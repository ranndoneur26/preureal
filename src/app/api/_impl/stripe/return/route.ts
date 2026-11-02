import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * POST /api/stripe/return { sessionId } — Fase 7: ruta de retorn del pagament.
 * La pantalla de confirmació crida aquí amb el session_id de Stripe; el
 * servidor consulta l'estat REAL de la sessió a Stripe (mai confia en l'URL).
 *
 * NOTA: l'activació efectiva del pla la fa el webhook signat; aquest endpoint
 * només INFORMA de l'estat (per evitar que un usuari s'activi un pla canviant
 * una URL).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId || "").slice(0, 300);
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return NextResponse.json({ error: "BAD_SESSION_ID" }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  let cs: Stripe.Checkout.Session;
  try {
    cs = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  // només la sessió del propi usuari (metadata) és consultable
  if (cs.metadata?.userId !== user.id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const paid = cs.payment_status === "paid" || cs.status === "complete";
  // estat efectiu del pla: el que diu la BD (activat per webhook), no l'URL
  const fresh = await db.user.findUnique({ where: { id: user.id }, select: { plan: true } });

  return NextResponse.json({
    ok: true,
    paymentStatus: cs.payment_status,
    planMetadata: cs.metadata?.plan || null,
    planEfectiu: fresh?.plan || "FREE",
    activat: paid && fresh?.plan && fresh.plan !== "FREE",
    message: paid
      ? fresh?.plan && fresh.plan !== "FREE"
        ? "Pagament confirmat i subscripció activa."
        : "Pagament rebut; la subscripció s'activarà en rebre la confirmació de Stripe (normalment segons)."
      : "El pagament no s'ha completat.",
  });
}
