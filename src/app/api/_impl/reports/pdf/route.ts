import { NextResponse } from "next/server";
import type { Building, Municipality } from "@prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows, pdfLimitForPlan, planName } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { buildReportPdf } from "@/lib/pdf-report";
import { recordUsage, monthKey, USAGE_TYPES } from "@/lib/subscription";
import { maskEmail, gatherMuniReportInput } from "@/lib/report-data";

/**
 * GET /api/reports/pdf?mun=CODE | ?building=ID — INFORME PROFESSIONAL DE 8
 * PÀGINES (Fase 6, v34). La construcció del document viu a src/lib/pdf-report.ts
 * (funció pura, testable); la reunió de dades, compartida amb els informes de
 * pagament únic, viu a src/lib/report-data.ts (v38.8). Aquí només: auth,
 * gating per pla i QUOTA pròpia (features.pdfMonth per pla, comptada amb
 * SubscriptionUsage PDF_REPORT — la mateixa font que la resta de quotes).
 * Premium: informe de municipi. Pro: municipi + edifici.
 */

export async function GET(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`pdf:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const url = new URL(req.url);
  const munCode = url.searchParams.get("mun");
  const buildingId = url.searchParams.get("building");
  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";

  if (!munCode && !buildingId) {
    return NextResponse.json({ error: "BAD_INPUT", message: "Cal ?mun= o ?building=" }, { status: 400 });
  }

  let mun: Municipality | null = null;
  let building: Building | null = null;
  if (munCode) {
    if (!(await planAllows(plan, "pdfMunicipi"))) {
      return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
    }
    mun = await db.municipality.findUnique({ where: { code: munCode } });
    if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } else {
    if (!(await planAllows(plan, "pdfEdifici"))) {
      return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PRO" }, { status: 403 });
    }
    building = await db.building.findUnique({ where: { id: buildingId! } });
    if (!building) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (building.municipalityCode) {
      mun = await db.municipality.findUnique({ where: { code: building.municipalityCode } });
    }
    if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // ---- Fase 6: quota pròpia d'informes PDF/mes (abans de generar res) ----
  const pdfLimit = await pdfLimitForPlan(plan);
  let pdfUsed = 0;
  if (pdfLimit >= 0) {
    pdfUsed = await db.subscriptionUsage.count({
      where: { userId: user.id, usageType: USAGE_TYPES.PDF_REPORT, usageMonth: monthKey() },
    });
    if (pdfUsed >= pdfLimit) {
      await db.event
        .create({ data: { type: "PDF_PAYWALL", userId: user.id, meta: JSON.stringify({ plan, used: pdfUsed, limit: pdfLimit }) } })
        .catch(() => {});
      return NextResponse.json(
        { error: "QUOTA_EXCEEDED", quota: { used: pdfUsed, limit: pdfLimit }, plan },
        { status: 402 }
      );
    }
  }

  const input = await gatherMuniReportInput(mun, {
    building,
    subscriberMasked: maskEmail(user.email),
    planLabel: planName(plan, "ca"),
  });

  const bytes = await buildReportPdf(input);
  await recordUsage(user.id, USAGE_TYPES.PDF_REPORT); // Fase 6: quota després de generar (una petició fallida no compta)
  await db.event
    .create({ data: { type: "PDF_DOWNLOADED", userId: user.id, meta: JSON.stringify({ mun: munCode, building: buildingId, plan }) } })
    .catch(() => {});

  const fname = building
    ? `preureal_informe_edifici_${building.id.slice(-6)}.pdf`
    : `preureal_informe_${mun.name.replace(/[^\p{L}\p{N}]+/gu, "_")}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
