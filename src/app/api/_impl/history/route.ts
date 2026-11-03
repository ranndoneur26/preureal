import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows } from "@/lib/plans";

/**
 * GET    /api/history — historial de consultes de l'usuari (Premium+, Fase 9)
 * DELETE /api/history?id=... | all=1 — eliminació de consultes
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
  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "historial"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") || "50", 10) || 50, 200);
  const logs = await db.searchLog.findMany({
    where: { userId: user.id, kind: "DETAIL" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  // noms de municipis presents
  const codes = [...new Set(logs.map((l) => l.municipalityCode).filter(Boolean))] as string[];
  const muns = codes.length
    ? await db.municipality.findMany({
        where: { code: { in: codes } },
        select: { code: true, name: true, rentLatest: true, rentPeriod: true, isTense: true },
      })
    : [];
  const munMap = new Map(muns.map((m) => [m.code, m]));
  return NextResponse.json({
    history: logs.map((l) => {
      const m = l.municipalityCode ? munMap.get(l.municipalityCode) : undefined;
      return {
        id: l.id,
        buildingId: l.buildingId,
        municipalityCode: l.municipalityCode,
        municipalityName: m?.name || null,
        rentLatest: m?.rentLatest ?? null,
        rentPeriod: m?.rentPeriod ?? null,
        isTense: m?.isTense ?? null,
        createdAt: l.createdAt,
      };
    }),
  });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const url = new URL(req.url);
  if (url.searchParams.get("all") === "1") {
    await db.searchLog.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ ok: true, deleted: "all" });
  }
  const id = url.searchParams.get("id");
  if (!id || id.length > 40) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  await db.searchLog.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
