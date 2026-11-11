import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchMunicipalityBoundary } from "@/lib/icgc";

/**
 * GET /api/municipalities/[code]
 * Detall complet d'un municipi: històric de lloguer real (Incasòl) + límit
 * municipal real (ICGC, amb cau persistent).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const mun = await db.municipality.findUnique({ where: { code } });
  if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // límit municipal (ICGC) amb cau de 30 dies
  let boundary = null;
  const stale =
    !mun.boundary ||
    !mun.boundaryFetchedAt ||
    Date.now() - mun.boundaryFetchedAt.getTime() > 30 * 24 * 3600 * 1000;
  if (stale) {
    const fetched = await fetchMunicipalityBoundary(mun.lat, mun.lng);
    if (fetched) {
      await db.municipality.update({
        where: { code },
        data: { boundary: fetched.boundary, boundaryFetchedAt: new Date() },
      });
      boundary = JSON.parse(fetched.boundary);
    }
  } else {
    boundary = JSON.parse(mun.boundary!);
  }

  return NextResponse.json({
    municipality: {
      code: mun.code,
      name: mun.name,
      comarca: mun.comarca,
      province: mun.province,
      lat: mun.lat,
      lng: mun.lng,
      rentLatest: mun.rentLatest,
      rentPeriod: mun.rentPeriod,
      rentPrevYear: mun.rentPrevYear,
      rentPrevPeriod: mun.rentPrevPeriod,
      rentHistory: mun.rentHistory ? JSON.parse(mun.rentHistory) : null,
      contractsLatest: mun.contractsLatest,
      comarcaRefLatest: mun.comarcaRefLatest,
      comarcaRefPeriod: mun.comarcaRefPeriod,
      comarcaRefHistory: mun.comarcaRefHistory ? JSON.parse(mun.comarcaRefHistory) : null,
      rentSource: mun.rentSource,
      isTense: mun.isTense,
      tenseList: mun.tenseList,
    },
    boundary,
  });
}
