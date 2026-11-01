import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  await db.user.update({ where: { id: user.id }, data: { plan: "FREE" } });
  await db.subscription.updateMany({
    where: { userId: user.id, demo: true, status: "active" },
    data: { status: "canceled" },
  });
  await db.event.create({ data: { type: "DEMO_CANCEL", userId: user.id } }).catch(() => {});
  await audit(user.id, "DEMO_CANCEL", null, null);
  return NextResponse.json({ ok: true });
}
