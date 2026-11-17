import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlanSettings, historialAccess, historialCutoff } from "@/lib/plans";

export const maxDuration = 60;

/**
 * GET /api/cron/history-ttl — FASE 1 (plans migració progressiva): purga física
 * RGPD de l'historial de consultes del pla Gratuït més enllà dels 7 dies.
 *
 * El /api/history ja només SERVEIX la finestra de 7 dies (TTL visible), però
 * aquí esborrem les files vellutes perquè el «guardat 7 dies» sigui esborrat
 * efectiu, no només ocultació. Només toca SearchLog kind DETAIL d'usuaris
 * amb pla FREE: les files dels plans de pagament (historial il·limitat) i
 * els TEASER anònims no es toquen. Idempotent: reexecutar no fa res.
 *
 * Cron diari (vercel.json, abans del resum d'e-mails de les 04:00). Auth: si
 * CRON_SECRET està definit exigeix `Authorization: Bearer $CRON_SECRET`
 * (mateix patró que la resta de crons).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  }
  // TTL del Gratuït des de la config efectiva (PlanSetting amb fallback al
  // default 7). Si l'admin el canvia, la purga segueix el mateix valor.
  let ttlDies = 7;
  try {
    const settings = await getPlanSettings();
    ttlDies = historialAccess(settings.FREE.features).ttlDies;
  } catch {
    // BD no disponible: default defensiu (mai purguem de menys ni de més)
  }
  if (ttlDies <= 0) {
    return NextResponse.json({ ok: true, skipped: "TTL<=0", ttlDies });
  }
  const cutoff = historialCutoff(new Date(), ttlDies);
  if (!cutoff) return NextResponse.json({ ok: true, skipped: "sense cutoff" });
  const deleted = await db.searchLog.deleteMany({
    where: {
      kind: "DETAIL",
      createdAt: { lt: cutoff },
      user: { is: { plan: "FREE" } },
    },
  });
  return NextResponse.json({
    ok: true,
    ttlDies,
    cutoff: cutoff.toISOString(),
    deleted: deleted.count,
  });
}
