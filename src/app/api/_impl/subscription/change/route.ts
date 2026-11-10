import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";
import { PLANS, syncUserPlan, type PlanId } from "@/lib/plans";

export const maxDuration = 30; // llamada a la API de Stripe

/**
 * POST /api/subscription/change — v31: cambio de plan SELF-SERVICE.
 *
 * Cuerpo: { "targetPlan": "PREMIUM" | "PRO" | "FREE" }
 *
 * Semántica (SEGURA por diseño: nunca se cobra dos veces porque NUNCA se
 * crea una segunda suscripción — se transforma la vigente, que es lo que
 * el índice único parcial de PostgreSQL exige de facto):
 *
 *  PREMIUM ⇄ PRO (subscripción Stripe real):
 *      stripe.subscriptions.update(items→price nuevo, proration
 *      "create_prorations", cancel_at_period_end:false) → el webhook
 *      customer.subscription.updated re-deriva el plan (planFromPriceId)
 *      y syncUserPlan(force) consolida. Además se actualiza la fila local
 *      de forma optimista para que la UI no espere al webhook.
 *  PREMIUM ⇄ PRO (demo o ADMIN_GRANT):
 *      cambio inmediato de la fila + syncUserPlan(force).
 *  → FREE:
 *      Stripe real  = cancel_at_period_end:true (mantiene el acceso pagado
 *                     hasta el fin del período, igual que "Cancelar").
 *      demo/grant   = baja INMEDIATA (modo pruebas / concesión admin).
 *
 * Errores: SAME_PLAN · BAD_TARGET · USE_CHECKOUT (409: FREE→de pago debe
 * pasar por checkout) · PRICE_NOT_CONFIGURED · STRIPE_NOT_CONFIGURED ·
 * STRIPE_ERROR (502). Auditoría: PLAN_CHANGED en todos los casos de éxito.
 */
