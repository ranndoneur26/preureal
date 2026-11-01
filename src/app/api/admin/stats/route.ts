import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/** GET /api/admin/stats — KPIs del negocio (solo admin). */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400 * 1000);

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

  const mrr = premium * 7.99 + pro * 19.99;

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
    funnel30: { signups: signups30, queries: queries30, paywalls: paywalls30, subscribes: subscribe30, teasers: teaser30 },
    series,
    reports,
    emails,
  });
}
