import { NextResponse, after } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { receiptMail, sendMail } from "@/lib/mail";
import { audit } from "@/lib/security";
import { planName, syncUserPlan } from "@/lib/plans";
import {
  formatEurFromCents,
  isUniqueViolation,
  planFromPriceId,
  subscriptionLocalData,
} from "@/lib/subscription";

// El rebut per correu va EN BACKGROUND amb after(): Vercel manté la funció
// viva fins que acaba l'enviament (ignorat fora de Vercel).
export const maxDuration = 60;

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
 * IDEMPOTÈNCIA (P1.1 + v23): la fila StripeEvent fa de LOCK. S'insereix ABANS
 * d'aplicar efectes (claim atòmic per la clau única eventId) i S'ELIMINA si
 * el processament falla → Stripe reentrega i l'event torna a executar-se.
 * v23: es DISTINGUEIX un duplicat real (violació d'unicitat → 200 sense
 * efectes) d'un error de BD (→ 500 perquè Stripe reentregui; abans un error
 * de connexió es tractava com a duplicat i l'event es perdia per sempre).
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

  // --- idempotència P1.1: claim → processar → alliberar si falla ---
  const claim = await db.stripeEvent
    .create({ data: { eventId: event.id, type: event.type } })
    .then(() => "claimed" as const)
    .catch((e: unknown) => {
      if (isUniqueViolation(e)) return "duplicate" as const;
      // error de BD (connexió, timeout...): NO és un duplicat → 500 i Stripe
      // reentregarà. Respondre 200 aquí PERDRIA l'event per sempre.
      console.error("stripe webhook: claim fallat (error de BD)", e);
      return "db_error" as const;
    });
  if (claim === "duplicate") {
    // ja processat amb ÈXIT (reentrega): resposta sense efectes
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim === "db_error") {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const userId = cs.metadata?.userId;
        const plan = cs.metadata?.plan === "PRO" ? "PRO" : "PREMIUM";
        if (userId) {
          // v23 — MAI es concedeix el pla sense verificar el pagament real:
          // amb mètodes de pagament asíncrons (SEPA, transferències) la sessió
          // es completa amb payment_status "unpaid". El pla arribarà quan el
          // pagament es confirmi (customer.subscription.created/updated +
          // invoice.paid). Sense això, algú podria activar Premium sense pagar.
          const paid =
            cs.payment_status === "paid" || cs.payment_status === "no_payment_required";
          if (!paid) {
            await audit(userId, "STRIPE_CHECKOUT_UNPAID", String(cs.id), {
              payment_status: cs.payment_status ?? null,
              plan,
            });
            break;
          }
          // mode subscription: l'estat real ve de la subscription de Stripe
          let subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id || null;
          // v22: sincronitza TOTS els camps del encàrrec (període, interval,
          // cancelAtPeriodEnd, price) directament des de la font de veritat
          let stripeData: ReturnType<typeof subscriptionLocalData> | null = null;
          if (subId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subId);
              stripeData = subscriptionLocalData(sub);
            } catch {
              // v23: si NO es pot llegir l'estat real de Stripe, NO es concedeix
              // el pla "a cegues" (status "incomplete"); el següent
              // subscription.created/updated el corregirà i activarà el pla.
            }
          }
          // P1.4: una ÚNICA subscripció activa per usuari — les anteriors
          // queden tancades (l'upsert de sota reactiva la de subId)
          await db.subscription.updateMany({
            where: { userId, status: "active" },
            data: { status: "canceled" },
          });
          if (subId) {
            await db.subscription.upsert({
              where: { stripeSubscriptionId: subId },
              create: {
                userId,
                stripeCustomerId: String(cs.customer || ""),
                stripeSubscriptionId: subId,
                plan,
                ...(stripeData ?? {
                  status: "incomplete",
                  currentPeriodStart: null,
                  currentPeriodEnd: null,
                  cancelAtPeriodEnd: false,
                  billingInterval: null,
                  stripePriceId: null,
                }),
              },
              update: { plan, ...(stripeData ?? {}) },
            });
          } else {
            await db.subscription.create({
              data: {
                userId,
                stripeCustomerId: String(cs.customer || ""),
                stripeSubscriptionId: `session_${cs.id}`,
                plan,
                status: "active",
                currentPeriodEnd: null,
              },
            });
          }
          // v23 — anti-cobros duplicats: si l'usuari tenia UNA altra subscripció
          // REAL de Stripe encara activa (p. ex. checkout des de dues pestanyes),
          // es cancel·la TAMBÉ a Stripe (la BD ja la tanca amb l'updateMany).
          const others = await db.subscription.findMany({
            where: {
              userId,
              status: { in: ["active", "trialing"] },
              stripeSubscriptionId: subId ? { not: subId } : undefined,
              AND: [{ demo: false }, { stripeSubscriptionId: { not: null } }],
            },
          });
          for (const o of others) {
            if (!o.stripeSubscriptionId || o.stripeSubscriptionId.startsWith("session_")) continue;
            try {
              await stripe.subscriptions.cancel(o.stripeSubscriptionId);
              await db.subscription.update({
                where: { id: o.id },
                data: { status: "canceled" },
              });
              await audit(userId, "STRIPE_SUB_SUPERSEDED", o.stripeSubscriptionId, {
                replacedBy: subId || cs.id,
              });
            } catch (e) {
              // no bloquegem l'activació nova; el webhook deleted/updated de la
              // antiga acabarà de netejar (i syncUserPlan és auto-curatiu)
              console.error("stripe webhook: cancel·lant sub antiga", e);
            }
          }
          // v23 — P1.4 estricte: el pla es DERIVA de les subscripcions vigents
          // (mai s'escriu directament des de la sessió de checkout)
          await syncUserPlan(userId, { force: true });
          await db.event
            .create({ data: { type: "SUBSCRIBE_SUCCESS", userId, meta: JSON.stringify({ plan, mode: "stripe" }) } })
            .catch(() => {});
          await audit(userId, "STRIPE_SUBSCRIBE", subId || cs.id, {
            plan,
            status: stripeData?.status ?? "incomplete",
          });
          const u = await db.user.findUnique({ where: { id: userId } });
          if (u) {
            const locale = u.locale === "es" ? "es" : "ca";
            // v23 — rebut amb l'IMPORT REAL facturat per Stripe (mai un preu
            // memoritzat) i el nom nominal del pla ("Pro (agents)")
            const amount = formatEurFromCents(cs.amount_total) ?? "—";
            const mail = receiptMail(planName(plan, locale), amount, locale);
            after(async () => {
              await sendMail({
                to: u.email,
                subject: mail.subject,
                html: mail.html,
                type: "RECEIPT",
                userId: u.id,
                // P1 v19 — idempotència: re-entregues del webhook o reprocessos
                // mai generen un segon rebut per la mateixa checkout session
                idempotencyKey: `stripe-receipt:${subId || cs.id}`,
              });
            });
          }
        }
        break;
      }
      // v22: `created` també es gestiona — una subscripció creada fora del
      // checkout (p. ex. des del Portal de Stripe) queda sincronitzada; l'usuari
      // es dedueix del customer a partir de subscripcions anteriors.
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const s = event.data.object as Stripe.Subscription;
        const data = subscriptionLocalData(s);
        // v23 — canvis de pla fets des del Portal de Client de Stripe: allí no
        // hi ha metadata (userId/plan); l'únic senyal és el PRICE de la
        // subscripció. Si el price no és cap dels nostres (p. ex. preu esborrat
        // al panel), es conserva el plan existent de la fila.
        const derivedPlan = planFromPriceId(s.items.data[0]?.price?.id);
        let row = await db.subscription.findUnique({ where: { stripeSubscriptionId: String(s.id) } });
        if (!row && event.type === "customer.subscription.created") {
          const prior = await db.subscription.findFirst({
            where: { stripeCustomerId: String(s.customer || "") },
            orderBy: { createdAt: "desc" },
          });
          if (prior) {
            row = await db.subscription.create({
              data: {
                userId: prior.userId,
                stripeCustomerId: String(s.customer || ""),
                stripeSubscriptionId: String(s.id),
                plan: derivedPlan ?? (prior.plan === "PRO" ? "PRO" : "PREMIUM"),
                ...data,
              },
            });
          }
        }
        if (row) {
          await db.subscription.update({
            where: { id: row.id },
            data: { ...data, ...(derivedPlan ? { plan: derivedPlan } : {}) },
          });
          // P1.4: el pla de l'usuari es recalcula SEMPRE a partir de les
          // subscripcions vigents (mai es confia en un estat intermedi)
          await syncUserPlan(row.userId, { force: true });
          const stillPaid = data.status === "active" || data.status === "trialing";
          if (!stillPaid) {
            await audit(null, "STRIPE_SUB_DOWNGRADED", String(s.id), { status: data.status });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const s = event.data.object as Stripe.Subscription;
        const sub = await db.subscription.findUnique({ where: { stripeSubscriptionId: String(s.id) } });
        if (sub) {
          await db.subscription.update({
            where: { id: sub.id },
            data: { status: "canceled", cancelAtPeriodEnd: false },
          });
          // P1.4: el pla de l'usuari es recalcula SEMPRE a partir de les
          // subscripcions vigents (mai es confia en un estat intermedi)
          await syncUserPlan(sub.userId, { force: true });
          await audit(null, "STRIPE_SUB_DOWNGRADED", String(s.id), { status: "canceled" });
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
          await syncUserPlan(sub.userId, { force: true }); // P1.4: reactivació coherent
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
    // P1.1: alliberem el lock → Stripe reentregarà i l'event es reprocessarà
    await db.stripeEvent.delete({ where: { eventId: event.id } }).catch(() => {});
    console.error("stripe webhook", e);
    return NextResponse.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
