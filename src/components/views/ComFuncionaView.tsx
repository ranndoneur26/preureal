"use client";

import { useState } from "react";
import { useApp } from "@/components/app-context";
import {
  ChevronDown, Globe, Map as MapIcon, Mail, FileText, Calculator,
  CircleHelp, BookOpen, ArrowRight, ShieldCheck, Ban,
} from "lucide-react";

/**
 * v59 — BLOQUE C del PROMPT MASTER: «Com funciona» COMPLET (#/com-funciona).
 *
 * C1+C2 aprovats (docs/com-funciona-copy.md): guia pas a pas de TOTES les
 * funcionalitats reals del producte en llenguatge molt fàcil (frases ≤20
 * paraules, una acció per pas, cada terme tècnic explicat la primera vegada),
 * amb divulgació progressiva (acordeó accessible), exemple amb xifres reals,
 * «Què NO és», límits del pla Free, mini-FAQ i glossari.
 *
 * A11y: cada pas/FAQ és un botó amb aria-expanded + aria-controls i el panell
 * amb role="region" + aria-labelledby. Zero dependències noves. El contingut
 * és gratuït i indexable (no mostra res de pagament): claus howFull.* a
 * src/lib/i18n.ts, simètriques ca/es (guardes a tests/how_full_v59.test.ts).
 */

