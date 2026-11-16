"use client";

import { useState } from "react";
import { ExternalLink, FileText, Home, Info } from "lucide-react";
import { useApp } from "@/components/app-context";
import EstimaForm, { type EstimaPayload } from "@/components/estima/EstimaForm";
import EstimaReport from "@/components/estima/EstimaReport";
import { ESTIMA_SERPAVI_URL } from "@/lib/estima";

/**
 * F2/F3 (redisseny de la Home) — Funcionalitat «Estima el lloguer del teu
 * habitatge»: estimació progressiva. N1 = base estadística oficial Incasòl
 * escalada per superfície (sempre en RANG). N2 = ajustos opcionals per estat
 * de conservació i habitacions, amb coeficient documentat al motor validat.
 * El rang per parcel·la (N3, secció censal) només el calcula SERPAVI amb
 * fonts tributàries no públiques: mai es simula, mai s'inventa — botó oficial.
 *
 * Regla d'or: mai una xifra única de taxació, mai una consulta oficial
 * SERPAVI simulada, cap dada personal (no demana adreça ni ref. catastral).
 */
export default function EstimaIntro() {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const [result, setResult] = useState<EstimaPayload | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-mintsoft border border-mintline text-[11px] font-bold text-mossdeep">
        <Info className="w-3.5 h-3.5" />
        {ca ? "Nou · estimació progressiva (nivells N1 + N2)" : "Nuevo · estimación progresiva (niveles N1 + N2)"}
      </div>

      <h3 className="font-extrabold text-lg leading-snug">
        {ca ? "Estima el lloguer del teu habitatge" : "Estima el alquiler de tu vivienda"}
      </h3>
      <p className="text-sm text-moss leading-relaxed">
        {ca
          ? "Municipi + superfície → un RANG orientatiu amb la base oficial registrada (fiances Incasòl), traçabilitat completa i degradació honesta («dades insuficients») quan la zona no té mostra. Si vols, afegeix estat de conservació i habitacions: els únics ajustos amb coeficient documentat (N2). Mai una xifra única de taxació."
          : "Municipio + superficie → un RANGO orientativo con la base oficial registrada (fianzas Incasòl), trazabilidad completa y degradación honesta («datos insuficientes») cuando la zona no tiene muestra. Nunca una cifra única de tasación. Si quieres, añade estado de conservación y habitaciones: los únicos ajustes con coeficiente documentado (N2)."}
      </p>

      {result ? (
        <>
          <EstimaReport data={result} variant="compact" onRetry={() => { setResult(null); setFormKey((k) => k + 1); }} />
          <p className="text-[11px] text-stone leading-relaxed">
            {ca
              ? "Cap dada personal: l'estimació no demana adreces ni referències catastrals i no guarda res associat a usuaris."
              : "Ningún dato personal: la estimación no pide direcciones ni referencias catastrales y no guarda nada asociado a usuarios."}
          </p>
        </>
      ) : (
        <>
          <EstimaForm
            key={formKey}
            variant="compact"
            onResult={(d) => setResult(d)}
          />
          <a
            href={ESTIMA_SERPAVI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl border border-line bg-card font-semibold text-sm hover:bg-sand transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            <ExternalLink className="w-4 h-4" />
            {ca ? "Consulta el rang oficial a SERPAVI" : "Consulta el rango oficial en SERPAVI"}
          </a>
          <button
            type="button"
            onClick={() => navigate("/estima")}
            className="w-full rounded-xl border border-line bg-card font-semibold text-sm hover:bg-sand transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Home className="w-4 h-4" />
            {ca ? "Obre l'estimador complet" : "Abre el estimador completo"}
          </button>
        </>
      )}
    </div>
  );
}
