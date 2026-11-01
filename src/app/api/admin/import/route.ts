import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";

/**
 * POST /api/admin/import — importación de datos a nivel de edificio/illa.
 * Formato JSON:
 *  [ { "refcat": "0801901DF...", "municipalityCode": "080193",
 *      "tipus": "edi", "polygon": [[lng,lat],...],
 *      "yearBuilt": 1930, "avgRentEurMonth": 1250.5, "sampleSize": 34 } ]
 *
 * CORRECCIÓ (E3/Fase 9.1): avgRentEurMonth i sampleSize ara es GUARDEN.
 * A més: validació estricta, límit de mida, registre a ImportRun (Fase 9.2)
 * i auditoria de l'acció.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rl = await rateLimit(`import:${admin.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ error: "EXPECTED_ROWS_ARRAY" }, { status: 400 });
  if (rows.length > 5000) {
    return NextResponse.json({ error: "TOO_MANY_ROWS", message: "Màxim 5.000 files per importació." }, { status: 400 });
  }

  const source = String(body?.source || "INCASOL_EDIFICIS").slice(0, 60);
  let created = 0, updated = 0, skipped = 0;
  const run = await db.importRun.create({
    data: { source, status: "OK", rowsTotal: rows.length, createdBy: admin.id },
  });

  try {
    for (const r of rows) {
      const refcat = r?.refcat ? String(r.refcat).toUpperCase().slice(0, 20) : null;
      const polygon = Array.isArray(r?.polygon) ? r.polygon : null;
      if (!refcat || !polygon || polygon.length < 3) {
        skipped++;
        continue;
      }
      // validació numèrica del polígon
      let cx = 0, cy = 0, valid = true;
      for (const p of polygon) {
        if (!Array.isArray(p) || !isFinite(Number(p[0])) || !isFinite(Number(p[1]))) { valid = false; break; }
        cx += Number(p[0]); cy += Number(p[1]);
      }
      if (!valid) { skipped++; continue; }
      cx /= polygon.length; cy /= polygon.length;

      const avgRent = r.avgRentEurMonth != null ? Number(r.avgRentEurMonth) : null;
      const sampleSize = r.sampleSize != null ? parseInt(String(r.sampleSize), 10) : null;
      const data = {
        externalId: `IMPORT-${refcat}`,
        source: "IMPORT",
        municipalityCode: r.municipalityCode ? String(r.municipalityCode).slice(0, 10) : null,
        tipus: r.tipus ? String(r.tipus).slice(0, 10) : "edi",
        estat: null,
        altura: null,
        nom: r.name ? String(r.name).slice(0, 120) : null,
        polygonJson: JSON.stringify(polygon),
        centroidLat: cy,
        centroidLng: cx,
        refcat,
        yearBuilt: typeof r.yearBuilt === "number" && r.yearBuilt > 1500 && r.yearBuilt < 2100 ? r.yearBuilt : null,
        yearSource: typeof r.yearBuilt === "number" ? "IMPORT" : null,
        // E3/Fase 9.1 — abans es descartaven:
        avgRentEurMonth: avgRent != null && isFinite(avgRent) && avgRent > 0 ? avgRent : null,
        sampleSize: sampleSize != null && isFinite(sampleSize) && sampleSize >= 0 ? sampleSize : null,
      };
      const existing = await db.building.findUnique({ where: { externalId: data.externalId } });
      if (existing) {
        await db.building.update({ where: { externalId: data.externalId }, data });
        updated++;
      } else {
        await db.building.create({ data });
        created++;
      }
    }
    await db.importRun.update({
      where: { id: run.id },
      data: { status: skipped > 0 && created + updated === 0 ? "ERROR" : skipped > 0 ? "PARTIAL" : "OK", created, updated, skipped },
    });
    await audit(admin.id, "IMPORT_RUN", run.id, { source, created, updated, skipped, rows: rows.length });
    return NextResponse.json({ ok: true, created, updated, skipped, runId: run.id });
  } catch (e: any) {
    await db.importRun.update({
      where: { id: run.id },
      data: { status: "ERROR", error: String(e?.message || e).slice(0, 500), created, updated, skipped },
    });
    return NextResponse.json({ error: "IMPORT_FAILED", message: String(e?.message || e) }, { status: 500 });
  }
}
