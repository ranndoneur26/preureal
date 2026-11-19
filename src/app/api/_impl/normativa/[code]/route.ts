import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { NORM_FACTS, SERPAVI_URL, ORIENTATION_DISCLAIMER, tensePublicacio } from "@/lib/analitza";

/**
 * GET /api/normativa/[code] — FASE 2 (plans migració progressiva), punt «Nou»
 * de Premium: MÒDUL NORMATIU COMPLET per municipi, consolidat.
 *
 * Reutilitza SEMPRE dades i constants que ja existien (anti-duplicació FASE 0):
 *  - Índex de referència vigent = fiança municipal oficial (Municipality,
 *    fiances Incasòl via habitatge.gencat.cat) o referència de comarca marcada
 *    com a ESTIMACIÓ (mateix contracte que la fitxa, mai dada municipal inventada).
 *  - Àrees tensades: Municipality.isTense/tenseList + NORM_FACTS.tenseResolutions
 *    (TER/2408/2024 2a tanda · TER/3739/2026 i TER/3740/2026, DOGC 19-10-2026
 *    i núm. 9196 de 3-7-2024 — 302 municipis, auditoria v69).
 *  - IRAV (INE, Llei 12/2023 DA 11ª): NORM_FACTS.iravLatestPct/iravLatestPeriod.
 *  - Gran tenedor/SERPAVI (RDL 29/2026): NORM_FACTS + SERPAVI_URL (MIVAU).
 *  - Límits de contracte (LAU art. 17.2, temporada art. 3) i amiant (3-10-2026).
 *
 * TOTA la traçabilitat surt a la resposta amb font i període (principi de
 * traceabilitat de l'encàrrec). Això NO és una taxació ni una consulta
 * individualitzada: el rang amb validesa legal només el dóna SERPAVI (MIVAU).
 *
 * Gating server-side complet: auth + correu verificat + planAllows
 * (features.normativaCompleta → Premium i Pro; el Gratuït manté exactament el
 * que ja tenia: marcador d'àrea tensada al mapa i bloc B de l'eina Consulta).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`normativa:${user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "normativaCompleta"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }

  const { code } = await params;
  const munCode = String(code || "").slice(0, 6);
  if (!/^\d{6}$/.test(munCode)) {
    return NextResponse.json({ error: "BAD_MUNICIPALITY" }, { status: 400 });
  }
  const mun = await db.municipality.findUnique({
    where: { code: munCode },
    select: {
      code: true, name: true, comarca: true, province: true,
      rentLatest: true, rentPeriod: true, rentPrevYear: true, rentPrevPeriod: true,
      rentSource: true, comarcaRefLatest: true, comarcaRefPeriod: true,
      isTense: true, tenseList: true,
    },
  });
  if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Índex de referència vigent: SEMPRE oficial o marcada com a estimació.
  const isMunicipal = mun.rentSource === "INCASOL" && mun.rentLatest != null;
  const referValue = isMunicipal
    ? mun.rentLatest
    : mun.comarcaRefLatest ?? null;
  const referPeriod = isMunicipal
    ? mun.rentPeriod
    : mun.comarcaRefPeriod ?? null;
  const variacioInteranual =
    mun.rentLatest != null && mun.rentPrevYear != null && mun.rentPrevYear > 0
      ? Math.round(((mun.rentLatest - mun.rentPrevYear) / mun.rentPrevYear) * 1000) / 10
      : null;

  return NextResponse.json({
    municipi: {
      code: mun.code,
      name: mun.name,
      comarca: mun.comarca,
      provincia: mun.province,
    },
    indexReferencia: {
      // Fiances Incasòl via habitatge.gencat.cat (font oficial del registre)
      valor: referValue,
      period: referPeriod,
      municipal: isMunicipal,
      estimacio: !isMunicipal && referValue != null, // ref. de comarca → mai es presenta com a dada municipal
      font: isMunicipal
        ? "Fiances de lloguer (Incasòl) via habitatge.gencat.cat"
        : "Referència de comarca (Incasòl), marcada com a ESTIMACIÓ",
      variacioInteranualPct: variacioInteranual,
      periodPrev: mun.rentPrevPeriod ?? null,
    },
    areaTensa: {
      tense: mun.isTense,
      // A = TER/3739/2026 (pròrroga 1a tanda) · B = TER/2408/2024 (2a tanda,
      // vigent sense canvis) · C = TER/3740/2026 (nous 2026)
      llista: mun.tenseList ?? null,
      resolucionsVigents: NORM_FACTS.tenseResolutions,
      font: NORM_FACTS.tenseSource,
      publicacio: tensePublicacio(mun.tenseList),
    },
    irav: {
      pct: NORM_FACTS.iravLatestPct,
      periode: NORM_FACTS.iravLatestPeriod,
      font: NORM_FACTS.iravSource, // INE — actualització anual de renta (Llei 12/2023 DA 11ª / LAU art. 18)
    },
    granTenedorSerpavi: {
      consultaOficial: SERPAVI_URL,
      granTenedor: NORM_FACTS.granTenedorSource,
      nota:
        "SERPAVI (MIVAU) és la consulta oficial individualitzada: el rang amb validesa legal només el dóna SERPAVI; aquest mòdul és estadístic i orientatiu.",
      vigencia: "Obligatori per a grans tenedores en zona tensada des del 8-10-2026 (RDL 29/2026)",
    },
    limits: {
      nouContracte: NORM_FACTS.newContractLimitSource,
      temporada: NORM_FACTS.temporadaSource,
    },
    altres: {
      amiant: NORM_FACTS.amiantNote,
    },
    disclaimer: ORIENTATION_DISCLAIMER,
    consultedAt: new Date().toISOString(),
  });
}
