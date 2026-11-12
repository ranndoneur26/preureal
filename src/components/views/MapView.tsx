"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { Flame, MapPin, Search, X, Building2, TrendingUp, TrendingDown, Minus, Info, ExternalLink, Star, FileDown, FileSpreadsheet, AlertTriangle, Home, MailCheck, Lock, Factory, Calculator, Hash } from "lucide-react";
import LineChart, { type LineSeries } from "@/components/charts/LineChart";
import BarChart, { type BarRow } from "@/components/charts/BarChart";
import ValuationPanel from "@/components/views/ValuationPanel";
import OnboardingTour from "@/components/OnboardingTour";
import FirstRunChecklist from "@/components/FirstRunChecklist";
import { markStep } from "@/lib/steps";
import { VAL_REF_M2, VAL_BETA_SUPERFICIE } from "@/lib/territorial";

/** Resposta de GET /api/indicators/muni/:code (Fase 4, gating al servidor). */
interface GatedIndicatorsResponse {
  plan: string;
  medianaMunicipal: { p50: number; n: number; basis: string } | null;
  teaser: { bandaDisponible: boolean; esforcDisponible: boolean; evolucioDisponible?: boolean; comparativaDisponible?: boolean } | null;
  bandaCompleta: { p25: number; p50: number; p75: number; n: number; totalWeight: number; basis: string } | null;
  posVsMedian: { absDiff: number; pctDiff: number; direction: "ABOVE" | "BELOW" | "AT"; median: number; basis: string } | null;
  refBand: { position: "BELOW" | "WITHIN" | "ABOVE"; labelCa: string; labelEs: string; p25: number; p75: number; basis: string } | null;
  ipva: {
    catalunya: { latestAnual: { period: string; value: number } | null; acum2015: { period: string; value: number } | null } | null;
    provincia: { geoName: string | null; latestAnual: { period: string; value: number } | null; acum2015: { period: string; value: number } | null } | null;
    municipi: { geoName: string | null; latestAnual: { period: string; value: number } | null } | null;
  } | null;
  renta: {
    municipi: {
      hogar: { latest: { period: string; value: number } | null; series: { period: string; value: number }[] } | null;
      persona: { latest: { period: string; value: number } | null } | null;
    };
  } | null;
  effort: {
    hogar: { pct: number; rentEurMonth: number; rentPeriod: string | null; rentaAnual: number; rentaPeriod: string } | null;
    persona: { pct: number } | null;
  } | null;
  /** Noves funcionalitats (F1-F4) — tallades al servidor per pla/flags. */
  effortCatalunya: { pct: number; rentEurMonth: number; rentPeriod: string | null; rentaAnual: number; rentaPeriod: string } | null;
  catalunyaRentYear: { year: string | null; median: number | null; n: number | null } | null;
  evolucio: {
    muni: Array<{ year: string; value: number }>;
    interanual: Array<{ year: string; pct: number }>;
    comarca: Array<{ year: string; median: number; n: number }> | null;
    provincia: Array<{ year: string; median: number; n: number }> | null;
    muniPeriod: string | null;
    volatileJump: boolean;
  } | null;
  comparativa: {
    year: string | null;
    muni: { value: number; period: string | null };
    comarca: { median: number; n: number; name: string | null } | null;
    provincia: { median: number; n: number; name: string | null } | null;
    deltaComarcaPct: number | null;
    deltaProvinciaPct: number | null;
    extremes: { car: { name: string; value: number } | null; barat: { name: string; value: number } | null } | null;
    seccioCensalDisponible: false;
  } | null;
  terrDelta: {
    rentaVsProvincia: { pctDiff: number } | null;
    rentaVsCatalunya: { pctDiff: number } | null;
    rentaVsEspanya: { pctDiff: number } | null;
  } | null;
  fontsUsed: string[];
  avisos: string[];
  generatedAt: string;
}

/**
 * Fase 4 — Bloc «Referència oficial i context» de la fitxa (FullPanel).
 * Les dades decideixen-les SEMPRE el servidor (/api/indicators/muni/:code):
 * el client només pinta el que ha rebut (gratuït: mediana + teaser;
 * Premium/Pro: banda, posició, IPVA, renda i esforç amb metodologia).
 */
