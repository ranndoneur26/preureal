"use client";

import { useEffect, useMemo, useState } from "react";
import { Locale, t as getT } from "@/lib/i18n";
import LandingView from "@/components/views/LandingView";
import MapView from "@/components/views/MapView";
import PricingView from "@/components/views/PricingView";
import AuthView from "@/components/views/AuthView";
import CheckEmailView from "@/components/views/CheckEmailView";
import VerificaView from "@/components/views/VerificaView";
import PanelView from "@/components/views/PanelView";
import AdminView from "@/components/views/AdminView";
import LegalView from "@/components/views/LegalView";
import ComparadorView from "@/components/views/ComparadorView";
import GuiaView from "@/components/views/GuiaView";
import SubscriptionResultView from "@/components/views/SubscriptionResultView";
import CookieConsent from "@/components/CookieConsent";
import { AppContext, AppCtx, AuthUser } from "@/components/app-context";
import { LogOut, Languages, User as UserIcon } from "lucide-react";

function currentRoute(): string {
  if (typeof window === "undefined") return "/";
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : "/";
}

export default function AppShell() {
  const [locale, setLocaleState] = useState<Locale>("ca");
  const [route, setRoute] = useState("/");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);

  const refreshAuth = async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const d = await res.json();
      setUser(d.user || null);
      setQuota(d.quota || null);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    onHash();
    window.addEventListener("hashchange", onHash);
    // preferències d'idioma: s'apliquen després del muntatge (evita cascada de render)
    const id = setTimeout(() => {
      const saved = localStorage.getItem("pr_locale");
      if (saved === "es" || saved === "ca") setLocaleState(saved);
      else {
        const wl = navigator.language.slice(0, 2);
        if (wl === "es") setLocaleState("es");
      }
    }, 0);
    // sincronitza la sessió amb el sistema extern (API): ús legítim d'effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshAuth();
    return () => {
      window.removeEventListener("hashchange", onHash);
      clearTimeout(id);
    };
  }, []);

  const navigate = (r: string) => {
    window.location.hash = r;
    setRoute(r);
    window.scrollTo({ top: 0 });
  };

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem("pr_locale", l); } catch {}
    document.documentElement.lang = l;
  };

  const t = useMemo(() => getT(locale), [locale]);
  const ctx: AppCtx = useMemo(
    () => ({
      locale,
      t,
      setLocale,
      navigate,
      auth: { user, quota, refresh: refreshAuth },
    }),
    [locale, t, setLocale, user, quota]
  );

  const view = route.split("?")[0];
  const hashQuery = typeof window !== "undefined"
    ? window.location.hash.split("?")[1] || ""
    : "";
  const token = hashQuery
    ? new URLSearchParams(hashQuery).get("token")
    : null;
  // errores del callback de Google: /#/entrada?error=GOOGLE_XXX
  const oauthError = hashQuery
    ? new URLSearchParams(hashQuery).get("error")
    : null;

  return (
    <AppContext.Provider value={ctx}>
      <div className="min-h-screen flex flex-col bg-[#faf9f7] text-[#17241d]">
        <Header route={view} />
        <main className="flex-1 flex flex-col">
          {view === "/" && <LandingView />}
          {view === "/mapa" && <MapView />}
          {view === "/comparador" && <ComparadorView />}
          {view === "/guia" && <GuiaView />}
          {view === "/preus" && <PricingView />}
          {view === "/subscripcio/exit" && <SubscriptionResultView mode="exit" />}
          {view === "/subscripcio/cancelat" && <SubscriptionResultView mode="cancelat" />}
          {(view === "/registre" || view === "/entrada" || view === "/oblidat") && (
            <AuthView
              mode={view === "/registre" ? "register" : view === "/entrada" ? "login" : "forgot"}
              oauthError={view === "/entrada" ? oauthError || undefined : undefined}
            />
          )}
          {view === "/restablir" && <AuthView mode="reset" token={token || undefined} />}
          {view === "/revisa-correu" && <CheckEmailView />}
          {view === "/verifica" && <VerificaView token={token || undefined} />}
          {view === "/panell" && <PanelView />}
          {view === "/admin" && <AdminView />}
          {view === "/avis-legal" && <LegalView kind="avis" />}
          {view === "/privacitat" && <LegalView kind="privacitat" />}
          {view === "/cookies" && <LegalView kind="cookies" />}
          {view === "/faq" && <LegalView kind="faq" />}
        </main>
        <Footer />
        <CookieConsent />
      </div>
    </AppContext.Provider>
  );
}

