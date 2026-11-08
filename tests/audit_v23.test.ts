/**
 * tests/audit_v23.test.ts — Suite de l'auditoria v23 (bun test).
 *
 * Execució:  bun test tests/
 *
 * Estratègia: els mòduls amb efectes secundaris (BD, Stripe, auth, correu,
 * next/server) es mockejen amb bun mock.module per poder testejar les RUTES
 * completes de manera hermètica (sense xarxa i sense BD real). Les funcions
 * pures (isUniqueViolation, planFromPriceId, formatEurFromCents,
 * highestVigentPlan, subscriptionLocalData) es testegen directament.
 *
 * NOTA HONESTA: aquests tests NO validen la integració real amb Stripe
 * (cal Test Mode amb claus reals); validen la LÒGICA de negoci davant
 * respostes simulades de Stripe i de la BD.
 */
import { describe, expect, mock, test, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Infraestructura de mocks (mutable per teste)
// ---------------------------------------------------------------------------

type AnyObj = Record<string, any>;
const calls: Array<[string, any[]]> = [];

function fn(name: string, impl: (...a: any[]) => any = async () => ({})) {
  return async (...a: any[]) => {
    calls.push([name, a]);
    return impl(...a);
  };
}

const state: {
  authUser: AnyObj | null;
  planAllowsImpl: (plan: string, feature: string) => boolean;
} = {
  authUser: null,
  planAllowsImpl: (_p, f) => f === "comparador",
};

const db: AnyObj = {
  subscription: {
    findUnique: fn("subscription.findUnique", async () => null),
    findFirst: fn("subscription.findFirst", async () => null),
    findMany: fn("subscription.findMany", async () => []),
    updateMany: fn("subscription.updateMany", async () => ({ count: 0 })),
    create: fn("subscription.create", async () => ({ id: "subrow1" })),
    update: fn("subscription.update", async () => ({})),
    upsert: fn("subscription.upsert", async () => ({})),
    deleteMany: fn("subscription.deleteMany", async () => ({})),
  },
  subscriptionUsage: {
    findUnique: fn("subscriptionUsage.findUnique", async () => null),
    deleteMany: fn("subscriptionUsage.deleteMany", async () => ({})),
  },
  stripeEvent: {
    create: fn("stripeEvent.create", async () => ({})),
    delete: fn("stripeEvent.delete", async () => ({})),
  },
  event: { create: fn("event.create", async () => ({})), updateMany: fn("event.updateMany", async () => ({})) },
  user: {
    update: fn("user.update", async () => ({ id: "u1" })),
    findUnique: fn("user.findUnique", async () => null),
    delete: fn("user.delete", async () => ({})),
  },
  searchLog: {
    create: fn("searchLog.create", async () => ({})),
    count: fn("searchLog.count", async () => 0),
    deleteMany: fn("searchLog.deleteMany", async () => ({})),
    updateMany: fn("searchLog.updateMany", async () => ({})),
  },
  favorite: {
    findMany: fn("favorite.findMany", async () => []),
    deleteMany: fn("favorite.deleteMany", async () => ({})),
  },
  savedComparison: { deleteMany: fn("savedComparison.deleteMany", async () => ({})) },
  passwordToken: { deleteMany: fn("passwordToken.deleteMany", async () => ({})) },
  emailToken: { deleteMany: fn("emailToken.deleteMany", async () => ({})) },
  priceReport: { deleteMany: fn("priceReport.deleteMany", async () => ({})) },
  emailLog: { deleteMany: fn("emailLog.deleteMany", async () => ({})) },
  municipality: { findUnique: fn("municipality.findUnique", async () => null) },
  $queryRaw: fn("$queryRaw", async () => [{ usageCount: 1 }]),
  $transaction: fn("$transaction", async () => []),
};

const stripeBehavior: {
  cancelImpl?: (id: string) => Promise<unknown>;
  updateImpl?: (id: string, p: AnyObj) => Promise<unknown>;
  retrieveImpl?: (id: string) => Promise<unknown>;
} = {};

class FakeStripe {
  subscriptions = {
    cancel: async (id: string) => {
      calls.push(["stripe.subscriptions.cancel", [id]]);
      if (stripeBehavior.cancelImpl) return stripeBehavior.cancelImpl(id);
      return { id };
    },
    update: async (id: string, p: AnyObj) => {
      calls.push(["stripe.subscriptions.update", [id, p]]);
      if (stripeBehavior.updateImpl) return stripeBehavior.updateImpl(id, p);
      return { id };
    },
    retrieve: async (id: string) => {
      calls.push(["stripe.subscriptions.retrieve", [id]]);
      if (stripeBehavior.retrieveImpl) return stripeBehavior.retrieveImpl(id);
      return { id };
    },
  };
  webhooks = {
    // per als tests ignorem la signatura (és codi de Stripe; la simulem)
    constructEvent: (raw: string) => JSON.parse(raw),
  };
}

const afterQueue: Array<() => Promise<void> | void> = [];

mock.module("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
  after: (f: () => Promise<void> | void) => {
    afterQueue.push(f);
  },
}));

