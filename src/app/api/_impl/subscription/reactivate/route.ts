import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";
import { getSubscriptionState, subscriptionLocalData } from "@/lib/subscription";

/**
 * POST /api/subscription/reactivate — desfés una cancel·lació programada
 * (cancelAtPeriodEnd → false). Equival a l'Edge Function
 * `reactivate-subscription` del encàrrec. Mai concedeix accés que la BD no
 * tingui ja: només té efecte si hi ha una subscripció vigent que estava
 * marcada per cancel·lar-se a final de període.
 */
export async function POST() {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`sub-react:${user.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const sub = await db.subscription.findFirst({
    where: { userId: user.id, status: { in: ["active", "trialing"] } },
  });
  if (!sub || !sub.cancelAtPeriodEnd) {
    return NextResponse.json(
      {
        error: "NOTHING_TO_REACTIVATE",
        message: "No tens cap cancel·lació programada per desfés.",
      },
      { status: 404 }
    );
  }

  const isRealStripe =
    !sub.demo &&
    Boolean(process.env.STRIPE_SECRET_KEY) &&
    Boolean(sub.stripeSubscriptionId) &&
    !String(sub.stripeSubscriptionId).startsWith("session_");

  try {
    if (isRealStripe) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const s = await stripe.subscriptions.update(sub.stripeSubscriptionId!, {
        cancel_at_period_end: false,
      });
      await db.subscription.update({
        where: { id: sub.id },
        data: { ...subscriptionLocalData(s), plan: sub.plan },
      });
    } else {
      await db.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: false },
      });
    }
  } catch (e) {
    console.error("subscription/reactivate", e);
    return NextResponse.json(
      { error: "STRIPE_ERROR", message: "No s'ha pogut reactivar la subscripció. Prova-ho més tard." },
      { status: 502 }
    );
  }

  await audit(user.id, "SUBSCRIPTION_REACTIVATED", sub.id, { plan: sub.plan }).catch(() => {});
  const state = await getSubscriptionState(user);
  return NextResponse.json({ ok: true, state });
}
