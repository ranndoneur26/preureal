import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/analytics";
import { receiptMail, sendMail } from "@/lib/mail";

/**
 * POST /api/stripe/webhook — endpoint de webhooks de Stripe.
 * Configurarlo en el panel de Stripe cuando el propietario conecte su cuenta
 * (STRIPE_WEBHOOK_SECRET). Gestiona: checkout completado, cambios y
 * cancelaciones de suscripción.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });

  const stripe = new Stripe(secret);
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig || "", whSecret || "");
  } catch (e: any) {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const userId = cs.metadata?.userId;
        const plan = cs.metadata?.plan || "PREMIUM";
        if (userId) {
          await db.user.update({ where: { id: userId }, data: { plan } });
          await db.subscription.upsert({
            where: { stripeSubscriptionId: String(cs.subscription || cs.id) },
            create: {
              userId,
              stripeCustomerId: String(cs.customer || ""),
              stripeSubscriptionId: String(cs.subscription || cs.id),
              plan,
              status: "active",
              currentPeriodEnd: cs.expires ? new Date((cs.expires + 30 * 86400) * 1000) : null,
            },
            update: { status: "active", plan },
          });
          await logEvent("SUBSCRIBE_SUCCESS", userId, { plan, mode: "stripe" });
          const user = await db.user.findUnique({ where: { id: userId } });
          if (user) {
            const locale = user.locale === "es" ? "es" : "ca";
            const amount = plan === "PRO" ? "19,99 €" : "7,99 €";
            const mail = receiptMail(plan === "PRO" ? "Pro" : "Premium", amount, locale);
            sendMail({ to: user.email, subject: mail.subject, html: mail.html });
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const s = event.data.object as Stripe.Subscription;
        const status = event.type === "deleted" ? "canceled" : s.status;
        const sub = await db.subscription.findUnique({
          where: { stripeSubscriptionId: String(s.id) },
        });
        if (sub) {
          await db.subscription.update({ where: { id: sub.id }, data: { status } });
          if (status === "canceled" || status === "incomplete_expired") {
            await db.user.update({ where: { id: sub.userId }, data: { plan: "FREE" } });
          }
        }
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = String(inv.customer || "");
        const sub = await db.subscription.findFirst({ where: { stripeCustomerId: customerId } });
        if (sub) {
          await db.subscription.update({
            where: { id: sub.id },
            data: { status: "active", currentPeriodEnd: new Date((inv.period_end || 0) * 1000) },
          });
        }
        break;
      }
    }
  } catch (e) {
    console.error("stripe webhook", e);
  }
  return NextResponse.json({ received: true });
}