function Header({ route }: { route: string }) {
  return (
    <AppContext.Consumer>
      {(ctx) => {
        const { t, auth, navigate, locale, setLocale } = ctx;
        const link = (to: string, label: string) => (
          <button
            onClick={() => { navigate(to); }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[#f0ede8] ${
              route === to ? "text-[#0f2e21] bg-[#f0ede8]" : "text-[#4b5349]"
            }`}
          >
            {label}
          </button>
        );
        return (
          <header className="sticky top-0 z-[1000] bg-[#faf9f7]/95 backdrop-blur border-b border-[#e5e1da]">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
              <button onClick={() => navigate("/")} className="flex items-center gap-2 shrink-0">
                <span className="w-8 h-8 rounded-lg bg-[#0f2e21] text-white flex items-center justify-center font-black text-sm">PR</span>
                <span className="font-extrabold text-lg tracking-tight">PreuReal<span className="text-[#e8673c]">.cat</span></span>
              </button>
              <nav className="hidden md:flex items-center gap-1">
                {link("/mapa", t.nav.mapa)}
                {link("/comparador", locale === "ca" ? "Comparador" : "Comparador")}
                {link("/guia", locale === "ca" ? "Guia" : "Guía")}
                {link("/preus", t.nav.preus)}
                {link("/faq", t.nav.faq)}
                {auth.user?.role === "ADMIN" && link("/admin", t.nav.admin)}
              </nav>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLocale(locale === "ca" ? "es" : "ca")}
                  className="px-2.5 py-2 rounded-lg text-sm font-semibold border border-[#e5e1da] hover:bg-[#f0ede8] flex items-center gap-1"
                  aria-label="Canvia d'idioma"
                >
                  <Languages className="w-4 h-4" />
                  {locale === "ca" ? "CA" : "ES"}
                </button>
                {auth.user ? (
                  <div className="hidden md:flex items-center gap-2">
                    <button
                      onClick={() => navigate("/panell")}
                      className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#f0ede8] flex items-center gap-1.5"
                    >
                      <UserIcon className="w-4 h-4" />
                      {t.nav.panel}
                    </button>
                    <button
                      onClick={async () => {
                        await fetch("/api/auth/logout", { method: "POST" });
                        await auth.refresh();
                        navigate("/");
                      }}
                      className="px-3 py-2 rounded-lg text-sm text-[#6b6f68] hover:bg-[#f0ede8] flex items-center gap-1.5"
                      title={t.nav.sortida}
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="hidden md:flex items-center gap-2">
                    <button
                      onClick={() => navigate("/entrada")}
                      className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-[#f0ede8]"
                    >
                      {t.nav.entrada}
                    </button>
                    <button
                      onClick={() => navigate("/registre")}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#e8673c] text-white hover:bg-[#d95a31] transition-colors"
                    >
                      {t.nav.registre}
                    </button>
                  </div>
                )}
                <button
                  className="md:hidden p-2 rounded-lg hover:bg-[#f0ede8]"
                  onClick={() => {
                    const el = document.getElementById("mobile-nav");
                    if (el) el.classList.toggle("hidden");
                  }}
                  aria-label="Menú"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
            <div id="mobile-nav" className="hidden md:hidden border-t border-[#e5e1da] bg-[#faf9f7] px-4 py-3 flex-col gap-1">
              {link("/mapa", t.nav.mapa)}
              {link("/comparador", locale === "ca" ? "Comparador" : "Comparador")}
              {link("/guia", locale === "ca" ? "Guia" : "Guía")}
              {link("/preus", t.nav.preus)}
              {link("/faq", t.nav.faq)}
              {auth.user ? (
                <>
                  {link("/panell", t.nav.panel)}
                  {auth.user.role === "ADMIN" && link("/admin", t.nav.admin)}
                  <button
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST" });
                      await auth.refresh();
                      navigate("/");
                    }}
                    className="px-3 py-2 rounded-lg text-sm text-left text-[#6b6f68] hover:bg-[#f0ede8]"
                  >
                    {t.nav.sortida}
                  </button>
                </>
              ) : (
                <>
                  {link("/entrada", t.nav.entrada)}
                  {link("/registre", t.nav.registre)}
                </>
              )}
            </div>
          </header>
        );
      }}
    </AppContext.Consumer>
  );
}

function Footer() {
  return (
    <AppContext.Consumer>
      {(ctx) => {
        const { t, navigate } = ctx;
        return (
          <footer className="mt-auto bg-[#0f2e21] text-[#c9d4cc] mt-16">
            <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 md:grid-cols-3">
              <div>
                <div className="font-extrabold text-white text-lg">PreuReal<span className="text-[#e8673c]">.cat</span></div>
                <p className="text-sm mt-2 opacity-80">{t.tagline}</p>
              </div>
              <div className="text-sm">
                <div className="font-semibold text-white mb-2">Legal</div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => navigate("/avis-legal")} className="text-left hover:text-white">{t.legal.avis}</button>
                  <button onClick={() => navigate("/privacitat")} className="text-left hover:text-white">{t.legal.privacitat}</button>
                  <button onClick={() => navigate("/cookies")} className="text-left hover:text-white">{t.legal.cookies}</button>
                  <button onClick={() => navigate("/guia")} className="text-left hover:text-white">{ctx.locale === "ca" ? "Guia del lloguer" : "Guía del alquiler"}</button>
                </div>
              </div>
              <div className="text-sm">
                <div className="font-semibold text-white mb-2">{t.data.title}</div>
                <p className="opacity-80 leading-relaxed">{t.footer.made}</p>
                <p className="opacity-60 mt-2 text-xs leading-relaxed">{t.footer.disclaimer}</p>
              </div>
            </div>
            <div className="border-t border-white/10 py-4 text-center text-xs opacity-60">
              © {new Date().getFullYear()} PreuReal.cat · {t.footer.made}
            </div>
          </footer>
        );
      }}
    </AppContext.Consumer>
  );
}
