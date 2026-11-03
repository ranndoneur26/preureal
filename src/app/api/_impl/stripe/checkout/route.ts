import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";

/**
 * POST /api/stripe/checkout { plan: "PREMIUM" | "PRO" }
 *
 * REGLA DE NEGOCIO: no se activa NINGÚN cobro real hasta que el propietario
 * conecte y autorice su cuenta de Stripe (variables STRIPE_* en .env).
 * Mientras tanto:
 *  - Sin STRIPE_SECRET_KEY y sin DEMO_CHECKOUT → error controlado.
 *  - Con DEMO_CHECKOUT=true (solo entorno de pruebas) → suscripción "demo"
 *    marcada en la BD para poder probar el embudo completo sin cobros.
 */
export async function POST(req: Request) {
  let user;
  try {
    // P1.3: MAI es cobra a un correu sense verificar (ni DEMO ni Stripe real)
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  // rate limit PER USUARI (E5 de l'auditoria: abans era una clau global compartida)
  const rl = await rateLimit(`checkout:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const planId = String(body?.plan || "");
  if (planId !== "PREMIUM" && planId !== "PRO") {
    return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });
  }
  const plan = PLANS[planId as "PREMIUM" | "PRO"];

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    if (process.env.DEMO_CHECKOUT === "true") {
      // P1.4: una ÚNICA subscripció activa — les anteriors (demo o reals de
      // proves) queden cancel·lades abans de crear la nova
      await db.subscription.updateMany({
        where: { userId: user.id, status: "active" },
        data: { status: "canceled" },
      });
      // MODO PRUEBA: activa la suscripción sin Stripe, marcada como demo
      const updated = await db.user.update({
        where: { id: user.id },
        data: { plan: planId },
      });
      const sub = await db.subscription.create({
        data: {
          userId: updated.id,
          plan: planId,
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          demo: true,
        },
      });
      await db.event.create({ data: { type: "CHECKOUT_DEMO", userId: updated.id, meta: JSON.stringify({ plan: planId }) } }).catch(() => {});
      await db.event.create({ data: { type: "SUBSCRIBE_SUCCESS", userId: updated.id, meta: JSON.stringify({ plan: planId, demo: true }) } }).catch(() => {});
      await audit(updated.id, "CHECKOUT_DEMO", sub.id, { plan: planId });
      return NextResponse.json({
        ok: true,
        mode: "DEMO",
        message:
          "Suscripción DEMO activada (modo prueba, sin cobro real). Conecta tu cuenta de Stripe para activar cobros reales.",
        subscriptionId: sub.id,
      });
    }
    return NextResponse.json(
      {
        error: "STRIPE_NOT_CONFIGURED",
        message:
          "Stripe no está configurado todavía. El propietario debe conectar su cuenta de Stripe y definir STRIPE_SECRET_KEY / STRIPE_PRICE_* en .env.",
      },
      { status: 503 }
    );
  }

  // Stripe real (requiere precios creados en el panel de Stripe)
  const priceId = process.env[plan.stripePriceEnv!];
  if (!priceId) {
    return NextResponse.json(
      {
        error: "PRICE_NOT_CONFIGURED",
        message: `Falta ${plan.stripePriceEnv} en .env (créalo en el panel de Stripe como precio recurrente).`,
      },
      { status: 503 }
    );
  }
  const stripe = new Stripe(secret);

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const cs = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    // la confirmació definitiva SEMPRE via webhook signat; la pantalla de
    // retorn només consulta l'estat real de la sessió (Fase 7)
    success_url: `${origin}/#/subscripcio/exit?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#/subscripcio/cancelat`,
    metadata: { userId: user.id, plan: planId },
  });
  await db.event.create({ data: { type: "CHECKOUT_START", userId: user.id, meta: JSON.stringify({ plan: planId }) } }).catch(() => {});
  return NextResponse.json({ ok: true, mode: "STRIPE", url: cs.url });
}
