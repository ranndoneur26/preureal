"use client";

import { useState } from "react";
import { Search, MousePointerClick, Bell, X, ArrowRight } from "lucide-react";

/**
 * Tour de benvinguda (v37) — 3 passos, NOMÉS la primera vegada que s'obre el
 * mapa (localStorage "pr_onboarded"). Cada pas porta una acció real: el
 * "Prova amb Barcelona" tanca el tour i obre directament una consulta real
 * (mai un tutorial mort). Desaparix per sempre marcant la clau.
 */

const STEPS = [
  {
    icon: Search,
    titleCa: "Cerca el teu municipi",
    titleEs: "Busca tu municipio",
    bodyCa:
      "Escriu el nom al cercador (947 municipis) o navega pel mapa. Cada municipi mostra el preu mitjà REAL registrat a les fiances de lloguer de l'Incasòl — no un anunci.",
    bodyEs:
      "Escribe el nombre en el buscador (947 municipios) o navega por el mapa. Cada municipio muestra el precio medio REAL registrado en las fianzas de alquiler de Incasòl — no un anuncio.",
  },
  {
    icon: MousePointerClick,
    titleCa: "Pica al teu edifici",
    titleEs: "Pulsa en tu edificio",
    bodyCa:
      "Al mapa hi ha els edificis reals de l'ICGC amb l'any de construcció i, als illes importades, el preu mitjà de l'illa. Pots obrir un informe PDF de 8 pàgines per comparar el que et demanen.",
    bodyEs:
      "En el mapa están los edificios reales del ICGC con el año de construcción y, en las manzanas importadas, el precio medio de la manzana. Puedes abrir un informe PDF de 8 páginas para comparar lo que te piden.",
  },
  {
    icon: Bell,
    titleCa: "Desa preferits i crea alertes",
    titleEs: "Guarda favoritos y crea alertas",
    bodyCa:
      "Amb Premium: desa municipis i edificis, reb un resum mensual i crea alertes perquè t'avisin si el preu vigent puja o baixa el % que triïs (o si la zona es declara tensada).",
    bodyEs:
      "Con Premium: guarda municipios y edificios, recibe un resumen mensual y crea alertas para que te avisen si el precio vigente sube o baja el % que elijas (o si la zona se declara tensionada).",
  },
];

export default function OnboardingTour({ navigate }: { navigate: (to: string) => void }) {
  // lazy init: només es mostra si la clau no existeix (mai parpelleig)
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return false;
      return window.localStorage.getItem("pr_onboarded") !== "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);

  if (!visible) return null;

  const close = () => {
    try {
      window.localStorage.setItem("pr_onboarded", "1");
    } catch {}
    setVisible(false);
  };

  const tryBarcelona = () => {
    close();
    navigate("/mapa?mun=080193");
  };

  const s = STEPS[step];
  const Icon = s.icon;

  return (
    <div className="fixed inset-0 z-[1900] bg-black/40 flex items-end sm:items-center justify-center p-4" role="dialog" aria-label="Guia d'inici">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="w-11 h-11 rounded-xl bg-[#0f2e21] text-white flex items-center justify-center">
            <Icon className="w-5 h-5 text-[#7fd6a4]" />
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-[#f0ede8]" aria-label="Tanca la guia">
            <X className="w-4 h-4 text-[#6b6f68]" />
          </button>
        </div>
        <h2 className="mt-3 font-extrabold text-lg">{s.titleCa}</h2>
        <p className="text-sm text-[#6b6f68]">{s.titleEs}</p>
        <p className="mt-2 text-sm text-[#4b5349] leading-relaxed">{s.bodyCa}</p>
        <p className="mt-1 text-xs text-[#6b6f68] leading-relaxed">{s.bodyEs}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-[#e8673c]" : "w-1.5 bg-[#e5e1da]"}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
          {step === 0 ? (
            <button onClick={tryBarcelona} className="px-4 py-2.5 rounded-xl bg-[#0f2e21] text-white text-sm font-bold hover:bg-[#16402e]">
              Prova amb Barcelona
            </button>
          ) : (
            <button onClick={close} className="px-4 py-2.5 rounded-xl border border-[#e5e1da] text-sm font-semibold hover:bg-[#f0ede8]">
              Començar ja
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} className="px-4 py-2.5 rounded-xl bg-[#e8673c] text-white text-sm font-bold flex items-center gap-1.5 hover:bg-[#d95a31]">
              Següent <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={close} className="px-4 py-2.5 rounded-xl bg-[#e8673c] text-white text-sm font-bold hover:bg-[#d95a31]">
              Entesos, al mapa!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
