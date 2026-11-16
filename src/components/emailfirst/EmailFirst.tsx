"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, MailCheck, Lock, Loader2 } from "lucide-react";
import { useApp } from "@/components/app-context";
import {
  EMAIL_FIRST_ERROR_INVALID,
  EMAIL_FIRST_LABEL,
  EMAIL_FIRST_LOCKED,
  EMAIL_FIRST_MAGIC_SENT,
  EMAIL_FIRST_NET_ERROR,
  EMAIL_FIRST_PLACEHOLDER,
  EMAIL_FIRST_SWITCH_USER,
  EMAIL_FIRST_UNREGISTERED,
  buildSignupRedirect,
  draftKeyFor,
  isValidEmailFormat,
  normalizeEmailInput,
  returnRouteFor,
  saveEmailFirstDraft,
  type DraftKind,
} from "@/lib/email-first";

/**
 * v46 — UI compartida del flux EMAIL-FIRST (AnalitzaForm + EstimaForm).
 *
 * - El camp e-mail és la PRIMERA casella (EmailFirstField) i, amb sessió
 *   iniciada, queda precarregat i de només lectura amb «Canvia d'usuari».
 * - El panell de resultats NEIX BLOQUEJAT sense compte: «Registra't primer»
 *   (GateLockedPanel). El bloqueig REAL és al servidor (401 REGISTRAT_PRIMER).
 * - Taula de decisió completa a submitGate(): amb sessió executa; registrat
 *   sense sessió → magic link; no registrat → registre Free amb e-mail
 *   precarregat; error de xarxa conserva l'esborrany; doble enviament és
 *   idempotent (ref inflight).
 *
 * RGPD: l'e-mail només viu al formulari i al sessionStorage del navegador
 * (esborrany per reprendre després del registre); mai s'envia a analytics ni
 * es persisteix amb cap consulta (els Events d'ús segueixen sent anònims).
 */

export type GateKind = "locked" | "magic" | "quota" | null;

export function useEmailFirst(kind: DraftKind) {
  const { auth, locale, navigate } = useApp();
  const ca = locale === "ca";
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [gate, setGate] = useState<GateKind>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const inflight = useRef(false);
  const sessionEmail = auth.user?.email ?? null;

  // Sessió iniciada → e-mail precarregat des de la sessió (només lectura).
  // Diferit amb await (patró del repo): evita cascades de render i el guard
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive || !sessionEmail) return;
      setEmail(sessionEmail);
      setEmailError(null);
      setGate(null);
      setRedirecting(false);
    })();
    return () => { alive = false; };
  }, [sessionEmail]);

  /** «Canvia d'usuari»: tanca la sessió i deixa el camp editable. */
  const switchUser = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    await auth.refresh();
    setEmail("");
    setEmailError(null);
    setGate(null);
    setRedirecting(false);
  };

  const validateEmail = (): string | null => {
    const em = normalizeEmailInput(email);
    if (!isValidEmailFormat(em)) {
      setEmailError(ca ? EMAIL_FIRST_ERROR_INVALID.ca : EMAIL_FIRST_ERROR_INVALID.es);
      emailRef.current?.focus();
      return null;
    }
    setEmailError(null);
    return em;
  };

  /**
   * Flux email-first complet (cridat pel submit de cada formulari).
   * `values` = valors del formulari (es guarden a l'esborrany ABANS d'enviar
   * res: error de xarxa o registre mai no perden el que l'usuari ha escrit).
   * `runQuery()` = la crida real del formulari (el servidor aplica sessió +
   * quota i pot respondre 401/402: el formulari mappeja aquests estats).
   */
  const submitGate = async (
    values: Record<string, unknown>,
    runQuery: () => Promise<void>,
  ): Promise<boolean> => {
    if (inflight.current) return false; // doble enviament / doble clic → idempotència
    inflight.current = true;
    setBusy(true);
    try {
      const em = validateEmail();
      if (!em) return false;

      // esborrany PRIMER (sessionStorage, sense analytics): el reintent i el
      // retorn des del registre recuperen tot el que l'usuari havia escrit
      saveEmailFirstDraft(kind, {
        values,
        email: em,
        autoRun: true,
      });

      // Sessió activa: desbloqueja i executa (el servidor exigeix sessió i
      // aplica la quota per user_id — el bloqueig no depèn del client).
      if (auth.user) {
        await runQuery();
        return true;
      }

      // Sense sessió: la decisió la fa el servidor ({ registered: boolean })
      let registered: boolean | null = null;
      try {
        const res = await fetch("/api/email-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: em }),
        });
        if (res.status === 429) {
          setEmailError(ca
            ? "Massa intents. Prova-ho d'aquí un minut."
            : "Demasiados intentos. Prueba de nuevo en un minuto.");
          return false;
        }
        const d = await res.json().catch(() => null);
        registered = typeof d?.registered === "boolean" ? d.registered : null;
      } catch {
        // error de xarxa: l'esborrany ja és desat → reintent sense perdre res
        setEmailError(ca ? EMAIL_FIRST_NET_ERROR.ca : EMAIL_FIRST_NET_ERROR.es);
        return false;
      }
      if (registered === null) {
        setEmailError(ca ? EMAIL_FIRST_NET_ERROR.ca : EMAIL_FIRST_NET_ERROR.es);
        return false;
      }

      const returnTo = returnRouteFor(kind, "compact");

      if (registered) {
        // Registrat sense sessió → magic link (anti-suplantació); en tornar,
        // l'esborrany es restaura i la consulta s'executa sola.
        try {
          await fetch("/api/auth/magic-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: em, return: returnTo, locale }),
          });
        } catch {
          setEmailError(ca ? EMAIL_FIRST_NET_ERROR.ca : EMAIL_FIRST_NET_ERROR.es);
          return false;
        }
        setGate("magic");
        return false;
      }

      // No registrat → «Registra't primer» + redirecció al registre del pla
      // Free amb l'e-mail precarregat (redirecció immediata, amb un temps
      // mínim per llegir el missatge).
      setGate("locked");
      setRedirecting(true);
      setTimeout(() => {
        navigate(buildSignupRedirect(em, returnTo));
      }, 1100);
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  /** Mappeig dels bloquejos del SERVIDOR al panell corresponent. */
  const applyServerError = (status: number, body: { error?: string; code?: string } | null): boolean => {
    if (status === 401 && (body?.code === "REGISTRAT_PRIMER" || body?.error === "UNAUTHENTICATED")) {
      setGate("locked");
      return true;
    }
    if (status === 402 && body?.error === "QUOTA_EXCEEDED") {
      setGate("quota");
      return true;
    }
    return false;
  };

  return {
    ca,
    email, setEmail,
    emailError, setEmailError,
    emailRef,
    gate, setGate,
    redirecting,
    busy,
    sessionEmail,
    switchUser,
    validateEmail,
    submitGate,
    applyServerError,
  };
}

