/** Definición de planes de PreuReal.cat (Fase 5: límits configurables des de l'admin). */
import { db } from "@/lib/db";
import type { Plan } from "@prisma/client";

export type PlanId = "FREE" | "PREMIUM" | "PRO";

/** Valors per defecte (font de veritat si la BD no té cap fila a PlanSetting). */
export const PLANS: Record<
  PlanId,
  {
    quotaMonth: number; // -1 = il·limitades
    priceEur: number;
    stripePriceEnv?: "STRIPE_PRICE_PREMIUM" | "STRIPE_PRICE_PRO";
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
    features: { comparador: true, exportCsv: false, historial: false, preferits: false, pdfMunicipi: false, pdfEdifici: false },
  },
  PREMIUM: {
    quotaMonth: -1,
    priceEur: 7.99,
    stripePriceEnv: "STRIPE_PRICE_PREMIUM",
    features: { comparador: true, exportCsv: false, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: false },
  },
  PRO: {
    quotaMonth: -1,
    priceEur: 19.99,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    features: { comparador: true, exportCsv: true, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: true },
  },
};

export type EffectivePlan = {
  quotaMonth: number;
  priceEur: number;
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
