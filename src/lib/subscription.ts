import { randomUUID } from "crypto";
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

/**
 * v23 — Estats que mantenen el pla mentre són vigents.
 * "past_due" (pagament fallit) compta com a GRÀCIA: l'usuari manté l'accés
 * mentre Stripe reintentà el cobrament (finestra de doolencia). Quan Stripe
 * marca la subscripció "unpaid"/"canceled" (webhook) o el període venç
 * (sincronització local), el pla es retira automàticament.
 */
export const VIGENT_STATUSES = ["active", "trialing", "past_due"] as const;

/**
 * v23 — Distingeix un DUPLICAT real (violació d'unicitat: l'event ja s'havia
 * processat) d'un ERROR de BD (connexió caiguda, timeout...). Critic al
 * webhook: un error de BD tractat com a duplicat perd l'event per sempre
 * (Stripe rep 200 i no reentrega); tractat com a 500, Stripe reintenta.
 */
export function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string; cause?: { code?: string } };
  // Prisma P2002 (unique constraint) o PostgreSQL 23505 (unique violation)
  if (err.code === "P2002") return true;
  if (err.cause?.code === "23505" || err.code === "23505") return true;
  if (typeof err.message === "string" && err.message.includes("Unique constraint")) return true;
  return false;
}

/**
 * v23 — Dedueix el pla (PREMIUM|PRO) a partir del price ID de Stripe.
 * Font de veritat per als canvis de pla fets des del Portal de Client de
 * Stripe (allí no hi ha metadata.userId/plan: l'únic senyal és el preu).
 */
export function planFromPriceId(
  priceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): "PREMIUM" | "PRO" | null {
  if (!priceId) return null;
  const premium = [env.STRIPE_PREMIUM_PRICE_ID, env.STRIPE_PRICE_PREMIUM].filter(Boolean);
  const pro = [env.STRIPE_PRO_AGENTS_PRICE_ID, env.STRIPE_PRICE_PRO].filter(Boolean);
  if (premium.includes(priceId)) return "PREMIUM";
  if (pro.includes(priceId)) return "PRO";
  return null;
}

/**
 * v23 — Import real facturat (centims de Stripe) a text localitzat "7,99 €".
 * El rebut SEMPRE mostra l'import real del cobrament, mai un preu memoritzat
 * (unificació de preus: config de plans, factura i Stripe coincideixen).
 */
export function formatEurFromCents(cents: number | null | undefined): string | null {
  if (cents == null || !isFinite(cents) || cents < 0) return null;
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

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

/** El pla més alt de les subscripcions vigents (defensiu; requireUser ja sincronitza).
 *  v23: "past_due" compta (gràcia de pagament; vegeu VIGENT_STATUSES). */
export function highestVigentPlan(
  subs: Array<{ status: string; plan: string }>
): PlanId {
  let plan: PlanId = "FREE";
  for (const s of subs) {
    if (!(VIGENT_STATUSES as readonly string[]).includes(s.status)) continue;
    const p = (s.plan === "PREMIUM" || s.plan === "PRO" ? s.plan : "FREE") as PlanId;
    if (PLAN_RANK[p] > PLAN_RANK[plan]) plan = p;
  }
  return plan;
}

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number;
}

/**
 * v23 — Límit mensual de consultes ATÒMIC en PostgreSQL (punt 6 i 7 de la
 * auditoria): substitueix el count() + insert en dues passes (condició de
 * carrera: dues peticions paral·lels passaven totes dues el test) i unifica
 * els comptadors (SubscriptionUsage és l'ÚNICA font de la quota; SearchLog
 * queda com a historial/auditoria).
 *
 * Un ÚNIC enunciat: INSERT ... ON CONFLICT DO UPDATE ... WHERE usageCount <
 * $limit. Les peticions concurrents es serialitzen amb el lock de fila:
 * impossible sobrepassar el límit. En la creació inicial la fila s'amortitza
 * amb el detall de SearchLog del mes (backfill d'usos anteriors a v23).
 *
 * limit: -1 = il·limitat (increment sense topall); 0 = bloquejat sempre.
 * Mai llança: un fallo de comptador no pot trencar la consulta (fail-open amb
 * log; la quota es tornarà a avaluar a la següent petició).
 */
export async function consumeDetailQuery(userId: string, limit: number): Promise<QuotaResult> {
  const month = monthKey();
  const monthStart = `${month}-01`;
  const unlimited = limit < 0;
  const cap = unlimited ? 2147483647 : limit;
  try {
    if (limit === 0) {
      const row0 = await db.subscriptionUsage.findUnique({
        where: {
          userId_usageType_usageMonth: {
            userId,
            usageType: USAGE_TYPES.DETAIL_QUERY,
            usageMonth: month,
          },
        },
      });
      return { ok: false, used: row0?.usageCount ?? 0, limit: 0 };
    }
    const rows = await db.$queryRaw<Array<{ usageCount: number }>>`
      INSERT INTO "SubscriptionUsage"
        ("id", "userId", "usageType", "usageMonth", "usageCount", "createdAt", "updatedAt")
      SELECT
        ${randomUUID()}, ${userId}, ${USAGE_TYPES.DETAIL_QUERY}, ${month},
        1 + COALESCE((
          SELECT COUNT(*)::int FROM "SearchLog"
          WHERE "userId" = ${userId} AND "kind" = 'DETAIL' AND "createdAt" >= ${monthStart}::date
        ), 0),
        now(), now()
      WHERE ${unlimited} OR (
        1 + COALESCE((
          SELECT COUNT(*)::int FROM "SearchLog"
          WHERE "userId" = ${userId} AND "kind" = 'DETAIL' AND "createdAt" >= ${monthStart}::date
        ), 0)
      ) <= ${cap}
      ON CONFLICT ("userId", "usageType", "usageMonth")
      DO UPDATE SET
        "usageCount" = "SubscriptionUsage"."usageCount" + 1,
        "updatedAt" = now()
      WHERE "SubscriptionUsage"."usageCount" < ${cap}
      RETURNING "usageCount"`;
    if (rows.length > 0) {
      return { ok: true, used: Number(rows[0].usageCount), limit };
    }
    // Quota exhaurida: llegim el comptador real per al missatge 402
    const row = await db.subscriptionUsage.findUnique({
      where: {
        userId_usageType_usageMonth: {
          userId,
          usageType: USAGE_TYPES.DETAIL_QUERY,
          usageMonth: month,
        },
      },
    });
    return { ok: false, used: row?.usageCount ?? cap, limit };
  } catch (e) {
    console.error("consumeDetailQuery", e);
    // fail-open coherent amb el comportament previ de recordUsage: la consulta
    // passa, el comptador es podrà corregir (no es concedeix cap pla extra).
    return { ok: unlimited, used: 0, limit };
  }
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
    subs.find((s) => (VIGENT_STATUSES as readonly string[]).includes(s.status)) ?? null;

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
