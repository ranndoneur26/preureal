"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import LineChart, { type LineSeries } from "@/components/charts/LineChart";
import BarChart, { type BarRow } from "@/components/charts/BarChart";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * v39 — Bloc «CONTEXT DEMOGRÀFIC I TERRITORIAL» de la fitxa municipal.
 * Font: GET /api/demografia/muni/:code (IDESCAT: padró continu, censos de
 * llars, emex). Degradació elegant: sense dades → es diu clarament, mai
 * s'inventa. Estètica idèntica a la resta de la fitxa (cards border-line).
 */

interface DemoResponse {
  ok: boolean;
  code: string;
  locale: "ca" | "es";
  poblacio: {
    actual: number | null;
    anyActual: string | null;
    serie: Array<{ year: string; value: number }>;
    var5Pct: number | null;
    var10Pct: number | null;
    abs5: number | null;
    abs10: number | null;
    tendencia: "CREIXEMENT" | "ESTABLE" | "PERDUA" | null;
    homes: number | null;
    dones: number | null;
  };
  edats: {
    actual: Record<string, number> | null;
    anyActual: string | null;
    serie: Record<string, Array<{ year: string; value: number }>>;
    pct65: number | null;
    pct0_14: number | null;
  };
  llars: {
    total: number | null;
    totalAny: string | null;
    serie: Array<{ year: string; value: number }>;
    midaMitjana: number | null;
    midaAny: string | null;
    distribucioPct: Record<string, number> | null;
  };
  estrangera: {
    valor: number | null;
    pct: number | null;
    any: string | null;
    serie: Array<{ year: string; value: number }>;
    pctCatalunya: number | null;
  };
  territori: {
    superficieKm2: number | null;
    densitat: number | null;
    densitatCatalunya: number | null;
    any: string | null;
  };
  comarca: {
    poblacioActual: number | null;
    pct65: number | null;
    llarsTotal: number | null;
    densitat: number | null;
    estrangeraPct: number | null;
    comarca: string | null;
  };
  catalunya: {
    poblacioActual: number | null;
    pct65: number | null;
    llarsTotal: number | null;
    estrangeraPct: number | null;
  };
  cobertura: { poblacio: boolean; edats: boolean; llars: boolean; estrangera: boolean; territori: boolean };
  interpretacio: string[];
  generatedAt: string;
}

const fmt0 = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-sand/60 px-3 py-2">
      <div className="text-[10px] font-semibold text-stone uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-black leading-tight ${accent ? "text-ember3" : "text-pine"}`}>{value}</div>
      {sub && <div className="text-[10px] text-stone">{sub}</div>}
    </div>
  );
}

function TrendBadge({ tendencia, var10 }: { tendencia: string | null; var10: number | null }) {
  const { locale } = useApp();
  const ca = locale === "ca";
  if (!tendencia) return null;
  const cfg =
    tendencia === "CREIXEMENT"
      ? { icon: TrendingUp, cls: "bg-mintsoft text-green2", label: ca ? "Creixement" : "Crecimiento" }
      : tendencia === "PERDUA"
        ? { icon: TrendingDown, cls: "bg-embersoft text-ember3", label: ca ? "Pèrdua de població" : "Pérdida de población" }
        : { icon: Minus, cls: "bg-sand text-stone", label: ca ? "Estable" : "Estable" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
      {var10 != null ? ` ${var10 > 0 ? "+" : ""}${fmt1(var10)}%` : ""}
    </span>
  );
}

