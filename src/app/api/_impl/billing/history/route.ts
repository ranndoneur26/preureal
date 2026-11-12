import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/billing/history — historial de facturació de l'usuari (Fase 7/11).
 * Si hi ha Stripe: llegeix les factures reals del customer.
 * Sempre inclou també l'historial local de subscripcions (demo i reals).
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const subs = await db.subscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  let invoices: Array<{ id: string; date: string | null; amount: number | null; currency: string | null; status: string | null; hostedUrl: string | null; pdfUrl: string | null }> = [];
  const secret = process.env.STRIPE_SECRET_KEY;
  const customerId = subs.find((s) => s.stripeCustomerId)?.stripeCustomerId;
  if (secret && customerId) {
    try {
      const stripe = new Stripe(secret);
      const list = await stripe.invoices.list({ customer: customerId, limit: 24 });
      invoices = list.data.map((inv) => ({
        id: inv.id || "",
        date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        amount: inv.amount_paid != null ? inv.amount_paid / 100 : null,
        currency: inv.currency || null,
        status: inv.status,
        hostedUrl: inv.hosted_invoice_url || null,
        pdfUrl: inv.invoice_pdf || null,
      }));
    } catch (e) {
      console.error("billing/history stripe", e);
    }
  }

  return NextResponse.json({
    subscriptions: subs.map((s) => ({
      id: s.id,
      plan: s.plan,
      status: s.status,
      demo: s.demo,
      currentPeriodEnd: s.currentPeriodEnd,
      createdAt: s.createdAt,
    })),
    invoices,
    stripeConfigured: Boolean(secret),
  });
}
