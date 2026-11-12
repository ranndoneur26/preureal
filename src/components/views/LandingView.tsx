"use client";

import { useApp } from "@/components/app-context";
import { BadgeCheck, Building2, MapPin, Scale, TrendingUp, ArrowRight } from "lucide-react";

export default function LandingView() {
  const { t, navigate, locale } = useApp();

  return (
    <div className="flex flex-col">
      {/* HERO */}
      <section className="w-full bg-cream">
        <div className="max-w-6xl mx-auto px-4 pt-14 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-2 gap-10 items-center">
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
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-line bg-card shadow-xl shadow-black/5 overflow-hidden">
              <div className="bg-pine text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-mint" />
                Dreta de l&apos;Eixample · Barcelona
              </div>
              <div className="p-5 bg-sand2">
                <MiniGrid />
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Stat value="1.134 €" label={locale === "ca" ? "mitjana real" : "media real"} />
                  <Stat value="30.789" label={locale === "ca" ? "contractes" : "contratos"} />
                  <Stat value="2025" label="Incasòl" />
                </div>
              </div>
            </div>
            <div className="absolute -top-3 -right-3 rotate-3 bg-ember text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg">
              {locale === "ca" ? "dades oficials" : "datos oficiales"}
            </div>
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
            <p className="text-xs text-stone mt-4 leading-relaxed">{t.tense.desc}</p>
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-card border border-line py-3">
      <div className="font-black text-pine">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-stone">{label}</div>
    </div>
  );
}

/** Trama de l'Eixample dibuixada amb CSS (il·lustrativa, sense dades inventades) */
function MiniGrid() {
  const cells = [
    "#8fd6a8", "#f2b8a0", "#8fd6a8", "#f2b8a0", "#f2b8a0",
    "#f2b8a0", "#8fd6a8", "#f2b8a0", "#8fd6a8", "#f2b8a0",
    "#8fd6a8", "#f2b8a0", "#f2b8a0", "#f2b8a0", "#8fd6a8",
    "#f2b8a0", "#8fd6a8", "#f2b8a0", "#8fd6a8", "#f2b8a0",
  ];
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {cells.map((c, i) => (
        <div key={i} className="aspect-square rounded-md border border-white/80" style={{ background: c }} />
      ))}
    </div>
  );
}
