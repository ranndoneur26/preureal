"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { MailCheck, BadgeCheck, MapPin, RefreshCw, LogIn } from "lucide-react";

/**
 * /#/verifica?token=... — vista on aterra l'enllaç del correu de verificació
 * («Verificar correu», Fase 1).
 *
 * El correu (verifyMail) apunta a `<site>/#/verifica?token=<hex>`. Aquesta
 * vista llegeix el token i fa la CONFIRMACIÓ EXPLÍCITA CONTRA EL SERVIDOR
 * (POST /api/auth/verify { token } — P1.2: el GET de l'API mai muta dades,
 * perquè els escàners d'enllaços no puguin consumir el token) i mostra el
 * resultat amb estats diferenciats:
 *   - ok        → compte activat, confirmació visual + accés al mapa
 *   - ja_usat   → l'enllaç ja s'havia fet servir (error exigit per l'encàrrec)
 *   - caducat   → enllaç caducat (24 h) → botó per demanar-ne un de nou
 *   - invalid   → token inexistent o compte inactiu
 *
 * La validació ÉS DEL SERVIDOR: el client només mostra el resultat. Sense
 * token a la URL es mostra una pantalla orientativa (com entrar / revisar el
 * correu), mai cap intent de verificació.
 */

type Estat = "comprovant" | "ok" | "ja_usat" | "caducat" | "invalid" | "sense_token";