/** Esborrany tipat compartit que els formularis restauen (valors propis). */
export interface DraftRestore {
  values: Record<string, unknown>;
  email: string;
  autoRun: boolean;
}

/**
 * Consumió ÚNICA de l'esborrany quan hi ha SESSIÓ (després del registre o del
 * magic link): restaura els valors i, si `canRun(values)` i autoRun, executa.
 * El hook rep `restore` perquè cada formulari mapeja els seus camps.
 */
export function useDraftAutoRun(
  kind: DraftKind,
  authUserEmail: string | null,
  restore: (d: DraftRestore) => void,
  canRun: (values: Record<string, unknown>) => boolean,
  run: () => void,
) {
  const doneFor = useRef<string | null>(null);
  useEffect(() => {
    if (!authUserEmail) return; // espera la sessió (registre/magic link en curs)
    if (doneFor.current === authUserEmail) return; // una sola vegada per sessió
    doneFor.current = authUserEmail;
    try {
      const key = draftKeyFor(kind);
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return;
      const d = JSON.parse(raw) as DraftRestore | null;
      if (!d || typeof d !== "object" || !d.values || typeof d.values !== "object") return;
      window.sessionStorage.removeItem(key);
      restore({ values: d.values, email: typeof d.email === "string" ? d.email : "", autoRun: Boolean(d.autoRun) });
      if (d.autoRun && canRun(d.values)) {
        // la sessió ja hi és: la consulta va directe (el servidor aplica quota)
        setTimeout(() => run(), 60);
      }
    } catch {
      // esborrany corrupte: es descarta en silenci (mai bloca el formulari)
    }
  }, [authUserEmail]);
}

// ── Camp e-mail (PRIMERA casella del formulari) ──────────────────────────────

