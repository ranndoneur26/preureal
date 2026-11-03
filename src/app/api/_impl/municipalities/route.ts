import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/municipalities?q=&tense=1&limit=
 * Cerca de municipis amb dades reals de lloguer (fiances Incasòl via Gencat).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const tenseOnly = searchParams.get("tense") === "1";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);

  const where: any = {};
  if (q) where.name = { contains: q, mode: "insensitive" }; // PG: cerca insensible
  if (tenseOnly) where.isTense = true;

  const rows = await db.municipality.findMany({
    where,
    orderBy: [{ name: "asc" }],
    take: limit,
    select: {
      code: true,
      name: true,
      comarca: true,
      province: true,
      lat: true,
      lng: true,
      rentLatest: true,
      rentPeriod: true,
      rentPrevYear: true,
      rentPrevPeriod: true,
      contractsLatest: true,
      isTense: true,
      tenseList: true,
    },
  });
  return NextResponse.json({ municipalities: rows });
}
