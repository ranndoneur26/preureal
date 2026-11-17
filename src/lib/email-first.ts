/**
 * v46 — Flux EMAIL-FIRST amb registre obligatori al formulari de la Home.
 *
 * «Analitza el teu futur lloguer» (AnalitzaForm) i «Estima el lloguer del teu
 * habitatge» (EstimaForm) demanen PRIMER el correu electrònic. La taula de
 * decisió completa viu a decideEmailFirst() i el bloqueig REAL és al servidor:
 * les rutes que calculen registres detallats (/api/analitza, /api/estima)
 * passen per gateDetailedQuery() (src/lib/consulta-gate.ts) i sense sessió
 * retornen 401 { code: "REGISTRAT_PRIMER" } sense executar cap càlcul.
 *
 * Aquest mòdul és ISOMÒRFIC (client + servidor + tests): només lògica pura i
 * sessionStorage amb guards de tipus `typeof window`. Els textos en català
 * són els EXACTES exigits per l'encàrrec (mai traduïts al vol).
 *
 * RGPD: l'e-mail és dada personal. El desat només al sessionStorage del
 * navegador (mai a analytics); el servidor no el persisteix associat a cap
 * consulta (els Events d'ús segueixen sent anònims: municipi/m²/tensada).
 */

// ── Tipus ────────────────────────────────────────────────────────────────────

export type DraftKind = "analitza" | "estima";
export type EmailFirstDecision = "run" | "magic" | "signup";

// ── Textos exactes de l'encàrrec (català) + castellà per al segon idioma ────

export const EMAIL_FIRST_ERROR_INVALID = {
  ca: "Introdueix un e-mail vàlid.",
  es: "Introduce un e-mail válido.",
} as const;

/** Panell bloquejat (neix així sense sessió): títol + descripció + CTA. */
export const EMAIL_FIRST_LOCKED = {
  title: { ca: "Registra't primer", es: "Regístrate primero" },
  desc: {
    ca: "Crea un compte Free gratuït per veure els resultats. Sense targeta · 3 consultes detallades al mes.",
    es: "Crea una cuenta Free gratuita para ver los resultados. Sin tarjeta · 3 consultas detalladas al mes.",
  },
  cta: { ca: "Registra't gratis", es: "Regístrate gratis" },
} as const;

/** E-mail vàlid però sense compte → redirecció al registre del pla Free. */
export const EMAIL_FIRST_UNREGISTERED = {
  ca: "Aquest e-mail encara no té compte. Et portem al registre Free…",
  es: "Este e-mail aún no tiene cuenta. Te llevamos al registro Free…",
} as const;

/** E-mail registrat sense sessió → magic link (anti-suplantació). */
export const EMAIL_FIRST_MAGIC_SENT = {
  ca: "Ja tens compte. T'hem enviat un enllaç per entrar-hi.",
  es: "Ya tienes cuenta. Te hemos enviado un enlace para entrar.",
} as const;

/** Error de xarxa: l'esborrany es conserva, el reintent no perd res. */
export const EMAIL_FIRST_NET_ERROR = {
  ca: "Error de xarxa. Reintenta en uns instants: l'esborrany del formulari es conserva.",
  es: "Error de red. Reintenta en unos instantes: el borrador del formulario se conserva.",
} as const;

export const EMAIL_FIRST_LABEL = {
  ca: "El teu e-mail *",
  es: "Tu e-mail *",
} as const;

export const EMAIL_FIRST_PLACEHOLDER = {
  ca: "L'e-mail amb què t'has registrat",
  es: "El e-mail con el que te has registrado",
} as const;

export const EMAIL_FIRST_SWITCH_USER = {
  ca: "Canvia d'usuari",
  es: "Cambia de usuario",
} as const;

// ── Validació i normalització (client) ──────────────────────────────────────

/**
 * Normalització mínima AL CLIENT: trim + lowercase. Al servidor la ruta
 * /api/email-status i /api/auth/magic-link afegeixen normalizeEmail()
 * (aliases de Gmail) — el client mai decideix l'igualtat de comptes.
 */