export default function DemografiaPanel({ muniCode, muniName }: { muniCode: string; muniName: string }) {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [d, setD] = useState<DemoResponse | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dead = false;
    fetch(`/api/demografia/muni/${muniCode}?lang=${locale}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (dead) return;
        setD(json as DemoResponse);
        setLoadedFor(muniCode);
      })
      .catch(() => {
        if (!dead) {
          setFailed(true);
          setLoadedFor(muniCode);
        }
      });
    return () => {
      dead = true;
    };
  }, [muniCode, locale]);

  const p = d?.poblacio;
  const pending = loadedFor !== muniCode || d?.locale !== locale;
  const hasPoblacio = Boolean(d?.cobertura.poblacio);
  const edatsRows: BarRow[] = d?.edats.actual
    ? [
        { label: ca ? "0-14 anys" : "0-14 años", value: d.edats.actual.g0_14 ?? 0, sub: `${fmt1(((d.edats.actual.g0_14 ?? 0) / Math.max(1, (p?.actual ?? 1))) * 100)}%` },
        { label: ca ? "15-64 anys" : "15-64 años", value: d.edats.actual.g15_64 ?? 0, sub: `${fmt1(((d.edats.actual.g15_64 ?? 0) / Math.max(1, (p?.actual ?? 1))) * 100)}%` },
        { label: ca ? "65-84 anys" : "65-84 años", value: d.edats.actual.g65_84 ?? 0, sub: `${fmt1(((d.edats.actual.g65_84 ?? 0) / Math.max(1, (p?.actual ?? 1))) * 100)}%` },
        { label: ca ? "85 anys i més" : "85 años y más", value: d.edats.actual.g85_mes ?? 0, sub: `${fmt1(((d.edats.actual.g85_mes ?? 0) / Math.max(1, (p?.actual ?? 1))) * 100)}%` },
      ].filter((r) => r.value > 0)
    : [];

  const llarsRows: BarRow[] = d?.llars.distribucioPct
    ? [
        { label: ca ? "1 persona" : "1 persona", value: d.llars.distribucioPct.g1, sub: `${fmt1(d.llars.distribucioPct.g1)}%` },
        { label: ca ? "2 persones" : "2 personas", value: d.llars.distribucioPct.g2, sub: `${fmt1(d.llars.distribucioPct.g2)}%` },
        { label: ca ? "3 persones" : "3 personas", value: d.llars.distribucioPct.g3, sub: `${fmt1(d.llars.distribucioPct.g3)}%` },
        { label: ca ? "4 persones" : "4 personas", value: d.llars.distribucioPct.g4, sub: `${fmt1(d.llars.distribucioPct.g4)}%` },
        { label: ca ? "5 o més" : "5 o más", value: d.llars.distribucioPct.g5, sub: `${fmt1(d.llars.distribucioPct.g5)}%` },
      ]
    : [];

  const pobSeries: LineSeries[] =
    p && p.serie.length > 1
      ? [
          {
            id: "muni",
            label: muniName,
            color: "#0f2e21",
            points: p.serie.slice(-12).map((pt) => ({ x: pt.year, y: pt.value })),
          },
        ]
      : [];

  const estrSeries: LineSeries[] =
    d?.estrangera.serie && d.estrangera.serie.length > 1
      ? [
          {
            id: "estr",
            label: ca ? "Població de nacionalitat estrangera" : "Población de nacionalidad extranjera",
            color: "#e8673c",
            points: d.estrangera.serie.slice(-12).map((pt) => ({ x: pt.year, y: pt.value })),
          },
        ]
      : [];

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-semibold text-stone uppercase tracking-wide">
          {ca ? "Contexte demogràfic i territorial" : "Contexto demográfico y territorial"}
        </div>
        {d && (
          <button onClick={() => setOpen((v) => !v)} className="text-[10px] text-stone underline hover:text-pine">
            {open ? (ca ? "Amaga el detall" : "Ocultar el detalle") : ca ? "Més detall" : "Más detalle"}
          </button>
        )}
      </div>

      {pending && !failed && <div className="text-xs text-stone py-3 text-center">{ca ? "Carregant dades demogràfiques…" : "Cargando datos demográficos…"}</div>}
      {failed && <div className="text-xs text-stone py-2">{ca ? "Dades demogràfiques no disponibles ara mateix." : "Datos demográficos no disponibles ahora mismo."}</div>}

      {!pending && d && !hasPoblacio && (
        <div className="text-xs text-stone py-3">
          {ca
            ? "Encara no hi ha indicadors demogràfics oficials importats per a aquest municipi (IDESCAT). Es mostraran quan el sistema d'actualització els porti — mai s'inventen."
            : "Todavía no hay indicadores demográficos oficiales importados para este municipio (IDESCAT). Se mostrarán cuando el sistema de actualización los traiga — nunca se inventan."}
        </div>
      )}

      {!pending && d && hasPoblacio && p && (
        <div className="space-y-4">
          {/* KPI població */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi label={ca ? "Població" : "Población"} value={p.actual != null ? fmt0(p.actual) : "—"} sub={p.anyActual ? `${ca ? "1 de gener" : "1 de enero"} ${p.anyActual}` : undefined} />
            <Kpi label={ca ? "Variació 5 anys" : "Variación 5 años"} value={p.var5Pct != null ? `${p.var5Pct > 0 ? "+" : ""}${fmt1(p.var5Pct)}%` : "—"} sub={p.abs5 != null ? `${p.abs5 > 0 ? "+" : ""}${fmt0(p.abs5)} hab.` : undefined} />
            <Kpi label={ca ? "Variació 10 anys" : "Variación 10 años"} value={p.var10Pct != null ? `${p.var10Pct > 0 ? "+" : ""}${fmt1(p.var10Pct)}%` : "—"} sub={p.abs10 != null ? `${p.abs10 > 0 ? "+" : ""}${fmt0(p.abs10)} hab.` : undefined} />
            <Kpi label={ca ? "Densitat" : "Densidad"} value={d.territori.densitat != null ? `${fmt0(d.territori.densitat)} hab/km²` : "—"} sub={d.territori.superficieKm2 != null ? `${fmt1(d.territori.superficieKm2)} km²` : undefined} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TrendBadge tendencia={p.tendencia} var10={p.var10Pct} />
            {d.edats.pct65 != null && (
              <span className="inline-flex items-center rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold text-stone">
                {ca ? `${fmt1(d.edats.pct65)}% té 65 anys o més` : `${fmt1(d.edats.pct65)}% tiene 65 años o más`}
                {d.catalunya.pct65 != null ? ` · ${ca ? "CAT" : "ESP"} ${fmt1(d.catalunya.pct65)}%` : ""}
              </span>
            )}
            {d.estrangera.pct != null && (
              <span className="inline-flex items-center rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold text-stone">
                {ca ? `Nacionalitat estrangera ${fmt1(d.estrangera.pct)}%` : `Nacionalidad extranjera ${fmt1(d.estrangera.pct)}%`}
                {d.estrangera.pctCatalunya != null ? ` · CAT ${fmt1(d.estrangera.pctCatalunya)}%` : ""}
              </span>
            )}
            {d.llars.total != null && (
              <span className="inline-flex items-center rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold text-stone">
                {ca ? `${fmt0(d.llars.total)} llars (cens ${d.llars.totalAny ?? "—"})` : `${fmt0(d.llars.total)} hogares (censo ${d.llars.totalAny ?? "—"})`}
              </span>
            )}
          </div>

          {/* Evolució població */}
          {pobSeries.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-pine mb-1">
                {ca ? "Evolució de la població" : "Evolución de la población"}
                {p.anyActual ? ` · ${ca ? "1 de gener" : "1 de enero"}` : ""}
              </div>
              <LineChart series={pobSeries} locale={locale} unitLabel={ca ? "habitants" : "habitantes"} height={170} />
            </div>
          )}

          {/* Edats */}
          {edatsRows.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-pine mb-1">
                {ca ? "Estructura per grans grups d'edat" : "Estructura por grandes grupos de edad"}
                {d.edats.anyActual && d.edats.anyActual !== "n.d." ? ` (${d.edats.anyActual})` : ""}
              </div>
              <BarChart rows={edatsRows} locale={locale} />
            </div>
          )}

          {/* Detall opcional */}
          {open && (
            <div className="space-y-4 pt-1">
              {(p.homes != null || p.dones != null) && (
                <div className="text-xs text-stone">
                  {ca ? "Distribució per sexe" : "Distribución por sexo"}:{" "}
                  <b className="text-pine">
                    {p.homes != null ? `${ca ? "homes" : "hombres"} ${fmt0(p.homes)}` : ""}
                    {p.homes != null && p.dones != null ? " · " : ""}
                    {p.dones != null ? `${ca ? "dones" : "mujeres"} ${fmt0(p.dones)}` : ""}
                  </b>
                </div>
              )}
              {llarsRows.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-pine mb-1">
                    {ca ? "Llars per grandària (cens 2021)" : "Hogares por tamaño (censo 2021)"}
                    {d.llars.midaMitjana != null ? ` · ${ca ? "grandària mitjana" : "tamaño medio"} ${fmt1(d.llars.midaMitjana)}` : ""}
                  </div>
                  <BarChart rows={llarsRows} locale={locale} />
                </div>
              )}
              {estrSeries.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-pine mb-1">
                    {ca ? "Població de nacionalitat estrangera (sèrie)" : "Población de nacionalidad extranjera (serie)"}
                  </div>
                  <LineChart series={estrSeries} locale={locale} unitLabel={ca ? "habitants" : "habitantes"} height={140} />
                </div>
              )}
              {d.comarca.comarca && (d.comarca.poblacioActual != null || d.comarca.densitat != null) && (
                <div className="text-xs text-stone">
                  {ca ? "La comarca" : "La comarca"} <b className="text-pine">{d.comarca.comarca}</b>
                  {d.comarca.poblacioActual != null ? ` · ${ca ? "població" : "población"} ${fmt0(d.comarca.poblacioActual)}` : ""}
                  {d.comarca.densitat != null ? ` · ${fmt0(d.comarca.densitat)} hab/km²` : ""}
                  {d.comarca.llarsTotal != null ? ` · ${fmt0(d.comarca.llarsTotal)} ${ca ? "llars (cens)" : "hogares (censo)"}` : ""}
                </div>
              )}
              {/* Interpretació automàtica des de les dades (sense causalitat) */}
              {d.interpretacio.length > 0 && (
                <div className="rounded-lg border border-line bg-cream/40 p-3">
                  <div className="text-[10px] font-semibold text-stone uppercase tracking-wide mb-1">
                    {ca ? "Lectura dels indicadors" : "Lectura de los indicadores"}
                  </div>
                  <ul className="space-y-1">
                    {d.interpretacio.map((s, i) => (
                      <li key={i} className="text-xs text-stone leading-relaxed">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Fonts */}
          <div className="text-[10px] text-stone leading-relaxed">
            {ca ? "Font" : "Fuente"}: IDESCAT — {ca ? "Padró continu d'habitants (INE), Censos de població i habitatges i El municipi en xifres" : "Padrón continuo de habitantes (INE), Censos de población y viviendas y El municipio en cifras"}.{" "}
            {ca ? "Percentatges i variacions: càlcul sobre categories oficials; la població estrangera és total − nacionalitat espanyola." : "Porcentajes y variaciones: cálculo sobre categorías oficiales; la población extranjera es total − nacionalidad española."}
          </div>
        </div>
      )}
    </div>
  );
}
