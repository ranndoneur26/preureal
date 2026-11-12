"use client";

import { useEffect, useState } from "react";
import { Map as MapIcon, GitCompare, FileDown, X, Check } from "lucide-react";
import { useApp } from "@/components/app-context";
import { getSteps, markStep, type PrSteps } from "@/lib/steps";

/**
 * Checklist de primer ús (v38.2) — els 3 passos clau del producte:
 *   1. Explora el mapa  2. Compara municipis  3. Descarrega un informe PDF.
 * Flotant sobre el mapa; es desa a localStorage i desapareix per sempre
 * quan els 3 passos estan fets o es tanca manualment (localStorage pr_checklist_closed).
 */

export default function FirstRunChecklist() {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const [steps, setSteps] = useState<PrSteps>({});
  const [closed, setClosed] = useState(true); // per defecte amagat fins que munta (evita flash)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSteps(getSteps());
    try { setClosed(Boolean(localStorage.getItem("pr_checklist_closed"))); } catch {}
    const onChange = () => setSteps(getSteps());
    window.addEventListener("pr:steps-changed", onChange);
    return () => window.removeEventListener("pr:steps-changed", onChange);
  }, []);

  const done = Boolean(steps.mapa && steps.comparador && steps.informe);
  if (closed || done) return null;
  const close = () => {
    setClosed(true);
    try { localStorage.setItem("pr_checklist_closed", "1"); } catch {}
  };

  const items: Array<{ key: keyof PrSteps; icon: typeof MapIcon; label: string; doneLabel: string; onClick?: () => void }> = [
    { key: "mapa", icon: MapIcon, label: ca ? "Explora el mapa" : "Explora el mapa", doneLabel: ca ? "Ja estàs aquí" : "Ya estás aquí" },
    { key: "comparador", icon: GitCompare, label: ca ? "Compara 2 municipis" : "Compara 2 municipios", doneLabel: ca ? "Comparat" : "Comparado", onClick: () => { markStep("comparador"); navigate("/comparador"); } },
    { key: "informe", icon: FileDown, label: ca ? "Descarrega un informe PDF" : "Descarga un informe PDF", doneLabel: ca ? "Descarregat" : "Descargado" },
  ];

  const count = items.filter((i) => steps[i.key]).length;

  return (
    <div className="absolute bottom-3 left-3 z-[700] max-w-[280px] rounded-2xl bg-card border border-line shadow-2xl p-4 pr-sheet-anim hidden md:block">
      <div className="flex items-start justify-between gap-2">
        <div className="font-bold text-sm">{ca ? "Primeres passes" : "Primeros pasos"}</div>
        <button onClick={close} className="p-1 rounded-lg hover:bg-sand -mt-1 -mr-1" aria-label="Tanca">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-stone mt-0.5">{ca ? `${count} de 3 fets` : `${count} de 3 hechos`}</p>
      <ul className="mt-2.5 space-y-2">
        {items.map((it) => {
          const ok = Boolean(steps[it.key]);
          const Icon = it.icon;
          return (
            <li key={it.key}>
              <button
                onClick={it.onClick}
                disabled={ok || !it.onClick}
                className={`w-full flex items-center gap-2.5 text-left text-[13px] rounded-lg px-2 py-1.5 -mx-1 ${ok ? "text-stone" : "hover:bg-sand cursor-pointer"}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-mintsoft text-mossdeep" : "bg-sand text-moss"}`}>
                  {ok ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </span>
                <span className={ok ? "line-through" : "font-medium"}>{ok ? it.doneLabel : it.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
