import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getPlanSettings, invalidatePlanCache } from "@/lib/plans";
import { audit } from "@/lib/security";

/** GET /api/admin/plan-settings — configuració efectiva dels plans. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const settings = await getPlanSettings();
  return NextResponse.json({ settings });
}

/** PUT /api/admin/plan-settings — actualitza límits/preus (Fase 5). */
export async function PUT(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const updates = body?.settings;
  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }

  const before = await getPlanSettings();
  for (const planId of ["FREE", "PREMIUM", "PRO"] as const) {
    const u = updates[planId];
    if (!u) continue;
    const quota = parseInt(String(u.quotaMonth), 10);
    const price = Number(u.priceEur);
    const data: { quotaMonth?: number; priceEur?: number; features?: string } = {};
    if (Number.isFinite(quota) && quota >= -1 && quota <= 100000) data.quotaMonth = quota;
    if (Number.isFinite(price) && price >= 0 && price <= 1000) data.priceEur = price;
    if (u.features && typeof u.features === "object") {
      data.features = JSON.stringify(u.features);
    }
    if (Object.keys(data).length === 0) continue;
    await db.planSetting.upsert({
      where: { plan: planId },
      create: { plan: planId, quotaMonth: data.quotaMonth ?? before[planId].quotaMonth, priceEur: data.priceEur ?? before[planId].priceEur, features: data.features ?? JSON.stringify(before[planId].features) },
      update: data,
    });
  }
  invalidatePlanCache();
  await audit(admin.id, "PLAN_SETTINGS_UPDATED", null, { before, after: updates });
  const settings = await getPlanSettings();
  return NextResponse.json({ ok: true, settings });
}
