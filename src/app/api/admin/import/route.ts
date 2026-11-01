import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * POST /api/admin/import — importación de datos a nivel de edificio/illa.
 * Formato JSON:
 *  [ { "refcat": "0801901DF...", "municipalityCode": "080193",
 *      "tipus": "edi", "polygon": [[lng,lat],...],
 *      "yearBuilt": 1930, "avgRentEurMonth": 1250.5, "sampleSize": 34 } ]
 *
 * Esto es la PIEZA CLAVE para cuando el propietario consiga los datos de
 * fiances a nivel de illa/parcel·la (conveni Incasòl): se suben aquí y el
 * mapa los muestra sin tocar código.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ error: "EXPECTED_ROWS_ARRAY" }, { status: 400 });

  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    if (!r?.refcat || !Array.isArray(r?.polygon) || r.polygon.length < 3) {
      skipped++;
      continue;
    }
    let cx = 0, cy = 0;
    for (const [x, y] of r.polygon) { cx += x; cy += y; }
    cx /= r.polygon.length; cy /= r.polygon.length;
    const externalId = `IMPORT-${String(r.refcat).toUpperCase()}`;
    const data = {
      externalId,
      source: "IMPORT",
      municipalityCode: r.municipalityCode || null,
      tipus: r.tipus || "edi",
      estat: null,
      altura: null,
      nom: r.name || null,
      polygonJson: JSON.stringify(r.polygon),
      centroidLat: cy,
      centroidLng: cx,
      refcat: String(r.refcat).toUpperCase(),
      yearBuilt: typeof r.yearBuilt === "number" ? r.yearBuilt : null,
      yearSource: typeof r.yearBuilt === "number" ? "IMPORT" : null,
    };
    const existing = await db.building.findUnique({ where: { externalId } });
    if (existing) {
      await db.building.update({ where: { externalId }, data });
      updated++;
    } else {
      await db.building.create({ data });
      created++;
    }
  }
  return NextResponse.json({ ok: true, created, updated, skipped });
}