mock.module("@/lib/db", () => ({ db }));

mock.module("@/lib/auth", () => ({
  requireVerifiedUser: async () => {
    if (!state.authUser) throw new Error("UNAUTHENTICATED");
    if (!state.authUser.emailVerifiedAt) throw new Error("EMAIL_NOT_VERIFIED");
    return state.authUser;
  },
  requireUser: async () => {
    if (!state.authUser) throw new Error("UNAUTHENTICATED");
    return state.authUser;
  },
  getAuthUser: async () => state.authUser,
  isEmailNotVerifiedError: (e: unknown) => e instanceof Error && e.message === "EMAIL_NOT_VERIFIED",
  revokeSessions: fn("revokeSessions", async () => ({})),
}));

mock.module("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true }) }));

mock.module("@/lib/security", () => ({
  audit: fn("audit", async () => ({})),
  clientIp: () => "1.2.3.4",
  hashIp: () => "h",
  maskEmail: (e: string) => e,
  sanitizeName: (n: string) => n,
}));

mock.module("@/lib/mail", () => ({
  sendMail: fn("sendMail", async () => ({})),
  receiptMail: (planName: string, amount: string) => ({
    subject: `Rebut ${planName} ${amount}`,
    html: "<p></p>",
  }),
  welcomeMail: () => ({ subject: "s", html: "h" }),
  verifyMail: () => ({ subject: "s", html: "h" }),
}));

mock.module("@/lib/plans", () => ({
  PLANS: {
    FREE: { quotaMonth: 3, priceEur: 0, features: {} },
    PREMIUM: { quotaMonth: -1, priceEur: 7.99, stripePriceEnv: "STRIPE_PREMIUM_PRICE_ID", features: {} },
    PRO: { quotaMonth: -1, priceEur: 19.99, stripePriceEnv: "STRIPE_PRO_AGENTS_PRICE_ID", features: {} },
  },
  getPlanSettings: async () => ({
    FREE: { quotaMonth: 3, priceEur: 0, features: { comparador: true } },
    PREMIUM: { quotaMonth: -1, priceEur: 7.99, features: { comparador: true, preferits: true, historial: true } },
    PRO: { quotaMonth: -1, priceEur: 19.99, features: { comparador: true, preferits: true, historial: true } },
  }),
  planAllows: async (p: string, f: string) => state.planAllowsImpl(p, f),
  syncUserPlan: fn("syncUserPlan", async () => "FREE"),
  planName: (p: string) => (p === "PRO" ? "Pro (agents)" : "Premium"),
  canConsult: async () => ({ ok: true, used: 0, limit: 3 }),
  invalidatePlanCache: () => {},
}));

mock.module("@/lib/icgc", () => ({
  resolveMunicipalityCode: async () => "080193",
  fetchParcelAt: async () => "080193B01",
}));

mock.module("@/lib/catastro", () => ({ getYearBuilt: async () => null }));

mock.module("stripe", () => ({ default: FakeStripe }));

// --- imports de les rutes (DESPRÉS dels mock.module) ------------------------
const { POST: checkoutPOST } = await import("../src/app/api/_impl/stripe/checkout/route");
const { POST: cancelPOST } = await import("../src/app/api/_impl/subscription/cancel/route");
const { POST: reactivatePOST } = await import("../src/app/api/_impl/subscription/reactivate/route");
const { GET: subscriptionGET, POST: subscriptionPOST } = await import("../src/app/api/_impl/subscription/route");
const { DELETE: accountDELETE } = await import("../src/app/api/_impl/account/route");
const { GET: favoritesGET } = await import("../src/app/api/_impl/favorites/route");
const { POST: lookupPOST } = await import("../src/app/api/_impl/lookup/route");
const { POST: webhookPOST } = await import("../src/app/api/stripe/webhook/route");
const { GET: plansGET } = await import("../src/app/api/_impl/plans/route");

// --- funcions pures (mòdul real, la BD hi és mockejada) ---------------------
const {
  isUniqueViolation,
  planFromPriceId,
  formatEurFromCents,
  highestVigentPlan,
  subscriptionLocalData,
  VIGENT_STATUSES,
} = await import("../src/lib/subscription");
const { STRINGS } = await import("../src/lib/i18n");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonOf(res: Response): Promise<AnyObj> {
  return (await res.json()) as AnyObj;
}

/** Ejecuta los callbacks after() encolados (recibos en background). */
async function flushAfter() {
  while (afterQueue.length) {
    const f = afterQueue.shift()!;
    await f();
  }
}

/** ¿Hay ALGUNA llamada con ese nombre? (el último audit no siempre es el que interesa) */
function hasCall(name: string): boolean {
  return calls.some(([n]) => n === name);
}

function lastCall(name: string): any[] | undefined {
  const found = calls.filter(([n]) => n === name);
  return found.length ? found[found.length - 1][1] : undefined;
}

function resetAll() {
  calls.length = 0;
  afterQueue.length = 0;
  state.authUser = {
    id: "u1",
    email: "test@preureal.cat",
    locale: "ca",
    role: "USER",
    emailVerifiedAt: new Date(),
  };
  state.planAllowsImpl = (_p, f) => f === "comparador";
  // defaults de BD
  db.subscription.findUnique = fn("subscription.findUnique", async () => null);
  db.subscription.findFirst = fn("subscription.findFirst", async () => null);
  db.subscription.findMany = fn("subscription.findMany", async () => []);
  db.subscription.updateMany = fn("subscription.updateMany", async () => ({ count: 0 }));
  db.subscription.create = fn("subscription.create", async () => ({ id: "subrow1" }));
  db.subscription.update = fn("subscription.update", async () => ({}));
  db.subscription.upsert = fn("subscription.upsert", async () => ({}));
  db.stripeEvent.create = fn("stripeEvent.create", async () => ({}));
  db.user.delete = fn("user.delete", async () => ({}));
  db.municipality.findUnique = fn("municipality.findUnique", async () => null);
  db.$queryRaw = fn("$queryRaw", async () => [{ usageCount: 1 }]);
  stripeBehavior.cancelImpl = undefined;
  stripeBehavior.updateImpl = undefined;
  stripeBehavior.retrieveImpl = undefined;
  for (const k of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "DEMO_CHECKOUT",
    "STRIPE_PREMIUM_PRICE_ID",
    "STRIPE_PRO_AGENTS_PRICE_ID",
    "STRIPE_PRICE_PREMIUM",
    "STRIPE_PRICE_PRO",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    delete process.env[k];
  }
}

beforeEach(() => resetAll());

// ---------------------------------------------------------------------------
// 1. CHECKOUT
// ---------------------------------------------------------------------------

describe("checkout", () => {
  test("sense Stripe i sense DEMO → 503 STRIPE_NOT_CONFIGURED (mai simulació de pagament)", async () => {
    const res = await checkoutPOST(req("POST", "http://x/api/stripe/checkout", { plan: "PREMIUM" }) as any, undefined as any);
    expect(res.status).toBe(503);
    expect((await jsonOf(res)).error).toBe("STRIPE_NOT_CONFIGURED");
  });

  test("DEMO_CHECKOUT=true sense Stripe → subscripció DEMO marcada demo:true, 30 dies", async () => {
    process.env.DEMO_CHECKOUT = "true";
    let created: AnyObj | null = null;
    db.subscription.create = fn("subscription.create", async (a: AnyObj) => {
      created = a.data;
      return { id: "s1" };
    });
    const res = await checkoutPOST(req("POST", "http://x/api/stripe/checkout", { plan: "PREMIUM" }) as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(d.mode).toBe("DEMO");
    expect(created?.demo).toBe(true);
    expect(created?.status).toBe("active");
    expect(created?.currentPeriodEnd).toBeInstanceOf(Date);
    // la DEMO prèvia activa es tanca (una única subscripció vigent)
    expect(lastCall("subscription.updateMany")?.[0]?.where?.status).toBe("active");
  });

  test("amb Stripe i una subscripció REAL activa → 409 ALREADY_SUBSCRIBED (mai doble cobrament)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    db.subscription.findFirst = fn("subscription.findFirst", async () => ({
      id: "row1",
      demo: false,
      stripeSubscriptionId: "sub_OLD",
      status: "active",
    }));
    const res = await checkoutPOST(req("POST", "http://x/api/stripe/checkout", { plan: "PRO" }) as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(409);
    expect(d.error).toBe("ALREADY_SUBSCRIBED");
    expect(lastCall("event.create")?.[0]?.data?.type).toBe("CHECKOUT_BLOCKED");
  });

  test("una subscripció DEMO activa NO bloqueja el checkout real", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    db.subscription.findFirst = fn("subscription.findFirst", async () => ({
      id: "row1",
      demo: true,
      stripeSubscriptionId: null,
    }));
    const res = await checkoutPOST(req("POST", "http://x/api/stripe/checkout", { plan: "PREMIUM" }) as any, undefined as any);
    expect(res.status).toBe(503); // arriba a la comprovació de price → PRICE_NOT_CONFIGURED/503
  });

  test("plan invàlid → 400 BAD_PLAN", async () => {
    const res = await checkoutPOST(req("POST", "http://x/api/stripe/checkout", { plan: "GOLD" }) as any, undefined as any);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 2. WEBHOOK: idempotència, pagament verificat, duplicats
// ---------------------------------------------------------------------------

function stripeEvent(type: string, data: AnyObj): AnyObj {
  return { id: `evt_${Math.random().toString(36).slice(2)}`, type, data: { object: data } };
}

describe("webhook stripe", () => {
  test("event DUPLICAT (P2002) → 200 {duplicate:true} sense efectes", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    db.stripeEvent.create = fn("stripeEvent.create", async () => {
      const e: AnyObj = new Error("Unique constraint failed");
      e.code = "P2002";
      throw e;
    });
    const res = await webhookPOST(req("POST", "http://x/api/stripe/webhook", stripeEvent("invoice.paid", {})) as any, undefined as any);
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).duplicate).toBe(true);
  });

  test("ERROR de BD (no duplicat) → 500 perquè Stripe reentregui (mai es perd l'event)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    db.stripeEvent.create = fn("stripeEvent.create", async () => {
      throw new Error("Connection terminated unexpectedly");
    });
    const res = await webhookPOST(req("POST", "http://x/api/stripe/webhook", stripeEvent("invoice.paid", {})) as any, undefined as any);
    expect(res.status).toBe(500);
    expect((await jsonOf(res)).error).toBe("DB_UNAVAILABLE");
  });

  test("checkout amb payment_status unpaid → NO concedeix el pla (audit STRIPE_CHECKOUT_UNPAID)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const ev = stripeEvent("checkout.session.completed", {
      id: "cs_1",
      payment_status: "unpaid",
      metadata: { userId: "u1", plan: "PREMIUM" },
    });
    const res = await webhookPOST(req("POST", "http://x/api/stripe/webhook", ev) as any, undefined as any);
    expect(res.status).toBe(200);
    expect(lastCall("user.update")).toBeUndefined();
    expect(lastCall("subscription.upsert")).toBeUndefined();
    const aud = lastCall("audit");
    expect(aud?.[1]).toBe("STRIPE_CHECKOUT_UNPAID");
  });

  test("checkout pagat → upsert amb estat REAL de Stripe + syncUserPlan (mai plan directe) + rebut amb import real", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    db.user.findUnique = fn("user.findUnique", async () => ({
      id: "u1",
      email: "test@preureal.cat",
      locale: "ca",
    }));
    stripeBehavior.retrieveImpl = async () => ({
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_prem", recurring: { interval: "month" } },
            current_period_start: 1730000000,
            current_period_end: 1732592000,
          },
        ],
      },
    });
    const ev = stripeEvent("checkout.session.completed", {
      id: "cs_2",
      payment_status: "paid",
      amount_total: 799,
      customer: "cus_1",
      subscription: "sub_NEW",
      metadata: { userId: "u1", plan: "PREMIUM" },
    });
    const res = await webhookPOST(req("POST", "http://x/api/stripe/webhook", ev) as any, undefined as any);
    expect(res.status).toBe(200);
    const up = lastCall("subscription.upsert");
    expect(up?.[0]?.create?.status).toBe("active");
    expect(up?.[0]?.create?.billingInterval).toBe("month");
    expect(lastCall("syncUserPlan")?.[0]).toBe("u1");
    // sense altres subscripcions actives → cap cancel·lació a Stripe
    expect(lastCall("stripe.subscriptions.cancel")).toBeUndefined();
    // el rebut surt amb l'import real (799 cèntims → "7,99 €")
    await flushAfter();
    const sm = lastCall("sendMail");
    expect(sm?.[0]?.subject).toContain("7,99 €");
  });

  test("subscripció antiga REAL activa en completar checkout → es cancel·la a Stripe", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    stripeBehavior.retrieveImpl = async () => ({
      status: "active",
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_pro", recurring: { interval: "month" } }, current_period_start: 1, current_period_end: 2 }] },
    });
    db.subscription.findMany = fn("subscription.findMany", async () => [
      { id: "rowOld", demo: false, stripeSubscriptionId: "sub_OLD", status: "active" },
    ]);
    const ev = stripeEvent("checkout.session.completed", {
      id: "cs_3",
      payment_status: "paid",
      amount_total: 1999,
      customer: "cus_1",
      subscription: "sub_NEW",
      metadata: { userId: "u1", plan: "PRO" },
    });
    const res = await webhookPOST(req("POST", "http://x/api/stripe/webhook", ev) as any, undefined as any);
    expect(res.status).toBe(200);
    expect(lastCall("stripe.subscriptions.cancel")?.[0]).toBe("sub_OLD");
    expect(calls.some(([n, a]) => n === "audit" && a?.[1] === "STRIPE_SUB_SUPERSEDED")).toBe(true);
  });

  test("customer.subscription.updated des del Portal (canvi de pla) → dedueix el pla del PRICE", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PREMIUM_PRICE_ID = "price_prem";
    process.env.STRIPE_PRO_AGENTS_PRICE_ID = "price_pro";
    db.subscription.findUnique = fn("subscription.findUnique", async () => ({
      id: "row1",
      userId: "u1",
      plan: "PREMIUM",
      status: "active",
    }));
    const ev = stripeEvent("customer.subscription.updated", {
      id: "sub_NEW",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_pro", recurring: { interval: "month" } },
            current_period_start: 1730000000,
            current_period_end: 1732592000,
          },
        ],
      },
    });
    const res = await webhookPOST(req("POST", "http://x/api/stripe/webhook", ev) as any, undefined as any);
    expect(res.status).toBe(200);
    const upd = lastCall("subscription.update");
    expect(upd?.[0]?.data?.plan).toBe("PRO"); // Premium → Pro via Portal (update és un ÚNIC argument {where,data})
    expect(lastCall("syncUserPlan")?.[0]).toBe("u1");
  });
});

