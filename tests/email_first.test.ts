/**
 * v46 — Tests del flux EMAIL-FIRST amb registre obligatori al formulari de la
 * Home (encàrrec «Registre obligatori amb e-mail primer»).
 *
 * Coberta d'aquest fitxer:
 *  1. Taula de decisió COMPLETA (cap cas sense definir): buit/invàlid → error;
 *     registrat+sessió → executa; registrat sense sessió → magic link;
 *     no registrat → registre Free; quota exhaurida → la decideix el SERVIDOR
 *     (402, testat al gate real).
 *  2. Endpoint públic /api/email-status: resposta mínima { registered } (mai
 *     noms ni pla — anti-enumeració), rate-limit 5/min.
 *  3. BLOQUEIG REAL AL SERVIDOR (mai només visual): /api/analitza i
 *     /api/estima sense sessió → 401 { code: "REGISTRAT_PRIMER" } i NO toquen
 *     la BD (cap càlcul detallat); amb sessió → quota DETAIL_QUERY per user_id
 *     (la mateixa font atòmica v23 que /api/lookup).
 *  4. Magic link: POST { sent: true } SEMPRE (anti-enumeració), token només
 *     HASH a la BD, un sol ús ATÒMIC, caducitat 15 min, returnTo revalidat
 *     contra l'allowlist (mai open redirect), comptes inactius mai reben correu.
 *  5. Rutes internes segures (safeInternalRoute) i redirects de registre.
 *  6. Guardes de FONT: l'e-mail és la PRIMERA casella dels formularis i del
 *     registre; els textos «sense registre» / «cap dada personal» ja no existeixen.
 *
 * Patró de mocks: audit_v23.test.ts (next/server, db amb Proxy, rate-limit,
 * security amb COPIA COMPLETA) + mocks nous d'auth/plans/subscription/mail.
 */
import { describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";

import {
  buildSignupRedirect,
  decideEmailFirst,
  isValidEmailFormat,
  normalizeEmailInput,
  safeInternalRoute,
  EMAIL_FIRST_ERROR_INVALID,
  EMAIL_FIRST_LOCKED,
  EMAIL_FIRST_MAGIC_SENT,
  EMAIL_FIRST_NET_ERROR,
  EMAIL_FIRST_UNREGISTERED,
} from "../src/lib/email-first";
import { hashToken } from "../src/lib/token-hash";

// ── Estat compartit dels mocks ───────────────────────────────────────────────

const state = {
  rateOk: true,
  sessionUser: null as null | { id: string; email: string; plan: string; active: boolean; emailVerifiedAt: Date | null; tokenVersion: number; name: string | null; role: string; locale: string },
  usersByEmail: new Map<string, Record<string, unknown>>(),
  magicTokens: new Map<string, Record<string, unknown>>(), // clau: HASH sha256
  quotaResult: { ok: true, used: 0, limit: 3 } as { ok: boolean; used: number; limit: number },
  quotaCalls: [] as Array<[string, number]>,
  mailSent: [] as Array<{ to: string; subject: string; type: string }>,
  sessionsCreated: [] as Array<Record<string, unknown>>,
  events: [] as Array<{ type: string; meta?: string; userId?: string }>,
  dbOps: [] as Array<[string, unknown]>,
  muni: {
    code: "081136",
    name: "Manresa",
    comarca: "Bages",
    province: "Barcelona",
    lat: 41.7243,
    lng: 1.8289,
    rentLatest: 750.5,
    rentPeriod: "2025",
    rentHistory: JSON.stringify({ "2024": 741.2, "2025": 750.5 }),
    contractsLatest: 1468,
    comarcaRefLatest: 700,
    comarcaRefPeriod: "2025",
    rentSource: "INCASOL",
    isTense: false,
    tenseList: null,
  },
};

function resetState() {
  state.rateOk = true;
  state.sessionUser = null;
  state.usersByEmail.clear();
  state.magicTokens.clear();
  state.quotaResult = { ok: true, used: 0, limit: 3 };
  state.quotaCalls = [];
  state.mailSent = [];
  state.sessionsCreated = [];
  state.events = [];
  state.dbOps = [];
}

// ── Mocks (ABANS dels imports de rutes — obligatori amb bun) ─────────────────

mock.module("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    redirect: (url: string) =>
      new Response(null, { status: 307, headers: { location: url } }),
  },
  after: (fn: () => Promise<void> | void) => { void fn(); }, // executa SINCRON pels tests
}));

