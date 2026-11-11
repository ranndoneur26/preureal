import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { fetchParcelByRefcat, resolveMunicipalityCode } from "@/lib/icgc";
import { provinciaForCode, fetchParcelDetailsByRefcat } from "@/lib/catastro";

/**
 * GET /api/lookup-refcat?rc=0801901DF3851E — buscador per referència catastral.
 *
 * v2 (2026-11-11):
 *  1) Ruta ràpida exacta: edificis coneguts (ICGC RTT + importacions) a la BD.
 *  2) Qualsevol parcel·la de Catalunya: capa ICGC `parcelles-cadastre`
 *     (filtre OGC API `filter=refcadp='<RC14>'`) → centroid → municipi (ICGC)
 *     → detalls cadastrals públics del Cadastre (DNPRC: adreça, CP, ús,
 *     superfície, any de construcció).
 *
 * Només retorna LOCALITZACIÓ i dades cadastrals públiques de la parcel·la;
 * les dades de lloguer continuen passant pel lookup amb les seves regles de
 * quota. Degradació elegant: cada font pot fallar sense trencar la resposta.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`refcat:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const rcRaw = (new URL(req.url).searchParams.get("rc") || "").replace(/\s+/g, "").toUpperCase().slice(0, 20);
  if (!/^[0-9]{7}[A-Z][A-Z0-9]{5,7}$/.test(rcRaw) && !/^[0-9A-Z]{14,20}$/.test(rcRaw)) {
    return NextResponse.json({ error: "BAD_REFCAT" }, { status: 400 });
  }
  const rc14 = rcRaw.slice(0, 14);

  // 1) BD d'edificis coneguts (coincidència per prefix de parcel·la)
  const building = await db.building.findFirst({
    where: { refcat: { startsWith: rc14 } },
    select: { id: true, refcat: true, nom: true, centroidLat: true, centroidLng: true, municipalityCode: true },
  });
  if (building) {
    return NextResponse.json({
      result: {
        id: building.id,
        refcat: building.refcat,
        nom: building.nom,
        lat: building.centroidLat,
        lng: building.centroidLng,
        municipalityCode: building.municipalityCode,
        ring: null,
        details: null,
        source: "BD",
      },
    });
  }

  // 2) ICGC: qualsevol parcel·la catastral de Catalunya
  const parcel = await fetchParcelByRefcat(rcRaw);
  if (!parcel) return NextResponse.json({ result: null });

  const municipalityCode = await resolveMunicipalityCode(parcel.centroidLat, parcel.centroidLng);

  // 3) Cadastre: detalls públics de la parcel·la (adreça, m², ús, any, CP)
  let details: Awaited<ReturnType<typeof fetchParcelDetailsByRefcat>> = null;
  if (municipalityCode) {
    const mun = await db.municipality.findUnique({
      where: { code: municipalityCode },
      select: { name: true, province: true },
    });
    const provincia = mun?.province || provinciaForCode(municipalityCode);
    if (mun?.name && provincia) {
      details = await fetchParcelDetailsByRefcat(rc14, { provincia, municipio: mun.name });
    }
  }

  return NextResponse.json({
    result: {
      id: null,
      refcat: parcel.refcat,
      nom: null,
      lat: parcel.centroidLat,
      lng: parcel.centroidLng,
      municipalityCode,
      ring: parcel.ring,
      details,
      source: "ICGC_CADASTRE",
    },
  });
}
