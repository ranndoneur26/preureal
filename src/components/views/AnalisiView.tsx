"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import LineChart, { type LineSeries } from "@/components/charts/LineChart";
import { TrendingUp, TrendingDown, Minus, Plus, X, Search, BarChart3 } from "lucide-react";

/**
 * v42 — EINA «ANÀLISI DEL MERCAT RESIDENCIAL»: creuament del preu mitjà real
 * del lloguer (fiances Incasòl), de l'evolució de contractes amb fiança
 * (flux anual Incasòl) i del creixement demogràfic (Padró IDESCAT), més el
 * contrast censal 2021 i lectures descriptives NO causals. Mateix principi
 * que la resta del projecte: només dades reals, mai interpolades.
 */

interface SeriePoint {
  year: string;
  value: number;
}
interface Growth {
  pct: number | null;
  fromYear: string | null;
  toYear: string | null;
}
interface AnalisiPayload {
  ok: boolean;
  code: string;
  locale: "ca" | "es";
  muni: { code: string; name: string; comarca: string | null; province: string | null } | null;
  rent: {
    serie: SeriePoint[];
    latest: number | null;
    period: string | null;
    prevYear: number | null;
    prevPeriod: string | null;
    g5: Growth;
    g10: Growth;
    comarcaRefSerie: SeriePoint[];
    comarcaRefLatest: number | null;
    comarcaRefPeriod: string | null;
    rentSource: string | null;
  } | null;
  contracts: {
    serie: SeriePoint[];
    latest: number | null;
    latestYear: string | null;
    g5: Growth;
    seriesFromImport: boolean;
    fallbackPeriod: string | null;
  } | null;
  poblacio: {
    serie: SeriePoint[];
    latest: number | null;
    latestYear: string | null;
    g5: Growth;
    g10: Growth;
    catalunyaLatest: number | null;
    catalunyaYear: string | null;
  } | null;
  crossover: Array<{ year: string; rent: number; contracts: number; population: number | null; volumeEur: number; contractsPer1k: number | null }>;
  census: { pct: number | null; rental: number | null; total: number | null; year: string | null; catalunyaPct: number | null } | null;
  interpretacio: string[];
  sources: string[];
  generatedAt: string;
}

interface MuniHit {
  code: string;
  name: string;
  comarca: string | null;
  province: string | null;
}

const fmt0 = (n: number, loc = "ca-ES") => n.toLocaleString(loc, { maximumFractionDigits: 0 });
const fmtM = (n: number, loc = "ca-ES") => `${fmt0(n / 1_000_000, loc)} M`;

function GrowthBadge({ g }: { g: Growth }) {
  if (g.pct == null || g.fromYear == null) return null;
  const up = g.pct > 0;
  const flat = Math.abs(g.pct) < 0.05;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${flat ? "bg-sand text-stone" : up ? "bg-mintsoft text-green2" : "bg-embersoft text-ember3"}`}>
      <Icon className="w-3 h-3" />
      {`${g.pct > 0 ? "+" : ""}${g.pct.toFixed(1).replace(".", ",")}%`}
      {g.fromYear ? ` (${g.fromYear}–${g.toYear ?? ""})` : ""}
    </span>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-sand/60 px-3 py-2">
      <div className="text-[10px] font-semibold text-stone uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-black leading-tight ${accent ? "text-ember3" : "text-pine"}`}>{value}</div>
      {sub && <div className="text-[10px] text-stone">{sub}</div>}
    </div>
  );
}

const QUICK = [
  { code: "080193", name: "Barcelona" },
  { code: "081136", name: "Manresa" },
  { code: "170792", name: "Girona" },
  { code: "251207", name: "Lleida" },
  { code: "431482", name: "Tarragona" },
];

