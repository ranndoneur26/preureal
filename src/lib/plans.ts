/** Definición de planes de PreuReal.cat (Fase 5: límits configurables des de l'admin). */
import { db } from "@/lib/db";
import { VIGENT_STATUSES } from "@/lib/subscription";

export type PlanId = "FREE" | "PREMIUM" | "PRO";

/** Valors per defecte (font de veritat si la BD no té cap fila a PlanSetting). */
export const PLANS: Record<
  PlanId,
  {
    quotaMonth: number; // -1 = il·limitades
    priceEur: number;
    comparatorMax: number; // v25: entitats màximes per comparació (gratuït 2, pagament 6)
    stripePriceEnv?: "STRIPE_PREMIUM_PRICE_ID" | "STRIPE_PRO_AGENTS_PRICE_ID";
    features: {
      comparador: boolean;
      exportCsv: boolean;
      historial: boolean;
      preferits: boolean;
      pdfMunicipi: boolean;
      pdfEdifici: boolean;
    };
  }
> = {
  FREE: {
    quotaMonth: 3,
    priceEur: 0,
    comparatorMax: 2,
    features: { comparador: true, exportCsv: false, historial: false, preferits: false, pdfMunicipi: false, pdfEdifici: false },
  },
  PREMIUM: {
    quotaMonth: -1,
    priceEur: 7.99,
    comparatorMax: 6,
    stripePriceEnv: "STRIPE_PREMIUM_PRICE_ID",
    features: { comparador: true, exportCsv: false, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: false },
  },
  PRO: {
    quotaMonth: -1,
    priceEur: 19.99,
    comparatorMax: 6,
    stripePriceEnv: "STRIPE_PRO_AGENTS_PRICE_ID",
    features: { comparador: true, exportCsv: true, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: true },
  },
};

export type EffectivePlan = {
  quotaMonth: number;
  priceEur: number;
  comparatorMax: number;
  features: (typeof PLANS)["FREE"]["features"];
};

type Cache = { at: number; data: Record<PlanId, EffectivePlan> };
let settingsCache: Cache | null = null;
const CACHE_MS = 30_000; // l'admin veu els canvis com a molt tard en 30 s

/** Configuració efectiva dels plans: BD (PlanSetting) amb fallback als defaults. */
export async function getPlanSettings(): Promise<Record<PlanId, EffectivePlan>> {
  if (settingsCache && Date.now() - settingsCache.at < CACHE_MS) return settingsCache.data;
  const out: Record<PlanId, EffectivePlan> = {
    FREE: { ...PLANS.FREE, features: { ...PLANS.FREE.features } },
    PREMIUM: { ...PLANS.PREMIUM, features: { ...PLANS.PREMIUM.features } },
    PRO: { ...PLANS.PRO, features: { ...PLANS.PRO.features } },
  };
  try {
    const rows = await db.planSetting.findMany();
    for (const row of rows) {
      if (row.plan in out) {
        const id = row.plan as PlanId;
        out[id].quotaMonth = row.quotaMonth;
        out[id].priceEur = row.priceEur;
        if (row.features) {
          try {
            out[id].features = { ...out[id].features, ...JSON.parse(row.features) };
          } catch {}
        }
      }
    }
    settingsCache = { at: Date.now(), data: out };
  } catch (e) {
    console.error("getPlanSettings: BD no disponible, s'usen els defaults", e);
  }
  return out;
}

export function invalidatePlanCache() {
  settingsCache = null;
}

export function planName(plan: PlanId, locale: "ca" | "es"): string {
  const names: Record<PlanId, [string, string]> = {
    FREE: ["Gratuït", "Gratuito"],
    PREMIUM: ["Premium", "Premium"],
    PRO: ["Pro (agents)", "Pro (agentes)"],
  };
  return names[plan][locale === "es" ? 1 : 0];
}

/** Quota del pla segons la configuració efectiva. */
export async function quotaForPlan(plan: PlanId): Promise<number> {
  return (await getPlanSettings())[plan].quotaMonth;
}

/** true si el usuario tiene la consulta gratuita disponible este mes */
export async function canConsult(
  userId: string,
  plan: PlanId
): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = (await getPlanSettings())[plan].quotaMonth;
  if (limit < 0) return { ok: true, used: 0, limit: -1 };
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const used = await db.searchLog.count({
    where: { userId, kind: "DETAIL", createdAt: { gte: start } },
  });
  return { ok: used < limit, used, limit };
}

/** Comprova una feature del pla contra la configuració efectiva. */
export async function planAllows(plan: PlanId, feature: keyof EffectivePlan["features"]): Promise<boolean> {
  const s = await getPlanSettings();
  return Boolean(s[plan]?.features[feature]);
}

const PLAN_RANK: Record<PlanId, number> = { FREE: 0, PREMIUM: 1, PRO: 2 };

// Cau de sincronització per usuari (P1.4): evita martellejar la BD a cada petició
const planSyncAt = new Map<string, number>();
const PLAN_SYNC_MS = 60_000;

/**
 * P1.4 — Sincronitza el pla de l'usuari amb les seves subscripcions VIGENTS:
 *  1) expira les subscripcions "active" el període de les quals ja ha acabat
 *     (caducitat automàtica dels 30 dies DEMO o del període Stripe, sense
 *     dependre del botó de cancel·lar ni de cap cron);
 *  2) el pla efectiu és el MÉS ALT de les subscripcions encara actives
 *     (mai queden subscripcions antigues "actives" decidint el pla).
 *
 * Auto-curatiu: es crida des de requireUser() dels usuaris de pagament, des
 * dels webhooks de Stripe i des del flux DEMO. Mai llança: si la BD falla
 * retorna null i el caller manté el pla actual.
 */
export async function syncUserPlan(
  userId: string,
  opts?: { force?: boolean }
): Promise<PlanId | null> {
  try {
    if (!opts?.force) {
      const last = planSyncAt.get(userId);
      if (last && Date.now() - last < PLAN_SYNC_MS) return null; // sincronitzat fa poc
    }
    planSyncAt.set(userId, Date.now());

    const now = new Date();
    // v23: expira TAMBIÉ "trialing" (abans es quedava actiu per sempre quan el
    // període de prova vençia sense conversió) i "past_due" amb el període
    // vençut (la gràcia només dura mentre el període pagat/pendent estigui viu).
    await db.subscription.updateMany({
      where: {
        userId,
        status: { in: ["active", "trialing", "past_due"] },
        currentPeriodEnd: { lt: now },
      },
      data: { status: "expired" },
    });
    // v23: "past_due" = gràcia de pagament (l'usuari manté l'accés mentre
    // Stripe reintenta el cobrament; vegeu VIGENT_STATUSES a subscription.ts)
    const vigents = await db.subscription.findMany({
      where: { userId, status: { in: [...VIGENT_STATUSES] } },
      select: { plan: true },
    });
    let plan: PlanId = "FREE";
    for (const s of vigents) {
      const p = (s.plan === "PREMIUM" || s.plan === "PRO" ? s.plan : "FREE") as PlanId;
      if (PLAN_RANK[p] > PLAN_RANK[plan]) plan = p;
    }
    const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
    if (user && user.plan !== plan) {
      await db.user.update({ where: { id: userId }, data: { plan } });
    }
    return plan;
  } catch (e) {
    console.error("syncUserPlan", e);
    return null;
  }
}
