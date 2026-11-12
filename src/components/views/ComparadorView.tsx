"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { GitCompare, Plus, Save, X, TrendingUp, TrendingDown, Minus, Flame, Info, Crown, BarChart3, Factory, Download } from "lucide-react";
import LineChart from "@/components/charts/LineChart";

interface Entity {
  type: "MUNI" | "BUILDING";
  code: string;
  name?: string; // opcional: les comparacions desades es resolen en carregar
}

interface ComparatorIndicators {
  bandP25: number | null;
  bandP50: number | null;
  bandP75: number | null;
  bandN: number | null;
  effortHogarPct: number | null;
  effortRentaPeriod: string | null;
  rentaHogar: number | null;
  rentaHogarYear: string | null;
  ipvaCatAnual: number | null;
  ipvaCatAnualPeriod: string | null;
  ipvaCatAcum: number | null;
}

interface ComparatorResult {
  type: string;
  code: string;
  name: string;
  comarca?: string | null;
  rentLatest: number | null;
  rentPeriod: string | null;
  rentPrevYear: number | null;
  rentHistory: Record<string, number> | null;
  contractsLatest: number | null;
  comarcaRefLatest?: number | null;
  comarcaRefPeriod?: string | null;
  rentSource?: string | null;
  isTense: boolean | null;
  median: number | null;
  samples: number | null;
  vsMax: number | null;
  vsMean: number | null;
  yearBuilt?: number | null;
  // Fase 4 — només amb pla pagant (la decisió és del servidor)
  indicators?: ComparatorIndicators | null;
}

/**
 * Comparador immobiliari avançat (Fase 8).
 * Compara fins a 6 entitats (municipis o edificis amb importació), amb
 * diferències percentuals, mitjana i mediana del conjunt, i evolució temporal.
 * Les dades oficials i les declaratives es mostren sempre per separat.
 */