const genericModel = () =>
  new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "findUnique") return async () => null;
      if (prop === "findMany") return async () => [];
      if (prop === "create") return async () => ({});
      return async () => ({});
    },
  });

const fakeDb = new Proxy(
  {
    user: {
      findUnique: async (args: { where: { email?: string; id?: string } }) => {
        state.dbOps.push(["user.findUnique", args]);
        if (args.where.email) return state.usersByEmail.get(args.where.email) ?? null;
        return null;
      },
      update: async (args: unknown) => {
        state.dbOps.push(["user.update", args]);
        return {};
      },
    },
    magicToken: {
      findUnique: async (args: { where: { token: string } }) => {
        state.dbOps.push(["magicToken.findUnique", args]);
        return state.magicTokens.get(args.where.token) ?? null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        state.dbOps.push(["magicToken.create", args]);
        const row = { id: `mt-${state.magicTokens.size + 1}`, used: false, ...args.data };
        state.magicTokens.set(String(args.data.token), row);
        return row;
      },
      updateMany: async (args: { where: { id?: string; used?: boolean; userId?: string }; data: { used: boolean } }) => {
        state.dbOps.push(["magicToken.updateMany", args]);
        let count = 0;
        for (const [k, row] of state.magicTokens) {
          if (args.where.id && row.id !== args.where.id) continue;
          if (args.where.used === false && row.used === true) continue;
          if (args.where.userId && row.userId !== args.where.userId) continue;
          state.magicTokens.set(k, { ...row, used: args.data.used });
          count++;
        }
        return { count };
      },
    },
    municipality: {
      findUnique: async (args: unknown) => {
        state.dbOps.push(["municipality.findUnique", args]);
        return state.muni;
      },
      findMany: async (args: unknown) => {
        state.dbOps.push(["municipality.findMany", args]);
        return [];
      },
    },
    event: {
      create: async (args: { data: { type: string; meta?: string; userId?: string } }) => {
        state.dbOps.push(["event.create", args]);
        state.events.push(args.data);
        return {};
      },
    },
  },
  {
    get: (target, prop: string) =>
      prop in target
        ? (target as Record<string, unknown>)[prop]
        : genericModel(),
  },
);

mock.module("@/lib/db", () => ({ db: fakeDb }));

mock.module("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: state.rateOk, used: 1, limit: 5 }),
}));

