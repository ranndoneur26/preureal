import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * GET /api/lookup-refcat?rc=0801901DF3851E — cerca per referència catastral
 * (Fase 8.1) dins dels edificis coneguts (ICGC RTT + importacions).
 * Només retorna coordenades per localitzar al mapa; les dades detallades
 * continuen passant pel lookup amb les seves regles de quota.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`refcat:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const rc = (new URL(req.url).searchParams.get("rc") || "").replace(/\s+/g, "").toUpperCase().slice(0, 20);
  if (!/^[0-9]{7}[A-Z][A-Z0-9]{5,7}$/.test(rc) && !/^[0-9A-Z]{14,20}$/.test(rc)) {
    return NextResponse.json({ error: "BAD_REFCAT" }, { status: 400 });
  }

  // coincidència per prefix (els refcat complets sovint superen 14 caràcters)
  const building = await db.building.findFirst({
    where: { refcat: { startsWith: rc.slice(0, 14) } },
    select: { id: true, refcat: true, nom: true, centroidLat: true, centroidLng: true, municipalityCode: true },
  });
  if (!building) return NextResponse.json({ result: null });

  return NextResponse.json({
    result: {
      id: building.id,
      refcat: building.refcat,
      nom: building.nom,
      lat: building.centroidLat,
      lng: building.centroidLng,
      municipalityCode: building.municipalityCode,
    },
  });
}
