"use client";

import { Home, Info, ExternalLink, FileText } from "lucide-react";
import { useApp } from "@/components/app-context";
import { SERPAVI_URL } from "@/lib/analitza";

/**
 * F1 (redisseny de la Home) — Funcionalitat «Estima el lloguer del teu
 * habitatge»: entrada honesta mentre el motor progressiu (N1 €/m² oficial,
 * N2 ajustos documentats, N3 rang SERPAVI) no estigui validat (F2/F3).
 *
 * Regla d'or: NO es mostra cap formulari que no pugui respondre amb dades
 * oficials reals, i mai es simula una consulta oficial. mentre F2 arriba,
 * s'ofereix la consulta oficial SERPAVI i la metodologia pública.
 */
export default function EstimaIntro() {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-sand border border-line text-[11px] font-bold text-moss">
        <Info className="w-3.5 h-3.5" />
        {ca ? "Properament — F2 del redisseny" : "Próximamente — F2 del rediseño"}
      </div>

      <h3 className="font-extrabold text-lg leading-snug">
        {ca ? "Estima el lloguer del teu habitatge" : "Estima el alquiler de tu vivienda"}
      </h3>
      <p className="text-sm text-moss leading-relaxed">
        {ca
          ? "Una estimació progressiva en tres nivells: (1) base estadística amb l'€/m² oficial registrat (Incasòl), (2) ajustos per característiques amb origen documentat i (3) rang orientatiu amb la metodologia oficial SERPAVI (MIVAU). El resultat serà sempre un RANG orientatiu amb font, data i nombre de contractes — mai una xifra única de taxació."
          : "Una estimación progresiva en tres niveles: (1) base estadística con el €/m² oficial registrado (Incasòl), (2) ajustes por características con origen documentado y (3) rango orientativo con la metodología oficial SERPAVI (MIVAU). El resultado será siempre un RANGO orientativo con fuente, fecha y número de contratos — nunca una cifra única de tasación."}
      </p>

      <ul className="text-xs text-stone leading-relaxed flex flex-col gap-1.5">
        <li className="flex items-start gap-2">
          <Home className="w-3.5 h-3.5 text-pine shrink-0 mt-0.5" />
          {ca ? "Demana només el necessari, per passos: municipi i superfície, després característiques (any, estat, ascensor…) i, opcionalment, referència catastral." : "Pide solo lo necesario, por pasos: municipio y superficie, después características (año, estado, ascensor…) y, opcionalmente, referencia catastral."}
        </li>
        <li className="flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-pine shrink-0 mt-0.5" />
          {ca ? "Si la zona no té mostra suficient, ho dirà clarament («dades insuficients») i t'oferirà la consulta oficial — mai una estimació poc fiable en silenci." : "Si la zona no tiene muestra suficiente, lo dirá claramente («datos insuficientes») y te ofrecerá la consulta oficial — nunca una estimación poco fiable en silencio."}
        </li>
      </ul>

      <a
        href={SERPAVI_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full rounded-xl bg-pine text-white font-bold text-sm px-4 py-3 hover:bg-pine/90 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
      >
        <ExternalLink className="w-4 h-4" />
        {ca ? "Consulta el rang oficial a SERPAVI" : "Consulta el rango oficial en SERPAVI"}
      </a>
      <button
        type="button"
        onClick={() => navigate("/metodologia")}
        className="w-full rounded-xl border border-line bg-card font-semibold text-sm hover:bg-sand transition-colors flex items-center justify-center gap-2 min-h-[44px]"
      >
        <FileText className="w-4 h-4" />
        {ca ? "Metodologia, fonts i limitacions" : "Metodología, fuentes y limitaciones"}
      </button>

      <p className="text-[11px] text-stone leading-relaxed">
        {ca
          ? "Cap dada personal: l'estimació no guardarà adreces ni referències catastrals associades a usuaris. Mentre el motor no estigui validat, no es mostra cap xifra: només les fonts oficials."
          : "Ningún dato personal: la estimación no guardará direcciones ni referencias catastrales asociadas a usuarios. Mientras el motor no esté validado, no se muestra ninguna cifra: solo las fuentes oficiales."}
      </p>
    </div>
  );
}
