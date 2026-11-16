import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { gateDetailedQuery } from "@/lib/consulta-gate";
import { haversineMeters } from "@/lib/analitza";
import { computeValuation, muniSeries, interannualPct, valueForYear, yearOfPeriod, type ValuationData } from "@/lib/territorial";
import { getMuniRentRows } from "@/lib/indicators-data";
import {
  ANALITZA_LIMITATIONS,
  ANALITZA_SOURCES,
  CHECKLIST,
  NORM_FACTS,
  buildNormative,
  buildPriceCheck,
  type AnalitzaInput,
  type ContractType,
} from "@/lib/analitza";

/**
 * POST /api/analitza — F1 «Consulta el preu real registrat» (funcionalitat
 * principal). v46: flux email-first amb registre obligatori — la ruta passa
 * per gateDetailedQuery(): sense sessió retorna 401 { code:
 * "REGISTRAT_PRIMER" } i NO executa cap càlcul detallat; amb sessió, la
 * consulta COMPUTA dins la quota del pla (per user_id, atòmica v23).
 *
 * Entrada: municipi (codi 6 dígits), preu anunciament, superfície, habitacions,
 * tipus de contracte, any de construcció, renta anterior, notes. Dades personals
 * mínimes: l'e-mail només identifica el compte (sessió httpOnly; mai arriba al
 * body ni es persisteix amb la consulta); el registre d'ús (Event) continua
 * sent anònim: municipi i tipus de contracte per a mètriques agregades.
 *
 * Sortida: informe JSON amb A) anàlisi de preu (referència Incasòl municipal o
 * referència de comarca marcada com a ESTIMACIÓ + motor computeValuation per a
 * la vivenda concreta), B) comprovació normativa per estats (mai legalitat
 * absoluta), D) llista de comprovació + fonts + limitacions. La secció C
 * (serveis d'entorn) viu a POST /api/analitza/serveis per no blocar la resposta.
 */

const CONTRACT_TYPES: ContractType[] = ["HABITATGE", "TEMPORADA", "HABITACIO"];