export default function AnalisiView() {
  const { locale } = useApp();
  const ca = locale === "ca";
  const loc = ca ? "ca-ES" : "es-ES";

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MuniHit[]>([]);
  const [data, setData] = useState<AnalisiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [compare, setCompare] = useState<Array<{ code: string; name: string; data: AnalisiPayload }>>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (code: string, name?: string) => {
      setLoading(true);
      setFailed(false);
      fetch(`/api/analisi/muni/${code}?lang=${locale}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: AnalisiPayload) => {
          setData(json);
          setLoading(false);
        })
        .catch(() => {
          setFailed(true);
          setLoading(false);
        });
      void name;
    },
    [locale]
  );

  // cerca de municipis amb debounce (API pública /api/municipalities)
  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (q.length < 2) {
        setHits([]);
        return;
      }
      fetch(`/api/municipalities?q=${encodeURIComponent(q)}&limit=8`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json) => setHits(Array.isArray(json?.municipalities) ? json.municipalities : []))
        .catch(() => setHits([]));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const addToCompare = useCallback((code: string, name: string) => {
    setCompare((prev) => {
      if (prev.some((p) => p.code === code) || prev.length >= 4) return prev;
      fetch(`/api/analisi/muni/${code}?lang=${locale}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: AnalisiPayload) => {
          setCompare((cur) =>
            cur.some((p) => p.code === code) || cur.length >= 4
              ? cur
              : [...cur, { code, name, data: json }].sort((a, b) => a.name.localeCompare(b.name, "ca"))
          );
        })
        .catch(() => {});
      return prev;
    });
  }, [locale]);

  const rentSeries: LineSeries[] =
    data?.rent && data.rent.serie.length > 0
      ? [
          {
            id: "rent",
            label: data.muni?.name ?? "",
            color: "#0f2e21",
            points: data.rent.serie.map((p) => ({ x: p.year, y: p.value })),
          },
          ...(data.rent.comarcaRefSerie.length > 1
            ? [
                {
                  id: "comarca",
                  label: ca ? `Ref. comarca (${data.muni?.comarca ?? ""})` : `Ref. comarca (${data.muni?.comarca ?? ""})`,
                  color: "#b9a98f",
                  dashed: true,
                  points: data.rent.comarcaRefSerie.map((p) => ({ x: p.year, y: p.value })),
                },
              ]
            : []),
        ]
      : [];

  const contractSeries: LineSeries[] =
    data?.contracts && data.contracts.serie.length > 1
      ? [{ id: "contracts", label: ca ? "Contractes amb fiança (flux anual)" : "Contratos con fianza (flujo anual)", color: "#e8673c", points: data.contracts.serie.map((p) => ({ x: p.year, y: p.value })) }]
      : [];
  const popSeries: LineSeries[] =
    data?.poblacio && data.poblacio.serie.length > 1
      ? [{ id: "pop", label: ca ? "Població (Padró)" : "Población (Padrón)", color: "#2f6f4f", points: data.poblacio.serie.map((p) => ({ x: p.year, y: p.value })) }]
      : [];
  const volumeSeries: LineSeries[] =
    data && data.crossover.length > 1
      ? [{ id: "volume", label: ca ? "Volum aproximat (mediana × 12 × contractes)" : "Volumen aproximado (mediana × 12 × contratos)", color: "#8a5a2b", points: data.crossover.map((c) => ({ x: c.year, y: c.volumeEur })) }]
      : [];

  const d = data;

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold flex items-center gap-3">
        <BarChart3 className="w-7 h-7 text-ember" />
        {ca ? "Anàlisi del mercat residencial" : "Análisis del mercado residencial"}
      </h1>
      <p className="mt-3 text-[15px] text-moss leading-relaxed max-w-3xl">
        {ca
          ? "Creuament de les tres sèries oficials del mercat: el preu mitjà real de les fiances d'Incasòl, l'evolució dels contractes amb fiança depositada i el creixement demogràfic del Padró. Més enllà de consultar un preu: volum de mercat aproximat, dinamisme per habitants i lectures descriptives de les sèries, sempre sense inventar ni interpolar cap dada."
          : "Cruce de las tres series oficiales del mercado: el precio medio real de las fianzas de Incasòl, la evolución de los contratos con fianza depositada y el crecimiento demográfico del Padrón. Más allá de consultar un precio: volumen de mercado aproximado, dinamismo por habitantes y lecturas descriptivas de las series, siempre sin inventar ni interpolar ningún dato."}
      </p>

      {/* cerca */}
      <div className="mt-6 relative">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
          <Search className="w-4 h-4 text-stone" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ca ? "Cerca un municipi (p. ex. Manresa)…" : "Busca un municipio (p. ej. Manresa)…"}
            className="flex-1 bg-transparent outline-none text-sm"
            aria-label={ca ? "Cerca municipi" : "Buscar municipio"}
          />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-card shadow-lg overflow-hidden">
            {hits.map((h) => (
              <button
                key={h.code}
                onClick={() => {
                  setQuery("");
                  setHits([]);
                  load(h.code, h.name);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-sand flex items-center justify-between"
              >
                <span className="font-semibold text-pine">{h.name}</span>
                <span className="text-xs text-stone">{h.comarca ?? ""} · {h.province ?? ""}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-[11px] text-stone self-center">{ca ? "Exemples:" : "Ejemplos:"}</span>
          {QUICK.map((q) => (
            <button key={q.code} onClick={() => load(q.code, q.name)} className="text-[11px] px-2 py-1 rounded-full bg-sand hover:bg-sand2 text-moss font-semibold">
              {q.name}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="mt-8 text-sm text-stone text-center py-8">{ca ? "Creuant sèries oficials…" : "Cruzando series oficiales…"}</div>}
      {failed && <div className="mt-8 text-sm text-stone text-center py-8">{ca ? "Anàlisi no disponible ara mateix." : "Análisis no disponible ahora mismo."}</div>}

      {!loading && d?.muni && (
        <div className="mt-6 space-y-5">
          {/* títol + KPIs */}
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold text-xl text-pine">{d.muni.name}</h2>
              <span className="text-xs text-stone">{d.muni.comarca ?? ""} · {d.muni.province ?? ""}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi
                label={ca ? "Preu mitjà (fiances)" : "Precio medio (fianzas)"}
                value={d.rent?.latest != null ? `${fmt0(d.rent.latest, loc)} €/mes` : "—"}
                sub={d.rent?.period ? `${ca ? "període" : "período"} ${d.rent.period}` : undefined}
              />
              <Kpi
                label={ca ? "Contractes/any (flux)" : "Contratos/año (flujo)"}
                value={d.contracts?.latest != null ? fmt0(d.contracts.latest, loc) : "—"}
                sub={d.contracts?.latestYear && d.contracts.latestYear !== "n.d." ? d.contracts.latestYear : undefined}
                accent
              />
              <Kpi
                label={ca ? "Població" : "Población"}
                value={d.poblacio?.latest != null ? fmt0(d.poblacio.latest, loc) : "—"}
                sub={d.poblacio?.latestYear ? `1 de gener de ${d.poblacio.latestYear}` : undefined}
              />
              <Kpi
                label={ca ? "% censal de lloguer" : "% censal de alquiler"}
                value={d.census?.pct != null ? `${d.census.pct.toFixed(2).replace(".", ",")}%` : "—"}
                sub={d.census?.year ? `Cens ${d.census.year}` : undefined}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <GrowthBadge g={d.rent?.g10 ?? { pct: null, fromYear: null, toYear: null }} />
              <GrowthBadge g={d.contracts?.g5 ?? { pct: null, fromYear: null, toYear: null }} />
              <GrowthBadge g={d.poblacio?.g10 ?? { pct: null, fromYear: null, toYear: null }} />
            </div>
            {d.contracts && !d.contracts.seriesFromImport && (
              <div className="mt-3 text-[11px] text-stone leading-relaxed">
                {ca
                  ? `La sèrie completa de contractes per any s'activarà quan la ingesta mensual (cron rental-share) porti les dades del Registre de fiances; de moment es mostra el punt únic publicat${d.contracts.fallbackPeriod ? ` (${d.contracts.fallbackPeriod})` : ""}.`
                  : `La serie completa de contratos por año se activará cuando la ingesta mensual (cron rental-share) traiga los datos del Registro de fianzas; de momento se muestra el punto único publicado${d.contracts.fallbackPeriod ? ` (${d.contracts.fallbackPeriod})` : ""}.`}
              </div>
            )}
          </div>

          {/* gràfics */}
          {rentSeries.length > 0 && (
            <div className="rounded-2xl border border-line bg-card p-5">
              <div className="text-[11px] font-bold text-pine mb-1">
                {ca ? "Preu mitjà del lloguer registrat (fiances Incasòl)" : "Precio medio del alquiler registrado (fianzas Incasòl)"}
              </div>
              <LineChart series={rentSeries} locale={locale} unitLabel="€/mes" height={200} />
            </div>
          )}
          {contractSeries.length > 0 && (
            <div className="rounded-2xl border border-line bg-card p-5">
              <div className="text-[11px] font-bold text-pine mb-1">
                {ca ? "Contractes amb fiança depositada per any (flux anual)" : "Contratos con fianza depositada por año (flujo anual)"}
                <span className="font-normal text-stone"> — {ca ? "activitat del mercat, no vivendes llogades" : "actividad del mercado, no viviendas alquiladas"}</span>
              </div>
              <LineChart series={contractSeries} locale={locale} unitLabel={ca ? "contractes" : "contratos"} height={180} />
            </div>
          )}
          {popSeries.length > 0 && (
            <div className="rounded-2xl border border-line bg-card p-5">
              <div className="text-[11px] font-bold text-pine mb-1">{ca ? "Població (Padró continu, 1 de gener)" : "Población (Padrón continuo, 1 de enero)"}</div>
              <LineChart series={popSeries} locale={locale} unitLabel={ca ? "habitants" : "habitantes"} height={180} />
            </div>
          )}
          {volumeSeries.length > 0 && (
            <div className="rounded-2xl border border-line bg-card p-5">
              <div className="text-[11px] font-bold text-pine mb-1">
                {ca ? "Volum de mercat registrat aproximat (€/any)" : "Volumen de mercado registrado aproximado (€/año)"}
                <span className="font-normal text-stone"> — {ca ? "mediana × 12 × contractes de l'any; aproximació elaborada" : "mediana × 12 × contratos del año; aproximación elaborada"}</span>
              </div>
              <LineChart series={volumeSeries} locale={locale} unitLabel="€/any" height={180} />
            </div>
          )}

          {/* lectura */}
          {d.interpretacio.length > 0 && (
            <div className="rounded-2xl border border-line bg-cream/60 p-5">
              <div className="text-[11px] font-semibold text-stone uppercase tracking-wide mb-2">
                {ca ? "Lectura creuada de les sèries" : "Lectura cruzada de las series"}
              </div>
              <ul className="space-y-1.5">
                {d.interpretacio.map((s, i) => (
                  <li key={i} className="text-sm text-moss leading-relaxed">• {s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* comparativa */}
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="text-[11px] font-bold text-pine uppercase tracking-wide">
                {ca ? "Comparativa de mercat (màx. 4 municipis)" : "Comparativa de mercado (máx. 4 municipios)"}
              </div>
              {d.muni && (
                <button
                  onClick={() => addToCompare(d.muni!.code, d.muni!.name)}
                  disabled={compare.some((p) => p.code === d.muni!.code) || compare.length >= 4}
                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-pine text-white font-bold disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" />
                  {ca ? "Afegeix" : "Añadir"} {d.muni.name}
                </button>
              )}
            </div>
            {compare.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-stone border-b border-sand">
                      <th className="py-2 pr-2">{ca ? "Indicador" : "Indicador"}</th>
                      {compare.map((c) => (
                        <th key={c.code} className="py-2 px-2 text-right">
                          <span className="inline-flex items-center gap-1">
                            {c.name}
                            <button
                              onClick={() => setCompare((cur) => cur.filter((p) => p.code !== c.code))}
                              aria-label={ca ? "Treure" : "Quitar"}
                              className="text-stone hover:text-ember"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        {
                          label: ca ? "Preu mitjà vigent (€/mes)" : "Precio medio vigente (€/mes)",
                          get: (p: AnalisiPayload) => (p.rent?.latest != null ? `${fmt0(p.rent.latest, loc)} (${p.rent.period ?? "—"})` : "—"),
                        },
                        {
                          label: ca ? "Variació del preu en 10 anys" : "Variación del precio en 10 años",
                          get: (p: AnalisiPayload) => (p.rent?.g10.pct != null ? `${p.rent.g10.pct > 0 ? "+" : ""}${p.rent.g10.pct.toFixed(1).replace(".", ",")}%` : "—"),
                        },
                        {
                          label: ca ? "Contractes amb fiança (últim any)" : "Contratos con fianza (último año)",
                          get: (p: AnalisiPayload) => (p.contracts?.latest != null ? `${fmt0(p.contracts.latest, loc)} (${p.contracts.latestYear ?? "—"})` : "—"),
                        },
                        {
                          label: ca ? "Variació de contractes en 5 anys" : "Variación de contratos en 5 años",
                          get: (p: AnalisiPayload) => (p.contracts?.g5.pct != null ? `${p.contracts.g5.pct > 0 ? "+" : ""}${p.contracts.g5.pct.toFixed(1).replace(".", ",")}%` : "—"),
                        },
                        {
                          label: ca ? "Contractes per 1.000 habitants" : "Contratos por 1.000 habitantes",
                          get: (p: AnalisiPayload) => {
                            const pt = [...p.crossover].reverse().find((c) => c.contractsPer1k != null);
                            return pt?.contractsPer1k != null ? `${pt.contractsPer1k.toFixed(2).replace(".", ",")} (${pt.year})` : "—";
                          },
                        },
                        {
                          label: ca ? "Volum aproximat (€/any)" : "Volumen aproximado (€/año)",
                          get: (p: AnalisiPayload) => {
                            const pt = p.crossover[p.crossover.length - 1];
                            return pt ? `~${fmt0(pt.volumeEur, loc)} (${pt.year})` : "—";
                          },
                        },
                        {
                          label: ca ? "Població (última)" : "Población (última)",
                          get: (p: AnalisiPayload) => (p.poblacio?.latest != null ? `${fmt0(p.poblacio.latest, loc)} (${p.poblacio.latestYear ?? "—"})` : "—"),
                        },
                        {
                          label: ca ? "Variació de població en 10 anys" : "Variación de población en 10 años",
                          get: (p: AnalisiPayload) => (p.poblacio?.g10.pct != null ? `${p.poblacio.g10.pct > 0 ? "+" : ""}${p.poblacio.g10.pct.toFixed(1).replace(".", ",")}%` : "—"),
                        },
                        {
                          label: ca ? "% de vivendes principals en lloguer (Cens 2021)" : "% viviendas principales en alquiler (Censo 2021)",
                          get: (p: AnalisiPayload) => (p.census?.pct != null ? `${p.census.pct.toFixed(2).replace(".", ",")}%` : "—"),
                        },
                      ] as Array<{ label: string; get: (p: AnalisiPayload) => string }>
                    ).map((row) => (
                      <tr key={row.label} className="border-b border-sand2 text-moss">
                        <td className="py-1.5 pr-2">{row.label}</td>
                        {compare.map((c) => (
                          <td key={c.code} className="py-1.5 px-2 text-right font-semibold text-pine">{row.get(c.data)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {compare.length === 0 && (
              <p className="text-xs text-stone">
                {ca
                  ? "Obre un municipi a dalt i prem «Afegeix» per comparar el mercat entre municipis (preu, flux de contractes, dinamisme, volum i pes censal)."
                  : "Abre un municipio arriba y pulsa «Añadir» para comparar el mercado entre municipios (precio, flujo de contratos, dinamismo, volumen y peso censal)."}
              </p>
            )}
          </div>

          {/* fonts */}
          <div className="rounded-2xl border border-line bg-sand/40 p-4">
            <div className="text-[10px] font-semibold text-stone uppercase tracking-wide mb-1">{ca ? "Fonts" : "Fuentes"}</div>
            <ul className="text-[11px] text-stone leading-relaxed space-y-0.5">
              {d.sources.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-stone leading-relaxed">
              {ca
                ? "Les lectures són descriptives de les sèries oficials i no estabeleixen cap relació causal. El volum és una aproximació elaborada per PreuReal (mediana mensual × 12 × contractes de l'any)."
                : "Las lecturas son descriptivas de las series oficiales y no establecen ninguna relación causal. El volumen es una aproximación elaborada por PreuReal (mediana mensual × 12 × contratos del año)."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
