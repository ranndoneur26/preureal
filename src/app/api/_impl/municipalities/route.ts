import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/municipalities?q=&tense=1&limit=  — cerca per nom
 * GET /api/municipalities?code=080193        — lite per codi exacte (v24:
 *     enllaços "obre al mapa" des del panell; sense límit municipal, que és
 *     costós: per això serveix la mateixa taula sense boundary)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const tenseOnly = searchParams.get("tense") === "1";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);
  // v24: lookup exacte per codi (deep links) — resposta lite, mateixa forma
  const code = (searchParams.get("code") || "").trim().slice(0, 10);
  if (code) {
    const mun = await db.municipality.findUnique({
      where: { code },
      select: {
        code: true, name: true, comarca: true, province: true, lat: true, lng: true,
        rentLatest: true, rentPeriod: true, rentPrevYear: true, rentPrevPeriod: true,
        contractsLatest: true, isTense: true, tenseList: true,
      },
    });
    return NextResponse.json({ municipalities: mun ? [mun] : [] });
  }

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
