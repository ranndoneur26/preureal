import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows, valuationLimitForPlan, planName } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { recordUsage, monthKey, USAGE_TYPES } from "@/lib/subscription";
import { computeValuation, valueForYear, yearOfPeriod, type EstatConservacio, type ValuationData } from "@/lib/territorial";
import { getMuniRentRows } from "@/lib/indicators-data";

/**
 * POST /api/valuation — Noves funcionalitats (F4): valoració orientativa de
 * la renta d'una vivenda concreta. Metodologia validada §5 de
 * INFORME_AUDITORIA_FUNCIONALIDADES.md:
 *  - base = fiança municipal vigent (€/mes per habitatge, mercat real registrat;
 *    vivenda típica ~85 m²) → exposada intacta com a baseCentral
 *  - ajustos hedònics APROXIMATS i VISIBLES (motor v2 a src/lib/territorial.ts):
 *    superfície (escala sublineal β=0,8), estat (−20%/+6%/+12%), habitacions
 *    (densitat m²/hab, ±5%); desglossament al resultat (adjustments[])
 *  - horquilla = dispersió MESURADA (RIQ relatiu) del central ajustat: comarca
 *    el mateix any (≥5 munis); si no, província (≥10); si no, rang històric
 *  - confiança ALTA/MITJANA/BAIXA per regles explícites
 * Gating server-side complet: auth + correu verificat + flag valoracio del
 * pla + quota VALUATION/mes (features.valoracionsMonth, 5 Premium / 30 Pro).
 */

const ESTATS: EstatConservacio[] = ["A_REFORMAR", "BON_ESTAT", "REFORMADA", "OBRA_NOVA"];

export async function POST(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`valuation:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "valoracio"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }

  // ---- entrada (sanejada) ----
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const munCode = String(body.municipalityCode ?? "").slice(0, 6);
  if (!/^\d{6}$/.test(munCode)) {
    return NextResponse.json({ error: "BAD_MUNICIPALITY" }, { status: 400 });
  }
  const surfaceRaw = Number(body.surfaceM2);
  // des de 5 m²: l'usuari pot introduir habitatges ILLEGALS (p. ex. 10 m²) i
  // el motor els calcula però adjunta avisos d'habitabilitat (Decret 141/2012).
  const surfaceM2 = Number.isFinite(surfaceRaw) && surfaceRaw >= 5 && surfaceRaw <= 500 ? surfaceRaw : null;
  const roomsRaw = Number(body.rooms);
  const rooms = Number.isFinite(roomsRaw) && roomsRaw >= 0 && roomsRaw <= 10 ? Math.round(roomsRaw) : null;
  const estatRaw = String(body.estat ?? "");
  const estat = (ESTATS as string[]).includes(estatRaw) ? (estatRaw as EstatConservacio) : null;

  // ---- quota pròpia de valoracions/mes (abans de calcular res) ----
  const limit = await valuationLimitForPlan(plan);
  let used = 0;
  if (limit >= 0) {
    used = await db.subscriptionUsage.count({
      where: { userId: user.id, usageType: USAGE_TYPES.VALUATION, usageMonth: monthKey() },
    });
    if (used >= limit) {
      await db.event
        .create({ data: { type: "VALUATION_PAYWALL", userId: user.id, meta: JSON.stringify({ plan, used, limit }) } })
        .catch(() => {});
      return NextResponse.json({ error: "QUOTA_EXCEEDED", quota: { used, limit }, plan }, { status: 402 });
    }
  }

  // ---- dades del municipi + pools territorials ----
  const mun = await db.municipality.findUnique({
    where: { code: munCode },
    select: {
      code: true,
      name: true,
      comarca: true,
      province: true,
      rentLatest: true,
      rentPeriod: true,
      rentHistory: true,
      contractsLatest: true,
      comarcaRefLatest: true,
      comarcaRefPeriod: true,
      rentSource: true,
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

  const data: ValuationData = {
    rentLatest: mun.rentLatest,
    rentPeriod: mun.rentPeriod,
    contracts: mun.contractsLatest,
    history,
    comarcaValues: [],
    provinciaValues: [],
    comarcaRefLatest: mun.comarcaRefLatest,
    comarcaRefPeriod: mun.comarcaRefPeriod,
  };
  const year = yearOfPeriod(mun.rentPeriod) ?? yearOfPeriod(mun.comarcaRefPeriod);
  if (year) {
    // pools EL MATEIX ANY del període vigent (comparabilitat garantida)
    const [comRows, provRows] = await Promise.all([
      getMuniRentRows({ comarca: mun.comarca }),
      getMuniRentRows({ province: mun.province }),
    ]);
    data.comarcaValues = comRows.map((r) => valueForYear(r, year)).filter((v): v is number => v !== null);
    data.provinciaValues = provRows.map((r) => valueForYear(r, year)).filter((v): v is number => v !== null);
  }

  const outcome = computeValuation(data, { surfaceM2, rooms, estat });
  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "NO_DATA",
        message:
          "Aquest municipi no té fiança municipal vigent publicada per Incasòl ni referència de comarca calculable: no es pot valorar sense inventar dades.",
      },
      { status: 422 },
    );
  }

  // ---- consumeix quota (només si hi ha resultat) ----
  await recordUsage(user.id, USAGE_TYPES.VALUATION, 1);
  await db.event
    .create({ data: { type: "VALUATION", userId: user.id, meta: JSON.stringify({ mun: munCode, plan, surface: surfaceM2, rooms, estat }) } })
    .catch(() => {});

  const quota = limit >= 0 ? { used: used + 1, limit } : { used: 0, limit: -1 };
  return NextResponse.json({
    valuation: outcome.result,
    municipality: {
      code: mun.code,
      name: mun.name,
      comarca: mun.comarca,
      province: mun.province,
      rentSource: mun.rentSource,
    },
    planName: planName(plan, "ca"),
    quota,
    generatedAt: new Date().toISOString(),
  });
}
