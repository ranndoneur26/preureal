"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { MapPin, ShieldCheck, Fingerprint } from "lucide-react";

export default function AuthView({
  mode,
  token,
  oauthError,
}: {
  mode: "register" | "login" | "forgot" | "reset";
  token?: string;
  oauthError?: string;
}) {
  const { t, navigate, locale, auth } = useApp();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(oauthError || null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  // v37 — 2FA: challenge curt rebut del login quan el compte té TOTP actiu
  const [totpChallenge, setTotpChallenge] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpUseRecovery, setTotpUseRecovery] = useState(false);
  // v37.1 — passkeys: botó d'entrada sense contrasenya (només si el navegador
  // suporta WebAuthn). La detecció és asíncrona (evita cascada de renders al
  // muntar i mismatch d'hidratació: el servidor pinta sense el botó).
  const [pkSupported, setPkSupported] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) {
        try {
          setPkSupported(typeof window !== "undefined" && window.PublicKeyCredential !== undefined);
        } catch {
          if (alive) setPkSupported(false);
        }
      }
    });
    return () => { alive = false; };
  }, []);
  // el botó de Google només es mostra si l'OAuth està configurat al servidor
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/google/status")
      .then((r) => r.json())
      .then((d) => setGoogleEnabled(Boolean(d.enabled)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, locale }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "DEFAULT");
          return;
        }
        await auth.refresh();
        // Fase 1: després de registrar-se, pantalla «Revisa el teu correu»
        // (el correu de verificació ja s'ha enviat automàticament al servidor)
        navigate("/revisa-correu");
      } else if (mode === "login") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "DEFAULT");
          return;
        }
        // v37 — 2FA: contrasenya correcta != sessió; demanem el codi TOTP
        if (d.totpRequired && d.challenge) {
          setTotpChallenge(String(d.challenge));
          return;
        }
        await auth.refresh();
        // Fase 1: si el correu no està verificat, abans de res verificar-lo
        navigate(d.user?.emailVerified ? "/mapa" : "/revisa-correu");
      } else if (mode === "forgot") {
        const res = await fetch("/api/auth/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email }),
        });
        setInfo(t.auth.forgotSent);
      } else if (mode === "reset") {
        const res = await fetch("/api/auth/password-reset/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password: form.password }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "DEFAULT");
          return;
        }
        await auth.refresh();
        // Fase 1: confirmació visual explícita del canvi (el servei ja ha
        // creat sessió nova i ha tancat les anteriors)
        setResetDone(true);
      }
    } finally {
      setBusy(false);
    }
  };

  // v37 — segon pas del login amb 2FA (codi TOTP o codi de recuperació)
  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          totpUseRecovery
            ? { challenge: totpChallenge, recoveryCode: totpCode }
            : { challenge: totpChallenge, code: totpCode }
        ),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.message || d.error || "DEFAULT");
        return;
      }
      await auth.refresh();
      navigate(d.user?.emailVerified ? "/mapa" : "/revisa-correu");
    } finally {
      setBusy(false);
    }
  };

  // v37.1 — entrada amb passkey (sense contrasenya): opcions → ceremony → verify
  const submitPasskey = async () => {
    setError(null);
    setPkBusy(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const o = await fetch("/api/auth/passkeys/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email || undefined }),
      });
      const od = await o.json();
      if (!o.ok) { setError(od.message || od.error || "DEFAULT"); return; }
      let cred;
      try {
        cred = await startAuthentication({ optionsJSON: od.options });
      } catch {
        setError("PASSKEY_CANCELLED");
        return;
      }
      const r = await fetch("/api/auth/passkeys/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: cred }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "DEFAULT"); return; }
      await auth.refresh();
      navigate(d.user?.emailVerified ? "/mapa" : "/revisa-correu");
    } finally {
      setPkBusy(false);
    }
  };

  const titles =
    mode === "register"
      ? { h: t.auth.registreTitle, btn: t.auth.registreCta }
      : mode === "login"
      ? { h: t.auth.entradaTitle, btn: t.auth.entradaCta }
      : mode === "forgot"
      ? { h: t.auth.forgotTitle, btn: t.auth.forgotCta }
      : { h: t.auth.resetTitle, btn: t.auth.resetCta };

  const errText = error
    ? (t.auth.errors as Record<string, string>)[error] || t.auth.errors.DEFAULT
    : null;

  // confirmació visual després de restablir la contrasenya (Fase 1)
  if (mode === "reset" && resetDone) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-14">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-pine text-white flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-mint" />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold">
              {locale === "ca" ? "Contrasenya canviada" : "Contraseña cambiada"}
            </h1>
          </div>
          <div className="bg-card rounded-2xl border border-line p-6 space-y-4 text-center">
            <div className="rounded-lg bg-mintsoft border border-mintline text-green2 text-sm px-3 py-2">
              {locale === "ca"
                ? "La teva contrasenya s'ha canviat correctament. Les sessions obertes en altres dispositius s'han tancat per seguretat."
                : "Tu contraseña se ha cambiado correctamente. Las sesiones abiertas en otros dispositivos se han cerrado por seguridad."}
            </div>
            <button
              onClick={() => navigate("/mapa")}
              className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2 transition-colors"
            >
              {locale === "ca" ? "Continua al mapa" : "Continuar al mapa"}
            </button>
            <button
              onClick={() => navigate("/panell")}
              className="w-full py-2.5 rounded-xl border border-line bg-card font-semibold text-pine hover:bg-cream transition-colors text-sm"
            >
              {locale === "ca" ? "Anar al panell" : "Ir al panel"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // v37 — pantalla del segon factor (2FA): contrasenya ja validada pel servidor
  if (totpChallenge) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-14">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-pine text-white flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-mint" />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold">
              {locale === "ca" ? "Verificació en dos passos" : "Verificación en dos pasos"}
            </h1>
            <p className="mt-2 text-sm text-stone">
              {totpUseRecovery
                ? (locale === "ca"
                    ? "Introdueix un codi de recuperació d'un sol ús."
                    : "Introduce un código de recuperación de un solo uso.")
                : (locale === "ca"
                    ? "Obre l'app d'autenticació i introdueix el codi de 6 dígits."
                    : "Abre la app de autenticación e introduce el código de 6 dígitos.")}
            </p>
          </div>
          <form onSubmit={submitTotp} className="bg-card rounded-2xl border border-line p-6 space-y-4">
            <input
              type="text"
              required
              autoFocus
              inputMode={totpUseRecovery ? "text" : "numeric"}
              maxLength={totpUseRecovery ? 12 : 6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="pr-input text-center text-2xl tracking-[0.3em] font-bold"
              placeholder={totpUseRecovery ? "XXXXX-XXXXX" : "000000"}
              autoComplete="one-time-code"
            />
            {errText && (
              <div className="rounded-lg bg-embersoft border border-emberline text-ember3 text-sm px-3 py-2">
                {errText}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2 transition-colors disabled:opacity-50"
            >
              {busy ? "…" : locale === "ca" ? "Verifica i entra" : "Verificar y entrar"}
            </button>
            <button
              type="button"
              onClick={() => { setTotpUseRecovery(!totpUseRecovery); setTotpCode(""); setError(null); }}
              className="w-full text-xs text-stone underline"
            >
              {totpUseRecovery
                ? (locale === "ca" ? "Fes servir el codi de l'app" : "Usar el código de la app")
                : (locale === "ca" ? "No tinc l'app: fes servir un codi de recuperació" : "No tengo la app: usar un código de recuperación")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-pine text-white flex items-center justify-center mx-auto">
            <MapPin className="w-6 h-6 text-mint" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{titles.h}</h1>
        </div>

        <form onSubmit={submit} className="bg-card rounded-2xl border border-line p-6 space-y-4">
          {googleEnabled && (mode === "login" || mode === "register") && (
            <>
              <a
                href="/api/auth/google"
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-line bg-card font-semibold text-moss hover:bg-cream transition-colors"
              >
                <GoogleIcon />
                {t.auth.googleCta}
              </a>
              <div className="flex items-center gap-3 text-xs text-graydot">
                <span className="h-px flex-1 bg-line" />
                {t.auth.orEmail}
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
          {mode === "register" && (
            <Field label={t.auth.name}>
              <input value={form.name} onChange={set("name")} className="pr-input" autoComplete="name" />
            </Field>
          )}
          {mode !== "reset" && (
            <Field label={t.auth.email}>
              <input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                className="pr-input"
                autoComplete="email"
              />
            </Field>
          )}
          {mode !== "forgot" && (
            <Field label={t.auth.password}>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={set("password")}
                className="pr-input"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Field>
          )}

          {/* v37.1 — entrada amb passkey (només login i navegadors amb WebAuthn) */}
          {mode === "login" && pkSupported && (
            <button
              type="button"
              onClick={submitPasskey}
              disabled={pkBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-line bg-card font-semibold text-pine hover:bg-cream transition-colors disabled:opacity-50 text-sm"
            >
              <Fingerprint className="w-4 h-4" />
              {locale === "ca" ? "Entra amb una passkey" : "Entrar con una passkey"}
            </button>
          )}

          {errText && (
            <div className="rounded-lg bg-embersoft border border-emberline text-ember3 text-sm px-3 py-2">
              {errText}
            </div>
          )}
          {info && (
            <div className="rounded-lg bg-mintsoft border border-mintline text-green2 text-sm px-3 py-2">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2 transition-colors disabled:opacity-60"
          >
            {busy ? "..." : titles.btn}
          </button>

          <div className="text-sm text-center space-y-1.5 pt-2">
            {mode === "login" && (
              <>
                <div className="text-stone">
                  {t.auth.noAccount}{" "}
                  <button onClick={() => navigate("/registre")} className="text-ember font-semibold">
                    {t.nav.registre}
                  </button>
                </div>
                <div>
                  <button onClick={() => navigate("/oblidat")} className="text-stone hover:underline">
                    {t.auth.forgot}
                  </button>
                </div>
              </>
            )}
            {mode === "register" && (
              <div className="text-stone">
                {t.auth.haveAccount}{" "}
                <button onClick={() => navigate("/entrada")} className="text-ember font-semibold">
                  {t.nav.entrada}
                </button>
              </div>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <div>
                <button onClick={() => navigate("/entrada")} className="text-stone hover:underline">
                  {t.nav.entrada}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      <style jsx global>{`
        .pr-input {
          width: 100%;
          padding: 0.65rem 0.8rem;
          border: 1px solid #e5e1da;
          border-radius: 0.6rem;
          font-size: 0.9rem;
          outline: none;
          background: #faf9f7;
        }
        .pr-input:focus {
          border-color: #e8673c;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-moss mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
