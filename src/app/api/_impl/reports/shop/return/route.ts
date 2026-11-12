import { NextResponse, after } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { fulfillPurchase, notifyReportReady, purchaseDownloadUrl, shopError } from "@/lib/reports-fulfill";

/**
 * POST /api/reports/shop/return { sessionId } — v38.8: ruta de retorn del
 * pagament d'un informe individual. La pantalla de confirmació crida aquí amb
 * el session_id de Stripe; el servidor consulta l'estat REAL a Stripe (mai
 * confia en l'URL). La confirmació efectiva la fa el webhook signat; aquest
 * endpoint compleix la compra com a FALLBACK idempotent (p. ex. si el webhook
 * arriba tard) i envia el correu d'entrega quan és qui la completa.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return shopError("UNAUTHENTICATED", 401);
  }
  const rl = await rateLimit(`shop-return:${user.id}`, 20, 60_000);
  if (!rl.ok) return shopError("TOO_MANY", 429);

  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId || "").slice(0, 300);
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return shopError("BAD_SESSION_ID", 400);
  }

  const purchase = await db.reportPurchase.findUnique({ where: { stripeSessionId: sessionId } });
  if (!purchase || purchase.userId !== user.id) {
    return shopError("FORBIDDEN", 403);
  }

  // ja completada pel webhook (o per un retorn anterior): informem sense tocar res
  if (purchase.status === "paid") {
    // el token només té el correu; per pantalla, l'usuari autenticat baixa
    // per la seva sessió (el download endpoint ho accepta)
    return NextResponse.json({
      ok: true,
      paid: true,
      paymentStatus: "paid",
      downloadUrl: `/api/reports/shop/download?p=${purchase.id}`,
    });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return shopError("STRIPE_NOT_CONFIGURED", 503);
  const stripe = new Stripe(secret);
  let cs: Stripe.Checkout.Session;
  try {
    cs = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return shopError("SESSION_NOT_FOUND", 404);
  }

  const paid = cs.payment_status === "paid" || cs.payment_status === "no_payment_required";
  if (!paid) {
    return NextResponse.json({
      ok: true,
      paid: false,
      paymentStatus: cs.payment_status,
      message: "El pagament no s'ha completat encara.",
    });
  }

  // FALLBACK idempotent: el webhook encara no ha arribat. Si JA estava pagada
  // aquesta crida hauria retornat dalt (tokenRaw=null → cap correu duplicat).
  const { purchase: paidRow, tokenRaw } = await fulfillPurchase(purchase.id, {
    paymentIntent: typeof cs.payment_intent === "string" ? cs.payment_intent : cs.payment_intent?.id ?? null,
    event: "REPORT_PURCHASE_PAID",
  });
  after(async () => {
    await notifyReportReady(paidRow, tokenRaw).catch(() => {});
  });
  const url = tokenRaw ? purchaseDownloadUrl(paidRow.id, tokenRaw) : `/api/reports/shop/download?p=${paidRow.id}`;
  return NextResponse.json({
    ok: true,
    paid: true,
    paymentStatus: cs.payment_status,
    downloadUrl: url,
  });
}
