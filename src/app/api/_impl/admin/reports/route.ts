import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";

/** GET /api/admin/reports — llistat d'informes ciutadans amb filtres per estat. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where: any = {};
  if (status && ["PENDING", "ACCEPTED", "REJECTED"].includes(status)) where.status = status;

  const [reports, counts] = await Promise.all([
    db.priceReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true } } },
    }),
    db.priceReport.groupBy({ by: ["status"], _count: true }),
  ]);

  const stats = { PENDING: 0, ACCEPTED: 0, REJECTED: 0 };
  for (const c of counts) stats[c.status as keyof typeof stats] = c._count;

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      municipalityCode: r.municipalityCode,
      buildingId: r.buildingId,
      offerEurMonth: r.offerEurMonth,
      offerEurM2: r.offerEurM2,
      surfaceM2: r.surfaceM2,
      rooms: r.rooms,
      contractType: r.contractType,
      reportedAt: r.reportedAt,
      note: r.note,
      status: r.status,
      reviewedAt: r.reviewedAt,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt,
      userEmail: r.user?.email || null,
    })),
    stats,
  });
}

/** PATCH /api/admin/reports { id, status, reviewNote? } — moderació (Fase 10/12). */
export async function PATCH(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rl = await rateLimit(`moderate:${admin.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").slice(0, 40);
  const status = String(body?.status || "");
  if (!id || !["ACCEPTED", "REJECTED", "PENDING"].includes(status)) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }
  const report = await db.priceReport.update({
    where: { id },
    data: {
      status,
      reviewedAt: new Date(),
      reviewNote: body?.reviewNote ? String(body.reviewNote).slice(0, 300) : null,
    },
  });
  await audit(admin.id, status === "ACCEPTED" ? "REPORT_ACCEPT" : "REPORT_REJECT", id, {
    municipalityCode: report.municipalityCode,
    offerEurMonth: report.offerEurMonth,
  });
  return NextResponse.json({ ok: true, status: report.status });
}
