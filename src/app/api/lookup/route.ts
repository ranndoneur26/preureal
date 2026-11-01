import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canConsult } from "@/lib/plans";
import { logEvent, rateLimit } from "@/lib/analytics";
import { fetchParcelAt, resolveMunicipalityCode } from "@/lib/icgc";
import { getYearBuilt } from "@/lib/catastro";

/**
 * POST /api/lookup  { lat, lng, buildingId? }
 * CONSULTA DETALLADA: el cor del producte.
 *  - Sense sessió → resposta teaser (protecció de dades + captació).
 *  - Pla FREE → 3 consultes detallades/mes; a partir d'allà → 402 paywall.
 *  - PREMIUM/PRO → il·limitades.
 * Dades retornades: preu mitjà real (fiances Incasòl), contractes de referència,
 * àrea tensada, refcat catastral real (ICGC) i any de construcció (Catastro).
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = rateLimit(`lookup:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const lat = parseFloat(body?.lat);
  const lng = parseFloat(body?.lng);
  const buildingId = body?.buildingId ? String(body.buildingId) : null;
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "BAD_POINT" }, { status: 400 });
  }

  const session = await getSession();

  // 1) edifici (opcional)
  let building = null;
  if (buildingId) {
    building = await db.building.findUnique({ where: { id: buildingId } });
  }

  // 2) municipi: per l'edifici o per consulta ICGC amb cau
  let munCode = building?.municipalityCode || null;
  if (!munCode) {
    munCode = await resolveMunicipalityCode(lat, lng);
  }
  if (!munCode) {
    return NextResponse.json({ error: "MUNICIPALITY_NOT_FOUND" }, { status: 404 });
  }
  const mun = await db.municipality.findUnique({ where: { code: munCode } });
  if (!mun) return NextResponse.json({ error: "MUNICIPALITY_NOT_FOUND" }, { status: 404 });

  // 3) TISER: sense sessió → teaser
  if (!session) {
    await logEvent("MAP_QUERY", null, { kind: "teaser", mun: mun.code });
    await db.searchLog.create({ data: { kind: "TEASER", municipalityCode: mun.code, ipHash: hashIp(ip) } });
    return NextResponse.json({
      kind: "teaser",
      municipality: { name: mun.name, comarca: mun.comarca, isTense: mun.isTense },
      teaser: {
        hasRent: !!mun.rentLatest,
        period: mun.rentPeriod,
        message: "REGISTRA'T_PER_VEURE",
      },
    });
  }

  // 4) cuota para FREE
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  const quota = await canConsult(user.id, plan);
  if (!quota.ok) {
    await logEvent("PAYWALL_VIEW", user.id, { plan, mun: mun.code });
    return NextResponse.json(
      {
        error: "QUOTA_EXCEEDED",
        quota: { used: quota.used, limit: quota.limit },
        plan,
      },
      { status: 402 }
    );
  }

  // 5) refcat real (ICGC) si no el tenim
  let refcat = building?.refcat || null;
  if (!refcat) {
    refcat = await fetchParcelAt(lat, lng);
  }

  // 6) any de construcció (Catastro, degradació elegant)
  let yearBuilt: { year: number; source: string } | null = null;
  if (building) {
    yearBuilt = await getYearBuilt(building.id, refcat);
  }

  // 7) registra la consulta
  await db.searchLog.create({
    data: {
      userId: user.id,
      buildingId: building?.id || null,
      municipalityCode: mun.code,
      kind: "DETAIL",
      ipHash: hashIp(ip),
    },
  });
  await logEvent("MAP_QUERY", user.id, { kind: "detail", mun: mun.code });

  return NextResponse.json({
    kind: "full",
    building: building
      ? {
          id: building.id,
          tipus: building.tipus,
          altura: building.altura,
          nom: building.nom,
          refcat,
          yearBuilt,
        }
      : { refcat, yearBuilt: null },
    municipality: {
      code: mun.code,
      name: mun.name,
      comarca: mun.comarca,
      province: mun.province,
      rentLatest: mun.rentLatest,
      rentPeriod: mun.rentPeriod,
      rentPrevYear: mun.rentPrevYear,
      rentPrevPeriod: mun.rentPrevPeriod,
      rentHistory: mun.rentHistory ? JSON.parse(mun.rentHistory) : null,
      contractsLatest: mun.contractsLatest,
      isTense: mun.isTense,
      tenseList: mun.tenseList,
    },
    quota: { used: quota.used + 1, limit: quota.limit },
  });
}

function hashIp(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) | 0;
  return String(h);
}