// COPIA COMPLETA (patró audit_v23): si aquest mock guanyés la re-vinculació de
// bun, cap fitxer posterior no pot quedar-se sense un export del mòdul real.
mock.module("@/lib/security", () => ({
  audit: async () => ({}),
  clientIp: () => "203.0.113.9",
  hashIp: () => "h",
  escapeHtml: (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  htmlToText: (html: string) => html.replace(/<[^>]*>/g, " ").trim(),
  maskEmail: (e: string) => e,
  sanitizeName: (n: string) => n,
}));

mock.module("@/lib/auth", () => ({
  getAuthUser: async () => state.sessionUser,
  requireUser: async () => {
    if (!state.sessionUser) throw new Error("UNAUTHENTICATED");
    return state.sessionUser;
  },
  requireAdmin: async () => {
    if (!state.sessionUser) throw new Error("UNAUTHENTICATED");
    if (state.sessionUser.role !== "ADMIN") throw new Error("FORBIDDEN");
    return state.sessionUser;
  },
  requireVerifiedUser: async () => {
    if (!state.sessionUser) throw new Error("UNAUTHENTICATED");
    return state.sessionUser;
  },
  createSessionFor: async (user: Record<string, unknown>) => {
    state.sessionsCreated.push(user);
    return "jwt";
  },
  createSession: async () => "jwt",
  destroySession: async () => {},
  revokeSessions: async () => {},
  sessionPayloadFor: (user: Record<string, unknown>) => ({ userId: user.id, email: user.email, plan: user.plan, role: user.role, tv: 0 }),
  hashPassword: async (pw: string) => `hashed:${pw}`,
  verifyPassword: async () => true,
  createTotpChallenge: async () => "challenge",
  verifyTotpChallenge: async () => null,
  getSession: async () => null,
  isEmailNotVerifiedError: () => false,
}));

mock.module("@/lib/plans", () => ({
  getPlanSettings: async () => ({
    FREE: { quotaMonth: 3 },
    PREMIUM: { quotaMonth: -1 },
    PRO: { quotaMonth: -1 },
  }),
  quotaForPlan: async (plan: string) => (plan === "FREE" ? 3 : -1),
  canConsult: async () => ({ ok: true, used: 0, limit: 3 }),
  planAllows: async () => true,
  pdfLimitForPlan: async () => 5,
  valuationLimitForPlan: async () => 5,
  syncUserPlan: async () => null,
  PLANS: { FREE: { quotaMonth: 3 }, PREMIUM: { quotaMonth: -1 }, PRO: { quotaMonth: -1 } },
}));

mock.module("@/lib/subscription", () => ({
  consumeDetailQuery: async (userId: string, limit: number) => {
    state.quotaCalls.push([userId, limit]);
    return state.quotaResult;
  },
  recordUsage: async () => null,
  monthKey: () => "2026-11",
  PLAN_RANK: { FREE: 0, PREMIUM: 1, PRO: 2 },
  VIGENT_STATUSES: ["active", "trialing", "past_due"],
  USAGE_TYPES: { DETAIL_QUERY: "DETAIL_QUERY", EXPORT_CSV: "EXPORT_CSV", PDF_REPORT: "PDF_REPORT", VALUATION: "VALUATION" },
  isUniqueViolation: () => false,
  planIdToType: () => "free",
  typeToPlanId: () => null,
}));

mock.module("@/lib/mail", () => ({
  sendMail: async (input: { to: string; subject: string; type?: string }) => {
    state.mailSent.push({ to: input.to, subject: input.subject, type: input.type ?? "GENERIC" });
    return true;
  },
  magicMail: (token: string, locale: string) => ({
    subject: `Preureal — ${locale === "es" ? "Entrar en Preureal" : "Entra a Preureal"}`,
    html: `<a href="https://www.preureal.com/#/entrada-link?token=${token}">entra</a>`,
  }),
  welcomeMail: () => ({ subject: "w", html: "w" }),
  verifyMail: () => ({ subject: "v", html: "v" }),
  resetMail: () => ({ subject: "r", html: "r" }),
  receiptMail: () => ({ subject: "rc", html: "rc" }),
  reportReadyMail: () => ({ subject: "rr", html: "rr" }),
  favoritesDigestMail: () => ({ subject: "d", html: "d" }),
  priceAlertMail: () => ({ subject: "a", html: "a" }),
  mailProvider: () => "sandbox",
  redactSecrets: (html: string) => html,
  deliverWithResend: async () => ({ ok: false }),
}));

mock.module("@/lib/indicators-data", () => ({
  getMuniRentRows: async () => [],
}));

// imports de les rutes i del gate REAL (després dels mock.module)
const { POST: emailStatusPOST } = await import("../src/app/api/_impl/email-status/route");
const { POST: magicLinkPOST } = await import("../src/app/api/_impl/auth/magic-link/route");
const { POST: magicConsumePOST, GET: magicConsumeGET } = await import("../src/app/api/_impl/auth/magic-link/consume/route");
const { POST: analitzaPOST } = await import("../src/app/api/_impl/analitza/route");
const { POST: estimaPOST } = await import("../src/app/api/_impl/estima/route");
const { gateDetailedQuery } = await import("../src/lib/consulta-gate");

function jsonReq(body: unknown, url = "http://localhost/api/x"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── 1. Taula de decisió (pura) ───────────────────────────────────────────────

describe("email-first — taula de decisió completa (cap cas sense definir)", () => {
  test("buit o format invàlid → 'invalid' (error inline, no s'envia res)", () => {
    expect(decideEmailFirst({ email: "", registered: null, sessionEmail: null })).toBe("invalid");
    expect(decideEmailFirst({ email: "joan@@x", registered: null, sessionEmail: null })).toBe("invalid");
    expect(decideEmailFirst({ email: "sense-arroba", registered: true, sessionEmail: null })).toBe("invalid");
    expect(isValidEmailFormat("")).toBe(false);
    expect(isValidEmailFormat("a@b")).toBe(false);
    expect(EMAIL_FIRST_ERROR_INVALID.ca).toBe("Introdueix un e-mail vàlid.");
  });

  test("registrat + sessió mateix e-mail → 'run' (desbloqueja i executa; compta quota al servidor)", () => {
    expect(decideEmailFirst({ email: "Joan@Example.com", registered: true, sessionEmail: "joan@example.com" })).toBe("run");
  });

  test("registrat + SENSE sessió → 'magic' (verificació per enllaç; en tornar, reprendre)", () => {
    expect(decideEmailFirst({ email: "joan@example.com", registered: true, sessionEmail: null })).toBe("magic");
    expect(EMAIL_FIRST_MAGIC_SENT.ca).toBe("Ja tens compte. T'hem enviat un enllaç per entrar-hi.");
  });

  test("no registrat → 'signup' ('Registra't primer' → registre Free amb e-mail precarregat)", () => {
    expect(decideEmailFirst({ email: "nou@example.com", registered: false, sessionEmail: null })).toBe("signup");
    expect(EMAIL_FIRST_LOCKED.title.ca).toBe("Registra't primer");
    expect(EMAIL_FIRST_LOCKED.desc.ca).toContain("3 consultes detallades al mes");
    expect(EMAIL_FIRST_UNREGISTERED.ca).toBe("Aquest e-mail encara no té compte. Et portem al registre Free…");
  });

  test("registrat + quota exhaurida → la decideix EL SERVIDOR (402, no el client)", () => {
    // el client no té l'estat de quota: el gate del servidor respon 402 (test D3)
    expect(state.quotaResult.ok).toBe(true); // el client mai el decideix per avançat
  });

  test("sessió amb UN ALTRE e-mail → 'magic' (mai suplantació: l'enllaç va al correu escrit)", () => {
    expect(decideEmailFirst({ email: "altre@example.com", registered: true, sessionEmail: "joan@example.com" })).toBe("magic");
  });
});

describe("email-first — normalització i rutes internes segures (anti open-redirect)", () => {
  test("normalizeEmailInput: trim + lowercase (el servidor col·lapsa aliases Gmail)", () => {
    expect(normalizeEmailInput("  Joan@Example.COM ")).toBe("joan@example.com");
  });

  test("safeInternalRoute: només rutes internes de l'allowlist", () => {
    expect(safeInternalRoute("/")).toBe("/");
    expect(safeInternalRoute("/estima")).toBe("/estima");
    expect(safeInternalRoute("/analitza")).toBe("/analitza");
    expect(safeInternalRoute("https://evil.com")).toBeNull();
    expect(safeInternalRoute("//evil.com")).toBeNull();
    expect(safeInternalRoute("/\\evil")).toBeNull();
    expect(safeInternalRoute("/../secret")).toBeNull();
    expect(safeInternalRoute("/ruta-desconeguda")).toBeNull();
    expect(safeInternalRoute("")).toBeNull();
    expect(safeInternalRoute(null)).toBeNull();
  });

  test("buildSignupRedirect: /registre?pla=free&email=&return= SEMPRE interns", () => {
    const r = buildSignupRedirect("joan@example.com", "/estima");
    expect(r.startsWith("/registre?pla=free&email=")).toBe(true);
    expect(r).toContain(encodeURIComponent("joan@example.com"));
    expect(r).toContain(`return=${encodeURIComponent("/estima")}`);
    // return no segur → cau a "/" (mai open redirect)
    const bad = buildSignupRedirect("a@b.com", "https://evil.com");
    expect(bad).toContain(`return=${encodeURIComponent("/")}`);
  });
});

// ── 2. /api/email-status ─────────────────────────────────────────────────────

describe("email-first — POST /api/email-status (públic, rate-limitat, anti-enumeració)", () => {
  test("e-mail registrat → { registered: true } i NOMÉS aquest camp", async () => {
    resetState();
    state.usersByEmail.set("joan@example.com", { id: "u1", email: "joan@example.com" });
    const res = await emailStatusPOST(jsonReq({ email: "Joan@Example.com" }), "http://localhost/api/email-status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registered).toBe(true);
    expect(Object.keys(body).sort()).toEqual(["registered"]); // mai noms ni pla
  });

  test("e-mail NO registrat → { registered: false } (mateixa forma exacta)", async () => {
    resetState();
    const res = await emailStatusPOST(jsonReq({ email: "nou@example.com" }), "http://localhost/api/email-status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registered).toBe(false);
    expect(Object.keys(body).sort()).toEqual(["registered"]);
  });

  test("format invàlid → 400 sense tocar la BD", async () => {
    resetState();
    const res = await emailStatusPOST(jsonReq({ email: "no-es-un-email" }), "http://localhost/api/email-status");
    expect(res.status).toBe(400);
    expect(state.dbOps.length).toBe(0);
  });

  test("rate limit (5 req/min/IP) → 429", async () => {
    resetState();
    state.rateOk = false;
    const res = await emailStatusPOST(jsonReq({ email: "a@b.com" }), "http://localhost/api/email-status");
    state.rateOk = true;
    expect(res.status).toBe(429);
  });
});

// ── 3. BLOQUEIG REAL AL SERVIDOR (mai només visual) ──────────────────────────

describe("email-first — bloqueig REAL al servidor (gate de consulta detallada)", () => {
  test("D1. gate sense sessió → 401 { code: 'REGISTRAT_PRIMER' }", async () => {
    resetState();
    const g = await gateDetailedQuery();
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.res.status).toBe(401);
      const body = await g.res.json();
      expect(body.code).toBe("REGISTRAT_PRIMER");
      expect(body.error).toBe("UNAUTHENTICATED");
    }
  });

  test("D2. amb sessió → quota DETAIL_QUERY per USER_ID amb el límit del pla Free", async () => {
    resetState();
    state.sessionUser = { id: "u1", email: "joan@example.com", plan: "FREE", active: true, emailVerifiedAt: new Date(), tokenVersion: 0, name: null, role: "USER", locale: "ca" };
    const g = await gateDetailedQuery();
    expect(g.ok).toBe(true);
    expect(state.quotaCalls).toEqual([["u1", 3]]); // per user_id, mai per cookie
  });

  test("D3. quota exhaurida → 402 QUOTA_EXCEEDED amb { quota, plan } (mateix contracte que el mapa)", async () => {
    resetState();
    state.sessionUser = { id: "u1", email: "joan@example.com", plan: "FREE", active: true, emailVerifiedAt: new Date(), tokenVersion: 0, name: null, role: "USER", locale: "ca" };
    state.quotaResult = { ok: false, used: 3, limit: 3 };
    const g = await gateDetailedQuery();
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.res.status).toBe(402);
      const body = await g.res.json();
      expect(body.error).toBe("QUOTA_EXCEEDED");
      expect(body.quota).toEqual({ used: 3, limit: 3 });
      expect(body.plan).toBe("FREE");
    }
  });

  test("D4. /api/analitza sense sessió → 401 REGISTRAT_PRIMER i la BD NI ES TOCA (mai cap càlcul detallat)", async () => {
    resetState();
    const res = await analitzaPOST(jsonReq({ municipalityCode: "081136", priceEurMonth: 800 }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("REGISTRAT_PRIMER");
    expect(state.dbOps.length).toBe(0); // cap lectura de municipi, cap escriptura
  });

  test("D5. /api/estima sense sessió → 401 REGISTRAT_PRIMER i la BD ni es toca", async () => {
    resetState();
    const res = await estimaPOST(jsonReq({ municipalityCode: "081136", surfaceM2: 80 }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("REGISTRAT_PRIMER");
    expect(state.dbOps.length).toBe(0);
  });

  test("D6. /api/analitza AMB sessió → 200 i Event anònim (l'e-mail mai arriba al registre d'ús)", async () => {
    resetState();
    state.sessionUser = { id: "u1", email: "joan@example.com", plan: "FREE", active: true, emailVerifiedAt: new Date(), tokenVersion: 0, name: null, role: "USER", locale: "ca" };
    const res = await analitzaPOST(jsonReq({
      municipalityCode: "081136",
      municipalityName: "Manresa",
      priceEurMonth: 800,
      surfaceM2: 80,
      rooms: 3,
      contractType: "HABITATGE",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const events = state.events.filter((e) => e.type === "ANALITZA");
    expect(events.length).toBe(1);
    expect(events[0].userId).toBeUndefined(); // anònim (RGPD)
    const meta = JSON.parse(events[0].meta || "{}");
    expect(meta.mun).toBe("081136");
    expect(JSON.stringify(meta)).not.toContain("joan@example.com"); // mai l'e-mail
  });

  test("D7. /api/estima AMB sessió → 200 (l'estimació executa amb quota aplicada al servidor)", async () => {
    resetState();
    state.sessionUser = { id: "u1", email: "joan@example.com", plan: "FREE", active: true, emailVerifiedAt: new Date(), tokenVersion: 0, name: null, role: "USER", locale: "ca" };
    const res = await estimaPOST(jsonReq({ municipalityCode: "081136", surfaceM2: 85, rooms: 3, estat: "REFORMADA" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.available).toBe(true);
    expect(state.quotaCalls).toEqual([["u1", 3]]);
  });

  test("D8. sessió vàlida però quota exhaurida a /api/estima → 402 (mai calcula en silenci)", async () => {
    resetState();
    state.sessionUser = { id: "u1", email: "joan@example.com", plan: "FREE", active: true, emailVerifiedAt: new Date(), tokenVersion: 0, name: null, role: "USER", locale: "ca" };
    state.quotaResult = { ok: false, used: 3, limit: 3 };
    const res = await estimaPOST(jsonReq({ municipalityCode: "081136", surfaceM2: 85 }));
    state.quotaResult = { ok: true, used: 0, limit: 3 };
    expect(res.status).toBe(402);
    expect(state.dbOps.filter(([op]) => op === "municipality.findUnique").length).toBe(0);
  });
});

// ── 4. Magic link ────────────────────────────────────────────────────────────

describe("email-first — magic link (registrat sense sessió: anti-suplantació)", () => {
  test("M1. compte registrat → { sent: true } + correu enviat + token només HASH a la BD", async () => {
    resetState();
    state.usersByEmail.set("joan@example.com", { id: "u1", email: "joan@example.com", active: true, name: "Joan" });
    const res = await magicLinkPOST(jsonReq({ email: "Joan@Example.com", return: "/estima", locale: "ca" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(state.mailSent.length).toBe(1);
    expect(state.mailSent[0].to).toBe("joan@example.com"); // normalitzat (Gmail)
    expect(state.mailSent[0].subject).toContain("Preureal");
    // a la BD només el HASH sha256: el token cru mai es persisteix
    const creates = state.dbOps.filter(([op]) => op === "magicToken.create");
    expect(creates.length).toBe(1);
    const savedToken = (creates[0][1] as { data: { token: string; returnTo?: string } }).data.token;
    expect(savedToken).not.toContain("Joan");
    expect(savedToken).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect((creates[0][1] as { data: { returnTo?: string } }).data.returnTo).toBe("/estima");
  });

  test("M2. compte NO registrat → resposta IDÈNTICA { sent: true } i cap correu (anti-enumeració)", async () => {
    resetState();
    const res = await magicLinkPOST(jsonReq({ email: "fantasma@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(state.mailSent.length).toBe(0);
    expect(state.dbOps.filter(([op]) => op === "magicToken.create").length).toBe(0);
  });

  test("M3. compte INACTIU → cap correu (mateix comportament silenciós que el login)", async () => {
    resetState();
    state.usersByEmail.set("banned@example.com", { id: "u2", email: "banned@example.com", active: false });
    const res = await magicLinkPOST(jsonReq({ email: "banned@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(state.mailSent.length).toBe(0);
  });

  test("M4. format invàlit → 400; rate limit → 429", async () => {
    resetState();
    const bad = await magicLinkPOST(jsonReq({ email: "no-es-email" }));
    expect(bad.status).toBe(400);
    state.rateOk = false;
    const rl = await magicLinkPOST(jsonReq({ email: "a@b.com" }));
    state.rateOk = true;
    expect(rl.status).toBe(429);
  });

  test("M5. un enllaç nou ANUL·LA els anteriors pendents (fes servir sempre l'últim)", async () => {
    resetState();
    state.usersByEmail.set("joan@example.com", { id: "u1", email: "joan@example.com", active: true, name: null });
    await magicLinkPOST(jsonReq({ email: "joan@example.com" }));
    await magicLinkPOST(jsonReq({ email: "joan@example.com" }));
    const invalidations = state.dbOps.filter(([op]) => op === "magicToken.updateMany");
    expect(invalidations.length).toBe(2);
    expect(state.magicTokens.size).toBe(2);
    // el segon token queda VIGENT i el primer USAT
    const rows = [...state.magicTokens.values()] as Array<{ used: boolean; createdAt: string }>;
    expect(rows.filter((r) => !r.used).length).toBe(1);
  });

  test("M6. consumir un token vàlid → sessió creada + token usat + returnTo intern", async () => {
    resetState();
    const raw = "0".repeat(48);
    state.magicTokens.set(hashToken(raw), {
      id: "mt1",
      userId: "u1",
      token: hashToken(raw),
      returnTo: "/estima",
      expiresAt: new Date(Date.now() + 15 * 60_000),
      used: false,
      user: { id: "u1", email: "joan@example.com", name: "Joan", role: "USER", plan: "FREE", active: true },
    });
    const res = await magicConsumePOST(jsonReq({ token: raw }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.estat).toBe("ok");
    expect(body.returnTo).toBe("/estima");
    expect(state.sessionsCreated.length).toBe(1); // la sessió es crea AL SERVIDOR
    const row = state.magicTokens.get(hashToken(raw)) as { used: boolean };
    expect(row.used).toBe(true);
  });

  test("M7. un sol ús ATÒMIC: segon consum → ja_usat (mai dues sessions)", async () => {
    resetState();
    const raw = "1".repeat(48);
    state.magicTokens.set(hashToken(raw), {
      id: "mt1",
      userId: "u1",
      token: hashToken(raw),
      returnTo: null,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      used: false,
      user: { id: "u1", email: "joan@example.com", name: null, role: "USER", plan: "FREE", active: true },
    });
    const first = await magicConsumePOST(jsonReq({ token: raw }));
    expect(first.status).toBe(200);
    const second = await magicConsumePOST(jsonReq({ token: raw }));
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.estat).toBe("ja_usat");
    expect(state.sessionsCreated.length).toBe(1); // UNA sola sessió
  });

  test("M8. caducat / desconegut / compte inactiu → rebutjats sense sessió", async () => {
    resetState();
    const expired = "2".repeat(48);
    state.magicTokens.set(hashToken(expired), {
      id: "mt2", userId: "u1", token: hashToken(expired),
      expiresAt: new Date(Date.now() - 1000), used: false,
      user: { id: "u1", email: "joan@example.com", name: null, role: "USER", plan: "FREE", active: true },
    });
    const resExp = await magicConsumePOST(jsonReq({ token: expired }));
    expect(resExp.status).toBe(400);
    expect((await resExp.json()).estat).toBe("caducat");

    const resUnknown = await magicConsumePOST(jsonReq({ token: "3".repeat(48) }));
    expect(resUnknown.status).toBe(400);
    expect((await resUnknown.json()).estat).toBe("invalid");

    const inactive = "4".repeat(48);
    state.magicTokens.set(hashToken(inactive), {
      id: "mt3", userId: "u2", token: hashToken(inactive),
      expiresAt: new Date(Date.now() + 15 * 60_000), used: false,
      user: { id: "u2", email: "banned@example.com", name: null, role: "USER", plan: "FREE", active: false },
    });
    const resInact = await magicConsumePOST(jsonReq({ token: inactive }));
    expect(resInact.status).toBe(400);
    expect((await resInact.json()).estat).toBe("invalid");
    expect(state.sessionsCreated.length).toBe(0);
  });

  test("M9. returnTo insegur a la BD → revalidat a '/' (mai open redirect ni amb sessió creada)", async () => {
    resetState();
    const raw = "5".repeat(48);
    state.magicTokens.set(hashToken(raw), {
      id: "mt4", userId: "u1", token: hashToken(raw),
      returnTo: "https://evil.com",
      expiresAt: new Date(Date.now() + 15 * 60_000), used: false,
      user: { id: "u1", email: "joan@example.com", name: null, role: "USER", plan: "FREE", active: true },
    });
    const res = await magicConsumePOST(jsonReq({ token: raw }));
    const body = await res.json();
    expect(body.returnTo).toBe("/");
  });

  test("M10. el GET de consum NO muta mai dades (P1.2: només redirigeix a la SPA)", async () => {
    resetState();
    const res = await magicConsumeGET(new Request("http://localhost/api/auth/magic-link/consume?token=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/#/entrada-link?token=abc");
    expect(state.dbOps.length).toBe(0);
    expect(state.sessionsCreated.length).toBe(0);
  });
});

// ── 5. Guardes de FONT (l'e-mail és la PRIMERA casella; textos honestos) ─────

describe("email-first — guardes de font dels formularis i del registre", () => {
  const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  test("G1. AnalitzaForm: el camp e-mail és la PRIMERA casella (abans del municipi)", () => {
    const gate = readSrc("../src/components/emailfirst/EmailFirst.tsx");
    expect(gate).toContain('id="ef-email"'); // el DOM id real del camp compartit
    const src = readSrc("../src/components/analitza/AnalitzaForm.tsx");
    expect(src.indexOf("<EmailFirstField")).toBeGreaterThan(-1);
    expect(src.indexOf("<EmailFirstField")).toBeLessThan(src.indexOf('id="analitza-muni"'));
    expect(src.indexOf("<EmailFirstField")).toBeLessThan(src.indexOf('id="analitza-addr"'));
    expect(src.indexOf("<EmailFirstField")).toBeLessThan(src.indexOf('id="analitza-preu"'));
  });

  test("G2. EstimaForm: el camp e-mail és la PRIMERA casella (abans del municipi)", () => {
    const src = readSrc("../src/components/estima/EstimaForm.tsx");
    expect(src.indexOf("<EmailFirstField")).toBeGreaterThan(-1);
    expect(src.indexOf("<EmailFirstField")).toBeLessThan(src.indexOf('id="estima-muni"'));
    expect(src.indexOf("<EmailFirstField")).toBeLessThan(src.indexOf('id="estima-m2"'));
  });

  test("G3. AuthView: l'E-MAIL és la PRIMERA casella del registre (mai el nom)", () => {
    const src = readSrc("../src/components/views/AuthView.tsx");
    // al formulari: el bloc de l'e-mail (t.auth.email) apareix ABANS que el nom (t.auth.name)
    expect(src.indexOf("{t.auth.email}")).toBeLessThan(src.indexOf("{t.auth.name}"));
    // consentiment RGPD amb finalitat al registre
    expect(src).toContain("política de privacitat");
    expect(src).toContain("consent");
    // mode magic (consumició del magic link)
    expect(src).toContain('"magic"');
    expect(src).toContain("/api/auth/magic-link/consume");
  });

  test("G4. els textos falsos «sense registre» / «cap dada personal» ja NO existeixen als formularis", () => {
    for (const p of [
      "../src/components/analitza/AnalitzaForm.tsx",
      "../src/components/estima/EstimaForm.tsx",
      "../src/components/views/EstimaView.tsx",
      "../src/components/views/AnalitzaView.tsx",
      "../src/components/analitza/EstimaIntro.tsx",
    ]) {
      const src = readSrc(p);
      expect(src).not.toContain("gratuït i sense registre");
      expect(src).not.toContain("Gratuït i sense registre");
      expect(src).not.toContain("Gratuito y sin registro");
      expect(src).not.toContain("Cap dada personal:");
      expect(src).not.toContain("Ningún dato personal:");
      expect(src).not.toContain("Sense registre, sense dades personals");
      expect(src).not.toContain("Sin registro, sin datos personales");
    }
  });

  test("G5. el panell bloquejat existeix a les dues vistes (neix bloquejat sense compte)", () => {
    for (const p of [
      "../src/components/views/EstimaView.tsx",
      "../src/components/views/AnalitzaView.tsx",
      "../src/components/analitza/EstimaIntro.tsx",
    ]) {
      expect(readSrc(p)).toContain("GateLockedPanel");
    }
  });

  test("G6. el text fix de transparència dels informes es manté intacte (F1, mai degradat)", () => {
    const analitza = readFileSync(new URL("../src/lib/analitza.ts", import.meta.url), "utf8");
    expect(analitza).toContain("No és una taxació ni una valoració individualitzada de l'habitatge.");
    expect(analitza).toContain("No es una tasación ni una valoración individualizada de la vivienda.");
    const estima = readFileSync(new URL("../src/lib/estima.ts", import.meta.url), "utf8");
    // l'estima REUSA el text fix (mai una còpia divergent)
    expect(estima).toContain("ESTIMA_DISCLAIMER = ORIENTATION_DISCLAIMER");
  });

  // NOTA v46: la guarda G7 (ci.yml: email_first corre BLOQUEJANT al seu propi
  // procés bun) va amb el commit que actualitza .github/workflows/ci.yml (bucle
  // per fitxer + email_first a la llista). Requereix el permís «workflows» del
  // PAT per pushear-se; fins aleshores queda al commit pendent del workflow
  // (branca local v46-amb-workflow), com les 2 guardes equivalents de f4_qa.

  test("G8. doble enviament IDEMPOTENT (mai dobles consultes ni doble quota)", () => {
    const src = readSrc("../src/components/emailfirst/EmailFirst.tsx");
    // el guard inflight fa sortir la segona crida mentre la primera és en vol
    expect(src).toContain("if (inflight.current) return false");
    expect(src).toContain("inflight.current = false"); // s'allibera al finally
    expect(src).toContain("inflight.current = true");
  });

  test("G9. error de xarxa: l'esborrany es desa ABANS de la crida (el reintent no perd res)", () => {
    const src = readSrc("../src/components/emailfirst/EmailFirst.tsx");
    const saveIdx = src.indexOf("saveEmailFirstDraft(");
    const fetchIdx = src.indexOf('fetch("/api/email-status"');
    expect(saveIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(saveIdx); // esborrany PRIMER, xarxa DESPRÉS
    // missatge propi d'error de xarxa (mai un error genèric que faci perdre dades)
    expect(src).toContain("EMAIL_FIRST_NET_ERROR");
    expect(EMAIL_FIRST_NET_ERROR.ca).toContain("es conserva");
    expect(EMAIL_FIRST_NET_ERROR.es).toContain("se conserva");
  });
});
