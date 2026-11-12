import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";
import { getSubscriptionState, subscriptionLocalData } from "@/lib/subscription";

/**
 * POST /api/subscription/cancel — programar la cancel·lació a FINAL DEL PERÍODE
 * (l'usuari manté l'accés fins a currentPeriodEnd, igual que al Portal de
 * Stripe). Equival a l'Edge Function `cancel-subscription` del encàrrec.
 *
 * v37 — RETENCIÓ: el flux de la UI mostra abans alternatives (baixar de pla,
 * portal de pagament) i demana un motiu opcional (whitelist + text lliure
 * opcional <=500 chars). El motiu es desa a Subscription.cancelReason per a
 * analítica de retenció; la cancel·lació funciona igual sense body (compat).
 *
 * Seguretat: l'usuari ve de requireVerifiedUser() (sessió server-side); només
 * pot operar sobre LA SEVA subscripció vigent; el camp cancelAtPeriodEnd mai
 * s'accepta del client (la política anti auto-Premium queda intacta: cancelar
 * només REDUEIX accés, mai l'amplia).
 */

const CANCEL_REASONS = ["CAR", "NO_USO", "PREU", "FALTEN_DADES", "UN_ALTRE"] as const;

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`sub-cancel:${user.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  // v37: motiu opcional del flux de retenció (mai llança si el body falta)
  let reason: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown; feedback?: unknown };
    const r = typeof body?.reason === "string" ? body.reason : "";
    if ((CANCEL_REASONS as readonly string[]).includes(r)) reason = r;
    const fb = typeof body?.feedback === "string" ? body.feedback.trim().slice(0, 500) : "";
    if (fb) reason = `${reason ? reason + ": " : "UN_ALTRE: "}${fb}`;
  } catch {
    /* body buit o no-JSON: cancel·lació normal sense motiu */
  }

  const sub = await db.subscription.findFirst({
    where: { userId: user.id, status: { in: ["active", "trialing"] } },
  });
  if (!sub) {
    return NextResponse.json(
      { error: "NO_ACTIVE_SUBSCRIPTION", message: "No tens cap subscripció vigent." },
      { status: 404 }
    );
  }

  // Subscripció REAL de Stripe → la veritat és a Stripe (API), i sincronitzem.
  // DEMO o sessió sense sub de Stripe → només estat local (sense cobrament).
  const isRealStripe =
    !sub.demo &&
    Boolean(process.env.STRIPE_SECRET_KEY) &&
    Boolean(sub.stripeSubscriptionId) &&
    !String(sub.stripeSubscriptionId).startsWith("session_");

  try {
    if (isRealStripe) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const s = await stripe.subscriptions.update(sub.stripeSubscriptionId!, {
        cancel_at_period_end: true,
      });
      await db.subscription.update({
        where: { id: sub.id },
        data: { ...subscriptionLocalData(s), plan: sub.plan, cancelReason: reason },
      });
    } else {
      await db.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: true, cancelReason: reason },
      });
    }
  } catch (e) {
    console.error("subscription/cancel", e);
    return NextResponse.json(
      { error: "STRIPE_ERROR", message: "No s'ha pogut programar la cancel·lació. Prova-ho més tard." },
      { status: 502 }
    );
  }

  await audit(user.id, "SUBSCRIPTION_CANCEL_SCHEDULED", sub.id, { plan: sub.plan }).catch(() => {});
  const state = await getSubscriptionState(user);
  return NextResponse.json({ ok: true, state });
}
