/** Definición de planes de PreuReal.cat */
import { db } from "@/lib/db";

export type Plan = "FREE" | "PREMIUM" | "PRO";

export const PLANS = {
  FREE: {
    id: "FREE" as Plan,
    nameCa: "Gratuït",
    nameEs: "Gratuito",
    priceEur: 0,
    /** consultas detalladas por mes */
    quotaMonth: 3,
    features: {
      mapa: true,
      consultesDetallades: 3,
      comparador: true,
      exportCsv: false,
      historial: false,
    },
  },
  PREMIUM: {
    id: "PREMIUM" as Plan,
    nameCa: "Premium",
    nameEs: "Premium",
    priceEur: 7.99,
    quotaMonth: Infinity,
    stripePriceEnv: "STRIPE_PRICE_PREMIUM",
    features: {
      mapa: true,
      consultesDetallades: Infinity,
      comparador: true,
      exportCsv: false,
      historial: true,
    },
  },
  PRO: {
    id: "PRO" as Plan,
    nameCa: "Pro (agents)",
    nameEs: "Pro (agentes)",
    priceEur: 19.99,
    quotaMonth: Infinity,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    features: {
      mapa: true,
      consultesDetallades: Infinity,
      comparador: true,
      exportCsv: true,
      historial: true,
    },
  },
};

export function quotaForPlan(plan: Plan): number {
  return PLANS[plan].quotaMonth;
}

/** true si el usuario tiene la consulta gratuita disponible este mes */
export async function canConsult(
  userId: string,
  plan: Plan
): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = quotaForPlan(plan);
  if (limit === Infinity) return { ok: true, used: 0, limit: -1 };
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const used = await db.searchLog.count({
    where: { userId, kind: "DETAIL", createdAt: { gte: start } },
  });
  return { ok: used < limit, used, limit };
}
