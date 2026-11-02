import { NextResponse } from "next/server";
import type { Building } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { canConsult } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, hashIp } from "@/lib/security";
import { fetchParcelAt, resolveMunicipalityCode } from "@/lib/icgc";
import { getYearBuilt } from "@/lib/catastro";

/**
 * POST /api/lookup  { lat, lng, buildingId? }
 * CONSULTA DETALLADA: el cor del producte.
 *  - Sense sessió → resposta teaser (protecció de dades + captació).
 *  - Pla FREE → quota/mes configurable (PlanSetting); exhaurida → 402 paywall.
 *  - PREMIUM/PRO → il·limitades.
 * Dades retornades: preu mitjà real (fiances Incasòl), contractes de referència,
 * àrea tensada, refcat catastral real (ICGC), any de construcció (Catastro) i,
 * si hi ha importació a nivell d'illa, el preu real de l'edifici (Fase 9).
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`lookup:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const lat = parseFloat(body?.lat);
  const lng = parseFloat(body?.lng);
  const buildingId = body?.buildingId ? String(body.buildingId).slice(0, 40) : null;
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "BAD_POINT" }, { status: 400 });
  }

  const session = await getAuthUser();

  // 1) edifici (opcional)
  let building: Building | null = null;
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

  // 3) sense sessió → teaser
  if (!session) {
    await db.event
      .create({ data: { type: "MAP_QUERY", meta: JSON.stringify({ kind: "teaser", mun: mun.code }) } })
      .catch(() => {});
    await db.searchLog
      .create({ data: { kind: "TEASER", municipalityCode: mun.code, ipHash: hashIp(ip) } })
      .catch(() => {});
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

  // 4) quota del pla (configuració efectiva, aplicada AL SERVIDOR)
  const plan = (session.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  const quota = await canConsult(session.id, plan);
  if (!quota.ok) {
    await db.event
      .create({ data: { type: "PAYWALL_VIEW", userId: session.id, meta: JSON.stringify({ plan, mun: mun.code }) } })
      .catch(() => {});
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
      userId: session.id,
      buildingId: building?.id || null,
      municipalityCode: mun.code,
      kind: "DETAIL",
      ipHash: hashIp(ip),
    },
  });
  await db.event
    .create({ data: { type: "MAP_QUERY", userId: session.id, meta: JSON.stringify({ kind: "detail", mun: mun.code }) } })
    .catch(() => {});

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
          avgRentEurMonth: building.avgRentEurMonth,
          sampleSize: building.sampleSize,
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
