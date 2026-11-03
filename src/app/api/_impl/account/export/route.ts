import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/account/export — portabilitat de dades (art. 20 RGPD).
 * Retorna un JSON amb TOTES les dades personals de l'usuari autenticat.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const [favorites, comparisons, searchLogs, priceReports, subscriptions] = await Promise.all([
    db.favorite.findMany({ where: { userId: user.id } }),
    db.savedComparison.findMany({ where: { userId: user.id } }),
    db.searchLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.priceReport.findMany({ where: { userId: user.id } }),
    db.subscription.findMany({ where: { userId: user.id } }),
  ]);

  const payload = {
    exportat: new Date().toISOString(),
    compte: {
      email: user.email,
      nom: user.name,
      idioma: user.locale,
      rol: user.role,
      pla: user.plan,
      verificat: Boolean(user.emailVerifiedAt),
      creat: user.createdAt,
    },
    preferits: favorites,
    comparacions: comparisons,
    historialConsultes: searchLogs,
    informesPreu: priceReports,
    subscripcions: subscriptions.map((s) => ({
      plan: s.plan,
      status: s.status,
      demo: s.demo,
      currentPeriodEnd: s.currentPeriodEnd,
      createdAt: s.createdAt,
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="preureal_dades_personals.json"`,
    },
  });
}
