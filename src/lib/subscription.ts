import type Stripe from "stripe";
import { db } from "@/lib/db";
import type { PlanId } from "@/lib/plans";

/**
 * v22 — Fase 1 de subscripcions (encàrrec user_subscriptions / subscription_usage).
 *
 * Equivalències amb l'arquitectura demanada (Supabase Auth + RLS + Edge
 * Functions) sobre el stack REAL del projecte (Next.js serverless + Prisma):
 *  - `supabase.auth.getUser()`  ↔  requireUser() de src/lib/auth.ts: l'usuari
 *    s'identifica SEMPRE al servidor (JWT httpOnly + verificació a la BD +
 *    tokenVersion). Mai es confia en cap ID enviat des del frontend.
 *  - RLS policies              ↔  (1) migració v22: RLS habilitat a totes les
 *    taules (el rol anon de Supabase queda sense accés) + (2) totes les
 *    escriptures de plan/status/stripe_* passen per rutes de servidor o per
 *    webhooks signats — no existeix cap ruta que accepti aquests camps del client.
 *  - Edge Functions            ↔  rutes API de servidor (mateixa frontera de
 *    confiança; correuen a Vercel serverless, no a Deno).
 *
 * REGLA: Stripe és la font de veritat del estat de pagament. Sense credencials
 * STRIPE_* res no es simula com a pagament real (el mode DEMO queda marcat amb
 * `demo: true` i clarament separat).
 */

export type PlanType = "free" | "premium" | "pro_agents";

const PLAN_RANK: Record<PlanId, number> = { FREE: 0, PREMIUM: 1, PRO: 2 };

export const USAGE_TYPES = {
  DETAIL_QUERY: "DETAIL_QUERY",
  EXPORT_CSV: "EXPORT_CSV",
  PDF_REPORT: "PDF_REPORT",
} as const;
export type UsageType = (typeof USAGE_TYPES)[keyof typeof USAGE_TYPES];

/** Clau de mes UTC: "2026-11". */
export function monthKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function planIdToType(plan: PlanId): PlanType {
  return plan === "PRO" ? "pro_agents" : plan === "PREMIUM" ? "premium" : "free";
}

/** Tradueix el planType del encàrrec (free|premium|pro_agents) al PlanId intern. */
export function typeToPlanId(t: string): "PREMIUM" | "PRO" | null {
  const v = String(t || "").toLowerCase();
  if (v === "premium") return "PREMIUM";
  if (v === "pro_agents" || v === "pro") return "PRO";
  return null;
}

/**
 * Comptador d'ús mensual (upsert atòmic per la clau única userId+type+month).
 * MAI llança: un fallo de telemetria no pot trencar mai l'acció de l'usuari.
 */
export async function recordUsage(userId: string, type: UsageType, n: number = 1): Promise<number | null> {
  try {
    const row = await db.subscriptionUsage.upsert({
      where: {
        userId_usageType_usageMonth: { userId, usageType: type, usageMonth: monthKey() },
      },
      create: { userId, usageType: type, usageMonth: monthKey(), usageCount: n },
      update: { usageCount: { increment: n } },
    });
    return row.usageCount;
  } catch (e) {
    console.error("recordUsage", type, e);
    return null;
  }
}

/** Dades locals que es deriven d'una subscripció de Stripe (font de veritat). */
export function subscriptionLocalData(s: Stripe.Subscription) {
  const item = s.items.data[0];
  const interval = item?.price?.recurring?.interval;
  return {
    status: s.status,
    currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
    billingInterval: interval === "month" || interval === "year" ? interval : null,
    stripePriceId: item?.price?.id ?? null,
  };
}

/** El pla més alt de les subscripcions vigents (defensiu; requireUser ja sincronitza). */
export function highestVigentPlan(
  subs: Array<{ status: string; plan: string }>
): PlanId {
  let plan: PlanId = "FREE";
  for (const s of subs) {
    if (s.status !== "active" && s.status !== "trialing") continue;
    const p = (s.plan === "PREMIUM" || s.plan === "PRO" ? s.plan : "FREE") as PlanId;
    if (PLAN_RANK[p] > PLAN_RANK[plan]) plan = p;
  }
  return plan;
}

export interface SubscriptionState {
  planType: PlanType;
  subscriptionStatus: string;
  isFree: boolean;
  isPremium: boolean;
  isProAgents: boolean;
  hasPremiumAccess: boolean;
  hasProAgentsAccess: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionCount: number;
  monthlyDetailedQueriesUsed: number;
  stripeConfigured: boolean;
  demoCheckout: boolean;
}

/**
 * Estat complet per al hook useUserPlan(). `user` ve de requireUser() (pla
 * fresc, ja sincronitzat amb les subscripcions vigents i períodes vençuts).
 */
export async function getSubscriptionState(user: {
  id: string;
  plan: string;
}): Promise<SubscriptionState> {
  const [subs, usage] = await Promise.all([
    db.subscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.subscriptionUsage.findUnique({
      where: {
        userId_usageType_usageMonth: {
          userId: user.id,
          usageType: USAGE_TYPES.DETAIL_QUERY,
          usageMonth: monthKey(),
        },
      },
    }),
  ]);

  const plan = (user.plan === "PREMIUM" || user.plan === "PRO" ? user.plan : "FREE") as PlanId;
  const vigent =
    subs.find((s) => s.status === "active" || s.status === "trialing") ?? null;

  return {
    planType: planIdToType(plan),
    subscriptionStatus: vigent?.status ?? "free",
    isFree: plan === "FREE",
    isPremium: plan === "PREMIUM",
    isProAgents: plan === "PRO",
    hasPremiumAccess: PLAN_RANK[plan] >= PLAN_RANK.PREMIUM,
    hasProAgentsAccess: PLAN_RANK[plan] >= PLAN_RANK.PRO,
    currentPeriodStart: vigent?.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: vigent?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: vigent?.cancelAtPeriodEnd ?? false,
    subscriptionCount: subs.length,
    monthlyDetailedQueriesUsed: usage?.usageCount ?? 0,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    demoCheckout: process.env.DEMO_CHECKOUT === "true",
  };
}
