import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { receiptMail, sendMail } from "@/lib/mail";
import { audit } from "@/lib/security";

/**
 * POST /api/stripe/webhook — endpoint de webhooks de Stripe.
 * Configurarlo en el panel de Stripe cuando el propietario conecte su cuenta
 * (STRIPE_WEBHOOK_SECRET).
 *
 * Gestiona (Fase 7):
 *  - checkout.session.completed → activa la subscripció (mai des de la URL de retorn)
 *  - customer.subscription.updated/deleted → sincronitza estat i canvi de pla
 *  - invoice.paid → renovacions (actualitza període)
 *  - invoice.payment_failed → marca past_due
 *
 * IDEMPOTÈNCIA: cada event.id es registra a StripeEvent; si ja s'havia
 * processat, es respon 200 sense repetir efectes (Stripe reentrega).
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
  } catch {
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 400 });
  }

  // --- idempotència (V9 de l'auditoria) ---
  const inserted = await db.stripeEvent
    .create({ data: { eventId: event.id, type: event.type } })
    .then(() => true)
    .catch(() => false);
  if (!inserted) {
    // ja processat (reentrega): resposta sense efectes
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const userId = cs.metadata?.userId;
        const plan = cs.metadata?.plan === "PRO" ? "PRO" : "PREMIUM";
        if (userId) {
          // mode subscription: l'estat real ve de la subscription de Stripe
          let subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id || null;
          let status = "active";
          let periodEnd: Date | null = null;
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              status = sub.status;
              const item = sub.items.data[0];
              if (item?.current_period_end) periodEnd = new Date(item.current_period_end * 1000);
            } catch {
              // si no es pot llegir, el següent subscription.updated ho corregirà
            }
          }
          await db.user.update({ where: { id: userId }, data: { plan } });
          if (subId) {
            await db.subscription.upsert({
              where: { stripeSubscriptionId: subId },
              create: {
                userId,
                stripeCustomerId: String(cs.customer || ""),
                stripeSubscriptionId: subId,
                plan,
                status,
                currentPeriodEnd: periodEnd,
              },
              update: { status, plan, currentPeriodEnd: periodEnd },
            });
          } else {
            await db.subscription.create({
              data: {
                userId,
                stripeCustomerId: String(cs.customer || ""),
                stripeSubscriptionId: `session_${cs.id}`,
                plan,
                status,
                currentPeriodEnd: periodEnd,
              },
            });
          }
          await db.event
            .create({ data: { type: "SUBSCRIBE_SUCCESS", userId, meta: JSON.stringify({ plan, mode: "stripe" }) } })
            .catch(() => {});
          await audit(userId, "STRIPE_SUBSCRIBE", subId || cs.id, { plan, status });
          const u = await db.user.findUnique({ where: { id: userId } });
          if (u) {
            const locale = u.locale === "es" ? "es" : "ca";
            const amount = plan === "PRO" ? "19,99 €" : "7,99 €";
            const mail = receiptMail(plan === "PRO" ? "Pro" : "Premium", amount, locale);
            sendMail({ to: u.email, subject: mail.subject, html: mail.html }).catch(() => {});
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const s = event.data.object as Stripe.Subscription;
        const status = event.type === "deleted" ? "canceled" : s.status;
        const item = s.items.data[0];
        const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
        const priceId = item?.price?.id || null;
        const sub = await db.subscription.findUnique({ where: { stripeSubscriptionId: String(s.id) } });
        if (sub) {
          await db.subscription.update({
            where: { id: sub.id },
            data: { status, currentPeriodEnd: periodEnd, stripePriceId: priceId },
          });
          const stillPaid = status === "active" || status === "trialing";
          if (!stillPaid) {
            await db.user.update({ where: { id: sub.userId }, data: { plan: "FREE" } });
            await audit(null, "STRIPE_SUB_DOWNGRADED", String(s.id), { status });
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
            data: {
              status: "active",
              currentPeriodEnd: inv.period_end ? new Date(inv.period_end * 1000) : sub.currentPeriodEnd,
            },
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = String(inv.customer || "");
        const sub = await db.subscription.findFirst({ where: { stripeCustomerId: customerId } });
        if (sub) {
          await db.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
          await audit(null, "STRIPE_PAYMENT_FAILED", String(inv.id), { customerId });
        }
        break;
      }
    }
  } catch (e) {
    console.error("stripe webhook", e);
  }
  return NextResponse.json({ received: true });
}
