import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/analytics";

/**
 * POST /api/stripe/demo — cancela la suscripción DEMO (para pruebas).
 * Solo disponible en modo DEMO_CHECKOUT=true.
 */
export async function POST(req: Request) {
  if (process.env.DEMO_CHECKOUT !== "true") {
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  await db.user.update({ where: { id: session.userId }, data: { plan: "FREE" } });
  await db.subscription.updateMany({
    where: { userId: session.userId, demo: true, status: "active" },
    data: { status: "canceled" },
  });
  await logEvent("DEMO_CANCEL", session.userId);
  return NextResponse.json({ ok: true });
}
