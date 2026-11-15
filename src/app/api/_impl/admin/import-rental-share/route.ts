import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";
import {
  validateAdminRentalShareRows,
  computeRentalShare,
  type RentalShareCalcInput,
} from "@/lib/rental-share-parse";
import {
  recalcRentalShare,
  ensureDataSource,
  RS_VIGENTS_SOURCE,
  RS_PARC_SOURCE,
} from "@/lib/rental-share";

/**
 * POST /api/admin/import-rental-share — v41: CONNECTOR ADMINISTRATIU dels
 * components pendents de publicació oberta municipal:
 *  - numerador: incasolActiveDeposits = fiances VIGENTES (stock) del Registre
 *    de fiances d'INCASÒL (mai el flux anual de contractes);
 *  - denominador: residentialProperties = inmuebles de uso residencial del
 *    Catastro (ús principal residencial; sense locals/oficines/garatges).
 *
 * Format JSON: { dryRun?: boolean, rows: [ { municipalityCode ("081136") |
 *   ineCode ("08113"), incasolActiveDeposits?, incasolPeriod?, incasolSource?,
 *   residentialProperties?, cadastreYear?, cadastreSource? } ] }
 *
 * Cada component s'insereix a StatObservation (font INCASOL_FIANZES_VIGENTS /
 * DNP_CATASTRE_PARC) amb meta {kind:"STOCK", via:"admin-import"} i després es
 * recalcula l'indicador dels municipis afectats (traçat a ImportRun).
 * dryRun=true valida i calcula sense persistir res.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rl = await rateLimit(`import-rs:${admin.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const dryRun = Boolean(body?.dryRun);
  const { rows, errors } = validateAdminRentalShareRows(body?.rows);
  if (!rows.length) {
    return NextResponse.json({ error: "NO_VALID_ROWS", errors }, { status: 400 });
  }

  // codis censals dels 947 municipis (resolució ineCode → code, mai per nom)
  const munis = await db.municipality.findMany({ select: { code: true, ineCode: true, name: true } });
  const byCode = new Map(munis.map((m) => [m.code, m]));
  const byIne = new Map(munis.filter((m) => m.ineCode).map((m) => [m.ineCode as string, m]));

  type Prepared = {
    municipalityCode: string;
    muniName: string;
    ineCode: string | null;
    incasolActiveDeposits: number | null;
    incasolPeriod: string | null;
    incasolSource: string | null;
    residentialProperties: number | null;
    cadastreYear: string | null;
    cadastreSource: string | null;
  };
  const prepared: Prepared[] = [];
  for (const r of rows) {
    const muni = byCode.get(r.municipalityCode) ?? (r.ineCode ? byIne.get(r.ineCode) : undefined);
    if (!muni) {
      errors.push({ index: prepared.length, reason: `municipi desconegut (${r.municipalityCode})` });
      continue;
    }
    prepared.push({
      municipalityCode: muni.code,
      muniName: muni.name,
      ineCode: muni.ineCode,
      incasolActiveDeposits: r.incasolActiveDeposits,
      incasolPeriod: r.incasolPeriod,
      incasolSource: r.incasolSource ?? "Importació administrativa (connector /api/admin/import-rental-share)",
      residentialProperties: r.residentialProperties,
      cadastreYear: r.cadastreYear,
      cadastreSource: r.cadastreSource ?? "Importació administrativa (connector /api/admin/import-rental-share)",
    });
  }

  // vista prèvia del càlcul (també per a dryRun): mateixa lògica que el recàlcul
  const preview = prepared.map((p) => {
    const input: RentalShareCalcInput = {
      muniCode: p.municipalityCode,
      incasolActiveDeposits: p.incasolActiveDeposits,
      incasolPeriod: p.incasolPeriod,
      incasolIneCode: p.ineCode,
      residentialProperties: p.residentialProperties,
      cadastreYear: p.cadastreYear,
      cadastreIneCode: p.ineCode,
    };
    const res = computeRentalShare(input);
    return {
      municipalityCode: p.municipalityCode,
      name: p.muniName,
      referenceKey: res.referenceKey,
      rentalPercentage: res.rentalPercentage,
      dataStatus: res.dataStatus,
      warnings: res.warnings,
    };
  });

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, valid: prepared.length, errors, preview });
  }

  const run = await db.importRun.create({
    data: { source: "RENTAL_SHARE_ADMIN", status: "OK", rowsTotal: prepared.length, createdBy: admin.id },
  });

  try {
    const vigId = await ensureDataSource(RS_VIGENTS_SOURCE);
    const parcId = await ensureDataSource(RS_PARC_SOURCE);

    let created = 0;
    for (const p of prepared) {
      if (p.incasolActiveDeposits != null) {
        // upsert per (sourceId, variable, geoLevel, geoCode, period): revisió idempotent
        const existing = await db.statObservation.findFirst({
          where: {
            sourceId: vigId,
            variable: "INCASOL_FIANZES_VIGENTS",
            geoLevel: "MUNI",
            geoCode: p.municipalityCode,
            period: p.incasolPeriod ?? "n.d.",
          },
          select: { id: true },
        });
        if (existing) {
          await db.statObservation.update({
            where: { id: existing.id },
            data: {
              value: p.incasolActiveDeposits,
              municipalityCode: p.municipalityCode,
              unit: "fiances vigentes (stock)",
              meta: JSON.stringify({ kind: "STOCK", via: "admin-import", runId: run.id }),
              runId: run.id,
            },
          });
        } else {
          await db.statObservation.create({
            data: {
              sourceId: vigId,
              variable: "INCASOL_FIANZES_VIGENTS",
              geoLevel: "MUNI",
              geoCode: p.municipalityCode,
              geoName: p.muniName,
              municipalityCode: p.municipalityCode,
              period: p.incasolPeriod ?? "n.d.",
              value: p.incasolActiveDeposits,
              unit: "fiances vigentes (stock)",
              meta: JSON.stringify({ kind: "STOCK", via: "admin-import", runId: run.id }),
              runId: run.id,
            },
          });
          created++;
        }
      }
      if (p.residentialProperties != null) {
        const existing = await db.statObservation.findFirst({
          where: {
            sourceId: parcId,
            variable: "CAT_PARC_RESIDENCIAL",
            geoLevel: "MUNI",
            geoCode: p.municipalityCode,
            period: p.cadastreYear ?? "n.d.",
          },
          select: { id: true },
        });
        if (existing) {
          await db.statObservation.update({
            where: { id: existing.id },
            data: {
              value: p.residentialProperties,
              municipalityCode: p.municipalityCode,
              unit: "inmuebles de uso residencial",
              meta: JSON.stringify({ kind: "STOCK", via: "admin-import", runId: run.id }),
              runId: run.id,
            },
          });
        } else {
          await db.statObservation.create({
            data: {
              sourceId: parcId,
              variable: "CAT_PARC_RESIDENCIAL",
              geoLevel: "MUNI",
              geoCode: p.municipalityCode,
              geoName: p.muniName,
              municipalityCode: p.municipalityCode,
              period: p.cadastreYear ?? "n.d.",
              value: p.residentialProperties,
              unit: "inmuebles de uso residencial",
              meta: JSON.stringify({ kind: "STOCK", via: "admin-import", runId: run.id }),
              runId: run.id,
            },
          });
          created++;
        }
      }
    }

    // recàlcul dels municipis afectats (nou ImportRun traçat)
    const recalc = await recalcRentalShare(`admin:${admin.id}`, prepared.map((p) => p.municipalityCode));

    await db.importRun.update({
      where: { id: run.id },
      data: { status: "OK", created },
    });
    await audit(admin.id, "IMPORT_RENTAL_SHARE", run.id, { rows: prepared.length, created });

    return NextResponse.json({ ok: true, runId: run.id, valid: prepared.length, errors, created, recalc, preview });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.importRun.update({
      where: { id: run.id },
      data: { status: "ERROR", error: msg.slice(0, 500) },
    });
    return NextResponse.json({ error: "IMPORT_ERROR", detail: msg.slice(0, 200) }, { status: 500 });
  }
}