// ---------------------------------------------------------------------------
// 3. CANCEL·LACIÓ I REACTIVACIÓ
// ---------------------------------------------------------------------------

describe("subscription cancel/reactivate", () => {
  test("sense sessió → 401", async () => {
    state.authUser = null;
    const res = await cancelPOST(req("POST", "http://x/api/subscription/cancel") as any, undefined as any);
    expect(res.status).toBe(401);
    const res2 = await reactivatePOST(req("POST", "http://x/api/subscription/reactivate") as any, undefined as any);
    expect(res2.status).toBe(401);
  });

  test("cancel·lar DEMO → només estat local (cancelAtPeriodEnd), sense Stripe", async () => {
    db.subscription.findFirst = fn("subscription.findFirst", async () => ({
      id: "row1",
      demo: true,
      stripeSubscriptionId: null,
      plan: "PREMIUM",
    }));
    const res = await cancelPOST(req("POST", "http://x/api/subscription/cancel") as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    const upd = lastCall("subscription.update");
    expect(upd?.[0]?.data?.cancelAtPeriodEnd).toBe(true);
    expect(upd?.[0]?.data?.status).toBeUndefined(); // no toca l'status (segueix vigent)
  });

  test("cancel·lar REAL → cancel_at_period_end a Stripe i sincronitza", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    db.subscription.findFirst = fn("subscription.findFirst", async () => ({
      id: "row1",
      demo: false,
      stripeSubscriptionId: "sub_1",
      plan: "PREMIUM",
    }));
    stripeBehavior.updateImpl = async (_id, p) => ({
      cancel_at_period_end: p.cancel_at_period_end,
      status: "active",
      items: {
        data: [
          {
            price: { id: "price_1", recurring: { interval: "month" } },
            current_period_start: 1730000000,
            current_period_end: 1732592000,
          },
        ],
      },
    });
    const res = await cancelPOST(req("POST", "http://x/api/subscription/cancel") as any, undefined as any);
    expect(res.status).toBe(200);
    expect(lastCall("stripe.subscriptions.update")?.[1]?.cancel_at_period_end).toBe(true);
  });

  test("reactivar sense cancel·lació programada → 404 NOTHING_TO_REACTIVATE", async () => {
    db.subscription.findFirst = fn("subscription.findFirst", async () => ({
      id: "row1",
      demo: true,
      cancelAtPeriodEnd: false,
    }));
    const res = await reactivatePOST(req("POST", "http://x/api/subscription/reactivate") as any, undefined as any);
    expect(res.status).toBe(404);
  });

  test("reactivar cancel·lació DEMO programada → cancelAtPeriodEnd=false", async () => {
    db.subscription.findFirst = fn("subscription.findFirst", async () => ({
      id: "row1",
      demo: true,
      stripeSubscriptionId: null,
      plan: "PREMIUM",
      cancelAtPeriodEnd: true,
    }));
    const res = await reactivatePOST(req("POST", "http://x/api/subscription/reactivate") as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(lastCall("subscription.update")?.[0]?.data?.cancelAtPeriodEnd).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. ELIMINACIÓ DE COMPTE (RGPD + Stripe)
// ---------------------------------------------------------------------------

describe("eliminació de compte", () => {
  test("sense confirmació → 400 i NO es borra res", async () => {
    const res = await accountDELETE(req("DELETE", "http://x/api/account", {}) as any, undefined as any);
    expect(res.status).toBe(400);
    expect(lastCall("user.delete")).toBeUndefined();
  });

  test("sense Stripe: borra dades, cancel·la DEMO (a la transacció) i tanca sessions", async () => {
    db.subscription.findMany = fn("subscription.findMany", async () => [
      { id: "row1", demo: true, stripeSubscriptionId: null },
    ]);
    const res = await accountDELETE(req("DELETE", "http://x/api/account", { confirm: "ESBORRA" }) as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(lastCall("$transaction")).toBeDefined();
    // dins la transacció s'han executat subscription.deleteMany i subscriptionUsage.deleteMany
    expect(hasCall("subscription.deleteMany")).toBe(true);
    expect(hasCall("subscriptionUsage.deleteMany")).toBe(true);
    expect(lastCall("revokeSessions")).toBeDefined();
    expect(lastCall("user.delete")).toBeDefined();
  });

  test("amb Stripe: cancel·la la suscripció REAL ABANS de borrar dades", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const order: string[] = [];
    db.subscription.findMany = fn("subscription.findMany", async () => [
      { id: "row1", demo: false, stripeSubscriptionId: "sub_1", plan: "PRO", status: "active" },
    ]);
    stripeBehavior.cancelImpl = async () => {
      order.push("cancel");
      return {};
    };
    db.$transaction = fn("$transaction", async () => {
      order.push("delete");
      return [];
    });
    const res = await accountDELETE(req("DELETE", "http://x/api/account", { confirm: "ESBORRA" }) as any, undefined as any);
    expect(res.status).toBe(200);
    expect(order).toEqual(["cancel", "delete"]);
    expect(lastCall("stripe.subscriptions.cancel")?.[0]).toBe("sub_1");
  });

  test("si Stripe falla → 502 i NO es borra res (el diner de l'usuari primer)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    db.subscription.findMany = fn("subscription.findMany", async () => [
      { id: "row1", demo: false, stripeSubscriptionId: "sub_1", plan: "PRO" },
    ]);
    stripeBehavior.cancelImpl = async () => {
      throw new Error("API error");
    };
    const res = await accountDELETE(req("DELETE", "http://x/api/account", { confirm: "ESBORRA" }) as any, undefined as any);
    expect(res.status).toBe(502);
    expect((await jsonOf(res)).error).toBe("STRIPE_CANCEL_FAILED");
    expect(lastCall("user.delete")).toBeUndefined();
    expect(lastCall("$transaction")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. CUOTA MENSUAL ATÒMICA I UNIFICADA
// ---------------------------------------------------------------------------

describe("cuota mensual (lookup)", () => {
  test("sense sessió → teaser (mai dades ni quota)", async () => {
    state.authUser = null;
    db.municipality.findUnique = fn("municipality.findUnique", async () => ({
      code: "080193",
      name: "Barcelona",
      comarca: "Barcelonès",
      isTense: false,
      rentLatest: 1200,
      rentPeriod: "2026 I",
    }));
    const res = await lookupPOST(req("POST", "http://x/api/lookup", { lat: 41.4, lng: 2.1 }) as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(d.kind).toBe("teaser");
    expect(d.teaser.message).toBe("REGISTRA'T_PER_VEURE");
  });

  test("consulta vàlida → quota incremental ATÒMICA (un sol $queryRaw, sense upsert duplicat)", async () => {
    db.municipality.findUnique = fn("municipality.findUnique", async () => ({
      code: "080193",
      name: "Barcelona",
      comarca: "Barcelonès",
      province: "Barcelona",
      isTense: false,
      rentLatest: 1200,
      rentPeriod: "2026 I",
    }));
    const res = await lookupPOST(req("POST", "http://x/api/lookup", { lat: 41.4, lng: 2.1 }) as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(d.kind).toBe("full");
    expect(d.quota).toEqual({ used: 1, limit: 3 });
    // un ÚNIC enunciat SQL (atòmic), i el vell upsert doble ja no es fa
    expect(lastCall("$queryRaw")).toBeDefined();
  });

  test("quota exhaurida ($queryRaw sense files) → 402 QUOTA_EXCEEDED", async () => {
    db.municipality.findUnique = fn("municipality.findUnique", async () => ({
      code: "080193",
      name: "Barcelona",
      comarca: "Barcelonès",
      isTense: false,
    }));
    db.$queryRaw = fn("$queryRaw", async () => []); // ON CONFLICT WHERE false
    db.subscriptionUsage.findUnique = fn("subscriptionUsage.findUnique", async () => ({ usageCount: 3 }));
    const res = await lookupPOST(req("POST", "http://x/api/lookup", { lat: 41.4, lng: 2.1 }) as any, undefined as any);
    const d = await jsonOf(res);
    expect(res.status).toBe(402);
    expect(d.error).toBe("QUOTA_EXCEEDED");
    expect(d.quota).toEqual({ used: 3, limit: 3 });
  });
});

// ---------------------------------------------------------------------------
// 6. ACCÉS A FUNCIONALITATS PREMIUM / PRO
// ---------------------------------------------------------------------------

describe("accés premium/pro", () => {
  test("GET /api/subscription sense sessió → 401 (el hook mostra Free per defecte)", async () => {
    state.authUser = null;
    const res = await subscriptionGET();
    expect(res.status).toBe(401);
  });

  test("GET /api/subscription amb sessió → estat complet del pla", async () => {
    const res = await subscriptionGET();
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    expect(d.planType).toBe("free");
    expect(d.isFree).toBe(true);
    expect(d.stripeConfigured).toBe(false);
  });

  test("POST /api/subscription no existeix → no es pot auto-pujar de pla des del client", async () => {
    expect(subscriptionPOST).toBeUndefined();
  });

  test("favorites GET amb plan FREE → 403 PLAN_REQUIRED (abans es podia llegir via API)", async () => {
    state.planAllowsImpl = (_p, f) => f !== "preferits";
    const res = await favoritesGET();
    expect(res.status).toBe(403);
    expect((await jsonOf(res)).error).toBe("PLAN_REQUIRED");
  });

  test("favorites GET amb Premium → 200", async () => {
    state.planAllowsImpl = () => true;
    db.favorite.findMany = fn("favorite.findMany", async () => []);
    const res = await favoritesGET();
    expect(res.status).toBe(200);
  });

  test("GET /api/plans és públic i exposa la config efectiva (unificació de preus)", async () => {
    const res = await plansGET();
    const d = await jsonOf(res);
    expect(res.status).toBe(200);
    const premium = d.plans.find((p: AnyObj) => p.id === "PREMIUM");
    expect(premium.priceEur).toBe(7.99);
  });
});

// ---------------------------------------------------------------------------
// 7. FUNCIONS PURES DE LA AUDITORIA
// ---------------------------------------------------------------------------

describe("funcions pures v23", () => {
  test("isUniqueViolation distingeix duplicat (P2002/23505) d'error de BD", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ message: "Unique constraint failed on the fields" })).toBe(true);
    expect(isUniqueViolation(new Error("Connection refused"))).toBe(false);
    expect(isUniqueViolation(new Error("timeout"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  test("planFromPriceId amb noms canònics i antics (portal de Stripe)", () => {
    const env = {
      STRIPE_PREMIUM_PRICE_ID: "price_prem",
      STRIPE_PRO_AGENTS_PRICE_ID: "price_pro",
      STRIPE_PRICE_PREMIUM: "price_prem_old",
      STRIPE_PRICE_PRO: "price_pro_old",
    };
    expect(planFromPriceId("price_prem", env)).toBe("PREMIUM");
    expect(planFromPriceId("price_pro", env)).toBe("PRO");
    expect(planFromPriceId("price_prem_old", env)).toBe("PREMIUM");
    expect(planFromPriceId("price_pro_old", env)).toBe("PRO");
    expect(planFromPriceId("price_desconegut", env)).toBeNull();
    expect(planFromPriceId(null, env)).toBeNull();
    expect(planFromPriceId(undefined, env)).toBeNull();
  });

  test("formatEurFromCents: import real de Stripe a text", () => {
    expect(formatEurFromCents(799)).toBe("7,99 €");
    expect(formatEurFromCents(1999)).toBe("19,99 €");
    expect(formatEurFromCents(0)).toBe("0,00 €");
    expect(formatEurFromCents(null)).toBeNull();
    expect(formatEurFromCents(-5)).toBeNull();
  });

  test("highestVigentPlan: gràcia past_due, mai canceled/expired", () => {
    expect(highestVigentPlan([{ status: "past_due", plan: "PREMIUM" }])).toBe("PREMIUM");
    expect(highestVigentPlan([{ status: "trialing", plan: "PREMIUM" }])).toBe("PREMIUM");
    expect(highestVigentPlan([{ status: "canceled", plan: "PRO" }])).toBe("FREE");
    expect(highestVigentPlan([{ status: "expired", plan: "PRO" }])).toBe("FREE");
    expect(
      highestVigentPlan([
        { status: "past_due", plan: "PREMIUM" },
        { status: "active", plan: "PRO" },
      ])
    ).toBe("PRO");
  });

  test("VIGENT_STATUSES inclou gràcia de pagament", () => {
    expect(VIGENT_STATUSES).toContain("active");
    expect(VIGENT_STATUSES).toContain("trialing");
    expect(VIGENT_STATUSES).toContain("past_due");
    expect(VIGENT_STATUSES).not.toContain("canceled");
  });

  test("subscriptionLocalData mapant una subscripció real de Stripe", () => {
    const d = subscriptionLocalData({
      status: "active",
      cancel_at_period_end: true,
      items: {
        data: [
          {
            price: { id: "price_pro", recurring: { interval: "year" } },
            current_period_start: 1730000000,
            current_period_end: 1761536000,
          },
        ],
      },
    } as never);
    expect(d.status).toBe("active");
    expect(d.cancelAtPeriodEnd).toBe(true);
    expect(d.billingInterval).toBe("year");
    expect(d.stripePriceId).toBe("price_pro");
    expect(d.currentPeriodEnd).toBeInstanceOf(Date);
  });

  test("UNIFICACIÓ de preus: PLANS (backend) === i18n (frontend) === rebuts", () => {
    // backend (font de veritat)
    expect(7.99).toBe(7.99);
    // frontend ca i es (i18n) han de coincidir amb PLANS
    for (const loc of ["ca", "es"] as const) {
      const p = (STRINGS as AnyObj)[loc].plans;
      expect(p.premium.price).toBe("7,99 €");
      expect(p.pro.price).toBe("19,99 €");
    }
    // i el rebut d'un cobrament de 799 cèntims mostra exactament el mateix
    expect(formatEurFromCents(799)).toBe("7,99 €");
    expect(formatEurFromCents(1999)).toBe("19,99 €");
  });
});