function IndicadorsOficials({ muniCode, muniName, price }: { muniCode: string; muniName: string; price: number | null }) {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  // dades etiquetades amb el municipi que les va portar: quan canvia el
  // municipi, les velles deixen de pintar-se sense setState síncron a l'effect
  const [data, setData] = useState<{ code: string; d: GatedIndicatorsResponse } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/indicators/muni/${encodeURIComponent(muniCode)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setData({ code: muniCode, d }); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [muniCode]);

  if (failed) return null; // degradació elegant: el bloc no és crític
  if (!data || data.code !== muniCode) {
    return (
      <div className="rounded-xl border border-line p-4 text-xs text-stone">
        {ca ? "Carregant referència oficial…" : "Cargando referencia oficial…"}
      </div>
    );
  }
  const resp = data.d;

  // posició davant la mediana: el server ja la calcula amb ?price; si l'usuari
  // tecleja un preu nou, el % es recalcula localment (aritmètica sobre dades
  // ja autoritzades pel servidor; la DECISIÓ de visibilitat és del server).
  const banda = resp.bandaCompleta;
  const posLocal =
    banda && price && banda.p50 > 0
      ? {
          pctDiff: Math.round(((price - banda.p50) / banda.p50) * 100 * 10) / 10,
          direction: (price === banda.p50 ? "AT" : price > banda.p50 ? "ABOVE" : "BELOW") as "ABOVE" | "BELOW" | "AT",
        }
      : null;
  const pos = posLocal ?? (resp.posVsMedian ? { pctDiff: resp.posVsMedian.pctDiff, direction: resp.posVsMedian.direction } : null);
  const bandPos =
    banda && price
      ? price < banda.p25
        ? ca ? "Per sota del rang de referència" : "Por debajo del rango de referencia"
        : price > banda.p75
          ? ca ? "Per sobre del rang de referència" : "Por encima del rango de referencia"
          : ca ? "Dins del rang de referència" : "Dentro del rango de referencia"
      : null;
  const markerPct = banda && price && banda.p75 > banda.p25
    ? Math.min(100, Math.max(0, ((price - banda.p25) / (banda.p75 - banda.p25)) * 100))
    : null;

  const effort = resp.effort?.hogar ?? null;

  return (
    <div className="rounded-xl border border-line p-4 space-y-3">
      <div className="text-xs font-semibold text-stone uppercase tracking-wide">
        {ca ? "Referència oficial i context" : "Referencia oficial y contexto"}
      </div>

      {/* — gratuït: mediana municipal de referència — */}
      {resp.medianaMunicipal && (
        <div className="text-sm">
          <span className="text-stone">{ca ? "Mediana municipal (mercat registrat)" : "Mediana municipal (mercado registrado)"}: </span>
          <b>{resp.medianaMunicipal.p50.toFixed(0)} €/mes</b>
          <span className="text-xs text-stone"> · {resp.medianaMunicipal.n} {ca ? "illes amb dades" : "manzanas con datos"}</span>
        </div>
      )}

      {/* — teaser gratuït (només si la dada existeix de debò) — */}
      {resp.teaser && (resp.teaser.bandaDisponible || resp.teaser.esforcDisponible) && (
        <div className="rounded-lg border border-amberline2 bg-ambersoft2 p-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-ember3 shrink-0" />
          <p className="text-xs text-amberdark flex-1">
            {ca
              ? "Amb Premium: banda completa P25–P75, posició del teu preu, evolució del lloguer any a any, comparativa comarca/província, renda mitjana i esforç econòmic amb dades oficials."
              : "Con Premium: banda completa P25–P75, posición de tu precio, evolución del alquiler año a año, comparativa comarca/provincia, renta media y esfuerzo económico con datos oficiales."}
          </p>
          <button onClick={() => navigate("/preus")} className="px-3 py-1.5 rounded-lg bg-ember text-white text-[11px] font-bold shrink-0 hover:bg-ember2">
            {ca ? "Veure Premium" : "Ver Premium"}
          </button>
        </div>
      )}

      {/* — PREMIUM: banda + posició — */}
      {banda && (
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] text-stone font-semibold">
            <span>P25 · {banda.p25.toFixed(0)} €</span>
            <span>{ca ? "mediana" : "mediana"} · {banda.p50.toFixed(0)} €</span>
            <span>P75 · {banda.p75.toFixed(0)} €</span>
          </div>
          <div className="relative h-3 rounded-full" style={{ background: "linear-gradient(90deg,#63b57c,#e5c46a,#dd5a35)" }}>
            {markerPct !== null && (
              <div
                className="absolute -top-1 w-5 h-5 rounded-full bg-pine border-2 border-white shadow"
                style={{ left: `calc(${markerPct}% - 10px)` }}
                title={price ? `${price.toFixed(0)} €/mes` : ""}
              />
            )}
          </div>
          {bandPos && (
            <div className="text-xs font-semibold text-pine">{bandPos}</div>
          )}
          {pos !== null && (
            <div className="text-xs text-moss flex items-center gap-1">
              {pos.direction === "ABOVE" ? <TrendingUp className="w-3.5 h-3.5 text-ember3" /> : pos.direction === "BELOW" ? <TrendingDown className="w-3.5 h-3.5 text-green2" /> : <Minus className="w-3.5 h-3.5" />}
              {pos.pctDiff > 0 ? "+" : ""}{pos.pctDiff.toFixed(1).replace(".", ",")} % {ca ? "respecte a la mediana de l'entorn" : "respecto a la mediana del entorno"}
            </div>
          )}
          <div className="text-[10px] text-stone">{banda.basis} · n={banda.n}</div>
        </div>
      )}

      {/* — PREMIUM: IPVA — */}
      {resp.ipva?.catalunya && (
        <div className="text-sm">
          <div className="text-[11px] font-semibold text-stone uppercase">{ca ? "Evolució del mercat (IPVA INE)" : "Evolución del mercado (IPVA INE)"}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {resp.ipva.catalunya.latestAnual && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sand">
                CAT {resp.ipva.catalunya.latestAnual.value > 0 ? "+" : ""}{resp.ipva.catalunya.latestAnual.value.toFixed(1).replace(".", ",")} % ({resp.ipva.catalunya.latestAnual.period})
              </span>
            )}
            {resp.ipva.catalunya.acum2015 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sand">
                {ca ? "acum." : "acum."} +{resp.ipva.catalunya.acum2015.value.toFixed(1).replace(".", ",")} % {ca ? "des de 2015" : "desde 2015"}
              </span>
            )}
            {resp.ipva.provincia?.latestAnual && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sand">
                {resp.ipva.provincia.geoName ?? (ca ? "Província" : "Provincia")} {resp.ipva.provincia.latestAnual.value > 0 ? "+" : ""}{resp.ipva.provincia.latestAnual.value.toFixed(1).replace(".", ",")} %
              </span>
            )}
            {resp.ipva.municipi?.latestAnual && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sand">
                {ca ? "Municipi" : "Municipio"} {resp.ipva.municipi.latestAnual.value > 0 ? "+" : ""}{resp.ipva.municipi.latestAnual.value.toFixed(1).replace(".", ",")} %
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-stone">
            {ca ? "És un índex d'evolució (base 2015=100): no és un preu en euros." : "Es un índice de evolución (base 2015=100): no es un precio en euros."}
          </div>
        </div>
      )}

      {/* — PREMIUM: renda + esforç — */}
      {resp.renta?.municipi.hogar?.latest && (
        <div className="text-sm">
          <div className="text-[11px] font-semibold text-stone uppercase">{ca ? "Renda i esforç econòmic (INE)" : "Renta y esfuerzo económico (INE)"}</div>
          <div className="mt-1 text-sm">
            <span className="text-stone">{ca ? "Renda neta mitjana per llar" : "Renta neta media por hogar"}: </span>
            <b>{resp.renta.municipi.hogar.latest.value.toLocaleString(ca ? "ca-ES" : "es-ES")} €/any</b>
            <span className="text-xs text-stone"> ({resp.renta.municipi.hogar.latest.period})</span>
          </div>
          {effort && (
            <div className="mt-1.5 rounded-lg bg-cream border border-line p-2.5">
              <div className="font-black text-lg text-pine">{effort.pct.toFixed(1).replace(".", ",")} %</div>
              <div className="text-[11px] text-moss">
                {ca
                  ? `una llar amb la renda mitjana del municipi destinaria aquest % a un lloguer mitjà (${effort.rentEurMonth.toFixed(0)} €/mes × 12 ÷ ${effort.rentaAnual.toLocaleString(ca ? "ca-ES" : "es-ES")} €/any)`
                  : `un hogar con la renta media del municipio destinaría este % a un alquiler medio (${effort.rentEurMonth.toFixed(0)} €/mes × 12 ÷ ${effort.rentaAnual.toLocaleString(ca ? "ca-ES" : "es-ES")} €/año)`}
              </div>
              <div className="mt-1 text-[10px] text-stone">
                {ca
                  ? "Indicador TERRITORIAL (renda per llar de l'Atlas INE): no mesura la teva situació personal. Fiances: " + (effort.rentPeriod ?? "—") + "."
                  : "Indicador TERRITORIAL (renta por hogar del Atlas INE): no mide tu situación personal. Fianzas: " + (effort.rentPeriod ?? "—") + "."}
              </div>
              {/* Noves funcionalitats (F3): termòmetre d'esforç + comparativa Catalunya */}
              <div className="mt-2">
                <div className="relative h-3 rounded-full" style={{ background: "linear-gradient(90deg,#63b57c 0%,#e5c46a 42%,#dd5a35 75%)" }}>
                  <div
                    className="absolute -top-1 w-5 h-5 rounded-full bg-pine border-2 border-white shadow"
                    style={{ left: `calc(${Math.min(100, Math.max(0, (effort.pct / 60) * 100))}% - 10px)` }}
                    title={`${effort.pct.toFixed(1).replace(".", ",")} %`}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-stone mt-0.5">
                  <span>0 %</span>
                  <span>60 %</span>
                </div>
              </div>
              {resp.effortCatalunya && (
                <div className="mt-1.5 text-[11px] text-moss">
                  {ca ? "Catalunya amb el mateix lloguer medianà: " : "Cataluña con el mismo alquiler mediano: "}
                  <b>{resp.effortCatalunya.pct.toFixed(1).replace(".", ",")} %</b>
                  {resp.catalunyaRentYear?.median ? (
                    <>
                      {" · "}
                      {ca ? "lloguer medianà Cat." : "alquiler mediano Cat."} <b>{resp.catalunyaRentYear.median.toFixed(0)} €/mes</b> ({resp.catalunyaRentYear.year}, n={resp.catalunyaRentYear.n})
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* — Noves funcionalitats (F1): evolució temporal — Premium — */}
      {resp.evolucio && resp.evolucio.muni.length >= 2 && (() => {
        const evo = resp.evolucio;
        const evoSeries: LineSeries[] = [
          { id: "muni", label: muniName, color: "#e8673c", points: evo.muni.map((p) => ({ x: p.year, y: p.value })) },
          ...(evo.comarca && evo.comarca.length >= 2
            ? [{ id: "comarca", label: ca ? "Comarca (mediana)" : "Comarca (mediana)", color: "#0f2e21", points: evo.comarca.map((p) => ({ x: p.year, y: p.median })), dashed: true }]
            : []),
          ...(evo.provincia && evo.provincia.length >= 2
            ? [{ id: "prov", label: ca ? "Província (mediana)" : "Provincia (mediana)", color: "#6b6f68", points: evo.provincia.map((p) => ({ x: p.year, y: p.median })), dashed: true }]
            : []),
        ];
        return (
          <div className="pt-2.5 border-t border-line">
            <div className="text-[11px] font-semibold text-stone uppercase">{ca ? "Evolució del lloguer (fiances Incasòl)" : "Evolución del alquiler (fianzas Incasòl)"}</div>
            <div className="mt-1.5">
              <LineChart locale={ca ? "ca" : "es"} series={evoSeries} />
            </div>
            {evo.interanual.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {evo.interanual.slice(-4).map((p) => (
                  <span key={p.year} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.pct > 0 ? "bg-embersoft2 text-ember3" : p.pct < 0 ? "bg-mintsoft text-green2" : "bg-sand text-moss"}`}>
                    {p.year}: {p.pct > 0 ? "+" : ""}{p.pct.toFixed(1).replace(".", ",")} %
                  </span>
                ))}
              </div>
            )}
            {evo.volatileJump && (
              <div className="mt-1 text-[10px] text-amberdark flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {ca ? "Alguns salts interanuals són grans: municipi amb pocs contractes (mostra petita)." : "Algunos saltos interanuales son grandes: municipio con pocos contratos (muestra pequeña)."}
              </div>
            )}
            <div className="mt-1 text-[10px] text-stone">
              {ca ? "Només anys amb dada publicada (sense interpolació). Mitjana de fiances per habitatge · període vigent: " : "Solo años con dato publicado (sin interpolación). Media de fianzas por vivienda · período vigente: "}
              {evo.muniPeriod ?? "—"}
            </div>
          </div>
        );
      })()}

      {/* — Noves funcionalitats (F2): comparativa territorial — Premium — */}
      {resp.comparativa && resp.comparativa.muni.value > 0 && (() => {
        const comp = resp.comparativa;
        const compRows: BarRow[] = [
          { label: ca ? "Aquest municipi" : "Este municipio", value: comp.muni.value, period: comp.muni.period, highlight: true },
        ];
        if (comp.comarca) compRows.push({ label: comp.comarca.name ?? (ca ? "Comarca" : "Comarca"), value: comp.comarca.median, period: comp.year, sub: `mediana · n=${comp.comarca.n} ${ca ? "munis" : "munis."}` });
        if (comp.provincia) compRows.push({ label: comp.provincia.name ?? (ca ? "Província" : "Provincia"), value: comp.provincia.median, period: comp.year, sub: `mediana · n=${comp.provincia.n} ${ca ? "munis" : "munis."}` });
        return (
          <div className="pt-2.5 border-t border-line">
            <div className="text-[11px] font-semibold text-stone uppercase">{ca ? "Comparativa territorial" : "Comparativa territorial"}</div>
            <div className="mt-2">
              <BarChart locale={ca ? "ca" : "es"} rows={compRows} />
            </div>
            {(comp.deltaComarcaPct !== null || comp.deltaProvinciaPct !== null) && (
              <div className="mt-1.5 text-[11px] text-moss">
                {comp.deltaComarcaPct !== null && (
                  <>
                    {ca ? "Respecte a la comarca: " : "Respecto a la comarca: "}
                    <b className={comp.deltaComarcaPct > 0 ? "text-ember3" : "text-green2"}>{comp.deltaComarcaPct > 0 ? "+" : ""}{comp.deltaComarcaPct.toFixed(1).replace(".", ",")} %</b>
                    {comp.deltaProvinciaPct !== null ? " · " : ""}
                  </>
                )}
                {comp.deltaProvinciaPct !== null && (
                  <>
                    {ca ? "respecte a la província: " : "respecto a la provincia: "}
                    <b className={comp.deltaProvinciaPct > 0 ? "text-ember3" : "text-green2"}>{comp.deltaProvinciaPct > 0 ? "+" : ""}{comp.deltaProvinciaPct.toFixed(1).replace(".", ",")} %</b>
                  </>
                )}
              </div>
            )}
            {comp.extremes?.car && comp.extremes?.barat && (
              <div className="mt-1 text-[10px] text-stone">
                {ca ? "A la comarca" : "En la comarca"} ({comp.year}): {ca ? "més car" : "más caro"} <b>{comp.extremes.car.name}</b> ({comp.extremes.car.value.toFixed(0)} €) · {ca ? "més barat" : "más barato"} <b>{comp.extremes.barat.name}</b> ({comp.extremes.barat.value.toFixed(0)} €)
              </div>
            )}
            <div className="mt-1 text-[10px] text-stone">
              {ca ? "Mediana dels municipis amb dada el mateix any (comparabilitat de períodes garantida). Secció censal i districte: no disponibles — la font oficial no els publica." : "Mediana de los municipios con dato el mismo año (comparabilidad de períodos garantida). Sección censal y distrito: no disponibles — la fuente oficial no los publica."}
            </div>
          </div>
        );
      })()}

      {/* — fonts + enllaç a la guia — */}
      {resp.fontsUsed.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone">
          <span>Font: {resp.fontsUsed.includes("INE_ATLAS_RENTA") ? "INE (IPVA + Atlas de renda)" : "INE (IPVA)"}</span>
          <button onClick={() => navigate("/guia")} className="underline font-semibold text-pine hover:text-ember">
            {ca ? "Guia del lloguer i ajudes →" : "Guía del alquiler y ayudas →"}
          </button>
        </div>
      )}
    </div>
  );
}

interface MunLite {
  code: string;
  name: string;
  comarca: string | null;
  lat: number;
  lng: number;
  rentLatest: number | null;
  rentPeriod: string | null;
  comarcaRefLatest?: number | null;
  rentSource?: string | null;
  isTense: boolean;
  tenseList?: string | null;
}

interface AddressResult {
  label: string;
  lat: number;
  lng: number;
  municipalityCode: string | null;
  municipalityName: string | null;
  comarca: string | null;
  postalCode: string | null;
  portal: string | null;
  street: string | null;
}

/** Resultat del buscador per referència catastral (GET /api/lookup-refcat v2). */
interface RcResult {
  id: string | null;
  refcat: string;
  nom: string | null;
  lat: number;
  lng: number;
  municipalityCode: string | null;
  ring: number[][] | null;
  details: { address: string | null; postalCode: string | null; uso: string | null; surfaceM2: number | null; yearBuilt: number | null } | null;
  source: string;
}

interface LookupResult {
  kind: "full" | "teaser";
  building?: { id?: string; refcat?: string | null; yearBuilt?: { year: number; source: string } | null; tipus?: string | null; altura?: number | null; nom?: string | null; avgRentEurMonth?: number | null; sampleSize?: number | null };
  municipality?: {
    code: string; name: string; comarca: string | null; province: string | null;
    slug?: string | null; // v37: pàgina pública /lloguer/[slug]
    rentLatest: number | null; rentPeriod: string | null;
    rentPrevYear: number | null; rentPrevPeriod: string | null;
    rentHistory: Record<string, number> | null;
    contractsLatest: number | null;
    comarcaRefLatest: number | null;
    comarcaRefPeriod: string | null;
    comarcaRefHistory: Record<string, number> | null;
    rentSource: string | null;
    isTense: boolean; tenseList: string | null;
  };
  quota?: { used: number; limit: number };
  teaser?: { hasRent: boolean; period: string | null; message: string };
  error?: string;
  email?: string; // EMAIL_NOT_VERIFIED (Fase 1): correu emmascarat del compte
}

function rentColor(rent: number | null | undefined): string {
  if (!rent) return "#9aa5a0";
  if (rent < 550) return "#63b57c";
  if (rent < 700) return "#93c47d";
  if (rent < 850) return "#e5c46a";
  if (rent < 1000) return "#e89a4b";
  return "#dd5a35";
}

// v33 — les naus industrials (tipus "ind" de l'ICGC) NO participen de l'escala
// de lloguer d'habitatges (fiances Incasòl): un color neutre violeta fora de
// l'escala evita que un usuari interpreti el preu residencial municipal com a
// preu de la nau.
const NAU_FILL = "#8b7bb5";
const NAU_BORDER = "#5d5480";

/** Un text que sembla referència catastral (14+ alfanumèrics sense espais). */
function looksLikeRefcat(q: string): boolean {
  const s = q.replace(/\s+/g, "").toUpperCase();
  return /^[0-9]{7}[A-Z][A-Z0-9]{5,7}$/.test(s) || /^[0-9A-Z]{14,20}$/.test(s) && /[0-9]/.test(s) && /[A-Z]/.test(s);
}

export default function MapView() {
  const { t, locale, auth, navigate } = useApp();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const boundaryRef = useRef<any>(null);
  const selectedRef = useRef<any>(null);
  // v24 — enllaços "obre al mapa" des del panell: llistat d'edificis dibuixats
  // i el seu polígon per id, per poder seleccionar un edifici concret després
  // de volar al seu centroid (deep link /#/mapa?edifici=...)
  const lastBuildingsRef = useRef<any[]>([]);
  const polyByIdRef = useRef<Record<string, any>>({});

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MunLite[]>([]);
  const [addresses, setAddresses] = useState<AddressResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  // Buscador per referència catastral (2026-11-11)
  const parcelRef = useRef<any>(null); // ressaltat de la parcel·la trobada
  const [rcInput, setRcInput] = useState("");
  const [rcBusy, setRcBusy] = useState(false);
  const [rcResult, setRcResult] = useState<RcResult | null>(null);
  const [rcError, setRcError] = useState<string | null>(null);
  const [zoomHint, setZoomHint] = useState(false);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  const [coverageWarn, setCoverageWarn] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<"closed" | "loading" | "teaser" | "full" | "paywall" | "verificacio">("closed");
  const [verifySent, setVerifySent] = useState(false); // reenviament des del panell del mapa
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  // v33 — l'edifici clicat és una nau industrial? (el teaser no rep el building
  // del servidor; el client ja ho sap en el moment del clic)
  const [clickedNau, setClickedNau] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(auth.quota);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [favState, setFavState] = useState<"idle" | "saved" | "error" | "plan">("idle");
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);
  const [pdfLocked, setPdfLocked] = useState(false);
  // Fase 5 — exportació CSV (pla Pro · agents) visible a la fitxa
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [csvLocked, setCsvLocked] = useState(false);

  // ---- Selecció i dibuix d'edificis — moguts ABANS de l'efecte d'inicialització del
  // mapa perquè l'anàlisi de react-hooks no detecti accés abans de la declaració ----
  const lookupSeqRef = useRef(0);
  // recorda l'últim clic al mapa per poder repetir la consulta des del bloqueig
  // de verificació («Ja l'he verificat: comprova-ho») sense haver de reclicar
  const lastClickRef = useRef<{ b: any; lat: number; lng: number; poly: any } | null>(null);

  /** Consulta /api/lookup (compartida per clic d'edifici i buscador de RC). */
  const runLookup = useCallback(async (b: any | null, lat: number, lng: number) => {
    // invalida respuestas de consultas anteriores (evita carreras fuera de orden)
    const seq = ++lookupSeqRef.current;
    setClickedNau(b?.tipus === "ind"); // v33 — recorda si s'ha clicat una nau
    setPanelState("loading");
    setLookup(null);
    setDemoNotice(null);
    setFavState("idle");
    setPdfMsg(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, ...(b?.id ? { buildingId: b.id } : {}) }),
      });
      if (seq !== lookupSeqRef.current) return; // resposta obsoleta
      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        setLookup(d);
        setPanelState("paywall");
        return;
      }
      // Fase 1: correu sense verificar → 403 del servidor (bloqueig principal)
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d?.error === "EMAIL_NOT_VERIFIED") {
          setLookup(d);
          setPanelState("verificacio");
          setVerifySent(false);
          return;
        }
      }
      const d: LookupResult = await res.json();
      if (seq !== lookupSeqRef.current) return; // resposta obsoleta
      setLookup(d);
      setPanelState(d.kind === "full" ? "full" : "teaser");
      if (d.kind === "full" && d.quota) setQuota(d.quota);
    } catch {
      if (seq === lookupSeqRef.current) setPanelState("closed");
    }
  }, []);

  const onSelectBuilding = useCallback(async (b: any, lat: number, lng: number, poly: any) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (L && map && poly?.setStyle) {
      if (selectedRef.current) {
        selectedRef.current.setStyle({ color: "#3d4a42", weight: 0.7, fillOpacity: 0.55 });
      }
      poly.setStyle({ color: "#e8673c", weight: 3, fillOpacity: 0.8 });
      selectedRef.current = poly;
    }
    // recorda l'últim clic per al bloqueig de verificació («comprova-ho»)
    lastClickRef.current = { b, lat, lng, poly };
    await runLookup(b, lat, lng);
  }, [runLookup]);

  const drawBuildings = useCallback((buildings: any[]) => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    polyByIdRef.current = {}; // v24: el lot nou substitueix l'anterior
    lastBuildingsRef.current = buildings;
    for (const b of buildings) {
      const isNau = b.tipus === "ind";
      // v39 — municipis sense dada oficial (mostra petita Incasòl): el color ve
      // de la REFERÈNCIA DE COMARCA, traçat discontinu i més translúcid per
      // distingir estimació de dada municipal oficial.
      const isRefComarca = !isNau && !b.avgRentEurMonth && !b.munRent && !!b.munRefRent;
      let color = "#9aa5a0";
      // si l'edifici té dada pròpia importada, el color ve d'aquesta dada real
      if (isNau) color = NAU_FILL;
      else if (b.avgRentEurMonth) color = rentColor(b.avgRentEurMonth);
      else if (b.munRent) color = rentColor(b.munRent);
      else if (b.munRefRent) color = rentColor(b.munRefRent);
      const poly = L.polygon(b.ring.map((p: number[]) => [p[1], p[0]]), {
        color: isNau ? NAU_BORDER : "#3d4a42",
        weight: isNau ? 1 : isRefComarca ? 1 : 0.7,
        dashArray: isNau ? "4 3" : isRefComarca ? "2 3" : undefined,
        fillColor: color,
        fillOpacity: isNau ? 0.45 : isRefComarca ? 0.3 : 0.55,
      });
      if (isNau || isRefComarca) {
        // tooltip breu: és l'única pista sense obrir la fitxa
        const tip = isNau
          ? (locale === "ca"
            ? "Nau industrial · sense estadística de lloguer d'habitatges"
            : "Nave industrial · sin estadística de alquiler de viviendas")
          : (locale === "ca"
            ? "≈ Estimació per referència de comarca (municipi sense dada oficial)"
            : "≈ Estimación por referencia de comarca (municipio sin dato oficial)");
        poly.bindTooltip(tip, { sticky: true, direction: "top", opacity: 0.9 });
      }
      poly.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        onSelectBuilding(b, e.latlng.lat, e.latlng.lng, poly);
      });
      poly.addTo(layer);
      if (b.id) polyByIdRef.current[b.id] = poly;
    }

  }, [locale, onSelectBuilding]);

  const loadBuildingsInView = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !layerRef.current) return;
    const z = map.getZoom();
    if (z < 16) {
      layerRef.current.clearLayers();
      setZoomHint(true);
      setLoadingBuildings(false);
      setCoverageWarn(null);
      return;
    }
    setZoomHint(false);
    const b = map.getBounds();
    const qs = new URLSearchParams({
      west: String(b.getWest().toFixed(5)),
      south: String(b.getSouth().toFixed(5)),
      east: String(b.getEast().toFixed(5)),
      north: String(b.getNorth().toFixed(5)),
    });
    setLoadingBuildings(true);
    setBuildingsError(null);
    try {
      const res = await fetch(`/api/buildings?${qs}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.error === "BBOX_TOO_BIG") {
          layerRef.current.clearLayers();
          setBuildingsError("zoom");
        } else {
          setBuildingsError("service");
        }
        setCoverageWarn(null);
        return;
      }
      const data = await res.json();
      drawBuildings(data.buildings || []);
      // Fase 8.1: mai es presenta la vista com a completa si falten mosaics
      const cov = data.coverage;
      if (cov && cov.failed > 0) {
        setCoverageWarn(locale === "ca"
          ? `${cov.failed} de ${cov.total} zones no s'han pogut carregar: la vista NO està completa. Ampla-hi o torna-ho a provar.`
          : `${cov.failed} de ${cov.total} zonas no se pudieron cargar: la vista NO está completa. Amplía o inténtalo de nuevo.`);
      } else if (cov && cov.empty > 0) {
        setCoverageWarn(locale === "ca"
          ? `${cov.empty} de ${cov.total} zones sense edificis registrats (àrees rurals o sense dades ICGC).`
          : `${cov.empty} de ${cov.total} zonas sin edificios registrados (áreas rurales o sin datos ICGC).`);
      } else {
        setCoverageWarn(null);
      }
    } catch {
      setBuildingsError("service");
      setCoverageWarn(null);
    } finally {
      setLoadingBuildings(false);
    }
     
  }, [locale, drawBuildings]);

  const selectMunicipality = useCallback(async (mun: MunLite) => {
    setShowResults(false);
    setQuery(mun.name);
    parcelRef.current?.clearLayers?.(); // nova cerca: neteja el ressaltat de parcel·la
    const map = mapRef.current;
    if (!map) return;
    // límit municipal real (ICGC amb cau) + fit
    try {
      const res = await fetch(`/api/municipalities/${mun.code}`);
      const d = await res.json();
      if (d.boundary) {
        const L = LRef.current;
        boundaryRef.current?.clearLayers();
        const layer = L.geoJSON(d.boundary, {
          style: { color: "#0f2e21", weight: 2, fill: false, dashArray: "4 3" },
        });
        layer.addTo(boundaryRef.current);
        map.fitBounds(layer.getBounds().pad(0.05));
        // si ja tenim prou zoom, carreguem edificis immediatament
        if (map.getZoom() >= 16) loadBuildingsInView();
      } else {
        map.setView([mun.lat, mun.lng], 16);
        setTimeout(() => loadBuildingsInView(), 400);
      }
    } catch {
      map.setView([mun.lat, mun.lng], 16);
    }
  }, [loadBuildingsInView]);

  // recarrega edificis quan canvia l'idioma per refrescar colors i accés
  // recarrega edificis quan canvia l'idioma per refrescar colors i accés
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await loadBuildingsInView();
    })();
  }, [locale, loadBuildingsInView]);

  // lint v2: sincronitza la quota del context amb l'estat local mitjançant
  // l'ajust d'estat durant el render (patró React recomanat), no un efecte.
  const [syncedQuota, setSyncedQuota] = useState(auth.quota);
  if (auth.quota !== syncedQuota) {
    setSyncedQuota(auth.quota);
    setQuota(auth.quota);
  }

  // ---- Inicialització del mapa ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L;
      if (!mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current, {
        center: [41.3925, 2.1650],
        zoom: 16,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;
      L.tileLayer("https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic-gris/MON3857NW/{z}/{x}/{y}.png", {
        attribution: 'Base: <a href="https://www.icgc.cat">ICGC</a> (CC-BY 4.0) · Edificis: ICGC RTT · Dades: Incasòl / habitatge.gencat.cat',
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      boundaryRef.current = L.layerGroup().addTo(map);
      parcelRef.current = L.layerGroup().addTo(map); // ressaltat parcel·la RC

      const onMove = () => loadBuildingsInView();
      map.on("moveend", onMove);
      loadBuildingsInView();
      // v24 — deep links des del panell (/#/mapa?mun=... / ?edifici=...):
      // es consumeixen UNA vegada (es netegen de la URL per no re-aplicar-los
      // en cada visita al mapa des del menú)
      try {
        const hq = window.location.hash.split("?")[1] || "";
        const p = new URLSearchParams(hq);
        const edificiId = p.get("edifici");
        const munCode = p.get("mun");
        if (edificiId || munCode) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/mapa`);
          if (edificiId) {
            // edifici preferit/consultat: vola al centroid i reobri la consulta
            fetch(`/api/buildings/${encodeURIComponent(edificiId)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                const b0 = d?.building;
                if (!b0 || !mapRef.current) return;
                mapRef.current.flyTo([b0.lat, b0.lng], 18, { duration: 0.8 });
                // els edificis arriben amb el moveend de flyTo; re-intenta fins
                // que el polígon sigui clicable (màx ~4 s)
                const trySelect = (attempt: number) => {
                  const b = lastBuildingsRef.current.find((x: any) => x.id === edificiId);
                  const poly = polyByIdRef.current[edificiId];
                  if (b && poly) {
                    onSelectBuilding(b, b0.lat, b0.lng, poly);
                    return;
                  }
                  if (attempt < 10) setTimeout(() => trySelect(attempt + 1), 400);
                };
                setTimeout(() => trySelect(0), 900);
              })
              .catch(() => {});
          } else if (munCode) {
            // municipi preferit/consultat: mateixa UX que cercar-lo i clicar-lo
            fetch(`/api/municipalities/${encodeURIComponent(munCode)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                const m = d?.municipality;
                if (!m) return;
                selectMunicipality({
                  code: m.code,
                  name: m.name,
                  comarca: m.comarca,
                  lat: m.lat,
                  lng: m.lng,
                  rentLatest: m.rentLatest,
                  rentPeriod: m.rentPeriod,
                  comarcaRefLatest: m.comarcaRefLatest,
                  rentSource: m.rentSource,
                  isTense: m.isTense,
                  tenseList: m.tenseList,
                });
              })
              .catch(() => {});
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
     
  }, []);


  // ---- Cercador: municipis + adreces (ICGC) + refcat (BD) ----
  // lint v2: l'esborrat immediat amb consultes curtes es fa com a ajust
  // d'estat durant el render (patró React); l'efecte només debança la cerca.
  if (query.trim().length < 2 && (results.length > 0 || addresses.length > 0)) {
    setResults([]);
    setAddresses([]);
  }
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(async () => {
      // 1) municipis (BD local, instantani)
      try {
        const res = await fetch(`/api/municipalities?q=${encodeURIComponent(q)}&limit=8`);
        const d = await res.json();
        setResults(d.municipalities || []);
      } catch {
        setResults([]);
      }
      // 2) refcat: si sembla una referència catastral, cerca'l a la BD d'edificis
      if (looksLikeRefcat(q)) {
        try {
          const res = await fetch(`/api/lookup-refcat?rc=${encodeURIComponent(q.replace(/\s+/g, "").toUpperCase())}`);
          const d = await res.json();
          if (d.result) {
            setAddresses([{
              label: `Ref. catastral ${d.result.refcat}${d.result.nom ? " · " + d.result.nom : ""}`,
              lat: d.result.lat,
              lng: d.result.lng,
              municipalityCode: d.result.municipalityCode,
              municipalityName: null,
              comarca: null,
              postalCode: null,
              portal: null,
              street: d.result.nom || null,
            }]);
            setShowResults(true);
            return;
          }
        } catch {}
      }
      // 3) adreces (Geocodificador ICGC via proxy)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const d = await res.json();
        setAddresses(d.results || []);
      } catch {
        setAddresses([]);
      }
      setShowResults(true);
    }, 260);
    return () => clearTimeout(id);
  }, [query]);


  const selectAddress = useCallback((a: AddressResult) => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    setShowResults(false);
    setQuery(a.label);
    boundaryRef.current?.clearLayers();
    parcelRef.current?.clearLayers?.(); // nova cerca: neteja el ressaltat de parcel·la
    map.flyTo([a.lat, a.lng], 18, { duration: 0.8 });
    setTimeout(() => loadBuildingsInView(), 900);
  }, [loadBuildingsInView]);

  // ---- Buscador per referència catastral (2026-11-11) ----
  const clearParcel = useCallback(() => {
    parcelRef.current?.clearLayers?.();
    setRcResult(null);
  }, []);

  /** Cerca una RC: localitza (ICGC/BD), ressalta la parcel·la i obre la fitxa. */
  const searchRefcat = useCallback(async () => {
    const rc = rcInput.replace(/\s+/g, "").toUpperCase();
    if (!looksLikeRefcat(rc)) {
      setRcError(t.map.rc.badFormat);
      return;
    }
    setRcBusy(true);
    setRcError(null);
    try {
      const res = await fetch(`/api/lookup-refcat?rc=${encodeURIComponent(rc)}`);
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.result) {
        setRcResult(null);
        setRcError(t.map.rc.notFound);
        return;
      }
      const r = d.result as RcResult;
      setRcResult(r);
      const L = LRef.current;
      const map = mapRef.current;
      if (L && map) {
        parcelRef.current?.clearLayers?.();
        if (Array.isArray(r.ring) && r.ring.length >= 3) {
          L.polygon(r.ring.map((p: number[]) => [p[1], p[0]]), {
            color: "#e8673c",
            weight: 3,
            dashArray: "6 4",
            fillOpacity: 0.12,
          }).addTo(parcelRef.current);
        }
        map.flyTo([r.lat, r.lng], 18, { duration: 0.8 });
        setTimeout(() => loadBuildingsInView(), 900);
        // si la parcel·la coincideix amb un edifici conegut del mapa → fitxa
        // completa d'edifici; si no → fitxa del municipi al punt de la parcel·la
        const bm = lastBuildingsRef.current.find(
          (x: any) => x.refcat && String(x.refcat).startsWith(rc.slice(0, 14))
        );
        const poly = bm?.id ? polyByIdRef.current[bm.id] : null;
        if (bm && poly) {
          setTimeout(() => onSelectBuilding(bm, r.lat, r.lng, poly), 950);
        } else {
          lastClickRef.current = { b: null, lat: r.lat, lng: r.lng, poly: null };
          setTimeout(() => runLookup(null, r.lat, r.lng), 950);
        }
      }
    } catch {
      setRcError(locale === "ca" ? "Error de xarxa. Torna-ho a provar." : "Error de red. Inténtalo de nuevo.");
    } finally {
      setRcBusy(false);
    }
  }, [rcInput, t, locale, loadBuildingsInView, onSelectBuilding, runLookup]);

  const doCheckout = async (plan: "PREMIUM" | "PRO") => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = await res.json();
      if (d.ok && d.mode === "STRIPE" && d.url) {
        window.location.href = d.url;
      } else if (d.ok && d.mode === "DEMO") {
        setDemoNotice(d.message || "Demo");
        setPanelState("full");
        await auth.refresh();
      } else {
        setDemoNotice(d.message || d.error || "Error");
      }
    } catch {
      setDemoNotice(locale === "ca" ? "Error de xarxa" : "Error de red");
    }
  };

  const toggleFavorite = async () => {
    const mun = lookup?.municipality;
    const bId = lookup?.building?.id;
    if (!mun) return;
    setFavState("idle");
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: bId || null,
          municipalityCode: bId ? null : mun.code,
          label: bId ? lookup?.building?.nom || lookup?.building?.refcat || mun.name : mun.name,
        }),
      });
      if (res.status === 403) {
        setFavState("plan");
      } else if (res.ok) {
        setFavState("saved");
      } else {
        setFavState("error");
      }
    } catch {
      setFavState("error");
    }
  };

  const downloadPdf = () => {
    const mun = lookup?.municipality;
    const bId = lookup?.building?.id;
    if (!mun) return;
    setPdfMsg(null);
    setPdfLocked(false);
    const qs = bId ? `building=${bId}` : `mun=${mun.code}`;
    fetch(`/api/reports/pdf?${qs}`).then(async (res) => {
      // Fix 2026-11-11 — 401 (sessió caducada) i 403 EMAIL_NOT_VERIFIED tenien
      // el missatge genèric «No s'ha pogut generar», que semblava un error de
      // sistema; ara cadascun diu la causa real amb el seu CTA.
      if (res.status === 401) {
        setPdfMsg(locale === "ca"
          ? "La teva sessió ha caducat: torna a iniciar-la."
          : "Tu sesión ha caducado: vuelve a iniciarla.");
        setPdfLocked(true);
        return;
      }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d?.error === "EMAIL_NOT_VERIFIED") {
          setPdfMsg(locale === "ca"
            ? "Verifica el teu correu per descarregar l'informe."
            : "Verifica tu correo para descargar el informe.");
          return;
        }
        setPdfLocked(true); // Fase 5 — el missatge inclou CTA als plans
        setPdfMsg(d.plan === "PRO"
          ? (locale === "ca" ? "L'informe d'edifici requereix el pla Pro · agents (19,99 €/mes)." : "El informe de edificio requiere el plan Pro · agentes (19,99 €/mes).")
          : (locale === "ca" ? "L'informe PDF requereix el pla Premium (7,99 €/mes)." : "El informe PDF requiere el plan Premium (7,99 €/mes)."));
        return;
      }
      if (res.status === 404) {
        setPdfMsg(locale === "ca"
          ? "No trobem les dades d'aquest municipi/edifici per a l'informe."
          : "No encontramos los datos de este municipio/edificio para el informe.");
        return;
      }
      if (res.status === 429) {
        setPdfMsg(locale === "ca" ? "Massa descàrregues; espera un moment." : "Demasiadas descargas; espera un momento.");
        return;
      }
      // Fase 6 — quota pròpia d'informes PDF/mes (402 QUOTA_EXCEEDED)
      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        setPdfLocked(true);
        const lim = d?.quota?.limit ?? 5;
        setPdfMsg(locale === "ca"
          ? `Has exhaurit els ${lim} informes PDF d'aquest mes del teu pla. El comptador es reinicia l'1 del mes vinent.`
          : `Has agotado los ${lim} informes PDF de este mes de tu plan. El contador se reinicia el día 1 del próximo mes.`);
        return;
      }
      if (!res.ok) {
        // Fix 2026-11-11 — inclou el codi HTTP: qualsevol 5xx nou es pot
        // diagnosticar directament des d'una captura de l'usuari.
        setPdfMsg(locale === "ca" ? `No s'ha pogut generar l'informe (error ${res.status}).` : `No se pudo generar el informe (error ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Fix 2026-11-11 — abans `download=""` i alguns navegadors guardaven el
      // fitxer com a «download» sense extensió .pdf (semblava «no descarrega
      // res»). Ara el nom ve del Content-Disposition del servidor.
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `preureal_informe_${mun.name || mun.code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // v38.2 — onboarding: pas 3 (informe descarregat)
      markStep("informe");
    }).catch(() => setPdfMsg(locale === "ca" ? "Error de xarxa" : "Error de red"));
  };

  // Fase 5 — exportació CSV de dades del municipi (feature distintiva del pla
  // Pro · agents, ja existent al servidor: GET /api/export/[code]). Fins ara no
  // tenia cap botó a la UI: els subscriptors Pro no podien fer-la servir.
  const downloadCsv = () => {
    const mun = lookup?.municipality;
    if (!mun) return;
    setCsvMsg(null);
    setCsvLocked(false);
    fetch(`/api/export/${mun.code}`).then(async (res) => {
      // Fix 2026-11-11 — mateix tractament de 401 / email sense verificar que
      // el PDF: causa real en comptes del missatge genèric.
      if (res.status === 401) {
        setCsvMsg(locale === "ca"
          ? "La teva sessió ha caducat: torna a iniciar-la."
          : "Tu sesión ha caducado: vuelve a iniciarla.");
        setCsvLocked(true);
        return;
      }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d?.error === "EMAIL_NOT_VERIFIED") {
          setCsvMsg(locale === "ca"
            ? "Verifica el teu correu per exportar les dades."
            : "Verifica tu correo para exportar los datos.");
          return;
        }
        setCsvLocked(true);
        setCsvMsg(locale === "ca"
          ? "L'exportació CSV és del pla Pro · agents (19,99 €/mes)."
          : "La exportación CSV es del plan Pro · agentes (19,99 €/mes).");
        return;
      }
      if (res.status === 429) {
        setCsvMsg(locale === "ca" ? "Massa descàrregues; espera un moment." : "Demasiadas descargas; espera un momento.");
        return;
      }
      if (!res.ok) {
        setCsvMsg(locale === "ca" ? `No s'ha pogut generar el CSV (error ${res.status}).` : `No se pudo generar el CSV (error ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `preureal_${mun.name || mun.code}_lloguer.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }).catch(() => setCsvMsg(locale === "ca" ? "Error de xarxa" : "Error de red"));
  };

  // v38.2 — onboarding: el pas 1 (explorar el mapa) es completa en obrir-lo
  useEffect(() => { markStep("mapa"); }, []);

  // v38.2 — bottom sheet en mòbil: la nansa es pot arrossegar cap avall per tancar
  const sheetTouchY = useRef<number | null>(null);
  const closePanel = () => {
    setPanelState("closed");
    if (selectedRef.current) {
      selectedRef.current.setStyle({ color: "#3d4a42", weight: 0.7, fillOpacity: 0.55 });
      selectedRef.current = null;
    }
  };
  const onSheetTouchStart = (e: React.TouchEvent) => { sheetTouchY.current = e.touches[0]?.clientY ?? null; };
  const onSheetTouchEnd = (e: React.TouchEvent) => {
    const y0 = sheetTouchY.current;
    sheetTouchY.current = null;
    const y1 = e.changedTouches[0]?.clientY ?? 0;
    if (y0 !== null && y1 - y0 > 80) closePanel();
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row relative md:h-[calc(100vh-4rem)] md:overflow-hidden">
      {/* v37 — tour de benvinguda (només 1a visita al mapa) */}
      <OnboardingTour navigate={navigate} />
      {/* v38.2 — checklist de primeres passes (mapa → comparador → informe) */}
      <FirstRunChecklist />
      {/* MAPA */}
      <div className="relative flex-1 min-h-[55vh] md:h-full md:min-h-[520px] md:flex-none md:basis-auto md:grow">
        <div ref={mapDivRef} className="absolute inset-0 z-0" />

        {/* Cercador + buscador per referència catastral */}
        <div className="absolute top-3 left-3 right-3 z-[500] max-w-md">
          <div className="relative z-10">
            <div className="bg-card rounded-xl shadow-lg border border-line flex items-center px-3">
              <Search className="w-4 h-4 text-stone shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => (results.length || addresses.length) && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 180)}
                placeholder={t.map.searchPlaceholder}
                className="w-full px-2 py-3 text-sm outline-none bg-transparent"
                aria-label={t.map.searchPlaceholder}
              />
              {query && (
                <button onClick={() => { setQuery(""); setAddresses([]); boundaryRef.current?.clearLayers(); }}>
                  <X className="w-4 h-4 text-stone" />
                </button>
              )}
            </div>
            {showResults && (results.length > 0 || addresses.length > 0) && (
              <div className="absolute mt-1 w-full bg-card rounded-xl shadow-xl border border-line overflow-hidden max-h-80 overflow-y-auto pr-scroll">
                {results.length > 0 && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-stone">
                    {locale === "ca" ? "Municipis" : "Municipios"}
                  </div>
                )}
                {results.map((m) => (
                  <button
                    key={`mun-${m.code}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectMunicipality(m)}
                    className="w-full text-left px-4 py-2.5 hover:bg-sand flex items-center justify-between gap-2"
                  >
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-stone flex items-center gap-1.5">
                      {m.rentLatest ? (
                        <span className="font-bold text-pine">{Math.round(m.rentLatest)} €/mes</span>
                      ) : m.comarcaRefLatest ? (
                        <span className="italic text-ambertext" title={locale === "ca" ? "Referència de comarca (estimació)" : "Referencia de comarca (estimación)"}>
                          ≈{Math.round(m.comarcaRefLatest)} €
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                      {m.isTense && <Flame className="w-3.5 h-3.5 text-ember" />}
                    </span>
                  </button>
                ))}
                {addresses.length > 0 && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-stone">
                    {locale === "ca" ? "Adreces i referències cadastrals" : "Direcciones y referencias catastrales"}
                  </div>
                )}
                {addresses.map((a, i) => (
                  <button
                    key={`addr-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectAddress(a)}
                    className="w-full text-left px-4 py-2.5 hover:bg-sand flex items-start justify-between gap-2"
                  >
                    <span className="text-sm flex items-start gap-1.5">
                      <Home className="w-3.5 h-3.5 mt-0.5 text-stone shrink-0" />
                      <span>
                        {a.label}
                        {a.postalCode && <span className="text-xs text-stone"> · CP {a.postalCode}</span>}
                      </span>
                    </span>
                    {a.municipalityCode && <span className="text-[10px] text-stone shrink-0">{a.municipalityName}</span>}
                  </button>
                ))}
                {results.length === 0 && addresses.length === 0 && (
                  <div className="px-4 py-3 text-xs text-stone">
                    {locale === "ca" ? "Cap resultat. Prova el nom d'un municipi, una adreça amb número o una referència catastral." : "Ningún resultado. Prueba el nombre de un municipio, una dirección con número o una referencia catastral."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Buscador per referència catastral (2026-11-11): encima del mapa,
              sota el cercador. Localitza qualsevol parcel·la de Catalunya
              (ICGC) i en mostra els detalls públics del Cadastre. */}
          <div className="relative z-0 mt-2">
            <div className="bg-card rounded-xl shadow-lg border border-line flex items-center px-3 gap-1.5">
              <Hash className="w-4 h-4 text-stone shrink-0" />
              <input
                value={rcInput}
                onChange={(e) => {
                  setRcInput(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 20));
                  setRcError(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && rcInput.trim().length >= 14 && !rcBusy) searchRefcat(); }}
                placeholder={t.map.rc.placeholder}
                className="w-full px-1 py-2.5 text-sm font-mono uppercase tracking-wide outline-none bg-transparent"
                aria-label={t.map.rc.placeholder}
              />
              <button
                onClick={searchRefcat}
                disabled={rcBusy || rcInput.trim().length < 14}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-bold hover:bg-pine2 disabled:opacity-40"
              >
                {rcBusy ? (
                  <span className="block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  t.map.rc.button
                )}
              </button>
            </div>
            {rcError && (
              <div className="mt-1 rounded-lg px-3 py-2 text-xs shadow border bg-embersoft border-emberline text-ember3">
                {rcError}
              </div>
            )}
            {rcResult && (
              <div className="mt-1 bg-card rounded-xl shadow-xl border border-line overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-cream border-b border-line">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-pine flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-ember" />
                    {t.map.rc.found}
                  </div>
                  <button onClick={clearParcel} aria-label={t.map.rc.clear}>
                    <X className="w-3.5 h-3.5 text-stone" />
                  </button>
                </div>
                <div className="px-3 py-2">
                  <div className="font-mono text-xs font-bold text-pine">{rcResult.refcat}</div>
                  {rcResult.details?.address && (
                    <div className="text-xs mt-1 text-pine">{rcResult.details.address}</div>
                  )}
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-stone">{t.map.rc.surface}</span>
                    <b>{rcResult.details?.surfaceM2 ? `${rcResult.details.surfaceM2} m²` : "—"}</b>
                    <span className="text-stone">{t.map.rc.year}</span>
                    <b>{rcResult.details?.yearBuilt ?? "—"}</b>
                    <span className="text-stone">{t.map.rc.uso}</span>
                    <b>{rcResult.details?.uso || "—"}</b>
                    <span className="text-stone">{t.map.rc.postal}</span>
                    <b>{rcResult.details?.postalCode || "—"}</b>
                  </div>
                  <div className="text-[10px] text-stone mt-2">{t.map.rc.fonts}</div>
                </div>
              </div>
            )}
          </div>

          {demoNotice && (
            <div className="mt-2 bg-pine text-white text-xs rounded-xl p-3 shadow-lg flex justify-between gap-2">
              <span>{demoNotice}</span>
              <button onClick={() => setDemoNotice(null)}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>

        {/* Estats */}
        <div className="absolute bottom-3 left-3 z-[500] flex flex-col gap-2 max-w-[85%]">
          {(zoomHint || buildingsError === "zoom") && (
            <div className="bg-card/95 rounded-lg px-3 py-2 text-xs shadow border border-line flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-ember" /> {t.map.zoomHint}
            </div>
          )}
          {loadingBuildings && (
            <div className="bg-card/95 rounded-lg px-3 py-2 text-xs shadow border border-line flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-ember border-t-transparent animate-spin" />
              {t.map.loadingBuildings}
            </div>
          )}
          {buildingsError === "service" && (
            <div className="bg-embersoft rounded-lg px-3 py-2 text-xs shadow border border-emberline text-ember3">
              {locale === "ca"
                ? "El servei de cartografia no està disponible ara mateix. Torna-ho a provar."
                : "El servicio de cartografía no está disponible ahora mismo. Inténtalo de nuevo."}
            </div>
          )}
          {coverageWarn && !buildingsError && (
            <div className="bg-ambersoft rounded-lg px-3 py-2 text-xs shadow border border-amberline text-ambertext flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {coverageWarn}
            </div>
          )}
        </div>

        {/* Llegenda */}
        <div className="absolute bottom-3 right-3 z-[500] bg-card/95 rounded-lg px-3 py-2 text-[10px] shadow border border-line hidden sm:block">
          <div className="font-semibold mb-1">{t.map.legend.low} → {t.map.legend.high}</div>
          <div className="flex gap-1 items-center">
            {["#63b57c", "#93c47d", "#e5c46a", "#e89a4b", "#dd5a35"].map((c) => (
              <span key={c} className="w-5 h-3 rounded-sm inline-block" style={{ background: c }} />
            ))}
          </div>
          {/* v33 — naus industrials: fora de l'escala de lloguer d'habitatges */}
          <div className="mt-1 flex items-center gap-1 text-stone">
            <span
              className="w-5 h-3 rounded-sm inline-block shrink-0"
              style={{ background: NAU_FILL, border: `1px dashed ${NAU_BORDER}` }}
            />
            {t.map.legend.industrial}
          </div>
          {/* v39 — referència de comarca (municipis sense dada oficial) */}
          <div className="mt-1 flex items-center gap-1 text-stone">
            <span
              className="w-5 h-3 rounded-sm inline-block shrink-0"
              style={{ background: "#e5c46a99", border: "1px dashed #3d4a42" }}
            />
            {t.map.legend.refComarca}
          </div>
          <div className="mt-1 flex items-center gap-1 text-stone">
            <Flame className="w-3 h-3 text-ember" /> {t.map.legend.tense}
          </div>
        </div>
      </div>

      {/* PANELL DETALL — desktop lateral, mòbil bottom sheet amb nansa i gestos */}
      {panelState !== "closed" && (
        <>
          {/* fons tappable en mòbil */}
          <div
            className="fixed inset-0 bg-black/30 z-[590] md:hidden pr-backdrop-anim"
            onClick={closePanel}
            aria-hidden="true"
          />
          <div className="md:w-[400px] md:h-full w-full max-h-[75vh] md:max-h-full bg-card border-t md:border-t-0 md:border-l border-line shadow-2xl z-[600] overflow-y-auto pr-scroll shrink-0 fixed bottom-0 left-0 right-0 md:static rounded-t-2xl md:rounded-none pr-sheet-anim">
            {/* nansa (només mòbil): clic o swipe cap avall per tancar */}
            <div
              className="md:hidden sticky top-0 z-10 pt-2.5 pb-1.5 bg-card touch-none"
              onTouchStart={onSheetTouchStart}
              onTouchEnd={onSheetTouchEnd}
            >
              <button aria-label="Tanca" onClick={closePanel} className="mx-auto block w-10 h-1.5 rounded-full bg-line" />
            </div>
          <div className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="font-extrabold text-lg leading-tight">
                {panelState === "loading" && t.common.loading}
                {lookup?.municipality?.name || "—"}
                {lookup?.municipality?.comarca && (
                  <span className="block text-xs font-normal text-stone">{lookup.municipality.comarca}</span>
                )}
              </h2>
              <button onClick={closePanel} className="p-1.5 rounded-lg hover:bg-sand">
                <X className="w-5 h-5" />
              </button>
            </div>

            {panelState === "loading" && (
              <div className="space-y-3 py-2" aria-busy="true" role="status">
                {/* v38.2 — skeletons en lloc de spinner: es veu l'estructura que arribarà */}
                <div className="pr-skeleton h-7 w-2/3" />
                <div className="pr-skeleton h-16 w-full" />
                <div className="pr-skeleton h-24 w-full" />
                <div className="pr-skeleton h-10 w-full" />
                <div className="pr-skeleton h-10 w-5/6" />
              </div>
            )}

            {/* TEASER (sense sessió) */}
            {panelState === "teaser" && (
              <div className="space-y-4">
                {lookup?.municipality?.isTense && (
                  <TenseBadge note={t.tense.badgeEsNote} />
                )}
                {/* v33 — nau industrial clicada: l'avís també enregistrat sense sessió */}
                {clickedNau && <IndustrialBadge t={t} />}
                <div className="rounded-xl border border-line bg-cream p-4">
                  <div className="text-xs font-semibold text-stone uppercase tracking-wide">{t.map.panel.avgRent}</div>
                  <div className="mt-2 select-none blur-[7px] text-4xl font-black text-pine">1.134 €</div>
                  <div className="mt-1 text-xs text-stone">Incasòl · {lookup?.teaser?.period ?? ""}</div>
                </div>
                <div className="rounded-xl bg-pine text-white p-4">
                  <div className="font-bold">{t.map.teaser.title}</div>
                  <p className="text-sm mt-1 opacity-90 leading-relaxed">{t.map.teaser.desc}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button onClick={() => navigate("/registre")} className="w-full py-2.5 rounded-lg bg-ember font-bold text-sm hover:bg-ember2">
                      {t.map.teaser.cta}
                    </button>
                    <button onClick={() => navigate("/entrada")} className="w-full py-2 rounded-lg border border-white/30 text-sm hover:bg-card/10">
                      {t.map.teaser.login}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PAYWALL (quota exhaurida) */}
            {panelState === "paywall" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-embersoft border border-emberline p-4 text-center">
                  <Building2 className="w-8 h-8 text-ember3 mx-auto" />
                  <div className="font-bold mt-2 text-ember3">{t.map.paywall.title}</div>
                  <p className="text-sm mt-1 text-moss">{t.map.paywall.desc}</p>
                </div>
                <button onClick={() => navigate("/preus")} className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2">
                  {t.map.paywall.cta}
                </button>
              </div>
            )}

            {/* VERIFICACIÓ DE CORREU (Fase 1: bloqueig fins verificar) */}
            {panelState === "verificacio" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-embersoft border border-emberline p-4 text-center">
                  <MailCheck className="w-8 h-8 text-ember3 mx-auto" />
                  <div className="font-bold mt-2 text-ember3">{t.map.verify.title}</div>
                  <p className="text-sm mt-1 text-moss">{t.map.verify.desc}</p>
                  {lookup?.email && <p className="text-sm mt-1 font-semibold text-pine">{lookup.email}</p>}
                  <p className="text-xs mt-2 text-ambertext2">{t.map.verify.note}</p>
                </div>
                {/* si l'usuari ja ha verificat (potser en una altra pestanya), un clic
                    torna a llançar la MATEIXA consulta i desbloqueja el panell */}
                <button
                  onClick={() => {
                    const q = lastClickRef.current;
                    if (q) onSelectBuilding(q.b, q.lat, q.lng, q.poly);
                  }}
                  className="w-full py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2 transition-colors"
                >
                  {t.map.verify.recheck}
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/auth/verify", { method: "POST" });
                    if (res.ok) setVerifySent(true);
                    else navigate("/revisa-correu");
                  }}
                  disabled={verifySent}
                  className="w-full py-3 rounded-xl border border-line bg-card font-semibold text-pine hover:bg-cream transition-colors disabled:opacity-50"
                >
                  {verifySent ? t.map.verify.sent : t.map.verify.resend}
                </button>
                <button onClick={() => navigate("/panell")} className="w-full py-3 rounded-xl bg-pine text-white font-bold hover:bg-pine2">
                  {t.map.verify.goToPanel}
                </button>
              </div>
            )}

            {/* FULL */}
            {panelState === "full" && lookup?.municipality && (
              <FullPanel
                lookup={lookup}
                quota={quota}
                t={t}
                navigate={navigate}
                doCheckout={doCheckout}
                toggleFavorite={toggleFavorite}
                favState={favState}
                downloadPdf={downloadPdf}
                pdfMsg={pdfMsg}
                pdfLocked={pdfLocked}
                downloadCsv={downloadCsv}
                csvMsg={csvMsg}
                csvLocked={csvLocked}
              />
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}

function TenseBadge({ note }: { note: string }) {
  const { t } = useApp();
  return (
    <div className="rounded-xl bg-embersoft border border-emberline px-3 py-2.5 flex items-start gap-2">
      <Flame className="w-4 h-4 text-ember3 mt-0.5 shrink-0" />
      <div>
        <div className="text-sm font-bold text-ember3">{t.tense.badgeFull}</div>
        <div className="text-xs text-ember3/80">{note}</div>
      </div>
    </div>
  );
}

// v33 — avís prominent quan l'edifici clicat és una nau industrial: els preus
// de la fitxa són d'habitatges (fiances Incasòl) i NO cobreixen naus.
function IndustrialBadge({ t }: { t: any }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 flex items-start gap-2"
      style={{ background: "#efeafb", border: "1px solid #cabfe6" }}
      role="note"
    >
      <Factory className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#5d5480" }} />
      <div>
        <div className="text-sm font-bold" style={{ color: "#5d5480" }}>
          {t.map.panel.industrialBadge}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "#5d5480" }}>
          {t.map.panel.industrialNote}
        </div>
      </div>
    </div>
  );
}

function FullPanel({
  lookup, quota, t, navigate, doCheckout, toggleFavorite, favState, downloadPdf, pdfMsg, pdfLocked, downloadCsv, csvMsg, csvLocked,
}: {
  lookup: LookupResult;
  quota: { used: number; limit: number } | null;
  t: any;
  navigate: (r: string) => void;
  doCheckout: (p: "PREMIUM" | "PRO") => void;
  toggleFavorite: () => void;
  favState: "idle" | "saved" | "error" | "plan";
  downloadPdf: () => void;
  pdfMsg: string | null;
  pdfLocked: boolean;
  downloadCsv: () => void;
  csvMsg: string | null;
  csvLocked: boolean;
}) {
  const { locale, auth } = useApp();
  const mun = lookup.municipality!;
  const [yourRent, setYourRent] = useState("");
  const [yourM2, setYourM2] = useState("");
  const [contractType, setContractType] = useState("HABITATGE");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // v38.6 — dades de la comunitat (agregat públic /api/reports/summary): els
  // informes ciutadans ara es mostren com a mediana anònima (n >= 3) i el
  // botó «Comparteix el preu» té un efecte visible real per a l'usuari.
  const [community, setCommunity] = useState<{ code: string; n: number; median: number | null; medianEurM2: number | null } | null>(null);
  const loadCommunity = useCallback(() => {
    fetch(`/api/reports/summary?mun=${encodeURIComponent(mun.code)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setCommunity({ code: mun.code, n: Number(d?.n) || 0, median: d?.median ?? null, medianEurM2: d?.medianEurM2 ?? null }))
      .catch(() => setCommunity({ code: mun.code, n: 0, median: null, medianEurM2: null }));
  }, [mun.code]);
  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  // Fix 2026-11-11 — «Històric del municipi» sempre visible:
  //  a) les barres col·lapsaven (height en % dins d'una columna d'alçada
  //     automàtica no es resol: totes quedaven a min-h 3px) → ara alçada en px.
  //  b) el bloc desapareixia en silenci amb <2 punts → ara amb 1 punt es mostra,
  //     sense sèrie però amb variació interanual es mostren els 2 punts reals
  //     (anterior vs vigent) i sense cap dada s'ho diu clar (mai s'inventa).
  //  c) v39 — municipis sense sèrie municipal (255): sèrie de REFERÈNCIA DE
  //     COMARCA (comarcaRefHistory), sempre etiquetada com a estimació.
  const histPts: Array<[string, number]> = mun.rentHistory
    ? Object.entries(mun.rentHistory)
        .filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
    : [];
  const refPts: Array<[string, number]> = !mun.rentHistory && mun.comarcaRefHistory
    ? Object.entries(mun.comarcaRefHistory)
        .filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
    : [];
  const histShow: Array<[string, number]> =
    histPts.length > 0
      ? histPts.slice(-8)
      : refPts.length > 0
        ? refPts.slice(-8)
        : mun.rentPrevYear && mun.rentLatest
          ? [
              [mun.rentPrevPeriod || "—", Number(mun.rentPrevYear)],
              [mun.rentPeriod || "—", Number(mun.rentLatest)],
            ]
          : [];
  const maxVal = Math.max(...histShow.map(([, v]) => Number(v)), 1);
  const histPairFallback = histPts.length === 0 && histShow.length > 0;
  const histRefFallback = histPts.length === 0 && refPts.length > 0;

  const trend =
    mun.rentLatest && mun.rentPrevYear
      ? ((mun.rentLatest - mun.rentPrevYear) / mun.rentPrevYear) * 100
      : null;

  const yourRentNum = parseFloat(yourRent);
  const rentOk = isFinite(yourRentNum) && yourRentNum > 0;
  // v38.6 — base de comparació: renda municipal vigent; si el municipi no té
  // sèrie publicada (255 casos), referència de comarca (mateixa base que la fitxa).
  const baseRent = mun.rentLatest ?? mun.comarcaRefLatest ?? null;
  const baseIsRef = !mun.rentLatest && mun.comarcaRefLatest != null;
  const delta = rentOk && baseRent ? ((yourRentNum - baseRent) / baseRent) * 100 : null;

  const submitReport = async () => {
    setReportError(null);
    if (!rentOk) {
      setReportError(t.map.panel.reportNeedRent);
      return;
    }
    // Fase 10 (E1): només s'informa d'èxit quan el servidor ho confirma
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipalityCode: mun.code,
          buildingId: lookup.building?.id || null,
          offerEurMonth: yourRentNum || undefined,
          surfaceM2: parseFloat(yourM2) || undefined,
          contractType,
        }),
      });
      if (res.status === 409) {
        setReportError(locale === "ca"
          ? "Ja has enviat un informe igual en les últimes 24 hores."
          : "Ya has enviado un informe igual en las últimas 24 horas.");
        return;
      }
      if (!res.ok) {
        setReportError(locale === "ca" ? "No s'ha pogut enviar. Torna-ho a provar." : "No se pudo enviar. Inténtalo de nuevo.");
        return;
      }
      setReportSent(true);
      setReportOpen(false);
      loadCommunity(); // v38.6: la contribució és visible al bloc de la comunitat
    } catch {
      setReportError(locale === "ca" ? "Error de xarxa. Torna-ho a provar." : "Error de red. Inténtalo de nuevo.");
    }
  };

  const bAvg = lookup.building?.avgRentEurMonth;
  const bSamples = lookup.building?.sampleSize;
  // v33 — edifici industrial (nau): la fitxa ho indica i reetiqueta el preu
  const isNau = lookup.building?.tipus === "ind";

  // v38.6 — comparació ajustada per superfície: mateix model que la valoració
  // v2 (constants documentades a src/lib/territorial.ts): renda(m²) = base ×
  // (m²/85)^0,8 sobre l'habitatge típic ≈85 m². Per a naus NO s'aplica (la
  // base oficial és d'habitatges).
  const m2Num = parseFloat(yourM2);
  const hasM2 = isFinite(m2Num) && m2Num >= 10 && m2Num <= 1000;
  const expectedRent =
    !isNau && hasM2 && baseRent !== null && baseRent > 0
      ? baseRent * Math.pow(Math.min(Math.max(m2Num, 20), 400) / VAL_REF_M2, VAL_BETA_SUPERFICIE)
      : null;
  const deltaExpected = expectedRent !== null && rentOk ? ((yourRentNum - expectedRent) / expectedRent) * 100 : null;
  const headDelta = deltaExpected ?? delta;
  const tip =
    headDelta !== null && rentOk
      ? headDelta > 15
        ? t.map.panel.tipAbove + (mun.isTense ? t.map.panel.tipAboveTense : "")
        : headDelta < -15
          ? t.map.panel.tipBelow
          : null
      : null;

  // Fix 2026-11-11 — affordància de pla als botons PDF/CSV: el pla efectiu el
  // sap el client (auth.user.plan); si la feature no és inclosa es mostra un
  // candau ABANS de clicar. El clic segueix actiu i el servidor revalida.
  const plan = auth.user?.plan ?? "FREE";
  // CSV: només Pro · agents (features.exportCsv).
  const csvNeedsPro = plan !== "PRO";
  // PDF: municipi amb Premium ja n'hi ha; l'informe D'EDIFICI requereix Pro
  // (features.pdfEdifici). Sense sessió (plan FREE per defecte) → candau.
  const pdfNeedsProHere = plan === "FREE" || (plan === "PREMIUM" && Boolean(lookup.building?.id));

  return (
    <div className="space-y-4">
      {mun.isTense && <TenseBadge note={t.tense.badgeEsNote} />}
      {isNau && <IndustrialBadge t={t} />}

      {/* PREU MITJÀ REAL */}
      <div className="rounded-xl border border-line bg-cream p-4">
        <div className="text-xs font-semibold text-stone uppercase tracking-wide">
          {isNau ? t.map.panel.avgRentHousing : t.map.panel.avgRent}
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-4xl font-black text-pine">
            {mun.rentLatest
              ? `${mun.rentLatest.toFixed(0)} €`
              : mun.comarcaRefLatest
                ? `≈ ${mun.comarcaRefLatest.toFixed(0)} €`
                : "—"}
          </span>
          <span className="text-sm text-stone mb-1">{t.map.panel.perMonth}</span>
          {!mun.rentLatest && mun.comarcaRefLatest ? (
            <span className="mb-1.5 ml-auto text-[10px] font-bold px-2 py-1 rounded-md bg-ambersoft2 text-ambertext italic">
              {t.map.panel.refComarcaLabel}
            </span>
          ) : null}
          {trend !== null && (
            <span className={`mb-1.5 ml-auto text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 ${
              trend > 0 ? "bg-embersoft text-ember3" : trend < 0 ? "bg-mintsoft text-green2" : "bg-sand"
            }`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
          )}
        </div>
        {mun.rentLatest === null && mun.comarcaRefLatest != null && (
          <div className="mt-2 text-xs text-ambertext leading-snug">
            {t.map.panel.refComarcaNote}
          </div>
        )}
        {mun.rentLatest === null && mun.comarcaRefLatest == null && (
          <div className="mt-2 text-xs text-ember3">
            {locale === "ca" ? "Aquest municipi no té lloguer registrat al període actual (sense dades oficials; no s'inventa cap xifra)." : "Este municipio no tiene alquiler registrado en el período actual (sin datos oficiales; no se inventa ninguna cifra)."}
          </div>
        )}
        <div className="mt-2 text-xs text-stone space-y-0.5">
          <div>{t.map.panel.period}: <b>{mun.rentPeriod || mun.comarcaRefPeriod || "—"}</b></div>
          {mun.contractsLatest !== null && (
            <div>{t.map.panel.contracts}: <b>{mun.contractsLatest.toLocaleString(locale === "ca" ? "ca-ES" : "es-ES")}</b></div>
          )}
          <div className="flex items-center gap-1">
            {t.map.panel.source}
            <ExternalLink className="w-3 h-3" />
          </div>
          {/* v37 — pàgina pública indexable del municipi (SEO + compartir) */}
          {mun.slug && (
            <div>
              <a href={`/lloguer/${mun.slug}`} target="_blank" rel="noreferrer" className="text-pine underline flex items-center gap-1">
                {locale === "ca" ? "Pàgina pública del municipi" : "Página pública del municipio"}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* EDIFICI */}
      {(lookup.building?.yearBuilt || lookup.building?.refcat || bAvg) && (
        <div className="rounded-xl border border-line p-4">
          <div className="text-xs font-semibold text-stone uppercase tracking-wide mb-2">
            {locale === "ca" ? "Edifici" : "Edificio"}
          </div>
          {isNau && (
            <div className="flex justify-between text-sm py-1">
              <span className="text-stone">{locale === "ca" ? "Tipus" : "Tipo"}</span>
              <b className="flex items-center gap-1.5" style={{ color: "#5d5480" }}>
                <Factory className="w-3.5 h-3.5" />
                {locale === "ca" ? "Nau industrial" : "Nave industrial"}
              </b>
            </div>
          )}
          <div className="flex justify-between text-sm py-1">
            <span className="text-stone">{t.map.panel.yearBuilt}</span>
            <b>
              {lookup.building?.yearBuilt
                ? `${lookup.building.yearBuilt.year} (${lookup.building.yearBuilt.source === "CADASTRE_DNP" ? "Cadastre" : lookup.building.yearBuilt.source})`
                : locale === "ca" ? "No disponible" : "No disponible"}
            </b>
          </div>
          {lookup.building?.refcat && (
            <div className="flex justify-between text-sm py-1">
              <span className="text-stone">{t.map.panel.refcat}</span>
              <b className="font-mono text-xs">{lookup.building.refcat}</b>
            </div>
          )}
          {/* Fase 9: dada a nivell d'edifici SI EXISTEIX importació; si no, es diu clar */}
          <div className="flex justify-between text-sm py-1">
            <span className="text-stone">{locale === "ca" ? "Preu real de l'illa" : "Precio real de la manzana"}</span>
            <b>
              {bAvg
                ? `${bAvg.toFixed(0)} €/mes (${bSamples ?? "?"} ${locale === "ca" ? "mostres" : "muestras"})`
                : locale === "ca" ? "No disponible" : "No disponible"}
            </b>
          </div>
        </div>
      )}

      {/* Fase 4 — bloc «Referència oficial i context» (INE + mercat registrat) */}
      <IndicadorsOficials muniCode={mun.code} muniName={mun.name} price={isFinite(yourRentNum) && yourRentNum > 0 ? yourRentNum : null} />

      {/* Noves funcionalitats (F4) — valoració orientativa de lloguer (Premium/Pro) */}
      <ValuationPanel muniCode={mun.code} muniName={mun.name} />

      {/* COMPARADOR + ACCIONS */}
      <div className="rounded-xl border-2 border-pine p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-pine">{t.map.panel.compare}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFavorite}
              title={locale === "ca" ? "Desa als preferits (Premium)" : "Guarda en favoritos (Premium)"}
              className={`p-1.5 rounded-lg hover:bg-sand ${favState === "saved" ? "text-ember" : "text-stone"}`}
            >
              <Star className={`w-4 h-4 ${favState === "saved" ? "fill-ember" : ""}`} />
            </button>
            <button
              onClick={downloadPdf}
              title={locale === "ca"
                ? (pdfNeedsProHere ? "Descarrega l'informe PDF d'edifici (Pro · agents)" : "Descarrega l'informe PDF (Premium)")
                : (pdfNeedsProHere ? "Descarga el informe PDF de edificio (Pro · agentes)" : "Descarga el informe PDF (Premium)")}
              className={`relative p-1.5 rounded-lg hover:bg-sand ${pdfNeedsProHere ? "text-ambertext" : "text-stone"}`}
            >
              <FileDown className="w-4 h-4" />
              {/* Fix 2026-11-11 — affordància: si el pla actual no inclou aquest
                  informe, es veu un candau ABANS de clicar (abans només apareixia
                  el missatge després, i semblava que «no funcionava»). */}
              {pdfNeedsProHere && (
                <Lock className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 fill-cream text-ambertext" />
              )}
            </button>
            {/* Fase 5 — exportació CSV (Pro · agents) ara visible a la fitxa */}
            <button
              onClick={downloadCsv}
              title={locale === "ca" ? "Exporta les dades en CSV (Pro · agents)" : "Exporta los datos en CSV (Pro · agentes)"}
              className={`relative p-1.5 rounded-lg hover:bg-sand ${csvNeedsPro ? "text-ambertext" : "text-stone"}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {csvNeedsPro && (
                <Lock className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 fill-cream text-ambertext" />
              )}
            </button>
          </div>
        </div>
        {favState === "saved" && (
          <div className="mt-2 text-xs text-green2">{locale === "ca" ? "Desat als preferits." : "Guardado en favoritos."}</div>
        )}
        {favState === "plan" && (
          <div className="mt-2 text-xs text-ambertext">
            {locale === "ca" ? "Els preferits són del pla Premium." : "Los favoritos son del plan Premium."}{" "}
            <button onClick={() => navigate("/preus")} className="underline">{t.map.panel.upgrade}</button>
          </div>
        )}
        {favState === "error" && (
          <div className="mt-2 text-xs text-ember3">{locale === "ca" ? "No s'ha pogut desar ara mateix." : "No se pudo guardar ahora mismo."}</div>
        )}
        {pdfMsg && (
          <div className="mt-2 text-xs text-ambertext">
            {pdfMsg}{" "}
            {pdfLocked && (
              <button onClick={() => navigate("/preus")} className="underline font-semibold">
                {locale === "ca" ? "Veure plans" : "Ver planes"}
              </button>
            )}
          </div>
        )}
        {/* Fase 5 — exportació CSV (Pro · agents): resultat o bloqueig visible */}
        {csvMsg && (
          <div className="mt-2 text-xs text-ambertext">
            {csvMsg}{" "}
            {csvLocked && (
              <button onClick={() => navigate("/preus")} className="underline font-semibold">
                {locale === "ca" ? "Veure plans" : "Ver planes"}
              </button>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-stone">{t.map.panel.yourRent}</label>
            <input
              value={yourRent}
              onChange={(e) => setYourRent(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-ember"
              placeholder="950"
            />
          </div>
          <div>
            <label className="text-xs text-stone">{t.map.panel.yourSurface}</label>
            <input
              value={yourM2}
              onChange={(e) => setYourM2(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-ember"
              placeholder="65"
            />
          </div>
        </div>
        {/* v38.6 — resultat: amb superfície, el titular és la comparació ajustada
            per m² (la mitjana municipal correspon a l'habitatge típic ≈85 m²) */}
        {rentOk && deltaExpected !== null && expectedRent !== null && (
          <>
            <div className={`mt-3 rounded-lg p-3 text-center font-bold ${
              deltaExpected > 5 ? "bg-embersoft text-ember3" : deltaExpected < -5 ? "bg-mintsoft text-green2" : "bg-sand text-moss"
            }`}>
              {deltaExpected > 0 ? "+" : ""}{deltaExpected.toFixed(1)}%{" "}
              <span className="font-normal text-sm">
                {deltaExpected > 5 ? t.map.panel.aboveSurface : deltaExpected < -5 ? t.map.panel.belowSurface : t.map.panel.atSurface}{" "}
                ({locale === "ca" ? "renda típica" : "renta típica"} ≈{Math.round(expectedRent)} €/mes)
              </span>
            </div>
            <div className="mt-1 text-[10px] text-stone text-center">
              {t.map.panel.meanRef}: {delta !== null && delta > 0 ? "+" : ""}{delta !== null ? delta.toFixed(1) : "—"}%{" · "}
              {t.map.panel.eurM2Offer}: {(yourRentNum / m2Num).toFixed(1)} €/m²·mes
              {baseIsRef ? " · " + (locale === "ca" ? "base: ref. de comarca" : "base: ref. de comarca") : ""}
            </div>
            <div className="mt-2 text-[10px] text-stone leading-relaxed">
              {t.map.panel.approxNote}
            </div>
          </>
        )}
        {/* sense superfície: comparació amb la mitjana municipal (com abans) */}
        {rentOk && deltaExpected === null && delta !== null && (
          <>
            <div className={`mt-3 rounded-lg p-3 text-center font-bold ${
              delta > 5 ? "bg-embersoft text-ember3" : delta < -5 ? "bg-mintsoft text-green2" : "bg-sand text-moss"
            }`}>
              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%{" "}
              <span className="font-normal text-sm">
                {delta > 5 ? t.map.panel.above : delta < -5 ? t.map.panel.below : t.map.panel.atMarket}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-stone text-center">
              {isNau && (
                <div className="font-semibold" style={{ color: "#5d5480" }}>
                  {t.map.panel.industrialDeltaNote}
                </div>
              )}
              {locale === "ca" ? "Comparació amb la MITJANA municipal (dades agregades Incasòl); no és una valoració de l'immoble." : "Comparación con la MEDIA municipal (datos agregados Incasòl); no es una valoración del inmueble."}
            </div>
          </>
        )}
        {/* només superfície, sense renda: què sol costar aquest format aquí */}
        {!rentOk && expectedRent !== null && (
          <div className="mt-3 rounded-lg bg-sand text-moss p-3 text-center text-sm font-bold">
            {t.map.panel.surfaceTypicalRent}: ≈{Math.round(expectedRent)} €/mes
          </div>
        )}
        {/* v38.6 — veredicte accionable davant de desviacions grans */}
        {tip && (
          <div className="mt-2 rounded-lg border border-amberline2 bg-ambersoft2 p-2.5 text-[11px] text-amberdark leading-snug">
            {tip}
          </div>
        )}
        {/* v38.6 — dades de la comunitat: agregat públic, privadesa n >= 3 */}
        {community && community.n >= 3 && community.median !== null && (
          <div className="mt-3 rounded-lg border border-line bg-cream p-3 text-xs text-moss">
            <div className="font-semibold text-pine">{t.map.panel.communityTitle}</div>
            <div className="mt-0.5">
              {community.n} {t.map.panel.communityReports} · {locale === "ca" ? "mediana" : "mediana"} ≈{Math.round(community.median)} €/mes
              {community.medianEurM2 !== null ? ` · ≈${community.medianEurM2.toFixed(1)} €/m²·mes` : ""}
              {" · "}{t.map.panel.communityNotVerified}
            </div>
          </div>
        )}
        {community && community.n < 3 && (
          <p className="mt-3 text-[10px] text-stone">{t.map.panel.communityEmpty}</p>
        )}
        <button
          onClick={() => setReportOpen((v) => !v)}
          className="mt-3 w-full py-2 rounded-lg border border-line text-xs font-semibold hover:bg-sand flex items-center justify-center gap-1.5"
        >
          <MapPin className="w-3.5 h-3.5" />
          {reportSent ? t.map.panel.reportThanks : t.map.panel.report}
        </button>
        {reportOpen && !reportSent && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-stone leading-relaxed">{t.map.panel.reportNote}</p>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line text-sm"
              aria-label={locale === "ca" ? "Tipus de contracte" : "Tipo de contrato"}
            >
              <option value="HABITATGE">{locale === "ca" ? "Habitatge" : "Vivienda"}</option>
              <option value="HABITATGE_COMPARTIT">{locale === "ca" ? "Habitatge compartit" : "Vivienda compartida"}</option>
              <option value="LOCAL">{locale === "ca" ? "Local comercial" : "Local comercial"}</option>
              <option value="ALTRE">{locale === "ca" ? "Altres" : "Otros"}</option>
            </select>
            <button onClick={submitReport} className="w-full px-4 py-2 rounded-lg bg-pine text-white text-sm font-semibold">
              {t.map.panel.reportBtn}
            </button>
            {reportError && <div className="text-xs text-ember3">{reportError}</div>}
          </div>
        )}
      </div>

      {/* HISTÒRIC — bloc sempre visible (barres reals o missatge clar) */}
      <div className="rounded-xl border border-line p-4">
        <div className="text-xs font-semibold text-stone uppercase tracking-wide mb-3">{t.map.panel.history}</div>
        {histShow.length > 0 ? (
          <>
            <div className={`flex items-end gap-1.5 h-24 ${histRefFallback ? "opacity-80" : ""}`}>
              {histShow.map(([year, v]) => (
                <div key={year} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <div
                    className={`w-full rounded-t min-h-[3px] ${histRefFallback ? "bg-ambertext/70" : "bg-pine/85"}`}
                    style={{ height: `${Math.max(3, Math.round((Number(v) / maxVal) * 72))}px` }}
                    title={`${year}: ${Number(v).toFixed(0)} €`}
                  />
                  <span className="text-[9px] text-stone whitespace-nowrap">{year.slice(-2)}</span>
                </div>
              ))}
            </div>
            {histRefFallback && (
              <div className="text-[10px] text-ambertext mt-1.5">{t.map.panel.historyRefNote}</div>
            )}
            {histPairFallback && (
              <div className="text-[10px] text-stone mt-1.5">{t.map.panel.historyPairNote}</div>
            )}
            <div className="text-[10px] text-stone mt-2">{t.map.panel.source}</div>
          </>
        ) : (
          <div className="text-xs text-stone py-4 text-center">{t.map.panel.historyNoSeries}</div>
        )}
      </div>

      {/* QUOTA + UPGRADE */}
      {auth.user?.plan === "FREE" && quota && (
        <div className="rounded-xl bg-sand p-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <b>{quota.limit - quota.used}</b> {t.map.panel.quotaLeft}
          </div>
          <button onClick={() => navigate("/preus")} className="px-3 py-2 rounded-lg bg-ember text-white text-sm font-bold hover:bg-ember2 whitespace-nowrap">
            {t.map.panel.upgrade}
          </button>
        </div>
      )}
    </div>
  );
}