export default function ComparadorView() {
  const { locale, navigate, auth } = useApp();
  const ca = locale === "ca";
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Entity[]>([]);
  // lint v2: l'esborrat immediat de candidats amb consultes curtes es fa com a
  // ajust d'estat durant el render (patró React), no dins de l'efecte.
  if (query.trim().length < 2 && candidates.length > 0) {
    setCandidates([]);
  }
  const [entities, setEntities] = useState<Entity[]>([]);
  const [result, setResult] = useState<{ results: ComparatorResult[]; stats: any; advanced?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadedMsg, setLoadedMsg] = useState<string | null>(null);
  const [planLimitMsg, setPlanLimitMsg] = useState<string | null>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);

  // v25 — límit d'entitats per pla: gratuït 2, Premium i Pro (agents) 6.
  // El client el fa servir per a la UX; el límit real l'aplica sempre el servidor.
  const plan = auth.user?.plan;
  const isPaid = plan === "PREMIUM" || plan === "PRO";
  const maxEntities = isPaid ? 6 : 2;

  // v24 — enllaç des del panell (/#/comparador?id=...): carrega una comparació
  // desada i resol els noms de les entitats (el comparador només guarda tipus+codi)
  useEffect(() => {
    try {
      const hq = window.location.hash.split("?")[1] || "";
      const id = new URLSearchParams(hq).get("id");
      if (!id) return;
      (async () => {
        const res = await fetch("/api/comparisons");
        if (!res.ok) return;
        const d = await res.json();
        const c = (d.comparisons || []).find((x: any) => x.id === id);
        if (!c || !Array.isArray(c.entities) || c.entities.length < 2) return;
        const resolved: Entity[] = await Promise.all(
          c.entities.map(async (e: any) => {
            const type: "MUNI" | "BUILDING" = e?.type === "BUILDING" ? "BUILDING" : "MUNI";
            const code = String(e?.code || "");
            let name = code;
            try {
              const r = type === "MUNI"
                ? await fetch(`/api/municipalities?code=${encodeURIComponent(code)}`)
                : await fetch(`/api/buildings/${encodeURIComponent(code)}`);
              const j = await r.json();
              name = type === "MUNI" ? j?.municipalities?.[0]?.name || code : j?.building?.nom || j?.building?.refcat || code;
            } catch {}
            return { type, code, name };
          })
        );
        setEntities(resolved.filter((e) => e.code));
        setLoadedMsg(
          ca ? `Comparació «${c.name}» carregada del teu panell.` : `Comparación «${c.name}» cargada de tu panel.`
        );
      })().catch(() => {});
    } catch {}
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return; // l'esborrat es fa com a ajust d'estat al render
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/municipalities?q=${encodeURIComponent(q)}&limit=6`);
        const d = await res.json();
        setCandidates((d.municipalities || []).map((m: any) => ({ type: "MUNI" as const, code: m.code, name: m.name })));
      } catch { setCandidates([]); }
    }, 220);
    return () => clearTimeout(id);
  }, [query]);

  const addEntity = (e: Entity) => {
    if (entities.some((x) => x.code === e.code)) return;
    // Fase 5 — si el pla ja està al màxim, avís clar (no ignorar el clic en silenci)
    if (entities.length >= maxEntities) {
      setPlanLimitMsg(
        isPaid
          ? ca
            ? `Màxim ${maxEntities} municipis per comparació.`
            : `Máximo ${maxEntities} municipios por comparación.`
          : ca
            ? `Has arribat al màxim del pla gratuït (${maxEntities} municipis). Amb Premium o Pro en pots comparar 6.`
            : `Has llegado al máximo del plan gratuito (${maxEntities} municipios). Con Premium o Pro puedes comparar 6.`
      );
      return;
    }
    setEntities([...entities, e]);
    setQuery("");
    setCandidates([]);
  };

  const runCompare = useCallback(async (list: Entity[]) => {
    if (list.length < 2) return;
    setBusy(true);
    try {
      const res = await fetch("/api/comparator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: list }),
      });
      const d = await res.json();
      if (res.ok) { setResult(d); setPlanLimitMsg(null); }
      else if (d?.error === "PLAN_LIMIT" && d.max) {
        // v25 — el servidor decideix el límit: retall i avís amb upsell
        setEntities((prev) => prev.slice(0, d.max));
        setPlanLimitMsg(
          ca
            ? `El pla gratuït compara fins a ${d.max} municipis per consulta. Amb Premium o Pro en pots comparar 6.`
            : `El plan gratuito compara hasta ${d.max} municipios por consulta. Con Premium o Pro puedes comparar 6.`
        );
      }
    } catch {
      // v31: antes un fallo de red era una promesa rechazada sin mensaje
      setResult(null);
      setPlanLimitMsg(
        ca
          ? "No s'ha pogut comparar: revisa la connexió i torna-ho a provar."
          : "No se pudo comparar: revisa la conexión e inténtalo de nuevo."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // lint v2: la comparació automàtica s'arrenca en una continuació asíncrona
  // (runCompare posa estat; mai síncron dins de l'efecte)
  useEffect(() => {
    if (entities.length < 2) return;
    void (async () => {
      await Promise.resolve();
      await runCompare(entities);
    })();
  }, [entities, runCompare]);

  const saveComparison = async () => {
    if (!auth.user) { navigate("/registre"); return; }
    setSaveMsg(null);
    const res = await fetch("/api/comparisons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: saveName || `Comparació ${new Date().toLocaleDateString()}`, entities }),
    });
    if (res.status === 401) { navigate("/entrada"); return; }
    setSaveMsg(res.ok ? (ca ? "Comparació desada al teu panell." : "Comparación guardada en tu panel.") : (ca ? "No s'ha pogut desar." : "No se pudo guardar."));
  };

  // v37 — exportació CSV de la comparació vigent (servidor, pla Pro)
  const exportCsv = async () => {
    if (!auth.user) { navigate("/entrada"); return; }
    if (entities.length < 2) { setCsvMsg(ca ? "Selecciona almenys 2 entitats." : "Selecciona al menos 2 entidades."); return; }
    setCsvMsg(null);
    try {
      const res = await fetch("/api/comparator/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities }),
      });
      if (res.status === 403) {
        setCsvMsg(ca ? "L'exportació CSV és del pla Pro·Agents (19,99 €/mes)." : "La exportación CSV es del plan Pro·Agentes (19,99 €/mes).");
        return;
      }
      if (res.status === 401) { navigate("/entrada"); return; }
      if (!res.ok) { setCsvMsg(ca ? "No s'ha pogut exportar." : "No se pudo exportar."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preureal_comparacio_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setCsvMsg(ca ? "Error de xarxa." : "Error de red.");
    }
  };

  const maxRent = result?.results ? Math.max(...result.results.map((r) => r.rentLatest || r.comarcaRefLatest || 0), 1) : 1;

  // v25 — gràfica premium: ordenats del més car al més barat, % vs el més barat
  const withData = result?.results ? result.results.filter((r) => r.rentLatest != null) : [];
  const sortedByRent = [...withData].sort((a, b) => (b.rentLatest || 0) - (a.rentLatest || 0));
  const noData = result?.results ? result.results.filter((r) => r.rentLatest == null) : [];
  const ranked = [...sortedByRent, ...noData];
  const minRent = sortedByRent.length ? sortedByRent[sortedByRent.length - 1].rentLatest || 0 : 0;

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold flex items-center gap-2">
        <GitCompare className="w-7 h-7 text-[#0f2e21]" />
        {ca ? "Comparador immobiliari" : "Comparador inmobiliario"}
      </h1>
      <p className="mt-2 text-sm text-[#4b5349]">
        {ca
          ? "Compara municipis amb dades oficials reals (fiances Incasòl): fins a 2 amb el pla gratuït i fins a 6 amb Premium o Pro. Les mitjanes són agregats municipals: no descriuen immobles concrets."
          : "Compara municipios con datos oficiales reales (fianzas Incasòl): hasta 2 con el plan gratuito y hasta 6 con Premium o Pro. Las medias son agregados municipales: no describen inmuebles concretos."}
      </p>

      {/* selector */}
      <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-5">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ca ? "Afegeix un municipi (ex. Girona, Badalona…)" : "Añade un municipio (ej. Girona, Badalona…)"}
            className="w-full px-4 py-3 rounded-xl border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
          />
          {candidates.length > 0 && (
            <div className="absolute mt-1 w-full bg-white rounded-xl shadow-xl border border-[#e5e1da] overflow-hidden z-10">
              {candidates.map((c) => (
                <button key={c.code} onClick={() => addEntity(c)} className="w-full text-left px-4 py-2.5 hover:bg-[#f0ede8] text-sm flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-[#e8673c]" /> {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          {entities.map((e) => (
            <span key={e.code} className="px-3 py-1.5 rounded-full bg-[#0f2e21] text-white text-xs font-semibold flex items-center gap-1.5">
              {e.name || e.code}
              <button onClick={() => { setEntities(entities.filter((x) => x.code !== e.code)); setPlanLimitMsg(null); }}><X className="w-3 h-3" /></button>
            </span>
          ))}
          {entities.length < 2 && (
            <span className="text-xs text-[#6b6f68] self-center">{ca ? `Trieu-ne ${2 - entities.length} més per comparar` : `Elige ${2 - entities.length} más para comparar`}</span>
          )}
          {entities.length >= 2 && entities.length < maxEntities && (
            <span className="text-xs text-[#6b6f68] self-center">{ca ? `Fins a ${maxEntities} municipis` : `Hasta ${maxEntities} municipios`}</span>
          )}
          {!isPaid && entities.length >= 2 && (
            <span className="text-xs text-[#b0431c] self-center">{ca ? "Gratuït: màx. 2" : "Gratuito: máx. 2"}</span>
          )}
        </div>
      </div>

      {/* v25 — upsell: el pla gratuït arriba al seu límit (2 municipis) */}
      {!isPaid && entities.length >= maxEntities && (
        <div className="mt-4 rounded-2xl border border-[#f3d9b0] bg-[#fdf6ec] p-4 flex flex-wrap items-center gap-3">
          <Crown className="w-5 h-5 text-[#b0431c] shrink-0" />
          <p className="text-xs text-[#7a4a1c] flex-1 min-w-[220px]">
            {ca
              ? `El pla gratuït compara ${maxEntities} municipis. Amb Premium o Pro compares fins a 6 alhora, amb gràfica avançada i % de diferència detallat.`
              : `El plan gratuito compara ${maxEntities} municipios. Con Premium o Pro comparas hasta 6 a la vez, con gráfica avanzada y % de diferencia detallado.`}
          </p>
          <button onClick={() => navigate("/preus")} className="px-4 py-2 rounded-xl bg-[#e8673c] text-white text-xs font-bold hover:bg-[#d95a31]">
            {ca ? "Fes-te Premium" : "Hazte Premium"}
          </button>
        </div>
      )}
      {planLimitMsg && (
        <p className="mt-4 text-sm text-[#b0431c] bg-[#fdece4] border border-[#f3d9b0] rounded-xl px-4 py-3">{planLimitMsg}</p>
      )}

      {loadedMsg && (
        <p className="mt-4 text-sm text-[#1e7a41] bg-[#e6f4ea] border border-[#bfe3cc] rounded-xl px-4 py-3">{loadedMsg}</p>
      )}
      {busy && <p className="mt-4 text-sm text-[#6b6f68]">…</p>}

      {/* resultats */}
      {result && result.results.length > 0 && (
        <>
          <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-5">
            <h2 className="font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0f2e21]" />
              {ca ? "Gràfica comparativa · Preu mitjà mensual (Incasòl, fiances)" : "Gráfica comparativa · Precio medio mensual (Incasòl, fianzas)"}
            </h2>
            <p className="mt-1 mb-4 text-xs text-[#6b6f68]">
              {ca
                ? "Ordenats del més car al més barat. El % indica la diferència de cada municipi respecte al més barat de la selecció."
                : "Ordenados del más caro al más barato. El % indica la diferencia de cada municipio respecto al más barato de la selección."}
            </p>
            {/* v33 — si la comparació inclou naus industrials, s'avisa que el preu
                municipal de referència és d'habitatges, no de naus */}
            {result.results.some((x: any) => x.type === "BUILDING" && x.tipus === "ind") && (
              <p
                className="mb-4 text-xs rounded-xl px-3 py-2 flex items-start gap-1.5"
                style={{ background: "#efeafb", color: "#5d5480", border: "1px solid #cabfe6" }}
              >
                <Factory className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  {ca
                    ? "Hi ha naus industrials a la comparació: el preu municipal de referència és el de lloguer d'habitatges (fiances Incasòl); les naus es lloguen per €/m² i mes i no queden representades en aquesta xifra."
                    : "Hay naves industriales en la comparación: el precio municipal de referencia es el de alquiler de viviendas (fianzas Incasòl); las naves se alquilan por €/m² y mes y no quedan representadas en esta cifra."}
                </span>
              </p>
            )}
            <div className="space-y-5">
              {ranked.map((r, idx) => {
                const pct = r.rentLatest != null && minRent > 0 ? ((r.rentLatest - minRent) / minRent) * 100 : null;
                const isMin = r.rentLatest != null && r.rentLatest === minRent;
                return (
                  <div key={`${r.type}-${r.code}`}>
                    <div className="flex items-center justify-between gap-2 text-sm mb-1.5">
                      <span className="font-semibold flex items-center gap-1.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#f0ede8] text-[#0f2e21] text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                        <span className="truncate">{r.name}</span>
                        {/* v33 — naus industrials: fora de l'estadística d'habitatges */}
                        {r.type === "BUILDING" && (r as any).tipus === "ind" && (
                          <span
                            className="text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 flex items-center gap-1"
                            style={{ background: "#efeafb", color: "#5d5480", border: "1px solid #cabfe6" }}
                          >
                            <Factory className="w-3 h-3" />
                            {ca ? "nau industrial" : "nave industrial"}
                          </span>
                        )}
                        {r.isTense && <Flame className="w-3.5 h-3.5 text-[#e8673c] shrink-0" />}
                        {isMin && (
                          <span className="text-[10px] font-bold text-[#1e7a41] bg-[#e6f4ea] border border-[#bfe3cc] rounded-full px-2 py-0.5 shrink-0">
                            {ca ? "el més barat" : "el más barato"}
                          </span>
                        )}
                        {r.rentPeriod && <span className="text-xs text-[#6b6f68] shrink-0">· {r.rentPeriod}</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {pct != null && pct > 0.05 && (
                          <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${pct >= 25 ? "bg-[#fdece4] text-[#b0431c]" : "bg-[#f0ede8] text-[#4b5349]"}`}>
                            +{pct.toFixed(1).replace(".", ",")}%
                          </span>
                        )}
                        <span className="font-black text-[#0f2e21]">
                          {r.rentLatest != null
                            ? `${r.rentLatest.toFixed(0)} €/mes`
                            : r.comarcaRefLatest != null
                              ? `≈ ${r.comarcaRefLatest.toFixed(0)} €/mes`
                              : ca ? "sense dades" : "sin datos"}
                        </span>
                        {r.rentLatest == null && r.comarcaRefLatest != null && (
                          <span className="text-[10px] font-bold italic rounded-full px-2 py-0.5 bg-[#fdf3e0] text-[#8a6116]">
                            {ca ? "ref. comarca" : "ref. comarca"}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-3.5 rounded-full bg-[#f0ede8] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${((r.rentLatest || r.comarcaRefLatest || 0) / maxRent) * 100}%`,
                          background:
                            r.rentLatest != null
                              ? `linear-gradient(90deg, ${rentBarColor(r.rentLatest || 0)}, ${rentBarColor(r.rentLatest || 0)}cc)`
                              : "repeating-linear-gradient(45deg, #d9a441, #d9a441 6px, #e9c47a 6px, #e9c47a 12px)",
                          opacity: r.rentLatest == null ? 0.75 : 1,
                        }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#6b6f68]">
                      {r.vsMean !== null && (
                        <span className="flex items-center gap-1">
                          {r.vsMean > 0 ? <TrendingUp className="w-3 h-3" /> : r.vsMean < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {r.vsMean > 0 ? "+" : ""}{r.vsMean}% {ca ? "vs mitjana del conjunt" : "vs media del conjunto"}
                        </span>
                      )}
                      {r.contractsLatest != null && <span>{r.contractsLatest.toLocaleString()} {ca ? "contractes de mostra" : "contratos de muestra"}</span>}
                      {r.median != null && <span>{ca ? "mediana històrica" : "mediana histórica"}: {r.median.toFixed(0)} €</span>}
                      {r.rentLatest == null && r.comarcaRefLatest != null && (
                        <span className="text-[#8a6116]">{ca ? "≈ referència de comarca (estimació, sense dada municipal oficial)" : "≈ referencia de comarca (estimación, sin dato municipal oficial)"}</span>
                      )}
                      {r.rentLatest == null && r.comarcaRefLatest == null && <span className="text-[#b0431c]">{ca ? "sense dades oficials per aquest municipi (no s'inventa)" : "sin datos oficiales para este municipio (no se inventa)"}</span>}
                    </div>
                    {/* Fase 4 — xips avançats (Premium/Pro: la decisió és del servidor) */}
                    {result.advanced && r.indicators && (r.indicators.effortHogarPct != null || r.indicators.rentaHogar != null || r.indicators.ipvaCatAcum != null) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.indicators.rentaHogar != null && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f0ede8] text-[#0f2e21]">
                            {ca ? "renda llar" : "renta hogar"} {r.indicators.rentaHogar.toLocaleString(ca ? "ca-ES" : "es-ES")} €/any ({r.indicators.rentaHogarYear ?? "—"})
                          </span>
                        )}
                        {r.indicators.effortHogarPct != null && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f0ede8] text-[#0f2e21]">
                            {ca ? "esforç" : "esfuerzo"} {r.indicators.effortHogarPct.toFixed(1).replace(".", ",")} %
                          </span>
                        )}
                        {r.indicators.ipvaCatAcum != null && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f0ede8] text-[#0f2e21]">
                            IPVA +{r.indicators.ipvaCatAcum.toFixed(1).replace(".", ",")} % {ca ? "acum. des de 2015" : "acum. desde 2015"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {result.stats && (
              <div className="mt-4 pt-4 border-t border-[#f2efe9] grid grid-cols-3 gap-3 text-center text-sm">
                <div><div className="font-black text-[#0f2e21]">{result.stats.mean.toFixed(0)} €</div><div className="text-xs text-[#6b6f68]">{ca ? "mitjana del conjunt" : "media del conjunto"}</div></div>
                <div><div className="font-black text-[#0f2e21]">{result.stats.median.toFixed(0)} €</div><div className="text-xs text-[#6b6f68]">{ca ? "mediana del conjunt" : "mediana del conjunto"}</div></div>
                <div><div className="font-black text-[#0f2e21]">{((result.stats.max - result.stats.min) / result.stats.min * 100).toFixed(0)}%</div><div className="text-xs text-[#6b6f68]">{ca ? "bretxa max-mín" : "brecha max-mín"}</div></div>
              </div>
            )}
            <div className="mt-3 flex items-start gap-1.5 text-[10px] text-[#6b6f68]">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              {ca
                ? "Comparació estadística entre agregats oficials; no és una valoració individual. Font: Incasòl via habitatge.gencat.cat."
                : "Comparación estadística entre agregados oficiales; no es una valoración individual. Fuente: Incasòl via habitatge.gencat.cat."}
            </div>
          </div>

          {/* Fase 4 — teaser de columnes avançades per al pla gratuït */}
          {result && result.advanced === false && (
            <div className="mt-4 rounded-2xl border border-[#f3d9b0] bg-[#fdf6ec] p-4 flex flex-wrap items-center gap-3">
              <Crown className="w-5 h-5 text-[#b0431c] shrink-0" />
              <p className="text-xs text-[#7a4a1c] flex-1 min-w-[220px]">
                {ca
                  ? "Amb Premium o Pro: renda mitjana per llar (INE), esforç econòmic i evolució IPVA de cada municipi, directament al comparador."
                  : "Con Premium o Pro: renta media por hogar (INE), esfuerzo económico y evolución IPVA de cada municipio, directamente en el comparador."}
              </p>
              <button onClick={() => navigate("/preus")} className="px-4 py-2 rounded-xl bg-[#e8673c] text-white text-xs font-bold hover:bg-[#d95a31]">
                {ca ? "Fes-te Premium" : "Hazte Premium"}
              </button>
            </div>
          )}

          {/* evolució temporal */}
          {result.results.some((r) => r.rentHistory) && (
            <div className="mt-4 bg-white rounded-2xl border border-[#e5e1da] p-5">
              <h2 className="font-bold mb-4">{ca ? "Evolució temporal" : "Evolución temporal"}</h2>
              {/* Noves funcionalitats (F1): gràfic interactiu multi-municipi — només
                  amb historial del servidor (les fiances ja arriben gatejades pel pla) */}
              {(() => {
                const palette = ["#e8673c", "#0f2e21", "#1e7a41", "#9a6a1a", "#5d5480", "#6b6f68"];
                const series = result.results
                  .filter((r) => r.rentHistory && Object.keys(r.rentHistory).length >= 2)
                  .map((r, i) => ({
                    id: r.code,
                    label: r.name,
                    color: palette[i % palette.length],
                    points: Object.entries(r.rentHistory!)
                      .filter(([, v]) => Number(v) > 0)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([y, v]) => ({ x: y, y: Number(v) })),
                  }));
                return series.length >= 2 ? (
                  <div className="mb-4">
                    <LineChart locale={ca ? "ca" : "es"} series={series} />
                    <p className="mt-1 text-[10px] text-[#6b6f68]">
                      {ca ? "Mitjana de fiances per habitatge (Incasòl). Només anys amb dada publicada, sense interpolació." : "Media de fianzas por vivienda (Incasòl). Solo años con dato publicado, sin interpolación."}
                    </p>
                  </div>
                ) : null;
              })()}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#6b6f68]">
                    <th className="text-left py-1">{ca ? "Municipi" : "Municipio"}</th>
                    {result.results[0]?.rentHistory &&
                      Object.entries(result.results[0].rentHistory).sort().slice(-8).map(([y]) => (
                        <th key={y} className="py-1">{y.slice(2)}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {result.results.filter((r) => r.rentHistory).map((r) => {
                    const hist = Object.entries(r.rentHistory!).sort().slice(-8);
                    return (
                      <tr key={r.code} className="border-t border-[#f2efe9]">
                        <td className="py-1.5 font-semibold">{r.name}</td>
                        {hist.map(([y, v]) => (
                          <td key={y} className="text-center py-1.5">{Number(v).toFixed(0)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* desar */}
          <div className="mt-4 bg-white rounded-2xl border border-[#e5e1da] p-5 flex items-center gap-2 flex-wrap">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value.slice(0, 80))}
              placeholder={ca ? "Nom per desar la comparació (opcional)" : "Nombre para guardar la comparación (opcional)"}
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-[#e5e1da] text-sm"
            />
            <button onClick={saveComparison} className="px-4 py-2 rounded-lg bg-[#0f2e21] text-white text-sm font-bold flex items-center gap-1.5">
              <Save className="w-4 h-4" /> {ca ? "Desar comparació" : "Guardar comparación"}
            </button>
            {/* v37 — exportació CSV de la comparació (pla Pro, com la resta d'exports) */}
            <button onClick={exportCsv} className="px-4 py-2 rounded-lg border border-[#0f2e21] text-[#0f2e21] text-sm font-bold flex items-center gap-1.5 hover:bg-[#f0ede8]">
              <Download className="w-4 h-4" /> {ca ? "Exporta CSV" : "Exportar CSV"}
            </button>
            {saveMsg && <span className="text-xs text-[#4b5349]">{saveMsg}</span>}
            {csvMsg && <span className="text-xs text-[#4b5349]">{csvMsg}</span>}
          </div>
        </>
      )}

      {/* v37 — ESTAT BUIT: exemples d'un clic per començar (mai un buit mort) */}
      {!busy && entities.length < 2 && (
        <div className="mt-6 bg-white rounded-2xl border border-dashed border-[#cfc9bd] p-6">
          <h2 className="font-bold flex items-center gap-2">
            <Info className="w-4 h-4 text-[#0f2e21]" />
            {ca ? "Comença amb una comparació d'exemple" : "Empieza con una comparación de ejemplo"}
          </h2>
          <p className="mt-1 text-sm text-[#4b5349]">
            {ca
              ? "Tria municipis amb el cercador de dalt o toca un dels exemples. Els preus són la mitjana oficial de fiances Incasòl, no una estimació."
              : "Elige municipios con el buscador de arriba o toca uno de los ejemplos. Los precios son la media oficial de fianzas Incasòl, no una estimación."}
          </p>
          <div className="mt-3 flex gap-2 flex-wrap">
            {[
              { code: "080193", name: "Barcelona" },
              { code: "170792", name: "Girona" },
              { code: "431482", name: "Tarragona" },
              { code: "251208", name: "Lleida" },
              { code: "081877", name: "Sabadell" },
              { code: "080015", name: "Badalona" },
            ].map((m) => (
              <button
                key={m.code}
                onClick={() => { if (!entities.some((e) => e.code === m.code)) setEntities([...entities, { type: "MUNI" as const, code: m.code, name: m.name }].slice(0, maxEntities)); }}
                className="px-3 py-1.5 rounded-full border border-[#e5e1da] text-sm hover:bg-[#f0ede8] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {m.name}
              </button>
            ))}
          </div>
          {!isPaid && (
            <p className="mt-3 text-xs text-[#6b6f68]">
              {ca
                ? "Amb el pla gratuït compares 2 municipis; amb Premium i Pro, fins a 6 amb indicadors avançats."
                : "Con el plan gratuito comparas 2 municipios; con Premium y Pro, hasta 6 con indicadores avanzados."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function rentBarColor(rent: number): string {
  if (rent < 550) return "#63b57c";
  if (rent < 700) return "#93c47d";
  if (rent < 850) return "#e5c46a";
  if (rent < 1000) return "#e89a4b";
  return "#dd5a35";
}
