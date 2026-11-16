import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { buildEstimation, sanitizeEstimaSurface, ESTIMA_DISCLAIMER, ESTIMA_LIMITATIONS, ESTIMA_SOURCES, ESTIMA_SERPAVI_URL, type EstimaFailureReason } from "@/lib/estima";
import { getMuniRentRows } from "@/lib/indicators-data";
import { valueForYear, yearOfPeriod } from "@/lib/territorial";

/**
 * POST /api/estima — F2 «Estima el lloguer del teu habitatge» (nivell N1).
 *
 * Entrada MÍNIMA (regla d'or: no demanar dades que el càlcul no usa): municipi
 * (codi 6 dígits) + superfície (5–500 m²). Res de dades personals: sense auth,
 * sense adreça, sense referència catastral; només registre anònim d'ús (Event)
 * amb municipi i superfície arrodonida per a mètriques agregades.
 *
 * Sortida: SEMPRE un RANG orientatiu amb traçabilitat completa (base Incasòl,
 * període, nº contractes, dispersió mesurada, confiança) o degradació honesta
 * (available:false → «dades insuficients» + SERPAVI). Mai una xifra única de
 * taxació i mai una consulta oficial SERPAVI simulada.
 */

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`estima:${ip}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const munCode = String(body.municipalityCode ?? "").slice(0, 6);
  const surface = sanitizeEstimaSurface(body.surfaceM2);
  if (!/^\d{6}$/.test(munCode) || surface === null) {
    return NextResponse.json(
      { error: "BAD_INPUT", message: "Municipi (6 dígits) i superfície (5–500 m²) són obligatoris." },
      { status: 400 },
    );
  }

  const mun = await db.municipality.findUnique({
    where: { code: munCode },
    select: {
      code: true, name: true, comarca: true, province: true,
      rentLatest: true, rentPeriod: true, rentHistory: true, contractsLatest: true,
      comarcaRefLatest: true, comarcaRefPeriod: true, rentSource: true,
      isTense: true,
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

  // Base: NOMÉS la fiança municipal oficial Incasòl; si el municipi no la
  // publica (mostra petita), el motor cau a la referència de comarca ponderada
  // (marcada com a ESTIMACIÓ, confiança BAIXA) — mateixa semàntica que Analitza.
  const muniOfficial = mun.rentSource === "INCASOL" && mun.rentLatest != null && mun.rentLatest > 0;

  // Pools territorials per a l'horquilla MESURADA (mateix any que la base).
  const basePeriod = muniOfficial ? mun.rentPeriod : mun.comarcaRefPeriod;
  const refYear = yearOfPeriod(basePeriod) ?? yearOfPeriod(mun.rentPeriod) ?? yearOfPeriod(mun.comarcaRefPeriod);
  const comarcaValues: number[] = [];
  const provinciaValues: number[] = [];
  if (refYear) {
    const [comRows, provRows] = await Promise.all([
      getMuniRentRows({ comarca: mun.comarca }),
      getMuniRentRows({ province: mun.province }),
    ]);
    comarcaValues.push(...comRows.map((row) => valueForYear(row, refYear)).filter((v): v is number => v !== null));
    provinciaValues.push(...provRows.map((row) => valueForYear(row, refYear)).filter((v): v is number => v !== null));
  }

  const outcome = buildEstimation(
    {
      rentLatest: muniOfficial ? mun.rentLatest : null,
      rentPeriod: muniOfficial ? mun.rentPeriod : null,
      contracts: mun.contractsLatest,
      history,
      comarcaValues,
      provinciaValues,
      comarcaRefLatest: mun.comarcaRefLatest != null && mun.comarcaRefLatest > 0 ? mun.comarcaRefLatest : null,
      comarcaRefPeriod: mun.comarcaRefPeriod,
      tense: mun.isTense,
    },
    {
      municipalityCode: mun.code,
      municipalityName: mun.name,
      surfaceM2: surface,
    },
  );

  // registre anònim d'ús (sense cap dada personal — ni adreça ni ref. catastral)
  await db.event
    .create({
      data: {
        type: "ESTIMA",
        meta: JSON.stringify({ mun: mun.code, m2: Math.round(surface), tense: mun.isTense }),
      },
    })
    .catch(() => {});

  const base = {
    ok: true,
    generatedAt: new Date().toISOString(),
    input: {
      municipalityCode: mun.code,
      municipalityName: mun.name,
      comarca: mun.comarca,
      province: mun.province,
      surfaceM2: surface,
      isTense: mun.isTense,
    },
    disclaimer: ESTIMA_DISCLAIMER,
    serpaviUrl: ESTIMA_SERPAVI_URL,
    sources: ESTIMA_SOURCES,
    limitations: ESTIMA_LIMITATIONS,
  };

  if (!outcome.ok) {
    const reason: EstimaFailureReason = outcome.reason;
    return NextResponse.json({ ...base, available: false, reason });
  }

  return NextResponse.json({ ...base, available: true, estimation: outcome.result });
}
