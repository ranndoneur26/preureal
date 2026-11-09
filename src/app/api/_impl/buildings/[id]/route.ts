import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * GET /api/buildings/[id] — dades lite d'un edifici concret (v24).
 * Serveix als enllaços "obre al mapa" des del panell (preferits d'edifici i
 * comparacions desades): el client vola al centroid i el panell del mapa
 * reobri la consulta. Només dades que el mapa ja ensenya públicament
 * (geometria/preu mitjà Incasòl): cap dada personal.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.length > 40) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  const ip = clientIp(_req);
  const rl = await rateLimit(`building:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const b = await db.building.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      refcat: true,
      tipus: true,
      centroidLat: true,
      centroidLng: true,
      municipalityCode: true,
      avgRentEurMonth: true,
      sampleSize: true,
    },
  });
  if (!b) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // nom del municipi per mostrar (opcional)
  const mun = b.municipalityCode
    ? await db.municipality.findUnique({
        where: { code: b.municipalityCode },
        select: { code: true, name: true },
      })
    : null;

  return NextResponse.json({
    building: {
      id: b.id,
      nom: b.nom,
      refcat: b.refcat,
      tipus: b.tipus,
      lat: b.centroidLat,
      lng: b.centroidLng,
      municipalityCode: b.municipalityCode,
      municipalityName: mun?.name || null,
      avgRentEurMonth: b.avgRentEurMonth,
      sampleSize: b.sampleSize,
    },
  });
}
