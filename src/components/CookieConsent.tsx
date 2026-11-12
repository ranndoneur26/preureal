"use client";

import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { useApp } from "@/components/app-context";

/**
 * Banner de consentiment de cookies (Fase 15).
 * Preureal NOMÉS utilitza cookies estrictament necessàries (sessió) i
 * localStorage funcional (idioma, consentiment). No hi ha cap cookie
 * analítica ni de tercers: sense consentiment no es carrega res no essencial.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const { locale, navigate } = useApp();
  const ca = locale === "ca";

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (!localStorage.getItem("pr_cookie_consent")) {
          setVisible(true);
        }
      } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const decide = (value: "accepted" | "rejected") => {
    try {
      localStorage.setItem("pr_cookie_consent", value);
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[2000] p-3 md:p-4">
      <div className="max-w-3xl mx-auto bg-[#0f2e21] text-white rounded-2xl shadow-2xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center gap-3">
        <Cookie className="w-5 h-5 text-[#e8673c] shrink-0" />
        <p className="text-xs leading-relaxed flex-1">
          {ca ? (
            <>
              Utilitzem <b>només cookies estrictament necessàries</b> (la teva sessió) i emmagatzematge funcional (idioma i aquesta preferència).
              <b> No hi ha cookies publicitàries ni d'analítica de tercers.</b> Més detalls a la{" "}
              <button onClick={() => navigate("/cookies")} className="underline">política de cookies</button>.
            </>
          ) : (
            <>
              Utilizamos <b>solo cookies estrictamente necesarias</b> (tu sesión) y almacenamiento funcional (idioma y esta preferencia).
              <b> No hay cookies publicitarias ni de analítica de terceros.</b> Más detalles en la{" "}
              <button onClick={() => navigate("/cookies")} className="underline">política de cookies</button>.
            </>
          )}
        </p>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => decide("rejected")} className="px-3.5 py-2 rounded-lg border border-white/30 text-xs font-semibold hover:bg-white/10">
            {ca ? "Rebutja les no essencials" : "Rechaza las no esenciales"}
          </button>
          <button onClick={() => decide("accepted")} className="px-3.5 py-2 rounded-lg bg-[#e8673c] text-xs font-bold hover:bg-[#d95a31]">
            {ca ? "D'acord" : "De acuerdo"}
          </button>
        </div>
      </div>
    </div>
  );
}
