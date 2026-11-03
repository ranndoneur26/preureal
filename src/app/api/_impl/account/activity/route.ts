import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/account/activity — historial d'activitat del compte (Fase 1:
 * perfil — "historial d'activitat, si és necessari").
 *
 * Retorna els últims 20 esdeveniments propis (SIGNUP, LOGIN, EMAIL_VERIFIED,
 * PASSWORD_RESET, SESSIONS_REVOKED, PAYWALL_VIEW, ...) i l'últim inici de
 * sessió registrat. Només dades pròpies; cap PII de tercers.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const events = await db.event.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, type: true, createdAt: true },
  });

  return NextResponse.json({ events, lastLoginAt: user.lastLoginAt });
}