export default function VerificaView({ token }: { token?: string }) {
  const { locale, auth, navigate } = useApp();
  const [estat, setEstat] = useState<Estat>(token ? "comprovant" : "sense_token");
  const [resendOk, setResendOk] = useState(false);
  const [busy, setBusy] = useState(false);
  // estat REAL del compte segons el servidor (null = encara no el sabem):
  // permet distingir «enllaç ja usat perquè ja s'havia verificat» de
  // «enllaç anul·lat per un reenviament i el compte ENCARA no està verificat»
  const [verified, setVerified] = useState<boolean | null>(null);
  const demanat = useRef(false);

  const comprova = useCallback(
    async (tk: string) => {
      try {
        // P1.2: confirmació explícita via POST — el GET de l'API només consulta
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tk }),
          cache: "no-store",
        });
        const d = await res.json().catch(() => null);
        const e = (d?.estat as Estat) || "invalid";
        if (typeof d?.verified === "boolean") setVerified(d.verified);
        if (e === "ok") {
          setVerified(true);
          await auth.refresh();
        }
        setEstat(e);
      } catch {
        setEstat("invalid");
      }
    },
    [auth]
  );

  useEffect(() => {
    if (!token || demanat.current) return;
    demanat.current = true;
    comprova(token);
  }, [token, comprova]);

  const resend = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", { method: "POST" });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d?.alreadyVerified) {
          await auth.refresh();
          setVerified(true);
          setEstat("ok");
          return;
        }
        setResendOk(true);
      } else if (res.status === 401) {
        // sense sessió: cal entrar per poder reenviar des del compte
        navigate("/entrada");
      }
    } finally {
      setBusy(false);
    }
  };

  const ca = (x: string, y: string) => (locale === "es" ? y : x);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0f2e21] text-white flex items-center justify-center mx-auto">
            {estat === "ok" ? (
              <BadgeCheck className="w-7 h-7 text-[#7fd6a4]" />
            ) : (
              <MailCheck className="w-7 h-7 text-[#7fd6a4]" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{ca("Verificació del correu", "Verificación del correo")}</h1>
        </div>

        <div className="bg-white rounded-2xl border border-[#e5e1da] p-6 space-y-4 text-center">
          {estat === "comprovant" && (
            <>
              <p className="text-sm text-[#6b6f68] flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                {ca("Comprovant l'enllaç…", "Comprobando el enlace…")}
              </p>
            </>
          )}

          {estat === "ok" && (
            <>
              <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm px-3 py-2">
                {ca(
                  "Correu verificat correctament. El teu compte ja està actiu i les consultes detallades desbloquejades!",
                  "¡Correo verificado correctamente. Tu cuenta ya está activa y las consultas detalladas desbloqueadas!"
                )}
              </div>
              <button
                onClick={() => navigate("/mapa")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                {ca("Anar al mapa", "Ir al mapa")}
              </button>
              <button
                onClick={() => navigate("/panell")}
                className="w-full py-2.5 rounded-xl border border-[#e5e1da] bg-white font-semibold text-[#0f2e21] hover:bg-[#faf9f7] transition-colors text-sm"
              >
                {ca("Anar al panell", "Ir al panel")}
              </button>
            </>
          )}

          {estat === "ja_usat" && verified === true && (
            <>
              <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm px-3 py-2">
                {ca(
                  "Aquest enllaç ja s'havia utilitzat, però el teu compte JA consta verificat. Pots entrar al mapa.",
                  "Este enlace ya se había utilizado, pero tu cuenta YA consta verificada. Puedes entrar al mapa."
                )}
              </div>
              <button
                onClick={() => navigate("/mapa")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                {ca("Anar al mapa", "Ir al mapa")}
              </button>
              <button
                onClick={() => navigate("/panell")}
                className="w-full py-2.5 rounded-xl border border-[#e5e1da] bg-white font-semibold text-[#0f2e21] hover:bg-[#faf9f7] transition-colors text-sm"
              >
                {ca("Anar al panell", "Ir al panel")}
              </button>
            </>
          )}

          {estat === "ja_usat" && verified === false && (
            <>
              <div className="rounded-lg bg-[#fff7e0] border border-[#efd88f] text-[#8a6d1a] text-sm px-3 py-2">
                {ca(
                  "Aquest enllaç va quedar anul·lat (es va demanar un de nou) i el compte ENCARA no està verificat. Obre l'ÚLTIM correu de verificació rebut o demana'n un de nou aquí sota.",
                  "Este enlace quedó anulado (se pidió uno nuevo) y la cuenta AÚN no está verificada. Abre el ÚLTIMO correo de verificación recibido o pide uno nuevo abajo."
                )}
              </div>
              {auth.user ? (
                <button
                  onClick={resend}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors disabled:opacity-60"
                >
                  {busy ? "..." : ca("Reenviar el correu de verificació", "Reenviar el correo de verificación")}
                </button>
              ) : (
                <button
                  onClick={() => navigate("/entrada")}
                  className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  {ca("Entrar", "Entrar")}
                </button>
              )}
            </>
          )}

          {estat === "ja_usat" && verified === null && (
            <>
              <div className="rounded-lg bg-[#fff7e0] border border-[#efd88f] text-[#8a6d1a] text-sm px-3 py-2">
                {ca(
                  "Aquest enllaç ja s'havia utilitzat. Si el teu correu ja consta com a verificat, no cal fer res més: entra al panell per comprovar-ho.",
                  "Este enlace ya se había utilizado. Si tu correo ya consta como verificado, no hace falta nada más: entra al panel para comprobarlo."
                )}
              </div>
              {auth.user ? (
                <button
                  onClick={() => navigate("/panell")}
                  className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors"
                >
                  {ca("Anar al panell", "Ir al panel")}
                </button>
              ) : (
                <button
                  onClick={() => navigate("/entrada")}
                  className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  {ca("Entrar", "Entrar")}
                </button>
              )}
            </>
          )}

          {estat === "caducat" && verified === true && (
            <>
              <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm px-3 py-2">
                {ca(
                  "L'enllaç ha caducat, però el teu compte JA consta verificat. Pots entrar al mapa.",
                  "El enlace ha caducado, pero tu cuenta YA consta verificada. Puedes entrar al mapa."
                )}
              </div>
              <button
                onClick={() => navigate("/mapa")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                {ca("Anar al mapa", "Ir al mapa")}
              </button>
            </>
          )}

          {estat === "caducat" && verified !== true && (
            <>
              <div className="rounded-lg bg-[#fdeae2] border border-[#f2c4ac] text-[#b0431c] text-sm px-3 py-2">
                {ca(
                  "L'enllaç ha caducat (és vàlid 24 hores). Pots demanar-ne un de nou aquí sota.",
                  "El enlace ha caducado (es válido 24 horas). Puedes pedir uno nuevo aquí abajo."
                )}
              </div>
              {resendOk && (
                <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm px-3 py-2">
                  {ca("Correu de verificació reenviat! Revisa la teva safata.", "¡Correo de verificación reenviado! Revisa tu bandeja.")}
                </div>
              )}
              {auth.user ? (
                <button
                  onClick={resend}
                  disabled={busy || resendOk}
                  className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors disabled:opacity-60"
                >
                  {busy ? "..." : ca("Reenviar el correu de verificació", "Reenviar el correo de verificación")}
                </button>
              ) : (
                <button
                  onClick={() => navigate("/entrada")}
                  className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  {ca("Entra i demana un enllaç nou", "Entra y pide un enlace nuevo")}
                </button>
              )}
            </>
          )}

          {estat === "invalid" && verified === true && (
            <>
              <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm px-3 py-2">
                {ca(
                  "El teu compte ja consta verificat. Pots entrar al mapa.",
                  "Tu cuenta ya consta verificada. Puedes entrar al mapa."
                )}
              </div>
              <button
                onClick={() => navigate("/mapa")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                {ca("Anar al mapa", "Ir al mapa")}
              </button>
            </>
          )}

          {estat === "invalid" && verified !== true && (
            <>
              <div className="rounded-lg bg-[#fdeae2] border border-[#f2c4ac] text-[#b0431c] text-sm px-3 py-2">
                {ca(
                  "L'enllaç de verificació no és vàlid. Pot ser que s'hagi fet servir ja, que hagi caducat o que estigui incomplet.",
                  "El enlace de verificación no es válido. Puede que ya se haya usado, que haya caducado o que esté incompleto."
                )}
              </div>
              <button
                onClick={() => navigate(auth.user ? "/panell" : "/entrada")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors"
              >
                {auth.user
                  ? ca("Demana un enllaç nou des del panell", "Pide un enlace nuevo desde el panel")
                  : ca("Entrar", "Entrar")}
              </button>
            </>
          )}

          {estat === "sense_token" && (
            <>
              <p className="text-sm text-[#4b5349]">
                {ca(
                  "Aquesta pàgina serveix per confirmar el teu correu des de l'enllaç que t'hem enviat per correu electrònic.",
                  "Esta página sirve para confirmar tu correo desde el enlace que te hemos enviado por correo electrónico."
                )}
              </p>
              <p className="text-sm text-[#6b6f68]">
                {ca(
                  "Si no trobes el correu, revisa la carpeta de correu no desitjat o demana un enllaç nou.",
                  "Si no encuentras el correo, revisa la carpeta de correo no deseado o pide un enlace nuevo."
                )}
              </p>
              <button
                onClick={() => navigate(auth.user ? "/panell" : "/registre")}
                className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors"
              >
                {auth.user
                  ? ca("Anar al panell", "Ir al panel")
                  : ca("Crear un compte", "Crear una cuenta")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