function priceIdForPlan(plan: "PREMIUM" | "PRO"): string | null {
  const envName = PLANS[plan].stripePriceEnv;
  if (envName && process.env[envName]) return process.env[envName] as string;
  const legacy =
    plan === "PREMIUM"
      ? process.env.STRIPE_PRICE_PREMIUM
      : process.env.STRIPE_PRICE_PRO;
  return legacy || null;
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`plan-change:${user.id}`, 6, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const target = String(body?.targetPlan || "").toUpperCase();
  if (!["PREMIUM", "PRO", "FREE"].includes(target)) {
    return NextResponse.json({ error: "BAD_TARGET", valid: ["PREMIUM", "PRO", "FREE"] }, { status: 400 });
  }
  const from = (user.plan === "PREMIUM" || user.plan === "PRO" ? user.plan : "FREE") as PlanId;
  if (target === from) {
    return NextResponse.json({ error: "SAME_PLAN", message: `Ya estás en el plan ${target}.` }, { status: 400 });
  }

  const sub = await db.subscription.findFirst({
    where: { userId: user.id, status: { in: ["active", "trialing"] } },
    orderBy: { createdAt: "desc" },
  });
  const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
  const isRealStripe = Boolean(
    sub && sub.stripeSubscriptionId && !sub.demo && sub.stripePriceId !== "ADMIN_GRANT",
  );

  // ---------- baja a GRATUÏT ----------
  if (target === "FREE") {
    if (!sub) {
      await syncUserPlan(user.id, { force: true });
      return NextResponse.json({ ok: true, mode: "ALREADY_FREE", plan: "FREE" });
    }
    if (isRealStripe) {
      if (!stripeSecret) {
        return NextResponse.json(
          { error: "STRIPE_NOT_CONFIGURED", message: "Stripe no está configurado en este entorno." },
          { status: 503 },
        );
      }
      try {
        const stripe = new Stripe(stripeSecret);
        await stripe.subscriptions.update(sub.stripeSubscriptionId as string, {
          cancel_at_period_end: true,
        });
        await db.subscription.update({
          where: { id: sub.id },
          data: { cancelAtPeriodEnd: true },
        });
        await audit(user.id, "PLAN_CHANGED", user.id, {
          from,
          to: "FREE",
          mode: "DOWNGRADE_SCHEDULED",
        });
        return NextResponse.json({
          ok: true,
          mode: "DOWNGRADE_SCHEDULED",
          plan: "FREE",
          effectiveAt: sub.currentPeriodEnd,
          message:
            "Baja programada: mantendrás el acceso pagado hasta el final del período actual.",
        });
      } catch (e) {
        console.error("change→FREE stripe", e);
        return NextResponse.json(
          { error: "STRIPE_ERROR", message: "No se pudo programar la baja en Stripe. Inténtalo de nuevo." },
          { status: 502 },
        );
      }
    }
    // demo o ADMIN_GRANT: baja inmediata
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: "canceled", cancelAtPeriodEnd: false },
    });
    await syncUserPlan(user.id, { force: true });
    await audit(user.id, "PLAN_CHANGED", user.id, {
      from,
      to: "FREE",
      mode: sub.demo ? "DEMO_DOWNGRADE_NOW" : "GRANT_DOWNGRADE_NOW",
    });
    return NextResponse.json({ ok: true, mode: "DOWNGRADE_NOW", plan: "FREE" });
  }

  // ---------- upgrade / switch entre PREMIUM y PRO ----------
  if (!sub) {
    return NextResponse.json(
      {
        error: "USE_CHECKOUT",
        message: "No tienes ninguna suscripción activa: contrata el plan desde la página de Precios.",
      },
      { status: 409 },
    );
  }

  if (isRealStripe) {
    const targetPrice = priceIdForPlan(target as "PREMIUM" | "PRO");
    if (!targetPrice) {
      return NextResponse.json(
        {
          error: "PRICE_NOT_CONFIGURED",
          message: "El precio de destino no está configurado (STRIPE_*_PRICE_ID en Vercel). Usa el Portal de cliente de Stripe.",
        },
        { status: 503 },
      );
    }
    if (!stripeSecret) {
      return NextResponse.json(
        { error: "STRIPE_NOT_CONFIGURED", message: "Stripe no está configurado en este entorno." },
        { status: 503 },
      );
    }
    try {
      const stripe = new Stripe(stripeSecret);
      const current = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId as string);
      const itemId = current.items.data[0]?.id;
      if (!itemId) {
        return NextResponse.json(
          { error: "STRIPE_ERROR", message: "La suscripción no tiene líneas de precio." },
          { status: 502 },
        );
      }
      await stripe.subscriptions.update(sub.stripeSubscriptionId as string, {
        items: [{ id: itemId, price: targetPrice }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
      });
      // actualización optimista local (el webhook customer.subscription.updated
      // re-deriva el plan desde el priceId y vuelve a sincronizar — coherente)
      await db.subscription.update({
        where: { id: sub.id },
        data: { plan: target, cancelAtPeriodEnd: false },
      });
      await syncUserPlan(user.id, { force: true });
      await audit(user.id, "PLAN_CHANGED", user.id, {
        from,
        to: target,
        mode: "STRIPE_PRORATED",
        stripeSubscriptionId: sub.stripeSubscriptionId,
      });
      return NextResponse.json({
        ok: true,
        mode: "STRIPE_PRORATED",
        plan: target,
        message:
          "Cambio aplicado en Stripe con prorrateo: en tu próxima factura se imputa la diferencia proporcional.",
      });
    } catch (e) {
      console.error("change stripe", e);
      return NextResponse.json(
        { error: "STRIPE_ERROR", message: "Stripe rechazó el cambio de plan. Inténtalo de nuevo o usa el Portal de cliente." },
        { status: 502 },
      );
    }
  }

  // demo o ADMIN_GRANT: cambio inmediato de fila
  await db.subscription.update({
    where: { id: sub.id },
    data: { plan: target, cancelAtPeriodEnd: false },
  });
  await syncUserPlan(user.id, { force: true });
  await audit(user.id, "PLAN_CHANGED", user.id, {
    from,
    to: target,
    mode: sub.demo ? "DEMO_SWITCH" : "GRANT_SWITCH",
  });
  return NextResponse.json({ ok: true, mode: sub.demo ? "DEMO_SWITCH" : "GRANT_SWITCH", plan: target });
}
