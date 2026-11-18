"use client";

/**
 * BUSCADOR INVERS (v67) — mòdul de la portada: troba zones (seccions censals)
 * on el preu real del lloguer compleix l'índex de referència.
 *
 *  · Autocompletat de municipis de Catalunya (API /api/municipalities, debounce).
 *  · Targeta d'estat ZMRT / No tensionat amb colors semàfor (fonts DOGC vigents).
 *  · Taula ordenable per secció censal: preu mitjà real €/m², índex de
 *    referència €/m² i Índex de Compliment (% de contractes ≤ índex), amb
 *    semàfor verd (preu ≤ índex) / vermell (preu > índex).
 *  · Filtre «Mostrar només municipis no tensionats» (inversors/propietaris).
 *  · CTA per zona: «Verificar un edifici concret en aquesta zona» → cercador
 *    tradicional /#/analitza (adreça o referència catastral) amb el municipi
 *    prefilat — tanca el cercle buscador invers ↔ buscador directe.
 *
 * RGPD: tots els numbers són agregats de SECCIÓ CENSAL (unitat estadística
 * oficial); mai dades d'edifici o vivenda. El servidor (GET /api/zones) fa
 * servir el mateix contracte; aquí només hi ha presentació i ordenació client.
 * Estimacions marcades honestament (fitxer seccional d'Incasòl pendent).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "@/components/app-context";

type MuniLite = {
  code: string;
  name: string;
  comarca: string | null;
  province?: string | null;
  isTense?: boolean;
  tenseList?: string | null;
  rentLatest?: number | null;
  rentPeriod?: string | null;
  rentSource?: string | null;
  comarcaRefLatest?: number | null;
  comarcaRefPeriod?: string | null;
  contractsLatest?: number | null;
};

type Zone = {
  idSeccio: string;
  nom: string | null;
  preuRealMitjaEurM2: number | null;
  indexReferenciaEurM2: number | null;
  complimentPct: number | null;
  nivellDada: string;
  complimentMetode: string | null;
  estimacio: boolean;
  nEdificis: number;
  numViviendas: number | null;
};

type ZonesResp = {
  ok?: boolean;
  municipi?: { code: string; ineCode: string; name: string; comarca: string | null; provincia: string | null };
  zmrt?: { tense: boolean; llista: string | null; font: string; publicacio: string; resolucionsVigents: string[] };
  indexReferencia?: {
    valorEurMes: number | null;
    period: string | null;
    municipal: boolean;
    estimacio: boolean;
    font: string;
    eurM2: number | null;
    eurM2Font: string | null;
  };
  cobertura?: "PILOT_AMB" | "FORA_ABAST_PILOT";
  n_zones?: number;
  zones?: Zone[];
  nota_rgpd?: string;
  nota_estimacio?: string;
  disclaimer?: { ca: string; es: string };
  error?: string;
  message?: string;
};

type SortKey = "compliment" | "preu" | "index" | "nom";
const PAGE = 50;

export default function BuscadorInvers() {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";

  // ---- cerca de municipis amb autocompletat -------------------------------
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sugs, setSugs] = useState<MuniLite[]>([]);
  const [sel, setSel] = useState<MuniLite | null>(null);
  // Filtre avançat (UX): «Mostrar només municipis no tensionats»
  const [noTense, setNoTense] = useState(false);

  // ---- resultat -----------------------------------------------------------
  const [data, setData] = useState<ZonesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null); // DATA_NOT_READY | FORA_ABAST | ERROR
  const [sort, setSort] = useState<{ k: SortKey; dir: "asc" | "desc" }>({ k: "compliment", dir: "desc" });
  const [visible, setVisible] = useState(PAGE);
  const boxRef = useRef<HTMLDivElement>(null);

  // debounce de l'autocompletat (patró Comparador/Panel: 250 ms). El buidatge
  // amb menys de 2 caràcters es DERIVA al render (cap setState síncron dins
  // l'efecte: react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/municipalities?q=${encodeURIComponent(q)}&limit=25`);
        const j = await res.json();
        let rows: MuniLite[] = j?.municipalities || [];
        if (noTense) rows = rows.filter((m) => !m.isTense);
        setSugs(rows.slice(0, 12));
      } catch {
        setSugs([]);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [query, open, noTense]);

  // tanca el dropdown en fer clic fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const carregaZones = async (m: MuniLite) => {
    setSel(m);
    setOpen(false);
    setLoading(true);
    setErr(null);
    setData(null);
    setVisible(PAGE);
    try {
      const res = await fetch(`/api/zones?muni=${encodeURIComponent(m.code)}`);
      const j: ZonesResp = await res.json();
      if (!res.ok) {
        if (res.status === 503) setErr("DATA_NOT_READY");
        else setErr(j?.error === "NOT_FOUND" ? "NOT_FOUND" : "ERROR");
        return;
      }
      setData(j);
      if (j.cobertura === "FORA_ABAST_PILOT") setErr("FORA_ABAST");
    } catch {
      setErr("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const zones = data?.zones ?? [];
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (z: Zone): number | string => {
      switch (sort.k) {
        case "preu":
          return z.preuRealMitjaEurM2 ?? -1;
        case "index":
          return z.indexReferenciaEurM2 ?? -1;
        case "nom":
          return etiquetaZona(z.idSeccio, z.nom);
        default:
          return z.complimentPct ?? -1;
      }
    };
    return [...zones].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), ca ? "ca" : "es") * dir;
      }
      return (va - vb) * dir;
    });
  }, [zones, sort, ca]);

  const toggleSort = (k: SortKey) => {
    setSort((prev) => (prev.k === k ? { k, dir: prev.dir === "asc" ? "desc" : "asc" } : { k, dir: k === "nom" ? "asc" : "desc" }));
    setVisible(PAGE);
  };

  const muniTensada = data?.zmrt?.tense ?? sel?.isTense ?? false;
  const filtreAmagaTensada = noTense && muniTensada && sorted.length > 0;
  const muniName = data?.municipi?.name ?? sel?.name ?? "";

  return (
    <div>
      <p className="text-[11px] text-stone leading-relaxed mb-3">
        {ca
          ? "Cerca municipis on el preu real del lloguer compleix l'índex de referència. Comparació estadística amb dades oficials (fiances Incasòl, DOGC): no és una taxació oficial."
          : "Busca municipios donde el precio real del alquiler cumple el índice de referencia. Comparación estadística con datos oficiales (fianzas Incasòl, DOGC): no es una tasación oficial."}
      </p>

      {/* ---- autocompletat de municipis ---- */}
      <div ref={boxRef} className="relative">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-cream px-3 min-h-[48px]">
          <Search className="w-4 h-4 text-stone shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={open ? query : sel ? sel.name : query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(null);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              if (sel) setQuery(sel.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sugs.length > 0) {
                e.preventDefault();
                void carregaZones(sugs[0]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={ca ? "Cerca un municipi (p. ex. Barcelona)" : "Busca un municipio (p. ej. Barcelona)"}
            aria-label={ca ? "Cerca un municipi" : "Busca un municipio"}
            aria-expanded={open}
            role="combobox"
            aria-controls="zones-sugs"
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-stone"
          />
          {open && <ChevronDown className="w-4 h-4 text-stone" aria-hidden="true" />}
        </div>
        {open && query.trim().length >= 2 && sugs.length > 0 && (
          <ul id="zones-sugs" role="listbox" className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-card shadow-xl overflow-hidden max-h-72 overflow-y-auto">
            {sugs.map((m) => (
              <li key={m.code} role="option" aria-selected={sel?.code === m.code}>
                <button
                  type="button"
                  onClick={() => void carregaZones(m)}
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-sand flex items-center justify-between gap-2 min-h-[44px]"
                >
                  <span className="truncate">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-stone text-xs"> · {m.comarca ?? m.province ?? ""}</span>
                  </span>
                  {m.isTense ? (
                    <span className="shrink-0 rounded-full bg-embersoft text-ember3 text-[10px] font-bold px-2 py-0.5">
                      {ca ? "ZMRT" : "ZMRT"}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-mintsoft text-pine text-[10px] font-bold px-2 py-0.5">
                      {ca ? "No tensionat" : "No tensionado"}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- toggle: només municipis no tensionats ---- */}
      <button
        type="button"
        role="switch"
        aria-checked={noTense}
        onClick={() => setNoTense((x) => !x)}
        className={`mt-2.5 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border min-h-[44px] transition-colors ${
          noTense ? "bg-mintsoft border-mintline text-pine" : "border-line text-moss hover:bg-sand"
        }`}
        title={ca ? "Filtra municipis sense les limitacions de la Llei d'Habitatge" : "Filtra municipios sin las limitaciones de la Ley de Vivienda"}
      >
        <span className={`w-8 h-[18px] rounded-full relative shrink-0 transition-colors ${noTense ? "bg-pine" : "bg-sand3"}`} aria-hidden="true">
          <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${noTense ? "left-[16px]" : "left-[2px]"}`} />
        </span>
        {ca ? "Mostrar només municipis no tensionats" : "Mostrar solo municipios no tensionados"}
      </button>

      {/* ---- estats ---- */}
      {loading && (
        <div className="mt-4 rounded-xl border border-line bg-card p-5 flex items-center gap-3 text-sm text-moss" role="status" aria-live="polite">
          <Loader2 className="w-5 h-5 animate-spin text-pine" aria-hidden="true" />
          {ca ? "Carregant zones…" : "Cargando zonas…"}
        </div>
      )}

      {!loading && err === "DATA_NOT_READY" && (
        <div className="mt-4 rounded-xl border border-amberline bg-ambersoft p-5 text-sm" role="alert">
          <div className="font-bold text-ink flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-ember3" aria-hidden="true" />
            {ca ? "Dades encara no disponibles" : "Datos aún no disponibles"}
          </div>
          <p className="mt-1.5 text-moss leading-relaxed">
            {ca
              ? "El buscador invers espera la càrrega del pipeline geoespacial en aquesta base de dades (degradació honesta: mai es simula cobertura)."
              : "El buscador invers espera la carga del pipeline geoespacial en esta base de datos (degradación honesta: nunca se simula cobertura)."}
          </p>
        </div>
      )}

      {!loading && (err === "ERROR" || err === "NOT_FOUND") && (
        <div className="mt-4 rounded-xl border border-line bg-card p-5 text-sm text-moss" role="alert">
          {ca ? "No s'han pogut carregar les zones ara mateix. Reintenta en uns instants." : "No se han podido cargar las zonas ahora mismo. Reintenta en unos instantes."}
        </div>
      )}

      {!loading && err === "FORA_ABAST" && data && (
        <div className="mt-4 rounded-xl border border-line bg-card p-5 text-sm" role="status">
          <div className="font-bold text-ink flex items-center gap-2">
            <MapPin className="w-5 h-5 text-pine" aria-hidden="true" />
            {ca ? `${muniName}: sense cobertura del pilot encara` : `${muniName}: sin cobertura del piloto todavía`}
          </div>
          <p className="mt-1.5 text-moss leading-relaxed">
            {ca
              ? "L'estat ZMRT de la targeta cobreix els 947 municipis (DOGC), però les zones per secció censal només tenen cobertura al pilot geoespacial de l'àrea metropolitana de Barcelona. Mai s'inventen dades."
              : "El estado ZMRT de la tarjeta cubre los 947 municipios (DOGC), pero las zonas por sección censal solo tienen cobertura en el piloto geoespacial del área metropolitana de Barcelona. Nunca se inventan datos."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate(`/analitza?muni=${sel?.code ?? ""}&mn=${encodeURIComponent(sel?.name ?? "")}`)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-pine text-white text-xs font-bold px-3.5 py-2.5 hover:bg-pine/90 transition-colors min-h-[44px]"
            >
              {ca ? "Consulta el preu municipal" : "Consulta el precio municipal"}
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/mapa")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line text-moss text-xs font-bold px-3.5 py-2.5 hover:bg-sand transition-colors min-h-[44px]"
            >
              {ca ? "Obre el mapa" : "Abre el mapa"}
            </button>
          </div>
        </div>
      )}

      {/* ---- targeta d'estat + taula ---- */}
      {!loading && data && err !== "FORA_ABAST" && (
        <div className="mt-4">
          {/* targeta d'estat ZMRT (semàfor) */}
          <div
            className={`rounded-xl border p-4 ${muniTensada ? "bg-embersoft border-emberline" : "bg-mintsoft border-mintline"}`}
            data-testid="zmrt-card"
          >
            <div className={`flex items-center gap-2 font-extrabold ${muniTensada ? "text-ember3" : "text-pine"}`}>
              {muniTensada ? (
                <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {muniTensada
                  ? ca
                    ? "Zona de Mercat Residencial Tensionat (ZMRT)"
                    : "Zona de Mercado Residencial Tensionado (ZMRT)"
                  : ca
                    ? "No tensionat"
                    : "No tensionado"}
              </span>
              {muniTensada && data.zmrt?.llista && (
                <span className="rounded-full bg-ember text-white text-[10px] font-bold px-2 py-0.5">
                  Llista {data.zmrt.llista}
                </span>
              )}
            </div>
            <p className={`mt-1.5 text-xs leading-relaxed ${muniTensada ? "text-ember3" : "text-pine"}`}>
              {muniTensada
                ? ca
                  ? `Àrea de mercat residencial tensat: nous contractes amb limitacions segons l'índex de referència (${data.zmrt?.publicacio ?? "DOGC 19-10-2026"}). Per a grans tenedores: SERPAVI (RDL 29/2026).`
                  : `Área de mercado residencial tensionado: nuevos contratos con limitaciones según el índice de referencia (${data.zmrt?.publicacio ?? "DOGC 19-10-2026"}). Para grandes tenedores: SERPAVI (RDL 29/2026).`
                : ca
                  ? "Municipi sense declaració vigent: sense les limitacions de preus de la Llei d'Habitatge per a nous contractes."
                  : "Municipio sin declaración vigente: sin las limitaciones de precios de la Ley de Vivienda para nuevos contratos."}
            </p>
            {data.indexReferencia?.valorEurMes != null && (
              <p className="mt-2 text-xs text-moss leading-relaxed">
                {ca ? "Índex de referència vigent: " : "Índice de referencia vigente: "}
                <b className="tabular-nums">{data.indexReferencia.valorEurMes.toFixed(1)} €/mes</b>
                {data.indexReferencia.period ? ` (${data.indexReferencia.period})` : ""}
                {data.indexReferencia.estimacio && (
                  <span className="ml-1.5 rounded-full bg-ambersoft text-ember3 text-[10px] font-bold px-2 py-0.5">ESTIMACIÓ</span>
                )}
                {data.indexReferencia.eurM2 != null && (
                  <> · <b className="tabular-nums">{data.indexReferencia.eurM2.toFixed(2)} €/m²·mes</b> ({ca ? "superfície mitjana del parc" : "superficie media del parque"})</>
                )}
              </p>
            )}
          </div>

          {/* filtre actiu sobre municipi tensat: estat honest en lloc de la taula */}
          {filtreAmagaTensada ? (
            <div className="mt-3 rounded-xl border border-line bg-card p-5 text-sm text-moss leading-relaxed" data-testid="filter-hidden">
              <ShieldCheck className="w-5 h-5 text-pine mb-1.5" aria-hidden="true" />
              {ca
                ? `El filtre «només municipis no tensionats» amaga les ${data.n_zones ?? zones.length} zones de ${muniName}, que és ZMRT. Desactiva el filtre per veure-les.`
                : `El filtro «solo municipios no tensionados» oculta las ${data.n_zones ?? zones.length} zonas de ${muniName}, que es ZMRT. Desactiva el filtro para verlas.`}
            </div>
          ) : (
            <>
              {/* taula ordenable de zones */}
              <div className="mt-3 rounded-xl border border-line bg-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pt-3 pb-2">
                  <h3 className="font-extrabold text-sm">
                    {ca ? "Zones per compliment de l'índex" : "Zonas por cumplimiento del índice"}
                    <span className="text-stone font-medium"> · {data.n_zones ?? zones.length}</span>
                  </h3>
                  {zones.some((z) => z.estimacio) && (
                    <span className="rounded-full bg-ambersoft text-ember3 text-[10px] font-bold px-2 py-0.5" title={data.nota_estimacio}>
                      ESTIMACIÓ
                    </span>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto" data-scrollbar>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-cream z-10">
                      <tr className="text-left text-[11px] uppercase tracking-wide text-stone">
                        <th className="px-3.5 py-2 font-bold" aria-sort={sort.k === "nom" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                          <button type="button" onClick={() => toggleSort("nom")} className="inline-flex items-center gap-1 hover:text-ink uppercase">
                            {ca ? "Zona" : "Zona"} <SortIcon active={sort.k === "nom"} dir={sort.dir} />
                          </button>
                        </th>
                        <th className="px-3 py-2 font-bold text-right" aria-sort={sort.k === "preu" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                          <button type="button" onClick={() => toggleSort("preu")} className="inline-flex items-center gap-1 hover:text-ink uppercase text-right">
                            {ca ? "Preu real €/m²" : "Precio real €/m²"} <SortIcon active={sort.k === "preu"} dir={sort.dir} />
                          </button>
                        </th>
                        <th className="px-3 py-2 font-bold text-right" aria-sort={sort.k === "index" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                          <button type="button" onClick={() => toggleSort("index")} className="inline-flex items-center gap-1 hover:text-ink uppercase text-right">
                            {ca ? "Índex €/m²" : "Índice €/m²"} <SortIcon active={sort.k === "index"} dir={sort.dir} />
                          </button>
                        </th>
                        <th className="px-3 py-2 font-bold text-right" aria-sort={sort.k === "compliment" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                          <button type="button" onClick={() => toggleSort("compliment")} className="inline-flex items-center gap-1 hover:text-ink uppercase text-right">
                            {ca ? "Compliment" : "Cumplimiento"} <SortIcon active={sort.k === "compliment"} dir={sort.dir} />
                          </button>
                        </th>
                        <th className="px-3 py-2" aria-label={ca ? "Acció" : "Acción"} />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.slice(0, visible).map((z) => {
                        const compleix = z.preuRealMitjaEurM2 != null && z.indexReferenciaEurM2 != null && z.preuRealMitjaEurM2 <= z.indexReferenciaEurM2;
                        return (
                          <tr key={z.idSeccio} className="border-t border-sand3 align-middle hover:bg-sand/60">
                            <td className="px-3.5 py-2.5">
                              <div className="font-semibold">{etiquetaZona(z.idSeccio, z.nom)}</div>
                              <div className="text-[11px] text-stone tabular-nums">
                                {z.nEdificis} {ca ? "edificis" : "edificios"}
                                {z.numViviendas != null ? ` · ${z.numViviendas.toLocaleString(ca ? "ca-ES" : "es-ES")} ${ca ? "vivendes" : "viviendas"}` : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                              {z.preuRealMitjaEurM2 != null ? z.preuRealMitjaEurM2.toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-moss">
                              {z.indexReferenciaEurM2 != null ? z.indexReferenciaEurM2.toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {z.complimentPct != null ? (
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums ${compleix ? "bg-mintsoft text-pine" : "bg-embersoft text-ember3"}`}>
                                  <span className={`w-2 h-2 rounded-full ${compleix ? "bg-mint" : "bg-ember"}`} aria-hidden="true" />
                                  {z.complimentPct.toFixed(1)} %
                                </span>
                              ) : (
                                <span className="text-stone">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => navigate(`/analitza?muni=${data.municipi?.code ?? sel?.code ?? ""}&mn=${encodeURIComponent(muniName)}`)}
                                className="inline-flex items-center gap-1 rounded-lg border border-line text-[11px] font-bold text-pine px-2.5 py-2 hover:bg-sand transition-colors min-h-[36px]"
                                title={ca ? "Obre el cercador directe amb el municipi prefilat" : "Abre el buscador directo con el municipio preseleccionado"}
                              >
                                {ca ? "Verificar edifici" : "Verificar edificio"}
                                <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {sorted.length > visible && (
                  <div className="border-t border-sand3 px-3.5 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisible((v) => v + PAGE)}
                      className="rounded-xl border border-line text-moss text-xs font-bold px-4 py-2.5 hover:bg-sand transition-colors min-h-[44px]"
                    >
                      {ca ? `Mostra ${PAGE} més (de ${sorted.length})` : `Muestra ${PAGE} más (de ${sorted.length})`}
                    </button>
                  </div>
                )}
              </div>

              {/* CTA destacada per zona (sota la taula, primer resultat) */}
              <button
                type="button"
                onClick={() => navigate(`/analitza?muni=${data.municipi?.code ?? sel?.code ?? ""}&mn=${encodeURIComponent(muniName)}`)}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-pine text-white text-sm font-bold px-4 py-3.5 hover:bg-pine/90 transition-colors min-h-[48px]"
              >
                <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
                {ca
                  ? `Verificar un edifici concret en aquesta zona (${muniName})`
                  : `Verificar un edificio concreto en esta zona (${muniName})`}
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            </>
          )}

          {/* notes d'honestedat + RGPD */}
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] text-stone leading-relaxed">{data.nota_estimacio}</p>
            <p className="text-[11px] text-stone leading-relaxed flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-pine" aria-hidden="true" />
              {data.nota_rgpd}
            </p>
            <p className="text-[11px] text-stone leading-relaxed">
              {typeof data.disclaimer === "string" ? data.disclaimer : ca ? data.disclaimer?.ca : data.disclaimer?.es}
            </p>
          </div>
        </div>
      )}

      {/* sense selecció: explicació honesta (mai dades falses) */}
      {!loading && !data && !err && (
        <div className="mt-4 rounded-xl border border-line bg-card p-5 text-sm text-moss leading-relaxed">
          <div className="font-bold text-ink flex items-center gap-2">
            <MapPin className="w-5 h-5 text-pine shrink-0" aria-hidden="true" />
            {ca ? "Cerca un municipi per començar" : "Busca un municipio para empezar"}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed">
            {ca
              ? "Et mostrem l'estat ZMRT del municipi (resolucions vigents del DOGC) i les seves zones per secció censal ordenades per compliment de l'índex de referència. Cobertura de zones: pilot geoespacial de l'àrea metropolitana de Barcelona; l'estat ZMRT cobreix els 947 municipis de Catalunya."
              : "Te mostramos el estado ZMRT del municipio (resoluciones vigentes del DOGC) y sus zonas por sección censal ordenadas por cumplimiento del índice de referencia. Cobertura de zonas: piloto geoespacial del área metropolitana de Barcelona; el estado ZMRT cubre los 947 municipios de Cataluña."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Etiqueta de zona: nom oficial quan hi sigui; altrament "Secció censal NNNNN". */
function etiquetaZona(idSeccio: string, nom: string | null): string {
  if (nom) return nom;
  const ultim = idSeccio.slice(-5);
  return `Secció censal ${ultim}`;
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className={`inline-block w-3 ${active ? "text-pine" : "text-stone/40"}`} aria-hidden="true">
      {active && dir === "desc" ? "▾" : "▴"}
    </span>
  );
}
