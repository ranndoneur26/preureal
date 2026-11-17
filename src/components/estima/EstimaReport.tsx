"use client";

import { AlertTriangle, ExternalLink, FileText, Info, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/app-context";
import type { EstimationResult, EstimaFailureReason } from "@/lib/estima";
import type { EstimaPayload } from "@/components/estima/EstimaForm";

/**
 * F2/F3 «Estima el lloguer del teu habitatge» — resultat de l'estimació (N1/N2).
 *
 * Regles de presentació (criteris del redisseny):
 *  - el cap és SEMPRE el RANG orientatiu («entre X i Y €/mes»), mai una xifra única;
 *  - traçabilitat completa visible: base Incasòl, període, nº contractes,
 *    escalat per superfície, ajustos per característiques amb el factor,
 *    dispersió mesurada de l'horquilla i confiança;
 *  - el nivell (N1/N2) reflecteix el que s'ha aplicat DE BO (mai inflar);
 *  - zona tensada → avís legal (Llei 12/2023, LAU art. 17.2) + botó SERPAVI;
 *  - sense dades suficients → estat explícit + consulta oficial SERPAVI
 *    (mai una estimació poc fiable en silenci);
 *  - text fix de transparència sempre present.
 */

function confLabel(key: string, ca: boolean): string | null {
  const m: Record<string, [string, string]> = {
    CONF_PERIODE_RECENT: ["Període de dades recent", "Período de datos reciente"],
    CONF_PERIODE_VELL: ["Període de dades antic (les fiances triguen a publicar-se)", "Período de datos antiguo (las fianzas tardan en publicarse)"],
    CONF_CONTRACTS_ALTS: ["Mostra alta (molts contractes registrats)", "Muestra alta (muchos contratos registrados)"],
    CONF_CONTRACTS_MIG: ["Mostra mitjana de contractes", "Muestra media de contratos"],
    CONF_CONTRACTS_POCS: ["Mostra baixa (pocs contractes registrats)", "Muestra baja (pocos contratos registrados)"],
    CONF_BASE_COMARCA: ["Horquilla calculada amb municipis de la comarca", "Horquilla calculada con municipios de la comarca"],
    CONF_BASE_AMPLA: ["Horquilla calculada amb un pool territorial més ampli", "Horquilla calculada con un pool territorial más amplio"],
    CONF_DADES_MIGUES: ["Dades amb limitacions: contrasta sempre amb les fonts oficials", "Datos con limitaciones: contrasta siempre con las fuentes oficiales"],
    CONF_BASE_COMARCA_REF: ["Base de COMARCA (el municipi no té fiança publicada): aproximació, mai dada municipal", "Base de COMARCA (el municipio no tiene fianza publicada): aproximación, nunca dato municipal"],
  };
  const v = m[key];
  if (!v) return null;
  return ca ? v[0] : v[1];
}

export default function EstimaReport({
  data,
  variant,
  onRetry,
}: {
  data: EstimaPayload;
  variant: "compact" | "full";
  onRetry?: () => void;
}) {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const disclaimer = data.disclaimer ? (ca ? data.disclaimer.ca : data.disclaimer.es) : "";

  const fmtEur = (n: number) =>
    new Intl.NumberFormat(ca ? "ca-ES" : "es-ES", { maximumFractionDigits: 0 }).format(n);
  const fmtEur1 = (n: number) =>
    new Intl.NumberFormat(ca ? "ca-ES" : "es-ES", { maximumFractionDigits: 2 }).format(n);

  // ── degradació honesta: dades insuficients ──
  if (!data.available) {
    const reason: EstimaFailureReason | undefined = data.reason as EstimaFailureReason | undefined;
    return (
      <div className="rounded-2xl border border-ambersoft bg-card p-5 flex flex-col gap-3">
        <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-ambersoft border border-amberline text-[11px] font-bold text-ambertext">
          <AlertTriangle className="w-3.5 h-3.5" />
          {ca ? "Dades insuficients en aquesta zona" : "Datos insuficientes en esta zona"}
        </div>
        <h3 className="font-extrabold text-lg leading-snug">
          {ca
            ? `No podem valorar amb garanties a ${data.input?.municipalityName ?? "aquest municipi"}`
            : `No podemos valorar con garantías en ${data.input?.municipalityName ?? "este municipio"}`}
        </h3>
        <p className="text-sm text-moss leading-relaxed">
          {reason === "NO_RENT"
            ? (ca
              ? "Aquest municipi no té fiança mitjana publicada a Incasòl (mostra massa petita) i tampoc no hi ha referència de comarca amb mostra suficient. Per transparència NO mostrem cap càlcul poc fiable en silenci."
              : "Este municipio no tiene fianza media publicada en Incasòl (muestra demasiado pequeña) y tampoco hay referencia de comarca con muestra suficiente. Por transparencia NO mostramos ningún cálculo poco fiable en silencio.")
            : (ca
              ? "Les dades introduïdes no permeten completar el càlcul. Revisa la superfície i les característiques (habitacions i estat) i reintenta."
              : "Los datos introducidos no permiten completar el cálculo. Revisa la superficie y las características (habitaciones y estado) y reintenta.")}
        </p>
        <a
          href={data.serpaviUrl || "https://serpavi.mivau.gob.es/"}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full rounded-xl bg-pine text-white font-bold text-sm px-4 py-3 hover:bg-pine/90 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
        >
          <ExternalLink className="w-4 h-4" />
          {ca ? "Consulta el rang oficial a SERPAVI" : "Consulta el rango oficial en SERPAVI"}
        </a>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="w-full rounded-xl border border-line bg-card font-semibold text-sm hover:bg-sand transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            {ca ? "Reintenta amb altres dades" : "Reintenta con otros datos"}
          </button>
        )}
        {disclaimer && <p className="text-[11px] text-stone leading-relaxed">{disclaimer}</p>}
      </div>
    );
  }

  // ── resultat N1/N2 ──
  const e = data.estimation;
  if (!e) return null;
  const halfPct = Math.round((e.relativeDispersion / 2) * 1000) / 10;
  const confKeys = e.confidenceKeys.map((k) => confLabel(k, ca)).filter((v): v is string => v !== null);
  const estatLabel: Record<string, [string, string]> = {
    A_REFORMAR: ["a reformar", "a reformar"],
    BON_ESTAT: ["bon estat", "buen estado"],
    REFORMADA: ["reformada", "reformada"],
    OBRA_NOVA: ["obra nova", "obra nueva"],
  };
  const charParts: string[] = [];
  if (e.rooms !== null && e.rooms >= 1) charParts.push(`${e.rooms} ${ca ? "hab." : "hab."}`);
  if (e.estat) charParts.push(estatLabel[e.estat]?.[ca ? 0 : 1] ?? e.estat);
  const ajustosCar = e.adjustments.filter((a) => a.key !== "AJUST_SUPERFICIE");

  return (
    <div className="rounded-2xl border border-line bg-card p-5 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mintsoft border border-mintline text-[11px] font-bold text-mossdeep">
          <ShieldCheck className="w-3.5 h-3.5" />
          {e.level === "N2"
            ? (ca ? "Nivell N2 · base oficial + característiques" : "Nivel N2 · base oficial + características")
            : (ca ? "Nivell N1 · base oficial (Incasòl)" : "Nivel N1 · base oficial (Incasòl)")}
        </span>
        {e.tense && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-embersoft border border-emberline text-[11px] font-bold text-ember3">
            <AlertTriangle className="w-3.5 h-3.5" />
            {ca ? "Zona tensada (DOGC 19-10-2026)" : "Zona tensionada (DOGC 19-10-2026)"}
          </span>
        )}
      </div>

      {/* CAP: el RANG — mai una xifra única */}
      <div className="rounded-xl bg-cream border border-line px-4 py-4">
        <p className="text-xs font-semibold text-stone">
          {ca
            ? `Valoració orientativa per a un habitatge de ${e.surfaceM2} m²${charParts.length > 0 ? `, ${charParts.join(", ")},` : ""} a ${data.input?.municipalityName ?? ""}:`
            : `Valoración orientativa para una vivienda de ${e.surfaceM2} m²${charParts.length > 0 ? `, ${charParts.join(", ")},` : ""} en ${data.input?.municipalityName ?? ""}:`}
        </p>
        <p className="mt-1 text-2xl md:text-3xl font-black tracking-tight tabular-nums text-pine" aria-live="polite">
          {ca ? "entre" : "entre"} {fmtEur(e.min)} {ca ? "i" : "y"} {fmtEur(e.max)} {ca ? "€/mes" : "€/mes"}
        </p>
        <p className="mt-1 text-xs text-stone">
          {ca
            ? `Valor central orientatiu ≈ ${fmtEur(e.central)} €/mes (${fmtEur1(e.eurM2 ?? 0)} €/m²·mes derivat de la superfície introduïda)`
            : `Valor central orientativo ≈ ${fmtEur(e.central)} €/mes (${fmtEur1(e.eurM2 ?? 0)} €/m²·mes derivado de la superficie introducida)`}
        </p>
      </div>

      {/* traçabilitat completa */}
      <div className="rounded-xl border border-line overflow-hidden">
        <div className="bg-sand px-3.5 py-2 text-xs font-bold text-moss flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          {ca ? "Com s'ha calculat (traçabilitat)" : "Cómo se ha calculado (trazabilidad)"}
        </div>
        <dl className="text-[13px] divide-y divide-line bg-card">
          <div className="px-3.5 py-2 flex flex-wrap gap-x-2">
            <dt className="text-stone shrink-0">{ca ? "Base" : "Base"}:</dt>
            <dd className="flex-1 min-w-[12rem] text-moss">
              {e.baseSource === "MUNICIPI"
                ? (ca
                  ? `fiança mitjana municipal oficial d'Incasòl: ${fmtEur(e.baseCentral)} €/mes (${e.basePeriod ?? "període n/d"} · ${e.contracts ?? "n/d"} contractes)`
                  : `fianza media municipal oficial de Incasòl: ${fmtEur(e.baseCentral)} €/mes (${e.basePeriod ?? "periodo n/d"} · ${e.contracts ?? "n/d"} contratos)`)
                : (ca
                  ? `referència de comarca PONDERADA — ESTIMACIÓ, mai dada municipal: ${fmtEur(e.baseCentral)} €/mes (${e.basePeriod ?? "període n/d"})`
                  : `referencia de comarca PONDERADA — ESTIMACIÓN, nunca dato municipal: ${fmtEur(e.baseCentral)} €/mes (${e.basePeriod ?? "periodo n/d"})`)}
            </dd>
          </div>
          <div className="px-3.5 py-2 flex flex-wrap gap-x-2">
            <dt className="text-stone shrink-0">{ca ? "Escalat" : "Escalado"}:</dt>
            <dd className="flex-1 min-w-[12rem] text-moss">
              {ca
                ? `superfície: ${e.central === e.baseCentral ? `l'habitatge introduït coincideix amb el típic (${fmtEur1(e.eurM2Typical ?? 0)} €/m²·mes típic)` : `${e.surfaceM2} m² × (${fmtEur1(e.eurM2Typical ?? 0)} €/m²·mes típic, elasticitat 0,8 documentada)`}`
                : e.central === e.baseCentral
                  ? `la vivienda introducida coincide con la típica (${fmtEur1(e.eurM2Typical ?? 0)} €/m²·mes típico)`
                  : `${e.surfaceM2} m² × (${fmtEur1(e.eurM2Typical ?? 0)} €/m²·mes típico, elasticidad 0,8 documentada)`}
            </dd>
          </div>
          {ajustosCar.length > 0 && (
            <div className="px-3.5 py-2 flex flex-wrap gap-x-2">
              <dt className="text-stone shrink-0">{ca ? "Ajustos" : "Ajustes"}:</dt>
              <dd className="flex-1 min-w-[12rem] text-moss">
                {ajustosCar.map((a) =>
                  ca
                    ? `${a.key === "AJUST_ESTAT" ? "estat de conservació" : "densitat d'habitacions"}: ${a.detail} ×${a.factor} (coeficient documentat)`
                    : `${a.key === "AJUST_ESTAT" ? "estado de conservación" : "densidad de habitaciones"}: ${a.detail} ×${a.factor} (coeficiente documentado)`,
                ).join(ca ? " · " : " · ")}
              </dd>
            </div>
          )}
          <div className="px-3.5 py-2 flex flex-wrap gap-x-2">
            <dt className="text-stone shrink-0">{ca ? "Horquilla" : "Horquilla"}:</dt>
            <dd className="flex-1 min-w-[12rem] text-moss">
              {ca
                ? `dispersió MESURADA del pool (${e.bandBasis === "COMARCA" ? "comarca" : e.bandBasis === "PROVINCIA" ? "província" : "sèrie històrica"}, N=${e.bandN}, any ${e.bandYear ?? "n/d"}): ±${halfPct} %`
                : `dispersión MEDIDA del pool (${e.bandBasis === "COMARCA" ? "comarca" : e.bandBasis === "PROVINCIA" ? "provincia" : "serie histórica"}, N=${e.bandN}, año ${e.bandYear ?? "n/d"}): ±${halfPct} %`}
            </dd>
          </div>
          <div className="px-3.5 py-2 flex flex-wrap gap-x-2">
            <dt className="text-stone shrink-0">{ca ? "Confiança" : "Confianza"}:</dt>
            <dd className="flex-1 min-w-[12rem] text-moss">
              <span className="font-bold">{e.confidence}</span>
              {confKeys.length > 0 && <span className="text-stone"> — {confKeys.join(" · ")}</span>}
            </dd>
          </div>
        </dl>
      </div>

      {/* avisos d'habitabilitat (informatius, no alteren el càlcul) */}
      {e.warnings.length > 0 && (
        <ul className="rounded-xl bg-ambersoft/40 border border-amberline px-3.5 py-2.5 text-[13px] text-ambertext flex flex-col gap-1">
          {e.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {ca ? "Habitabilitat (Decret 141/2012): " : "Habitabilidad (Decreto 141/2012): "}
                {w.level === "ILLEGAL"
                  ? (ca ? "sota el mínim legal" : "por debajo del mínimo legal")
                  : w.level === "EXCEPCIONAL"
                    ? (ca ? "només excepcional amb cèdula vigent" : "solo excepcional con cédula vigente")
                    : w.level === "ADVERTENCIA"
                      ? (ca ? "habitatge compacte: risc d'incomplir sales mínimes" : "vivienda compacta: riesgo de incumplir salas mínimas")
                      : w.detail}
                {" "}{w.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* zona tensada: avís legal + SERPAVI (criteri F2) */}
      {e.tense && (
        <div className="rounded-xl bg-embersoft border border-emberline px-3.5 py-3 flex flex-col gap-2.5">
          <p className="text-[13px] text-ember3 leading-relaxed">
            <b>{ca ? "Zona tensada (Llei 12/2023, LAU art. 17.2): " : "Zona tensionada (Ley 12/2023, LAU art. 17.2): "}</b>
            {ca
              ? "en contractes nous d'habitatge habitual la renda no pot superar la de l'últim contracte dels darrers 5 anys, i els grans tenedores han de consultar el rang oficial SERPAVI. Aquest càlcul NO substitueix la consulta oficial."
              : "en contratos nuevos de vivienda habitual la renta no puede superar la del último contrato de los últimos 5 años, y los grandes tenedores deben consultar el rango oficial SERPAVI. Este cálculo NO sustituye la consulta oficial."}
          </p>
          <a
            href={data.serpaviUrl || "https://serpavi.mivau.gob.es/"}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl bg-pine text-white font-bold text-sm px-4 py-3 hover:bg-pine/90 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
          >
            <ExternalLink className="w-4 h-4" />
            {ca ? "Consulta el rang oficial a SERPAVI" : "Consulta el rango oficial en SERPAVI"}
          </a>
        </div>
      )}

      {/* text fix de transparència — sempre */}
      {disclaimer && (
        <p className="text-[11px] text-stone leading-relaxed flex items-start gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-pine shrink-0 mt-0.5" />
          {disclaimer}
        </p>
      )}

      {/* accions següents (separació honesta de funcionalitats) */}
      <div className={`flex flex-col ${variant === "full" ? "sm:flex-row" : ""} gap-2`}>
        <button
          type="button"
          onClick={() => navigate("/analitza")}
          className="flex-1 rounded-xl border border-line bg-card font-semibold text-sm hover:bg-sand transition-colors flex items-center justify-center gap-2 min-h-[44px]"
        >
          <Search className="w-4 h-4" />
          {ca ? "Comprova un anunci concret (abans de signar)" : "Comprueba un anuncio concreto (antes de firmar)"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/metodologia")}
          className="flex-1 rounded-xl border border-line bg-card font-semibold text-sm hover:bg-sand transition-colors flex items-center justify-center gap-2 min-h-[44px]"
        >
          <FileText className="w-4 h-4" />
          {ca ? "Metodologia i fonts" : "Metodología y fuentes"}
        </button>
      </div>

      {data.generatedAt && (
        <p className="text-[10px] text-stone">
          {ca ? "Calculat el " : "Calculado el "}{new Date(data.generatedAt).toLocaleString(ca ? "ca-ES" : "es-ES")}
        </p>
      )}
    </div>
  );
}
