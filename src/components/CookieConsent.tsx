"use client";

import { useEffect, useState } from "react";
import { Cookie, Settings2 } from "lucide-react";
import { useApp } from "@/components/app-context";

/**
 * Consentiment de cookies GRANULAR (RGPD art. 7 / LSSI art. 22).
 *
 * Categories:
 *  - tècniques/necessàries: sempre actives (sessió pr_session + preferències
 *    funcionals al localStorage: idioma, aquest consentiment). Sense consentiment.
 *  - analítica: DESACTIVADA per defecte. Avui no hi cap script d'analítica
 *    de tercers; si s'instal·la en el futur, només es carregarà si aquesta
 *    categoria està activada (comprova `getConsent().analytics`).
 *  - màrqueting: DESACTIVADA per defecte. Ídem.
 *
 * La decisió es guarda a localStorage "pr_cookie_consent" (JSON amb timestamp)
 * i es pot canviar en qualsevol moment des del peu ("Gestiona les cookies"),
 * que emet l'event "pr:open-cookie-settings". Cada canvi emet
 * "pr:consent-changed" amb el detall, perquè futures integracions s'hi enganxin.
 */

export type CookieConsent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  ts: string;
};

const KEY = "pr_cookie_consent";

export function getConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CookieConsent>;
    if (typeof v.analytics === "boolean" && typeof v.marketing === "boolean") {
      return { necessary: true, analytics: v.analytics, marketing: v.marketing, ts: String(v.ts ?? "") };
    }
    // compatibilitat amb el banner antic ("accepted" / "rejected")
    if (raw === "accepted") return { necessary: true, analytics: true, marketing: true, ts: "" };
    if (raw === "rejected") return { necessary: true, analytics: false, marketing: false, ts: "" };
    return null;
  } catch {
    return null;
  }
}

function save(consent: CookieConsent) {
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
  } catch {}
  window.dispatchEvent(new CustomEvent("pr:consent-changed", { detail: consent }));
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const { locale, navigate } = useApp();
  const ca = locale === "ca";

  useEffect(() => {
    const id = setTimeout(() => {
      const existing = getConsent();
      if (!existing) setVisible(true);
    }, 0);
    const open = () => {
      const cur = getConsent();
      setAnalytics(cur?.analytics ?? false);
      setMarketing(cur?.marketing ?? false);
      setConfig(true);
      setVisible(true);
    };
    window.addEventListener("pr:open-cookie-settings", open);
    return () => {
      clearTimeout(id);
      window.removeEventListener("pr:open-cookie-settings", open);
    };
  }, []);

  const acceptAll = () => {
    save({ necessary: true, analytics: true, marketing: true, ts: new Date().toISOString() });
    setVisible(false);
    setConfig(false);
  };
  const rejectAll = () => {
    save({ necessary: true, analytics: false, marketing: false, ts: new Date().toISOString() });
    setVisible(false);
    setConfig(false);
  };
  const savePrefs = () => {
    save({ necessary: true, analytics, marketing, ts: new Date().toISOString() });
    setVisible(false);
    setConfig(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[2000] p-3 md:p-4" role="dialog" aria-modal="false" aria-label={ca ? "Preferències de cookies" : "Preferencias de cookies"}>
      <div className="max-w-3xl mx-auto bg-pine text-white rounded-2xl shadow-2xl p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Cookie className="w-5 h-5 text-ember shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs leading-relaxed">
              {ca ? (
                <>
                  Utilitzem <b>cookies estrictament necessàries</b> (la teva sessió) i emmagatzematge funcional (idioma i aquesta preferència).
                  <b> No hi ha cookies publicitàries ni d'analítica de tercers</b>, i només es carregarien amb el teu consentiment granular. Més detalls a la{" "}
                  <button onClick={() => navigate("/cookies")} className="underline">política de cookies</button>.
                </>
              ) : (
                <>
                  Utilizamos <b>cookies estrictamente necesarias</b> (tu sesión) y almacenamiento funcional (idioma y esta preferencia).
                  <b> No hay cookies publicitarias ni de analítica de terceros</b>, y solo se cargarían con tu consentimiento granular. Más detalles en la{" "}
                  <button onClick={() => navigate("/cookies")} className="underline">política de cookies</button>.
                </>
              )}
            </p>

            {config && (
              <div className="mt-3 space-y-2">
                <Toggle
                  label={ca ? "Tècniques (necessàries)" : "Técnicas (necesarias)"}
                  desc={ca ? "Sessió d'usuari i preferències funcionals. Sense elles la web no funciona." : "Sesión de usuario y preferencias funcionales. Sin ellas la web no funciona."}
                  checked
                  disabled
                  onChange={() => {}}
                />
                <Toggle
                  label={ca ? "Analítica" : "Analítica"}
                  desc={ca ? "Mesures d'ús agregades i privades. Desactivada per defecte." : "Mediciones de uso agregadas y privadas. Desactivada por defecto."}
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <Toggle
                  label={ca ? "Màrqueting" : "Marketing"}
                  desc={ca ? "Publicitat o mesura de campanyes. Desactivada per defecte." : "Publicidad o medición de campañas. Desactivada por defecto."}
                  checked={marketing}
                  onChange={setMarketing}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2 justify-end">
          {!config && (
            <button
              onClick={() => setConfig(true)}
              className="px-3.5 py-2 rounded-lg border border-white/30 text-xs font-semibold hover:bg-card/10 flex items-center gap-1.5"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {ca ? "Configura" : "Configura"}
            </button>
          )}
          {config ? (
            <>
              <button onClick={rejectAll} className="px-3.5 py-2 rounded-lg border border-white/30 text-xs font-semibold hover:bg-card/10">
                {ca ? "Només les necessàries" : "Solo las necesarias"}
              </button>
              <button onClick={savePrefs} className="px-3.5 py-2 rounded-lg border border-ember bg-ember/20 text-xs font-bold hover:bg-ember/30">
                {ca ? "Desa les preferències" : "Guarda las preferencias"}
              </button>
              <button onClick={acceptAll} className="px-3.5 py-2 rounded-lg bg-ember text-xs font-bold hover:bg-ember2">
                {ca ? "Accepta-ho tot" : "Aceptar todo"}
              </button>
            </>
          ) : (
            <>
              <button onClick={rejectAll} className="px-3.5 py-2 rounded-lg border border-white/30 text-xs font-semibold hover:bg-card/10">
                {ca ? "Rebutja les no essencials" : "Rechaza las no esenciales"}
              </button>
              <button onClick={acceptAll} className="px-3.5 py-2 rounded-lg bg-ember text-xs font-bold hover:bg-ember2">
                {ca ? "D'acord" : "De acuerdo"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, disabled, onChange }: { label: string; desc: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl bg-card/5 px-3 py-2.5 ${disabled ? "opacity-80" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`mt-0.5 w-9 h-5 rounded-full relative transition-colors shrink-0 ${checked ? "bg-ember" : "bg-card/25"} ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-card transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span>
        <span className="text-xs font-bold">{label}</span>
        <span className="block text-[11px] opacity-75 leading-snug">{desc}</span>
      </span>
    </label>
  );
}
