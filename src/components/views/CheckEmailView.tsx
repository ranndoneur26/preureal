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
          <div className="w-14 h-14 rounded-2xl bg-[#0f2e21] text-white flex items-center justify-center mx-auto">
            <MailCheck className="w-7 h-7 text-[#7fd6a4]" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{t.auth.checkEmailTitle}</h1>
        </div>

        <div className="bg-white rounded-2xl border border-[#e5e1da] p-6 space-y-4 text-center">
          {email ? (
            <>
              <p className="text-sm text-[#4b5349]">
                {t.auth.checkEmailDesc1}{" "}
                <b className="text-[#0f2e21] break-all">{email}</b>
              </p>
              <p className="text-sm text-[#6b6f68]">{t.auth.checkEmailDesc2}</p>

              {sent && (
                <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm px-3 py-2">
                  {t.auth.checkEmailResent}
                </div>
              )}
              {error && (
                <div className="rounded-lg bg-[#fdeae2] border border-[#f2c4ac] text-[#b0431c] text-sm px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={resend}
                disabled={busy || sent}
                className="w-full py-3 rounded-xl border border-[#e5e1da] bg-white font-semibold text-[#0f2e21] hover:bg-[#faf9f7] transition-colors disabled:opacity-50"
              >
                {busy ? "..." : t.auth.checkEmailResend}
              </button>

              <button
                onClick={() => navigate("/mapa")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                {t.auth.checkEmailContinue}
              </button>

              <p className="text-xs text-[#9aa094]">{t.auth.checkEmailNoAccount}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[#4b5349]">{t.auth.checkEmailDesc2}</p>
              <button
                onClick={() => navigate("/entrada")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
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
