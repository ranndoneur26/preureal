"use client";

import { useState } from "react";
import { useApp } from "@/components/app-context";
import { MailCheck, MapPin, LogIn } from "lucide-react";

/**
 * /#/revisa-correu — pantalla «Revisa el teu correu» (Fase 1).
 *
 * Es mostra després del registre i després d'entrar amb un compte sense
 * verificar. Ofereix el botó de reenviament (POST /api/auth/verify, que
 * genera un token NOU amb 24 h de caducitat) i continuar al mapa, on les
 * consultes detallades queden bloquejades fins verificar (403 del servidor).
 */
export default function CheckEmailView() {
  const { t, auth, navigate } = useApp();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = auth.user?.email || null;

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", { method: "POST" });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d?.alreadyVerified) {
          // per si l'usuari ja havia verificat des d'una altra pestanya
          await auth.refresh();
          navigate("/mapa");
          return;
        }
        setSent(true);
      } else if (res.status === 401) {
        setError(t.auth.checkEmailNoAccount);
      } else {
        setError(t.auth.errors.DEFAULT);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-pine text-white flex items-center justify-center mx-auto">
            <MailCheck className="w-7 h-7 text-mint" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{t.auth.checkEmailTitle}</h1>
        </div>

        <div className="bg-card rounded-2xl border border-line p-6 space-y-4 text-center">
          {email ? (
            <>
              <p className="text-sm text-moss">
                {t.auth.checkEmailDesc1}{" "}
                <b className="text-pine break-all">{email}</b>
              </p>
              <p className="text-sm text-stone">{t.auth.checkEmailDesc2}</p>

              {sent && (
                <div className="rounded-lg bg-mintsoft border border-mintline text-green2 text-sm px-3 py-2">
                  {t.auth.checkEmailResent}
                </div>
              )}
              {error && (
                <div className="rounded-lg bg-embersoft border border-emberline text-ember3 text-sm px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={resend}
                disabled={busy || sent}
                className="w-full py-3 rounded-xl border border-line bg-card font-semibold text-pine hover:bg-cream transition-colors disabled:opacity-50"
              >
                {busy ? "..." : t.auth.checkEmailResend}
              </button>

              <button
                onClick={() => navigate("/mapa")}
                className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2 transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                {t.auth.checkEmailContinue}
              </button>

              <p className="text-xs text-graydot">{t.auth.checkEmailNoAccount}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-moss">{t.auth.checkEmailDesc2}</p>
              <button
                onClick={() => navigate("/entrada")}
                className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2 transition-colors flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                {t.auth.checkEmailLogin}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