export function EmailFirstField({
  value, onChange, readOnly, error, inputRef, ca, onSwitchUser, onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  ca: boolean;
  onSwitchUser: () => void;
  onEnter?: () => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="block text-xs font-bold text-moss mb-1.5" htmlFor="ef-email">
          {ca ? EMAIL_FIRST_LABEL.ca : EMAIL_FIRST_LABEL.es}
        </label>
        {readOnly && (
          <button
            type="button"
            onClick={onSwitchUser}
            className="text-[11px] font-semibold text-pine hover:underline mb-1.5 flex items-center gap-1"
          >
            <LogIn className="w-3 h-3" aria-hidden="true" />
            {ca ? EMAIL_FIRST_SWITCH_USER.ca : EMAIL_FIRST_SWITCH_USER.es}
          </button>
        )}
      </div>
      <input
        id="ef-email"
        ref={inputRef}
        type="email"
        required
        inputMode="email"
        autoComplete="email"
        className="w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[15px] outline-none focus:border-pine min-h-[48px]"
        placeholder={ca ? EMAIL_FIRST_PLACEHOLDER.ca : EMAIL_FIRST_PLACEHOLDER.es}
        value={value}
        readOnly={readOnly}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "ef-email-error" : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      {error && (
        <p id="ef-email-error" className="mt-1 text-xs font-semibold text-ember3" role="alert">{error}</p>
      )}
    </div>
  );
}

// ── Panells de bloqueig (aria-live="polite", contrast AA) ────────────────────

export function GateLockedPanel({ ca, onSignup }: { ca: boolean; onSignup?: () => void }) {
  return (
    <div className="rounded-2xl border border-emberline bg-embersoft p-6" aria-live="polite">
      <div className="flex items-center gap-2 text-ember3 font-extrabold text-base">
        <Lock className="w-5 h-5" aria-hidden="true" />
        {ca ? EMAIL_FIRST_LOCKED.title.ca : EMAIL_FIRST_LOCKED.title.es}
      </div>
      <p className="mt-2 text-sm text-moss leading-relaxed">
        {ca ? EMAIL_FIRST_LOCKED.desc.ca : EMAIL_FIRST_LOCKED.desc.es}
      </p>
      {onSignup && (
        <button
          type="button"
          onClick={onSignup}
          className="mt-4 w-full rounded-xl bg-ember text-white font-bold text-sm px-4 py-3 hover:bg-ember2 transition-colors min-h-[48px]"
        >
          {ca ? EMAIL_FIRST_LOCKED.cta.ca : EMAIL_FIRST_LOCKED.cta.es}
        </button>
      )}
    </div>
  );
}

export function GateMagicPanel({ ca }: { ca: boolean }) {
  return (
    <div className="rounded-2xl border border-mintline bg-mintsoft p-6" aria-live="polite">
      <div className="flex items-center gap-2 text-green2 font-extrabold text-base">
        <MailCheck className="w-5 h-5" aria-hidden="true" />
        {ca ? EMAIL_FIRST_MAGIC_SENT.ca : EMAIL_FIRST_MAGIC_SENT.es}
      </div>
      <p className="mt-2 text-sm text-moss leading-relaxed">
        {ca
          ? "Obre el correu i prem l'enllaç (vàlid 15 minuts, d'un sol ús): en tornar, l'esborrany del formulari es restaura i la consulta s'executa automàticament."
          : "Abre el correo y pulsa el enlace (válido 15 minutos, de un solo uso): al volver, el borrador del formulario se restaura y la consulta se ejecuta automáticamente."}
      </p>
    </div>
  );
}

export function GateSignupPanel({ ca }: { ca: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-6" aria-live="polite">
      <div className="flex items-center gap-2 text-pine font-extrabold text-base">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        {ca ? EMAIL_FIRST_UNREGISTERED.ca : EMAIL_FIRST_UNREGISTERED.es}
      </div>
      <p className="mt-2 text-sm text-moss leading-relaxed">
        {ca
          ? "L'esborrany del formulari es conserva: en completar el registre, tornaràs i la consulta s'executarà sola. No has de tornar a escriure res."
          : "El borrador del formulario se conserva: al completar el registro, volverás y la consulta se ejecutará sola. No tienes que escribir nada de nuevo."}
      </p>
    </div>
  );
}

export function GateQuotaPanel({ onPlans }: { onPlans: () => void }) {
  const { t } = useApp();
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="rounded-xl bg-embersoft border border-emberline p-4 text-center">
        <div className="font-bold mt-2 text-ember3">{t.map.paywall.title}</div>
        <p className="text-sm mt-1 text-moss">{t.map.paywall.desc}</p>
      </div>
      <button onClick={onPlans} className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2 transition-colors">
        {t.map.paywall.cta}
      </button>
    </div>
  );
}
