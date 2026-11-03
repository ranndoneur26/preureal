import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { syncUserPlan } from "@/lib/plans";
import { audit } from "@/lib/security";

/**
 * POST /api/stripe/demo — cancela la suscripción DEMO (para pruebas).
 * Solo disponible en modo DEMO_CHECKOUT=true.
 */
export async function POST() {
  if (process.env.DEMO_CHECKOUT !== "true") {
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: el flux DEMO també exigeix verificació
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  await db.subscription.updateMany({
    where: { userId: user.id, demo: true, status: "active" },
    data: { status: "canceled" },
  });
  // P1.4: el pla es recalcula a partir de les subscripcions que queden vigents
  // (si l'usuari tingués una subscripció real activa, NO perdria el pla)
  await syncUserPlan(user.id, { force: true });
  await db.event.create({ data: { type: "DEMO_CANCEL", userId: user.id } }).catch(() => {});
  await audit(user.id, "DEMO_CANCEL", null, undefined);
  return NextResponse.json({ ok: true });
}
