import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * POST /api/comparator  { entities: [{type:"MUNI"|"BUILDING", code}] }
 * Comparador avançat (Fase 8): calcula mètriques comparatives amb dades
 * reals (municipis: Incasòl; edificis: importació/any). Retorna sèries,
 * diferències percentuals i estadístics agregats del conjunt.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  const ip = clientIp(req);
  const rl = await rateLimit(`comparator:${user?.id || ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const entities = Array.isArray(body?.entities) ? body.entities.slice(0, 6) : null;
  if (!entities || entities.length < 2) {
    return NextResponse.json({ error: "BAD_INPUT", message: "Selecciona almenys 2 entitats." }, { status: 400 });
  }

  const munCodes = entities.filter((e: any) => e?.type !== "BUILDING").map((e: any) => String(e.code).slice(0, 10));
  const buildingIds = entities.filter((e: any) => e?.type === "BUILDING").map((e: any) => String(e.code).slice(0, 40));

  const muns = munCodes.length
    ? await db.municipality.findMany({
        where: { code: { in: munCodes } },
        select: { code: true, name: true, comarca: true, province: true, rentLatest: true, rentPeriod: true, rentPrevYear: true, rentHistory: true, contractsLatest: true, isTense: true, tenseList: true },
      })
    : [];
  const buildings = buildingIds.length
    ? await db.building.findMany({
        where: { id: { in: buildingIds } },
        select: { id: true, nom: true, tipus: true, altura: true, refcat: true, yearBuilt: true, avgRentEurMonth: true, sampleSize: true, municipalityCode: true },
      })
    : [];

  const results: any[] = [];
  for (const m of muns) {
    const hist = m.rentHistory ? JSON.parse(m.rentHistory) : null;
    const values = hist ? Object.values(hist).map(Number) : [];
    const median = values.length ? medianOf(values) : null;
    results.push({
      type: "MUNI",
      code: m.code,
      name: m.name,
      comarca: m.comarca,
      province: m.province,
      rentLatest: m.rentLatest,
      rentPeriod: m.rentPeriod,
      rentPrevYear: m.rentPrevYear,
      rentHistory: hist,
      contractsLatest: m.contractsLatest,
      isTense: m.isTense,
      tenseList: m.tenseList,
      median: median != null ? +median.toFixed(2) : null,
      samples: hist ? values.length : 0,
    });
  }
  for (const b of buildings) {
    results.push({
      type: "BUILDING",
      code: b.id,
      name: b.nom || b.refcat || `Edifici ${b.id.slice(-6)}`,
      tipus: b.tipus,
      altura: b.altura,
      refcat: b.refcat,
      yearBuilt: b.yearBuilt,
      rentLatest: b.avgRentEurMonth,
      rentPeriod: null,
      contractsLatest: b.sampleSize,
      municipalityCode: b.municipalityCode,
      isTense: null,
      rentHistory: null,
      median: null,
      samples: b.sampleSize,
    });
  }

  // diferències percentuals contra el màxim i el mínim del conjunt
  const rents = results.map((r) => r.rentLatest).filter((v: any) => typeof v === "number") as number[];
  const stats = rents.length
    ? {
        max: Math.max(...rents),
        min: Math.min(...rents),
        mean: +(rents.reduce((a, b) => a + b, 0) / rents.length).toFixed(2),
        median: +medianOf(rents).toFixed(2),
        count: rents.length,
      }
    : null;
  for (const r of results) {
    r.vsMax = typeof r.rentLatest === "number" && stats ? +(((r.rentLatest - stats.max) / stats.max) * 100).toFixed(1) : null;
    r.vsMean = typeof r.rentLatest === "number" && stats ? +(((r.rentLatest - stats.mean) / stats.mean) * 100).toFixed(1) : null;
  }

  await db.event
    .create({ data: { type: "COMPARATOR_USED", userId: user?.id || null, meta: JSON.stringify({ entities: entities.length }) } })
    .catch(() => {});

  return NextResponse.json({ results, stats });
}

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
