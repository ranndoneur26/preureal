import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { getPlanSettings, historialAccess, historialCutoff } from "@/lib/plans";

/**
 * GET    /api/history — historial de consultes de l'usuari (Fase 9)
 * FASE 1 (plans migració progressiva): el Gratuït també en té, amb TTL de 7
 * dies (finestra aplicada AL SERVIDOR; el pla ho decideix via
 * features.historial / features.historialTtlDies). Plans sense cap historial
 * segueixen rebent el mateix 403 PLAN_REQUIRED d'abans.
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
  const settings = await getPlanSettings();
  const access = historialAccess(settings[plan].features);
  if (!access.full && access.ttlDies === 0) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") || "50", 10) || 50, 200);
  // FASE 1 — finestra TTL del Gratuït: només es serveixen les consultes dels
  // últims N dies (7 per defecte). La purga física la fa el cron diari
  // /api/cron/history-ttl (RGPD: esborrat efectiu, no només ocultació).
  const cutoff = historialCutoff(new Date(), access.ttlDies);
  const logs = await db.searchLog.findMany({
    where: {
      userId: user.id,
      kind: "DETAIL",
      ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
    },
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
    // FASE 1 — la UI mostra la nota «es guarda 7 dies» amb aquest valor
    windowDies: access.full ? null : access.ttlDies,
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
