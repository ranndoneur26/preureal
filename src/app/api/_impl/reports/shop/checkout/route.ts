import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";
import { validateReportParams, reportProduct, type ReportKind } from "@/lib/reports-shop";
import { fulfillPurchase, loadValuation, purchaseDownloadUrl, shopError } from "@/lib/reports-fulfill";

/**
 * POST /api/reports/shop/checkout { kind, ...params } — v38.8: compra PUNTUAL
 * d'un informe (Stripe mode "payment", sense subscripció). Regles:
 *  - només usuaris amb correu verificat (P1.3, igual que subscripcions);
 *  - validació PURA dels paràmetres (reports-shop.ts) + existència de
 *    municipis + comprovació de VIABILITAT ABANS de cobrar (una valoració
 *    sense base oficial mai es cobra: 422 NO_DATA);
 *  - es snapshoten preu i paràmetres a ReportPurchase; Stripe cobra exactament
 *    el mateix import;
 *  - sense STRIPE_SECRET_KEY i amb DEMO_CHECKOUT=true → compra demo marcada
 *    pagada al moment (mateix patró que les subscripcions demo).
 * La confirmació SEMPRE via webhook signat o /shop/return; aquest endpoint
 * només obre la sessió de pagament.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return shopError("EMAIL_NOT_VERIFIED", 403);
    }
    return shopError("UNAUTHENTICATED", 401);
  }
  const rl = await rateLimit(`shop-checkout:${user.id}`, 10, 60_000);
  if (!rl.ok) return shopError("TOO_MANY", 429);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return shopError("BAD_JSON", 400);

  const val = validateReportParams(body.kind, body);
  if (!val.ok) return shopError(val.error, 400);
  const kind = val.params.kind as ReportKind;
  const product = reportProduct(kind);

  // ---- viabilitat ABANS de cobrar (mai es cobra un informe no generable) ----
  if (val.params.kind === "INFORME_MUNICIPI") {
    const mun = await db.municipality.findUnique({ where: { code: val.params.mun }, select: { code: true } });
    if (!mun) return shopError("MUNICIPALITY_NOT_FOUND", 404);
  } else if (val.params.kind === "VALORACIO") {
    const loaded = await loadValuation(val.params.mun, {
      surfaceM2: val.params.surfaceM2,
      rooms: val.params.rooms,
      estat: val.params.estat,
    });
    if (!loaded.ok) {
      if (loaded.reason === "MUNICIPALITY_NOT_FOUND") return shopError("MUNICIPALITY_NOT_FOUND", 404);
      return NextResponse.json(
        {
          error: "NO_DATA",
          message:
            "Aquest municipi no té fiança municipal vigent publicada per Incasòl ni referència de comarca calculable: no es pot valorar sense inventar dades.",
        },
        { status: 422 }
      );
    }
  } else {
    const munis = await db.municipality.findMany({
      where: { code: { in: val.params.muns } },
      select: { code: true, name: true, rentLatest: true, comarcaRefLatest: true },
    });
    if (munis.length !== val.params.muns.length) return shopError("MUNICIPALITY_NOT_FOUND", 404);
    if (!munis.some((m) => (m.rentLatest && m.rentLatest > 0) || (m.comarcaRefLatest && m.comarcaRefLatest > 0))) {
      return NextResponse.json(
        {
          error: "NO_DATA",
          message:
            "Cap dels municipis triats té fiança publicada ni referència de comarca: la comparativa no tindria cap dada oficial.",
        },
        { status: 422 }
      );
    }
  }

  const locale = user.locale === "es" ? "es" : "ca";
  const paramsJson = JSON.stringify({ ...val.params, locale });
  const secret = process.env.STRIPE_SECRET_KEY;

  // ---- Stripe real (mode payment) ----
  if (secret) {
    const purchase = await db.reportPurchase.create({
      data: {
        userId: user.id,
        kind,
        params: paramsJson,
        priceCents: product.priceCents,
        status: "pending",
      },
    });
    try {
      const stripe = new Stripe(secret);
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
      const cs = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: product.priceCents,
              product_data: {
                name: `Preureal · ${locale === "es" ? product.nameEs : product.nameCa}`,
                description: locale === "es" ? product.descEs : product.descCa,
              },
            },
          },
        ],
        customer_email: user.email,
        // la confirmació definitiva SEMPRE via webhook signat; la pantalla de
        // retorn només consulta l'estat real de la sessió (mateix patró Fase 7)
        success_url: `${origin}/#/informes/exit?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/#/informes/cancelat`,
        metadata: { userId: user.id, purchaseId: purchase.id, kind },
      });
      await db.reportPurchase.update({ where: { id: purchase.id }, data: { stripeSessionId: cs.id } });
      await db.event
        .create({ data: { type: "REPORT_CHECKOUT_START", userId: user.id, meta: JSON.stringify({ kind, purchaseId: purchase.id }) } })
        .catch(() => {});
      return NextResponse.json({ ok: true, mode: "STRIPE", url: cs.url });
    } catch (e) {
      // la sessió no s'ha obert: la compra queda sense sentit → es neteja
      await db.reportPurchase.delete({ where: { id: purchase.id } }).catch(() => {});
      console.error("shop checkout: stripe error", e);
      await db.event
        .create({ data: { type: "REPORT_CHECKOUT_ERROR", userId: user.id, meta: JSON.stringify({ kind, error: String(e).slice(0, 300) }) } })
        .catch(() => {});
      return shopError("STRIPE_ERROR", 502);
    }
  }

  // ---- DEMO (sense Stripe, entorn de proves) ----
  if (process.env.DEMO_CHECKOUT === "true") {
    const purchase = await db.reportPurchase.create({
      data: {
        userId: user.id,
        kind,
        params: paramsJson,
        priceCents: product.priceCents,
        status: "pending",
      },
    });
    const { purchase: paid, tokenRaw } = await fulfillPurchase(purchase.id, { event: "REPORT_PURCHASE_PAID_DEMO" });
    await audit(user.id, "REPORT_CHECKOUT_DEMO", paid.id, { kind });
    return NextResponse.json({
      ok: true,
      mode: "DEMO",
      purchaseId: paid.id,
      downloadUrl: purchaseDownloadUrl(paid.id, tokenRaw!),
      message:
        "Compra DEMO activada (modo prueba, sin cobro real). Conecta tu cuenta de Stripe para activar cobros reales.",
    });
  }

  return shopError("STRIPE_NOT_CONFIGURED", 503);
}
