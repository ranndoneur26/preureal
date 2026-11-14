import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import {
  importIdescatPob,
  importIdescatEdat,
  importIdescatNac,
  importIdescatCensLlars,
  importIdescatEmexSeed,
  importIdescatEmexBatch,
  EMEX_BATCH_SIZE,
} from "@/lib/idescat-import";

export const maxDuration = 60;

/**
 * POST /api/admin/import-demografia — v39: importació MANUAL de les fonts
 * demogràfiques IDESCAT (ús del propietari des del panell d'administració).
 *
 * Cos JSON: { "source": "IDESCAT_POB" | "IDESCAT_EDAT" | "IDESCAT_NAC" |
 *            "IDESCAT_CENS_LLARS" | "IDESCAT_EMEX_SEED" | "IDESCAT_EMEX_BATCH",
 *            "codes": ["080193", ...] }  // codes només per EMEX_BATCH
 *
 * Idempotent; només escriu a StatObservation/DataSource/ImportRun/AuditLog.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rl = await rateLimit(`import-demografia:${admin.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const source = String(body?.source ?? "");

  switch (source) {
    case "IDESCAT_POB":
      return NextResponse.json(await importIdescatPob(admin.id));
    case "IDESCAT_EDAT":
      return NextResponse.json(await importIdescatEdat(admin.id));
    case "IDESCAT_NAC":
      return NextResponse.json(await importIdescatNac(admin.id));
    case "IDESCAT_CENS_LLARS":
      return NextResponse.json(await importIdescatCensLlars(admin.id));
    case "IDESCAT_EMEX_SEED":
      return NextResponse.json(await importIdescatEmexSeed(admin.id));
    case "IDESCAT_EMEX_BATCH": {
      let codes: string[] = Array.isArray(body?.codes) ? body.codes.map(String) : [];
      if (codes.length === 0) {
        // sense codis explícits: els següents sense fila de superfície
        const munis = await db.municipality.findMany({ select: { code: true }, orderBy: { code: "asc" } });
        const withRows = await db.statObservation.findMany({
          where: { sourceId: "IDESCAT_EMEX", geoLevel: "MUNI", variable: "TERRITORI_SUPERFICIE_KM2" },
          select: { geoCode: true },
        });
        const have = new Set(withRows.map((r) => r.geoCode));
        codes = munis.map((m) => m.code).filter((c) => !have.has(c)).slice(0, EMEX_BATCH_SIZE);
      }
      if (codes.length === 0) {
        return NextResponse.json({ ok: true, message: "Res pendent: tots els municipis tenen fila emex." });
      }
      return NextResponse.json(await importIdescatEmexBatch(codes, admin.id));
    }
    default:
      return NextResponse.json(
        {
          error: "BAD_SOURCE",
          valid: ["IDESCAT_POB", "IDESCAT_EDAT", "IDESCAT_NAC", "IDESCAT_CENS_LLARS", "IDESCAT_EMEX_SEED", "IDESCAT_EMEX_BATCH"],
        },
        { status: 400 }
      );
  }
}
