/** Definición de planes de PreuReal.cat (Fase 5: límits configurables des de l'admin). */
import { db } from "@/lib/db";
import { VIGENT_STATUSES, PLAN_RANK, monthKey } from "@/lib/subscription";

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
      // Fase 4 — indicadors de fonts oficials (INE + mercat registrat):
      //  - referenciaAmpliada: banda completa P25/mediana/P75 + posició del preu
      //  - indicadorsTerritorials: IPVA, renda Atlas, esforç econòmic i deltas
      //  - comparadorAvancat: columnes avançades del comparador (banda + esforç)
      // Configurables des de l'admin via PlanSetting.features (JSON fusionat
      // sobre aquests defaults; cache 30 s) — recalibrar no requereix desplegar.
      referenciaAmpliada: boolean;
      indicadorsTerritorials: boolean;
      comparadorAvancat: boolean;
      // Fase 6 — quota pròpia d'informes PDF/mes (nombre dins del JSON de
      // features: PlanSetting la pot retocar des de l'admin sense desplegar;
      // -1 = il·limitats). No es comprova amb planAllows() (booleà) sinó amb
      // pdfLimitForPlan().
      pdfMonth: number;
      // Noves funcionalitats 2026-11 (F1-F4) — flags additius amb el mateix
      // patró: l'admin els pot retocar via PlanSetting.features sense desplegar.
      //  - evolucioTemporal: gràfic interactiu de sèries (fitxa + comparador)
      //  - comparativaTerritorial: barres muni/comarca/província (fitxa)
      //  - valoracio: motor de valoració de renta (formulari del panell)
      //  - valoracionsMonth: quota pròpia/mes (com pdfMonth; -1 = il·limitades)
      evolucioTemporal: boolean;
      comparativaTerritorial: boolean;
      valoracio: boolean;
      valoracionsMonth: number;
    };
  }
> = {
  FREE: {
    quotaMonth: 3,
    priceEur: 0,
    comparatorMax: 2,
    features: { comparador: true, exportCsv: false, historial: false, preferits: false, pdfMunicipi: false, pdfEdifici: false, referenciaAmpliada: false, indicadorsTerritorials: false, comparadorAvancat: false, pdfMonth: 0, evolucioTemporal: false, comparativaTerritorial: false, valoracio: false, valoracionsMonth: 0 },
  },
  PREMIUM: {
    quotaMonth: -1,
    priceEur: 7.99,
    comparatorMax: 6,
    stripePriceEnv: "STRIPE_PREMIUM_PRICE_ID",
    features: { comparador: true, exportCsv: false, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: false, referenciaAmpliada: true, indicadorsTerritorials: true, comparadorAvancat: true, pdfMonth: 5, evolucioTemporal: true, comparativaTerritorial: true, valoracio: true, valoracionsMonth: 5 },
  },
  PRO: {
    quotaMonth: -1,
    priceEur: 19.99,
    comparatorMax: 6,
    stripePriceEnv: "STRIPE_PRO_AGENTS_PRICE_ID",
    features: { comparador: true, exportCsv: true, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: true, referenciaAmpliada: true, indicadorsTerritorials: true, comparadorAvancat: true, pdfMonth: 30, evolucioTemporal: true, comparativaTerritorial: true, valoracio: true, valoracionsMonth: 30 },
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

/** true si el usuario tiene la consulta gratuita disponible este mes.
 *  v31: cuenta SubscriptionUsage DETAIL_QUERY — la MISMA fuente atómica que
 *  consumeDetailQuery() aplica en /api/lookup — para que la cifra mostrada
 *  en /api/auth/me (PanelView, MapView) coincida SIEMPRE con la aplicación
 *  real. Antes contaba SearchLog: borrando historial la quota "se reiniciaba"
 *  en pantalla pero no en la aplicación (y viceversa). */
export async function canConsult(
  userId: string,
  plan: PlanId
): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = (await getPlanSettings())[plan].quotaMonth;
  if (limit < 0) return { ok: true, used: 0, limit: -1 };
  const used = await db.subscriptionUsage.count({
    where: { userId, usageType: "DETAIL_QUERY", usageMonth: monthKey() },
  });
  return { ok: used < limit, used, limit };
}

/** Comprova una feature del pla contra la configuració efectiva. */
export async function planAllows(plan: PlanId, feature: keyof EffectivePlan["features"]): Promise<boolean> {
  const s = await getPlanSettings();
  return Boolean(s[plan]?.features[feature]);
}

/** Fase 6 — quota d'informes PDF/mes del pla (features.pdfMonth, -1 = il·limitats).
 *  Fallback defensiu al default del pla si l'admin hi ha posat un no-numèric. */
export async function pdfLimitForPlan(plan: PlanId): Promise<number> {
  const s = await getPlanSettings();
  const v = s[plan]?.features.pdfMonth;
  if (Number.isFinite(v)) return v as number;
  return PLANS[plan].features.pdfMonth;
}

/** Noves funcionalitats — quota de valoracions/mes (features.valoracionsMonth).
 *  Mateix patró que pdfLimitForPlan: -1 = il·limitades, fallback defensiu. */
export async function valuationLimitForPlan(plan: PlanId): Promise<number> {
  const s = await getPlanSettings();
  const v = s[plan]?.features.valoracionsMonth;
  if (Number.isFinite(v)) return v as number;
  return PLANS[plan].features.valoracionsMonth;
}

// v31: PLAN_RANK vive en subscription.ts (fuente única importada aquí arriba)

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