export function normalizeEmailInput(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

/** Mateix format mínim que la ruta de registre: algo@algo.tld, ≤200. */
export function isValidEmailFormat(email: string): boolean {
  const e = normalizeEmailInput(email);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 200;
}

// ── Rutes internes segures (anti open-redirect) ─────────────────────────────

/**
 * `return=` només pot apuntar a rutes internes de la SPA. Allowlist tancada:
 * res d'URLs absoltes, res de protocol-relative ("//evil.com"), res de rutes
 * desconegudes. Si no és segura → null (el que truca decideix el fallback).
 */
const INTERNAL_ROUTE_ALLOWLIST = new Set<string>([
  "/",
  "/analitza",
  "/estima",
  "/mapa",
  "/comparador",
  "/analisi",
  "/guia",
  "/preus",
  "/faq",
  "/panell",
]);

export function safeInternalRoute(raw: string | null | undefined): string | null {
  const r = String(raw ?? "").trim();
  if (!r || r.length > 100) return null;
  if (!r.startsWith("/")) return null;
  if (r.startsWith("//") || r.includes("://") || r.includes("\\") || r.includes("..")) return null;
  // sense query ni hash: només rutes de vista netes de l'allowlist
  const path = r.split("?")[0].split("#")[0];
  return INTERNAL_ROUTE_ALLOWLIST.has(path) ? path : null;
}

/** Ruta de retorn per defecte de cada formulari (on viu el seu esborrany). */
export function returnRouteFor(kind: DraftKind, variant: "compact" | "full"): string {
  if (kind === "estima") return variant === "full" ? "/estima" : "/";
  return variant === "full" ? "/analitza" : "/";
}

/** URL del registre del pla Free amb e-mail precarregat i retorn intern. */
export function buildSignupRedirect(email: string, returnTo: string): string {
  const safe = safeInternalRoute(returnTo) ?? "/";
  return `/registre?pla=free&email=${encodeURIComponent(email)}&return=${encodeURIComponent(safe)}`;
}

// ── Decisió (taula de l'encàrrec, costats client i test) ────────────────────

/**
 * Taula de decisió — cap cas sense definir:
 *  - e-mail buit/invàlid               → "invalid" (error inline, no s'envia res)
 *  - registrat + sessió mateix e-mail  → "run"     (executa; la quota la compta el servidor)
 *  - registrat + sense sessió          → "magic"   (enllaç per correu; en tornar, reprendre)
 *  - no registrat                      → "signup"  ("Registra't primer" → registre Free)
 *  - registrat + quota exhaurida       → ho decideix EL SERVIDOR (402 QUOTA_EXCEEDED);
 *    el client mostra el missatge actual del límit del pla Free.
 */
export function decideEmailFirst(input: {
  email: string;
  registered: boolean | null;
  sessionEmail: string | null;
}): EmailFirstDecision | "invalid" {
  const email = normalizeEmailInput(input.email);
  if (!isValidEmailFormat(email)) return "invalid";
  if (input.registered !== true) return "signup";
  const session = normalizeEmailInput(input.sessionEmail ?? "");
  if (session && session === email) return "run";
  return "magic";
}

// ── Esborrany al sessionStorage (sense analytics, mai al servidor) ──────────

export interface EmailFirstDraft {
  values: Record<string, unknown>;
  email: string;
  autoRun: boolean;
  savedAt: number;
}

const DRAFT_KEYS: Record<DraftKind, string> = {
  // "pr_analitza_prefill" és la clau HISTÒRICA (F1): conservar-la manté
  // compatibles els esborranys ja desats al navegador de l'usuari.
  analitza: "pr_analitza_prefill",
  estima: "pr_estima_prefill",
};

export function draftKeyFor(kind: DraftKind): string {
  return DRAFT_KEYS[kind];
}

export function saveEmailFirstDraft(kind: DraftKind, draft: Omit<EmailFirstDraft, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: EmailFirstDraft = { ...draft, savedAt: Date.now() };
    window.sessionStorage.setItem(DRAFT_KEYS[kind], JSON.stringify(payload));
  } catch {}
}

export function loadEmailFirstDraft(kind: DraftKind): EmailFirstDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEYS[kind]);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<EmailFirstDraft>;
    if (!d || typeof d !== "object" || !d.values || typeof d.values !== "object") return null;
    return {
      values: d.values as Record<string, unknown>,
      email: typeof d.email === "string" ? d.email : "",
      autoRun: Boolean(d.autoRun),
      savedAt: typeof d.savedAt === "number" ? d.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearEmailFirstDraft(kind: DraftKind): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEYS[kind]);
  } catch {}
}

/**
 * Per a la portada: quin formulari té l'esborrany més recent (per obrir la
 * pestanya adient quan l'usuari torna del registre/login amb l'esborrany).
 * Mai llança; sense esborranys → null (pestanya per defecte "consulta").
 */
export function peekLatestDraftKind(): DraftKind | null {
  if (typeof window === "undefined") return null;
  const a = loadEmailFirstDraft("analitza");
  const e = loadEmailFirstDraft("estima");
  if (!a && !e) return null;
  if (a && !e) return "analitza";
  if (!a && e) return "estima";
  return (a as EmailFirstDraft).savedAt >= (e as EmailFirstDraft).savedAt ? "analitza" : "estima";
}
