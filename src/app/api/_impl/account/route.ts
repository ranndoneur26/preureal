import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireUser, revokeSessions } from "@/lib/auth";
import { sanitizeName, audit } from "@/lib/security";

/**
 * PATCH /api/account  { name?, locale?, alertsEnabled? } — edita el perfil (Fase 6)
 * DELETE /api/account { confirm: "ESBORRA" }    — eliminació del compte (RGPD)
 *
 * L'eliminació esborra dades personals (nom, correu, hash) i anonimitza els
 * registres d'ús que tenen valor estadístic (SearchLog/Event), preservant
 * agregats sense dades personals.
 */
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const data: { name?: string | null; locale?: string; alertsEnabled?: boolean } = {};
  if (body?.name !== undefined) data.name = body.name === null ? null : sanitizeName(String(body.name));
  if (body?.locale === "es" || body?.locale === "ca") data.locale = body.locale;
  // v24 — opt-in del resum mensual de preferits: només booleans estrictes
  if (typeof body?.alertsEnabled === "boolean") data.alertsEnabled = body.alertsEnabled;
  const updated = await db.user.update({ where: { id: user.id }, data });
  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      locale: updated.locale,
      alertsEnabled: updated.alertsEnabled,
    },
  });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (body?.confirm !== "ESBORRA") {
    return NextResponse.json({ error: "CONFIRM_REQUIRED" }, { status: 400 });
  }

  // v23 — RGPD + anti-cobros fantasma: antes de borrar NINGÚN dato, se
  // cancelan en Stripe las suscripciones REALES activas del usuario. Si no,
  // Stripe seguiría cobrando a una cuenta que ya no existe (el webhook
  // invoice.paid ya no encontraría al usuario). Las DEMO no tocan Stripe.
  // Si Stripe falla, NO se borra nada: el usuario conserva su cuenta y puede
  // reintentar (protege su dinero; el borrado es reversible hasta este punto).
  const activeSubs = await db.subscription.findMany({
    where: { userId: user.id, status: { in: ["active", "trialing", "past_due"] } },
  });
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const realStripeSubs = activeSubs.filter(
    (s) =>
      !s.demo &&
      Boolean(s.stripeSubscriptionId) &&
      !String(s.stripeSubscriptionId).startsWith("session_")
  );
  if (stripeSecret && realStripeSubs.length > 0) {
    const stripe = new Stripe(stripeSecret);
    const failed: string[] = [];
    for (const s of realStripeSubs) {
      try {
        // cancelación INMEDIATA (el usuario deja de existir; no debe seguir
        // pagando): sin factura final (invoice_now=false por defecto)
        await stripe.subscriptions.cancel(String(s.stripeSubscriptionId));
        await audit(user.id, "STRIPE_SUB_CANCELLED_ON_DELETE", String(s.stripeSubscriptionId), {
          plan: s.plan,
        }).catch(() => {});
      } catch (e: unknown) {
        // ya cancelada en Stripe → equivalente a cancelada
        const msg = String((e as { message?: string })?.message || e);
        if (!msg.includes("already")) failed.push(String(s.stripeSubscriptionId));
        else
          await audit(user.id, "STRIPE_SUB_CANCELLED_ON_DELETE", String(s.stripeSubscriptionId), {
            already: true,
          }).catch(() => {});
      }
    }
    if (failed.length > 0) {
      console.error("account DELETE: no se pudieron cancelar subs Stripe", failed);
      return NextResponse.json(
        {
          error: "STRIPE_CANCEL_FAILED",
          message:
            "No se ha podido cancelar tu suscripción de Stripe. Inténtalo de nuevo en unos minutos o gestiona la cancelación desde el Portal de facturación de Stripe antes de borrar la cuenta.",
        },
        { status: 502 }
      );
    }
  }

  await db.$transaction([
    // dades personals directes
    db.favorite.deleteMany({ where: { userId: user.id } }),
    db.savedComparison.deleteMany({ where: { userId: user.id } }),
    db.passwordToken.deleteMany({ where: { userId: user.id } }),
    db.emailToken.deleteMany({ where: { userId: user.id } }),
    db.subscription.deleteMany({ where: { userId: user.id } }),
    db.subscriptionUsage.deleteMany({ where: { userId: user.id } }), // v22
    db.priceReport.deleteMany({ where: { userId: user.id } }),
    // pseudonimització d'ús històric (mètriques agregades sense PII)
    db.searchLog.updateMany({ where: { userId: user.id }, data: { userId: null } }),
    db.event.updateMany({ where: { userId: user.id }, data: { userId: null } }),
    db.emailLog.deleteMany({ where: { to: user.email } }),
  ]);
  await revokeSessions(user.id);
  await db.user.delete({ where: { id: user.id } });
  await audit(null, "ACCOUNT_DELETED", user.id, { email: "(esborrat)" });
  return NextResponse.json({ ok: true });
}
