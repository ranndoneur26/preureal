import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/stripe/portal — crea una sessió del Portal de Client de Stripe
 * (gestionar targeta, factures, cancel·lació) — Fase 7.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`portal:${user.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });

  // cal un customer de Stripe: el busquem a les subscripcions de l'usuari
  const sub = await db.subscription.findFirst({
    where: { userId: user.id, stripeCustomerId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!sub?.stripeCustomerId) {
    return NextResponse.json(
      { error: "NO_CUSTOMER", message: "Encara no tens cap subscripció amb Stripe." },
      { status: 404 }
    );
  }

  const stripe = new Stripe(secret);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${origin}/#/panell`,
  });
  return NextResponse.json({ ok: true, url: session.url });
}
