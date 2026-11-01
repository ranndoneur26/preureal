import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { logEvent, rateLimit } from "@/lib/analytics";

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
  const rl = rateLimit("checkout", 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const planId = String(body?.plan || "");
  if (planId !== "PREMIUM" && planId !== "PRO") {
    return NextResponse.json({ error: "BAD_PLAN" }, { status: 400 });
  }
  const plan = PLANS[planId as "PREMIUM" | "PRO"];

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    if (process.env.DEMO_CHECKOUT === "true") {
      // MODO PRUEBA: activa la suscripción sin Stripe, marcada como demo
      const user = await db.user.update({
        where: { id: session.userId },
        data: { plan: planId },
      });
      const sub = await db.subscription.create({
        data: {
          userId: user.id,
          plan: planId,
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          demo: true,
        },
      });
      await logEvent("CHECKOUT_DEMO", user.id, { plan: planId });
      await logEvent("SUBSCRIBE_SUCCESS", user.id, { plan: planId, demo: true });
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
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const cs = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email,
    success_url: `${origin}/#/suscripte?ok=1`,
    cancel_url: `${origin}/#/preus?cancelat=1`,
    metadata: { userId: user.id, plan: planId },
  });
  await logEvent("CHECKOUT_START", user.id, { plan: planId });
  return NextResponse.json({ ok: true, mode: "STRIPE", url: cs.url });
}
