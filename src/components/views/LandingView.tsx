"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { BadgeCheck, Building2, MapPin, Scale, TrendingUp, ArrowRight, WandSparkles, Search } from "lucide-react";
import AnalitzaForm from "@/components/analitza/AnalitzaForm";
import AnalitzaReport from "@/components/analitza/AnalitzaReport";
import EstimaIntro from "@/components/analitza/EstimaIntro";
import LandingMap from "@/components/views/LandingMap";
import { GateLockedPanel } from "@/components/emailfirst/EmailFirst";
import type { AnalitzaReportData } from "@/lib/analitza-html";
import { peekLatestDraftKind } from "@/lib/email-first";

export default function LandingView() {
  const { t, navigate, locale, auth } = useApp();
  const ca = locale === "ca";
  const [report, setReport] = useState<AnalitzaReportData | null>(null);
  // F1 — dues funcionalitats separades: «consulta» (mapa + comparació) i «estima»
  const [tab, setTab] = useState<"consulta" | "estima">("consulta");

  // v46 — quan l'usuari torna del registre/magic link amb un esborrany del
  // flux email-first, la portada obre DIRECTAMENT la pestanya del formulari
  // que el va generar (mai la pestanya per defecte). Diferit amb await
  // (patró del repo: evita cascades de render al muntar).
  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      const k = peekLatestDraftKind();
      if (k === "estima") setTab("estima");
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex flex-col">
      {/* HERO — v49: text block amunt + mini-mapa viu a sota (columna
          esquerra) i formulari a la dreta; aspecte premium amb ombres suaus */}
      <section className="w-full bg-cream">
        <div className="max-w-6xl mx-auto px-4 pt-12 pb-16 md:pt-16 md:pb-24 grid md:grid-cols-2 gap-10 items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-semibold mb-6">
              <BadgeCheck className="w-4 h-4 text-mint" />
              {t.hero.badge}
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-[1.08] tracking-tight">
              {t.hero.title}
            </h1>
            <p className="mt-5 text-lg text-moss leading-relaxed max-w-xl">
              {t.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/mapa")}
                className="px-6 py-3.5 rounded-xl bg-ember text-white font-bold text-base hover:bg-ember2 transition-all hover:shadow-lg hover:shadow-orange-200 flex items-center gap-2 min-h-[48px]"
              >
                <MapPin className="w-5 h-5" />
                {t.hero.ctaPrimary}
              </button>
              <button
                onClick={() => navigate("/preus")}
                className="px-6 py-3.5 rounded-xl border border-line bg-card font-semibold hover:bg-sand transition-colors flex items-center gap-2 min-h-[48px]"
              >
                {t.nav.preus}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-4 text-sm text-stone">{t.hero.trust}</p>

            {/* v49 — el mapa viu torna a la portada, més petit: els mateixos
                edificis ICGC colrats per la renta real registrada (Incasòl),
                clic → /mapa?edifici=... (deep link v24) i CTA al mapa complet */}
            <div className="mt-8 relative rounded-2xl border border-line bg-card shadow-xl shadow-black/10 overflow-hidden h-[280px] sm:h-[340px]">
              <LandingMap />
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-line bg-card shadow-2xl shadow-black/10 overflow-hidden">
              {/* F1 — dues funcionalitats separades i etiquetades honestament */}
              <div role="tablist" aria-label={ca ? "Eines de la portada" : "Herramientas de la portada"} className="grid grid-cols-2 bg-pine text-white">
                <button
                  role="tab"
                  aria-selected={tab === "consulta"}
                  onClick={() => setTab("consulta")}
                  className={`px-2.5 sm:px-3 py-3 text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors min-h-[48px] ${tab === "consulta" ? "bg-pine" : "bg-pine/60 text-white/75 hover:bg-pine/80"}`}
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span className="text-left">{ca ? "Consulta el preu real registrat" : "Consulta el precio real registrado"}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "estima"}
                  onClick={() => setTab("estima")}
                  className={`px-2.5 sm:px-3 py-3 text-[11px] sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors min-h-[48px] ${tab === "estima" ? "bg-pine" : "bg-pine/60 text-white/75 hover:bg-pine/80"}`}
                >
                  <WandSparkles className="w-4 h-4 shrink-0" />
                  <span className="text-left">{ca ? "Estima el lloguer del teu habitatge" : "Estima el alquiler de tu vivienda"}</span>
                </button>
              </div>
              <div className="p-5 bg-sand2">
                {tab === "estima" ? (
                  <EstimaIntro />
                ) : (
                  <>
                    <p className="text-[11px] text-stone leading-relaxed mb-3">
                      {ca
                        ? "Comparació estadística del preu de l'anunci amb la referència oficial registrada (fiances Incasòl): no és una valoració del teu habitatge."
                        : "Comparación estadística del precio del anuncio con la referencia oficial registrada (fianzas Incasòl): no es una valoración de tu vivienda."}
                    </p>
                    {/* v47 — enllaç creuat clar cap a «estima» dins la secció
                        consulta: text RESUMIT i amb redacció pròpia (el text
                        llarg viu a la pestanya estima i a /estima, mai duplicat) */}
                    <div className="mb-3 rounded-xl border border-sand3 bg-cream p-3.5">
                      <p className="text-xs text-moss leading-relaxed flex items-start gap-2">
                        <WandSparkles className="w-4 h-4 text-pine shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          {ca
                            ? "I si el que vols és estimar el lloguer del TEU habitatge (no comparar un anunci)? «Estima el lloguer del teu habitatge» calcula per passos un rang orientatiu: part de la base oficial de fiances (Incasòl) escalada per superfície (N1) i hi afegeix ajustos opcionals amb coeficient documentat, com l'estat de conservació o les habitacions (N2). Cada xifra amb la seva font, el seu període i les seves limitacions — mai una taxació."
                            : "¿Y si lo que quieres es estimar el alquiler de TU vivienda (no comparar un anuncio)? «Estima el alquiler de tu vivienda» calcula por pasos un rango orientativo: parte de la base oficial de fianzas (Incasòl) escalada por superficie (N1) y añade ajustes opcionales con coeficiente documentado, como el estado de conservación o las habitaciones (N2). Cada cifra con su fuente, su período y sus limitaciones — nunca una tasación."}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab("estima")}
                        aria-label={ca ? "Obre la pestanya Estima el lloguer del teu habitatge" : "Abre la pestaña Estima el alquiler de tu vivienda"}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-pine text-white text-xs font-bold px-3.5 py-2.5 hover:bg-pine/90 transition-colors min-h-[44px]"
                      >
                        {ca ? "Obre «Estima el lloguer del teu habitatge»" : "Abre «Estima el alquiler de tu vivienda»"}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {report ? (
                      <AnalitzaReport data={report} variant="compact" />
                    ) : (
                      <>
                        <AnalitzaForm
                          variant="compact"
                          onResult={(d) => setReport(d as AnalitzaReportData)}
                        />
                        {!auth.user && (
                          // v46 — el panell de resultats NEIX BLOQUEJAT sense compte
                          <GateLockedPanel ca={ca} onSignup={() => navigate("/registre")} />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* v45 — el pla gratuït exigeix registre (3 consultes/mes): el
                badge és un enllaç real a #/preus, no un adorno mort */}
            <button
              onClick={() => navigate("/preus")}
              className="absolute -top-3 -right-3 rotate-3 bg-ember text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg hover:bg-ember2 transition-colors"
            >
              {ca ? "Gratuït amb registre" : "Gratuito con registro"}
            </button>
          </div>
        </div>
      </section>

      {/* COM FUNCIONA */}
      <section className="w-full bg-card border-y border-sand3">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-center">{t.how.title}</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            <Step icon={<MapPin className="w-6 h-6" />} title={t.how.s1t} desc={t.how.s1d} />
            <Step icon={<Building2 className="w-6 h-6" />} title={t.how.s2t} desc={t.how.s2d} />
            <Step icon={<Scale className="w-6 h-6" />} title={t.how.s3t} desc={t.how.s3d} />
          </div>
        </div>
      </section>

      {/* ÀREES TENSADES */}
      <section className="w-full">
        <div className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-embersoft text-ember3 text-xs font-bold mb-4">
              <TrendingUp className="w-4 h-4" />
              {t.tense.badge}
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">{t.tense.title}</h2>
            <p className="mt-4 text-moss leading-relaxed">{t.tense.desc}</p>
          </div>
          <div className="rounded-2xl bg-card border border-line p-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded-xl bg-embersoft p-5">
                <div className="text-3xl font-black text-ember3">118</div>
                <div className="text-xs font-semibold text-ember3 mt-1">TER/3739/2026 (pròrroga)</div>
              </div>
              <div className="rounded-xl bg-embersoft p-5">
                <div className="text-3xl font-black text-ember3">53</div>
                <div className="text-xs font-semibold text-ember3 mt-1">TER/3740/2026 (nous)</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DADES */}
      <section className="w-full bg-card border-y border-sand3">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-center">{t.data.title}</h2>
          <div className="mt-10 grid md:grid-cols-2 gap-5">
            {t.data.sources.map((s, i) => (
              <div key={i} className="rounded-xl border border-sand3 p-5 bg-cream">
                <div className="font-bold">{s.t}</div>
                <p className="text-sm text-moss mt-2 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-stone max-w-3xl mx-auto text-center leading-relaxed">{t.data.note}</p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="w-full">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">{t.hero.title}</h2>
          <button
            onClick={() => navigate("/mapa")}
            className="mt-8 px-8 py-4 rounded-xl bg-ember text-white font-bold text-lg hover:bg-ember2 transition-all hover:shadow-xl hover:shadow-orange-200 inline-flex items-center gap-2"
          >
            <MapPin className="w-5 h-5" />
            {t.hero.ctaPrimary}
          </button>
        </div>
      </section>
    </div>
  );
}

function Step({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-cream border border-sand3 p-6">
      <div className="w-11 h-11 rounded-xl bg-pine text-white flex items-center justify-center">{icon}</div>
      <h3 className="mt-4 font-bold text-lg">{title}</h3>
      <p className="mt-2 text-sm text-moss leading-relaxed">{desc}</p>
    </div>
  );
}