export default function ComFuncionaView() {
  const { t, navigate, locale } = useApp();
  const ca = locale === "ca";
  const hf = t.howFull;
  const [openStep, setOpenStep] = useState<number | null>(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="w-full">
      {/* CAPÇALERA */}
      <section className="w-full bg-card border-b border-sand3">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{hf.nav}</h1>
          <p className="mt-3 text-moss leading-relaxed">{hf.intro}</p>
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-line bg-cream p-5">
              <div className="flex items-center gap-2 font-bold">
                <Mail className="w-4 h-4 text-pine" aria-hidden />
                {hf.necessites.t}
              </div>
              <p className="mt-2 text-sm text-moss leading-relaxed">{hf.necessites.d}</p>
            </div>
            <div className="rounded-2xl border border-line bg-cream p-5">
              <div className="flex items-center gap-2 font-bold">
                <ShieldCheck className="w-4 h-4 text-pine" aria-hidden />
                {hf.obtens.t}
              </div>
              <p className="mt-2 text-sm text-moss leading-relaxed">{hf.obtens.d}</p>
            </div>
          </div>
        </div>
      </section>

      {/* PAS A PAS (acordeó, divulgació progressiva) */}
      <section className="w-full">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-extrabold tracking-tight">{hf.passosTitle}</h2>
          <div className="mt-6 flex flex-col gap-3">
            {hf.passos.map((p, i) => {
              const open = openStep === i;
              return (
                <div key={i} className="rounded-2xl border border-line bg-card overflow-hidden">
                  <button
                    type="button"
                    id={`howf-step-btn-${i}`}
                    aria-expanded={open}
                    aria-controls={`howf-step-panel-${i}`}
                    onClick={() => setOpenStep(open ? null : i)}
                    className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-sand/60 transition-colors min-h-[44px]"
                  >
                    <span
                      aria-hidden
                      className="shrink-0 w-8 h-8 rounded-full bg-pine text-white text-sm font-black flex items-center justify-center"
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold">{p.t}</span>
                      <span className="block text-sm text-moss mt-0.5">{p.d}</span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`w-5 h-5 shrink-0 text-stone transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div
                    id={`howf-step-panel-${i}`}
                    role="region"
                    aria-labelledby={`howf-step-btn-${i}`}
                    hidden={!open}
                    className="px-4 pb-4 pt-1 md:pl-[68px]"
                  >
                    <p className="text-sm text-moss leading-relaxed border-l-2 border-sand3 pl-3">
                      {p.detall}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* EXEMPLE AMB XIFRES REALS */}
      <section className="w-full bg-card border-y border-sand3">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="rounded-2xl border border-pine/30 bg-cream p-6">
            <div className="flex items-center gap-2 text-lg font-extrabold">
              <Calculator className="w-5 h-5 text-pine" aria-hidden />
              {hf.exemple.t}
            </div>
            <p className="mt-3 text-moss leading-relaxed">{hf.exemple.d}</p>
            <p className="mt-2 text-moss leading-relaxed">{hf.exemple.d2}</p>
          </div>
        </div>
      </section>

      {/* QUÈ NO ÉS + LÍMITS FREE */}
      <section className="w-full">
        <div className="max-w-4xl mx-auto px-4 py-12 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-line bg-card p-6">
            <div className="flex items-center gap-2 font-bold">
              <Ban className="w-4 h-4 text-ember3" aria-hidden />
              {hf.queNoEs.t}
            </div>
            <p className="mt-2 text-sm text-moss leading-relaxed">{hf.queNoEs.d}</p>
          </div>
          <div className="rounded-2xl border border-line bg-card p-6">
            <div className="flex items-center gap-2 font-bold">
              <Globe className="w-4 h-4 text-pine" aria-hidden />
              {hf.limits.t}
            </div>
            <p className="mt-2 text-sm text-moss leading-relaxed">{hf.limits.d}</p>
          </div>
        </div>
      </section>

      {/* MINI-FAQ */}
      <section className="w-full bg-card border-y border-sand3">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-extrabold tracking-tight">{hf.faqTitle}</h2>
          <div className="mt-6 flex flex-col gap-2">
            {hf.faq.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="rounded-xl border border-line bg-cream overflow-hidden">
                  <button
                    type="button"
                    id={`howf-faq-btn-${i}`}
                    aria-expanded={open}
                    aria-controls={`howf-faq-panel-${i}`}
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center gap-2 px-4 py-3.5 text-left font-semibold hover:bg-sand/60 transition-colors min-h-[44px]"
                  >
                    <CircleHelp className="w-4 h-4 shrink-0 text-pine" aria-hidden />
                    <span className="flex-1">{f.q}</span>
                    <ChevronDown
                      aria-hidden
                      className={`w-4 h-4 shrink-0 text-stone transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div
                    id={`howf-faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`howf-faq-btn-${i}`}
                    hidden={!open}
                    className="px-4 pb-4"
                  >
                    <p className="text-sm text-moss leading-relaxed">{f.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* GLOSSARI */}
      <section className="w-full">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-extrabold tracking-tight">{hf.glossariTitle}</h2>
          <p className="mt-2 text-moss">{hf.glossariIntro}</p>
          <dl className="mt-6 grid md:grid-cols-2 gap-x-6 gap-y-3">
            {hf.glossari.map((g, i) => {
              const idx = g.indexOf(":");
              const term = idx > 0 ? g.slice(0, idx + 1) : g;
              const def = idx > 0 ? g.slice(idx + 1).trim() : "";
              return (
                <div key={i} className="rounded-xl border border-line bg-card p-4">
                  <dt className="font-bold text-sm">{term}</dt>
                  <dd className="mt-1 text-sm text-moss leading-relaxed">{def}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="w-full bg-card border-t border-sand3">
        <div className="max-w-4xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/mapa")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-pine text-white text-sm font-bold px-5 py-3 hover:bg-pine/90 transition-colors min-h-[44px]"
          >
            <MapIcon className="w-4 h-4" aria-hidden />
            {hf.ctaMapa}
          </button>
          <button
            type="button"
            onClick={() => navigate("/preus")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-cream text-ink text-sm font-bold px-5 py-3 hover:bg-sand transition-colors min-h-[44px]"
          >
            <FileText className="w-4 h-4" aria-hidden />
            {hf.ctaPreus}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => navigate("/guia")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl text-pine text-sm font-semibold px-4 py-3 hover:bg-sand transition-colors min-h-[44px]"
          >
            <BookOpen className="w-4 h-4" aria-hidden />
            {ca ? "Guia del lloguer" : "Guía del alquiler"}
          </button>
        </div>
      </section>
    </div>
  );
}
