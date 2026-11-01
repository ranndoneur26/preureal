import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/** GET /api/admin/stats — KPIs del negocio (solo admin). MRR REAL (Fase 12). */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400 * 1000);

  // MRR real: només subscripcions STRIPE (no demo) amb estat pagable,
  // proratitzades pel pla. Les demo es comptabilitzen apart com a "demoMrr".
  const subs = await db.subscription.findMany({
    where: { status: { in: ["active", "trialing", "past_due"] } },
    select: { plan: true, status: true, demo: true, currentPeriodEnd: true },
  });
  let mrr = 0;
  let demoMrr = 0;
  let mrrPastDue = 0;
  for (const s of subs) {
    const price = s.plan === "PRO" ? 19.99 : s.plan === "PREMIUM" ? 7.99 : 0;
    if (s.demo) {
      demoMrr += price;
      continue;
    }
    // període expirat i no renovat no compta com a ingressos corrents
    if (s.currentPeriodEnd && s.currentPeriodEnd < now && s.status !== "past_due") continue;
    if (s.status === "past_due") {
      mrrPastDue += price;
      continue;
    }
    mrr += price;
  }

  const [users, premium, pro, signups30, queries30, paywalls30, subscribe30, teaser30, reports, emails] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { plan: "PREMIUM" } }),
      db.user.count({ where: { plan: "PRO" } }),
      db.event.count({ where: { type: "SIGNUP", createdAt: { gte: d30 } } }),
      db.event.count({ where: { type: "MAP_QUERY", createdAt: { gte: d30 } } }),
      db.event.count({ where: { type: "PAYWALL_VIEW", createdAt: { gte: d30 } } }),
      db.event.count({ where: { type: "SUBSCRIBE_SUCCESS", createdAt: { gte: d30 } } }),
      db.searchLog.count({ where: { kind: "TEASER", createdAt: { gte: d30 } } }),
      db.priceReport.count(),
      db.emailLog.count(),
    ]);

  // serie diaria últimos 30 días (signup + query)
  const events = await db.event.findMany({
    where: { createdAt: { gte: d30 }, type: { in: ["SIGNUP", "MAP_QUERY", "PAYWALL_VIEW", "SUBSCRIBE_SUCCESS"] } },
    select: { type: true, createdAt: true },
  });
  const byDay: Record<string, Record<string, number>> = {};
  for (const e of events) {
    const day = e.createdAt.toISOString().slice(0, 10);
    byDay[day] = byDay[day] || { SIGNUP: 0, MAP_QUERY: 0, PAYWALL_VIEW: 0, SUBSCRIBE_SUCCESS: 0 };
    byDay[day][e.type]++;
  }
  const series = Object.entries(byDay)
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return NextResponse.json({
    users,
    plans: { free: users - premium - pro, premium, pro },
    mrr: +mrr.toFixed(2),
    mrrPastDue: +mrrPastDue.toFixed(2),
    demoMrr: +demoMrr.toFixed(2),
    activeSubs: subs.filter((s) => !s.demo && (s.status === "active" || s.status === "trialing")).length,
    funnel30: { signups: signups30, queries: queries30, paywalls: paywalls30, subscribes: subscribe30, teasers: teaser30 },
    series,
    reports,
    emails,
  });
}
