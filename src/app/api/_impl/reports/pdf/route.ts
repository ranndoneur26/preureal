import { NextResponse } from "next/server";
import type { Building, Municipality } from "@prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows, pdfLimitForPlan, planName } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { getMuniIndicators } from "@/lib/indicators-data";
import { buildReportPdf, type ReportInput } from "@/lib/pdf-report";
import { recordUsage, monthKey, USAGE_TYPES } from "@/lib/subscription";
import seedAids from "@/data/rental_aid_seed.json";

/**
 * GET /api/reports/pdf?mun=CODE | ?building=ID — INFORME PROFESSIONAL DE 8
 * PÀGINES (Fase 6, v34). La construcció del document viu a src/lib/pdf-report.ts
 * (funció pura, testable); aquí només: auth, gating per pla, QUOTA pròpia
 * (features.pdfMonth per pla, comptada amb SubscriptionUsage PDF_REPORT — la
 * mateixa font que la resta de quotes) i reunió de dades amb degradació
 * elegant. Premium: informe de municipi. Pro: municipi + edifici.
 */

const maskEmail = (email: string) => email.replace(/(.{2}).+(@.*)/, "$1***$2");

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

  // ---- dades auxiliars (degradació elegant: una peça que falta no treu la resta) ----
  const indRaw = await getMuniIndicators(mun.code, { price: building?.avgRentEurMonth ?? null }).catch(() => null);
  const ind: ReportInput["ind"] = indRaw
    ? {
        band: indRaw.band
          ? { p25: indRaw.band.p25, p50: indRaw.band.p50, p75: indRaw.band.p75, n: indRaw.band.n, totalWeight: indRaw.band.totalWeight }
          : null,
        effortHogar: indRaw.effort?.hogar
          ? {
              pct: indRaw.effort.hogar.pct,
              rentEurMonth: indRaw.effort.hogar.rentEurMonth,
              rentPeriod: indRaw.effort.hogar.rentPeriod,
              rentaAnual: indRaw.effort.hogar.rentaAnual,
              rentaPeriod: indRaw.effort.hogar.rentaPeriod,
            }
          : null,
        rentaHogarLatest: indRaw.renta?.municipi?.hogar?.latest
          ? { value: indRaw.renta.municipi.hogar.latest.value, period: indRaw.renta.municipi.hogar.latest.period }
          : null,
        ipvaCat: indRaw.ipva?.catalunya
          ? {
              latestAnual: indRaw.ipva.catalunya.latestAnual
                ? { value: indRaw.ipva.catalunya.latestAnual.value, period: indRaw.ipva.catalunya.latestAnual.period }
                : null,
              acum2015: indRaw.ipva.catalunya.acum2015 ? { value: indRaw.ipva.catalunya.acum2015.value } : null,
            }
          : null,
      }
    : null;

  let aids: ReportInput["aids"] = [];
  try {
    const rows = await db.rentalAid.findMany({
      where: { active: true, status: { not: "FINALIZADA" }, OR: [{ scopeCode: null }, { scopeCode: "09" }] },
      orderBy: [{ scope: "asc" }, { code: "asc" }],
      take: 6,
    });
    aids = rows.map((r) => ({
      title: r.title, amount: r.amount, audience: r.audience, source: r.source, url: r.url,
      reviewed: r.lastReviewedAt.toISOString().slice(0, 10),
    }));
  } catch {}
  if (aids.length === 0) {
    // mateix fallback editorial que /api/aid (mai inventat en calent)
    aids = (seedAids.aids as Array<Record<string, unknown>>)
      .filter((a) => (a.scopeCode === null || a.scopeCode === "09") && a.status !== "FINALIZADA")
      .slice(0, 6)
      .map((a) => ({
        title: String(a.title), amount: (a.amount as string) ?? null, audience: (a.audience as string) ?? null,
        source: String(a.source), url: String(a.url), reviewed: String(seedAids.revisado),
      }));
  }

  const input: ReportInput = {
    mun: {
      name: mun.name,
      comarca: mun.comarca,
      province: mun.province,
      code: mun.code,
      rentLatest: mun.rentLatest,
      rentPeriod: mun.rentPeriod,
      rentPrevYear: mun.rentPrevYear,
      rentPrevPeriod: mun.rentPrevPeriod,
      contractsLatest: mun.contractsLatest,
      isTense: mun.isTense,
      tenseList: mun.tenseList,
      rentHistory: mun.rentHistory,
    },
    building: building
      ? {
          nom: building.nom,
          refcat: building.refcat,
          tipus: building.tipus,
          altura: building.altura,
          yearBuilt: building.yearBuilt,
          avgRentEurMonth: building.avgRentEurMonth,
          sampleSize: building.sampleSize,
          source: building.source,
        }
      : null,
    ind,
    aids,
    subscriberMasked: maskEmail(user.email),
    planLabel: planName(plan, "ca"),
    genDate: new Date().toLocaleDateString("ca-ES", { day: "numeric", month: "long", year: "numeric" }),
  };

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