/** Sanejament d'entrada — res de franges lliures: rangs estrictes. */
function sanitize(body: Record<string, unknown>) {
  const munCode = String(body.municipalityCode ?? "").slice(0, 6);
  if (!/^\d{6}$/.test(munCode)) return null;
  const priceRaw = Number(body.priceEurMonth);
  if (!Number.isFinite(priceRaw) || priceRaw < 50 || priceRaw > 20000) return null;
  const s = Number(body.surfaceM2);
  const surfaceM2 = Number.isFinite(s) && s >= 5 && s <= 500 ? s : null;
  const r = Number(body.rooms);
  const rooms = Number.isFinite(r) && r >= 0 && r <= 12 ? Math.round(r) : null;
  const ctRaw = String(body.contractType ?? "");
  const contractType = (CONTRACT_TYPES as string[]).includes(ctRaw) ? (ctRaw as ContractType) : "HABITATGE";
  const y = Number(body.builtYear);
  const builtYear = Number.isFinite(y) && y >= 1800 && y <= new Date().getFullYear() ? Math.round(y) : null;
  const pr = Number(body.previousRent);
  const previousRent = Number.isFinite(pr) && pr >= 50 && pr <= 20000 ? pr : null;
  const notes = String(body.notes ?? "").slice(0, 300) || null;
  const address = String(body.address ?? "").slice(0, 160) || null;
  const latRaw = Number(body.lat);
  const lngRaw = Number(body.lng);
  const lat = Number.isFinite(latRaw) && latRaw >= 40.0 && latRaw <= 43.5 ? latRaw : null;
  const lng = Number.isFinite(lngRaw) && lngRaw >= -1.5 && lngRaw <= 3.6 ? lngRaw : null;
  return { munCode, priceEurMonth: priceRaw, surfaceM2, rooms, contractType, builtYear, previousRent, notes, address, lat, lng };
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`analitza:${ip}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  // v46 — BLOQUEIG REAL (mai només visual): sense sessió, 401 REGISTRAT_PRIMER
  // ABANS de llegir el body i de tocar la BD; amb sessió, quota per user_id.
  const gate = await gateDetailedQuery();
  if (!gate.ok) return gate.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const input = sanitize(body);
  if (!input) {
    return NextResponse.json(
      { error: "BAD_INPUT", message: "Municipi (6 dígits) i preu mensual (50–20000 €) són obligatoris; la resta de camps tenen rangs vàlids definits." },
      { status: 400 },
    );
  }

  // ---- municipi ----
  const mun = await db.municipality.findUnique({
    where: { code: input.munCode },
    select: {
      code: true, name: true, comarca: true, province: true, lat: true, lng: true,
      rentLatest: true, rentPeriod: true, rentHistory: true, contractsLatest: true,
      comarcaRefLatest: true, comarcaRefPeriod: true, rentSource: true,
      isTense: true, tenseList: true,
    },
  });
  if (!mun) return NextResponse.json({ error: "MUNICIPALITY_NOT_FOUND" }, { status: 404 });

  let history: Record<string, number> | null = null;
  if (mun.rentHistory) {
    try {
      const h = JSON.parse(mun.rentHistory);
      if (h && typeof h === "object" && !Array.isArray(h)) history = h as Record<string, number>;
    } catch {
      history = null;
    }
  }

  // ---- A. motor de valoració per a la vivenda concreta (reutilitzat) ----
  const valuationData: ValuationData = {
    rentLatest: mun.rentLatest,
    rentPeriod: mun.rentPeriod,
    contracts: mun.contractsLatest,
    history,
    comarcaValues: [],
    provinciaValues: [],
    comarcaRefLatest: mun.comarcaRefLatest,
    comarcaRefPeriod: mun.comarcaRefPeriod,
  };
  const refYear = yearOfPeriod(mun.rentPeriod) ?? yearOfPeriod(mun.comarcaRefPeriod);
  if (refYear) {
    const [comRows, provRows] = await Promise.all([
      getMuniRentRows({ comarca: mun.comarca }),
      getMuniRentRows({ province: mun.province }),
    ]);
    valuationData.comarcaValues = comRows.map((row) => valueForYear(row, refYear)).filter((v): v is number => v !== null);
    valuationData.provinciaValues = provRows.map((row) => valueForYear(row, refYear)).filter((v): v is number => v !== null);
  }
  const valuation = computeValuation(valuationData, { surfaceM2: input.surfaceM2, rooms: input.rooms, estat: null });

  // ---- A. comprovació de preu de l'anunci ----
  const referenceValue =
    mun.rentSource === "INCASOL" && mun.rentLatest != null && mun.rentLatest > 0
      ? mun.rentLatest
      : mun.comarcaRefLatest != null && mun.comarcaRefLatest > 0
        ? mun.comarcaRefLatest
        : null;
  const isMuniOfficial = mun.rentSource === "INCASOL" && mun.rentLatest != null && mun.rentLatest > 0;
  const expectedCentral = valuation.ok ? valuation.result.central : null;
  const price = buildPriceCheck({
    priceEurMonth: input.priceEurMonth,
    surfaceM2: input.surfaceM2,
    muniRent: referenceValue,
    isMuniOfficial,
    expectedCentral,
  });

  // ---- A. evolució anual municipal (sèrie oficial; període vigent a part) ----
  const evolution = muniSeries(history);
  const interannual = interannualPct(evolution).slice(-6);

  // ---- A. municipis propers amb dada oficial (mateixa comarca; si n'hi ha <3, província) ----
  const neighbourSelect = {
    code: true, name: true, lat: true, lng: true,
    rentLatest: true, rentPeriod: true, contractsLatest: true, rentSource: true,
  } as const;
  let pool = await db.municipality.findMany({
    where: { comarca: mun.comarca, code: { not: mun.code }, rentLatest: { gt: 0 } },
    select: neighbourSelect,
  });
  if (pool.length < 3 && mun.province) {
    const provPool = await db.municipality.findMany({
      where: { province: mun.province, code: { not: mun.code }, rentLatest: { gt: 0 } },
      select: neighbourSelect,
    });
    pool = provPool;
  }
  const neighbours = pool
    .map((p) => ({ ...p, distanceKm: Math.round(haversineMeters(mun.lat, mun.lng, p.lat, p.lng) / 100) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);

  // ---- B. normativa ----
  const normative = buildNormative(
    {
      municipalityCode: mun.code,
      municipalityName: mun.name,
      priceEurMonth: input.priceEurMonth,
      surfaceM2: input.surfaceM2,
      rooms: input.rooms,
      contractType: input.contractType,
      builtYear: input.builtYear,
      previousRent: input.previousRent,
      notes: input.notes,
    },
    mun.isTense,
  );

  // ---- registre anònim d'ús (sense cap dada personal) ----
  await db.event
    .create({
      data: {
        type: "ANALITZA",
        meta: JSON.stringify({ mun: mun.code, ct: input.contractType, tense: mun.isTense }),
      },
    })
    .catch(() => {});

  // ---- punt per a la secció C (serveis): el de la vivenda si hi és; si no, el centre del municipi ----
  const serveisPoint = input.lat !== null && input.lng !== null
    ? { lat: input.lat, lng: input.lng, scope: "VIVENDA" as const }
    : { lat: mun.lat, lng: mun.lng, scope: "CENTRE_MUNICIPI" as const };

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    input: {
      municipalityCode: mun.code,
      municipalityName: mun.name,
      comarca: mun.comarca,
      province: mun.province,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      priceEurMonth: input.priceEurMonth,
      surfaceM2: input.surfaceM2,
      rooms: input.rooms,
      contractType: input.contractType,
      builtYear: input.builtYear,
      previousRent: input.previousRent,
      notes: input.notes,
    },
    price: {
      ...price,
      referenceSource: isMuniOfficial ? "INCASOL_MUNICIPI" : referenceValue !== null ? "COMARCA_REF" : null,
      referencePeriod: isMuniOfficial ? mun.rentPeriod : mun.comarcaRefPeriod,
      referenceContracts: mun.contractsLatest,
      referenceScope: isMuniOfficial ? "MUNICIPI" : referenceValue !== null ? "COMARCA" : null,
      expected: valuation.ok ? valuation.result : null,
      evolution,
      interannual,
      currentPeriod: mun.rentPeriod,
      neighbours,
    },
    normative: {
      ...normative,
      tenseList: mun.tenseList,
      resolutions: NORM_FACTS.tenseResolutions,
      serpaviUrl: NORM_FACTS.serpaviSource,
      irav: { pct: NORM_FACTS.iravLatestPct, period: NORM_FACTS.iravLatestPeriod, source: NORM_FACTS.iravSource },
      sources: [
        { t: NORM_FACTS.newContractLimitSource, u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-30303" },
        { t: NORM_FACTS.granTenedorSource, u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-30303" },
        { t: "Llei 12/2023 i DA 11ª (índex d'actualització IRAV)", u: "https://www.boe.es/buscar/act.php?id=BOE-A-2023-11849" },
        { t: "Consulta oficial de l'índex a Catalunya (Agència d'Habitatge)", u: "https://agenciahabitatge.gencat.cat/indexdelloguer" },
      ],
    },
    serveisPoint,
    checklist: CHECKLIST,
    sources: ANALITZA_SOURCES,
    limitations: ANALITZA_LIMITATIONS,
  });
}
