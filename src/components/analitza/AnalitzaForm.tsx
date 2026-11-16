"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, Loader2, ChevronDown } from "lucide-react";
import { useApp } from "@/components/app-context";
import type { ContractType } from "@/lib/analitza";

/**
 * F1 «Consulta el preu real registrat» — formulari compartit.
 * variant "compact": a la portada (camps avançats plegats).
 * variant "full": a #/analitza (amb mapa ICGC per marcar el punt exacte).
 *
 * Dades demanades: mínimes per a l'anàlisi (cap dada personal). L'adreça usa
 * el Geocodificador oficial ICGC (via /api/geocode) i omple municipi i punt.
 * El resultat és una COMPARACIÓ ESTADÍSTICA, mai una valoració individual.
 */

export interface MuniLite {
  code: string;
  name: string;
  comarca: string | null;
  lat: number;
  lng: number;
  isTense?: boolean;
}

export interface AnalitzaFormValues {
  municipalityCode: string | null;
  municipalityName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceEurMonth: string;
  surfaceM2: string;
  rooms: string;
  contractType: ContractType;
  builtYear: string;
  previousRent: string;
  notes: string;
}

export const ANALITZA_PREFILL_KEY = "pr_analitza_prefill";

export function savePrefill(values: Partial<AnalitzaFormValues> & { autoRun?: boolean }) {
  try {
    sessionStorage.setItem(ANALITZA_PREFILL_KEY, JSON.stringify(values));
  } catch {}
}

function loadPrefill(): (Partial<AnalitzaFormValues> & { autoRun?: boolean }) | null {
  try {
    const raw = sessionStorage.getItem(ANALITZA_PREFILL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const emptyValues: AnalitzaFormValues = {
  municipalityCode: null,
  municipalityName: null,
  address: null,
  lat: null,
  lng: null,
  priceEurMonth: "",
  surfaceM2: "",
  rooms: "",
  contractType: "HABITATGE",
  builtYear: "",
  previousRent: "",
  notes: "",
};

interface GeocodeLite {
  label: string;
  lat: number;
  lng: number;
  municipalityCode: string | null;
  municipalityName: string | null;
}

export default function AnalitzaForm({
  variant,
  onResult,
  onLoadingChange,
  onPointChange,
  externalPoint,
}: {
  variant: "compact" | "full";
  onResult: (data: unknown) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** notifica el punt triat (adreça o municipi) perquè la vista el mostri al mapa */
  onPointChange?: (point: { lat: number; lng: number } | null) => void;
  /** full: punt marcat al mapa per l'usuari (la vista el sincronitza al formulari) */
  externalPoint?: { lat: number; lng: number } | null;
}) {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [v, setV] = useState<AnalitzaFormValues>(emptyValues);
  const [munQuery, setMunQuery] = useState("");
  const [munOptions, setMunOptions] = useState<MuniLite[]>([]);
  const [geoOptions, setGeoOptions] = useState<GeocodeLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const munBoxRef = useRef<HTMLDivElement>(null);
  const geoBoxRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<AnalitzaFormValues>) => {
    setV((prev) => {
      const next = { ...prev, ...patch };
      if (patch.lat != null && patch.lng != null) onPointChange?.({ lat: patch.lat, lng: patch.lng });
      if (patch.lat === null && patch.lng === null) onPointChange?.(null);
      return next;
    });
  };

  const runSubmit = async (vals: AnalitzaFormValues) => {
    if (!vals.municipalityCode) {
      setError(ca ? "Tria el municipi (o escriu l'adreça exacta per omplir-lo)." : "Elige el municipio (o escribe la dirección exacta para rellenarlo).");
      return;
    }
    const price = Number(vals.priceEurMonth);
    if (!Number.isFinite(price) || price < 50 || price > 20000) {
      setError(ca ? "Introdueix el preu mensual de l'anunci (entre 50 i 20.000 €)." : "Introduce el precio mensual del anuncio (entre 50 y 20.000 €).");
      return;
    }
    setError(null);
    setLoading(true);
    onLoadingChange?.(true);
    savePrefill({ ...vals, autoRun: false });
    try {
      const res = await fetch("/api/analitza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipalityCode: vals.municipalityCode,
          municipalityName: vals.municipalityName,
          address: vals.address || undefined,
          lat: vals.lat ?? undefined,
          lng: vals.lng ?? undefined,
          priceEurMonth: price,
          surfaceM2: vals.surfaceM2 ? Number(vals.surfaceM2) : undefined,
          rooms: vals.rooms ? Number(vals.rooms) : undefined,
          contractType: vals.contractType,
          builtYear: vals.builtYear ? Number(vals.builtYear) : undefined,
          previousRent: vals.previousRent ? Number(vals.previousRent) : undefined,
          notes: vals.notes || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d?.message || (ca ? "No s'ha pogut calcular l'informe. Revisa les dades." : "No se ha podido calcular el informe. Revisa los datos."));
        return;
      }
      onResult(d);
    } catch {
      setError(ca ? "Error de xarxa. Reintenta en uns instants." : "Error de red. Reintenta en unos instantes.");
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  // punt marcat al mapa (vista full): sincronitza al formulari durant el render
  // (patró React d'ajust d'estat quan canvien les props — l'estat del pare ja és
  // el mateix punt, no cal notificar de tornada: mai bucles)
  if (externalPoint && (externalPoint.lat !== v.lat || externalPoint.lng !== v.lng)) {
    setV((prev) => ({ ...prev, lat: externalPoint.lat, lng: externalPoint.lng }));
  }
  // neteja de desplegables amb consultes massa curtes (durant el render, patró MapView)
  if (munQuery.trim().length < 2 && munOptions.length > 0) setMunOptions([]);
  if ((v.address ?? "").trim().length < 5 && geoOptions.length > 0) setGeoOptions([]);

  // prefill des de la portada (mateixa sessió): omple i, si cal, executa automàtic.
  // El consumeix UNA vegada (esborra la clau) i difereix els setState amb await
  // per evitar renders en cascada (patró MapView).
  useEffect(() => {
    if (variant !== "full") return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const pre = loadPrefill();
      if (!pre) return;
      try {
        sessionStorage.removeItem(ANALITZA_PREFILL_KEY);
      } catch {}
      const { autoRun, ...vals } = pre;
      const filled = { ...emptyValues, ...vals };
      setV(filled);
      if (filled.lat != null && filled.lng != null) onPointChange?.({ lat: filled.lat, lng: filled.lng });
      if (autoRun && filled.municipalityCode && Number(filled.priceEurMonth) >= 50) {
        void runSubmit(filled);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  // cerca de municipis (BD local, instantània) — debounce curt (les neteges de
  // consultes curtes es fan durant el render, vegeu dalt)
  useEffect(() => {
    const q = munQuery.trim();
    if (q.length < 2) return;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/municipalities?q=${encodeURIComponent(q)}&limit=8`);
        const d = await res.json();
        setMunOptions(d.municipalities || []);
      } catch {
        setMunOptions([]);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [munQuery]);

  // cerca d'adreces (Geocodificador ICGC) — debounce, mínim 5 caràcters
  useEffect(() => {
    const q = (v.address ?? "").trim();
    if (q.length < 5) return;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const d = await res.json();
        setGeoOptions((d.results || []).slice(0, 6));
      } catch {
        setGeoOptions([]);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [v.address]);

  // tancar desplegables en clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (munBoxRef.current && !munBoxRef.current.contains(e.target as Node)) setMunOptions([]);
      if (geoBoxRef.current && !geoBoxRef.current.contains(e.target as Node)) setGeoOptions([]);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);


  const pickMuni = (m: MuniLite) => {
    set({ municipalityCode: m.code, municipalityName: m.name, lat: m.lat, lng: m.lng });
    setMunQuery("");
    setMunOptions([]);
  };
  const pickGeo = (g: GeocodeLite) => {
    set({
      address: g.label,
      lat: g.lat,
      lng: g.lng,
      municipalityCode: g.municipalityCode ?? v.municipalityCode,
      municipalityName: g.municipalityName ?? v.municipalityName,
    });
    setGeoOptions([]);
  };

  const inputCls =
    "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[15px] outline-none focus:border-pine min-h-[48px]";
  const labelCls = "block text-xs font-bold text-moss mb-1.5";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void runSubmit(v);
      }}
      className="flex flex-col gap-3.5"
    >
      {/* municipi */}
      <div ref={munBoxRef} className="relative">
        <label className={labelCls} htmlFor="analitza-muni">
          {ca ? "Municipi *" : "Municipio *"}
        </label>
        <input
          id="analitza-muni"
          type="text"
          autoComplete="off"
          className={inputCls}
          placeholder={ca ? "Ex.: Manresa, Barcelona, Girona…" : "Ej.: Manresa, Barcelona, Girona…"}
          value={munQuery || v.municipalityName || ""}
          onChange={(e) => {
            setMunQuery(e.target.value);
            if (e.target.value.trim() !== v.municipalityName) set({ municipalityCode: null, municipalityName: null });
          }}
        />
        {munOptions.length > 0 && (
          <ul className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-line bg-card shadow-xl max-h-56 overflow-auto">
            {munOptions.map((m) => (
              <li key={m.code}>
                <button
                  type="button"
                  onClick={() => pickMuni(m)}
                  className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-sand"
                >
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-stone"> · {m.comarca ?? ""}{m.isTense ? (ca ? " · zona tensada" : " · zona tensionada") : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* adreça (ICGC) */}
      <div ref={geoBoxRef} className="relative">
        <label className={labelCls} htmlFor="analitza-addr">
          {ca ? "Adreça de la vivenda (opcional)" : "Dirección de la vivienda (opcional)"}
        </label>
        <input
          id="analitza-addr"
          type="text"
          autoComplete="off"
          className={inputCls}
          placeholder={ca ? "Carrer, número, municipi — geocodificador ICGC" : "Calle, número, municipio — geocodificador ICGC"}
          value={v.address ?? ""}
          onChange={(e) => set({ address: e.target.value })}
        />
        {geoOptions.length > 0 && (
          <ul className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-line bg-card shadow-xl max-h-56 overflow-auto">
            {geoOptions.map((g, i) => (
              <li key={`${g.lat}-${g.lng}-${i}`}>
                <button type="button" onClick={() => pickGeo(g)} className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-sand">
                  <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-pine shrink-0" />{g.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* preu + superfície + habitacions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls} htmlFor="analitza-preu">
            {ca ? "Preu de l'anunci (€/mes) *" : "Precio del anuncio (€/mes) *"}
          </label>
          <input id="analitza-preu" type="number" inputMode="numeric" min={50} max={20000} className={inputCls} value={v.priceEurMonth} onChange={(e) => set({ priceEurMonth: e.target.value })} />
        </div>
        <div>
          <label className={labelCls} htmlFor="analitza-m2">
            {ca ? "Superfície (m²)" : "Superficie (m²)"}
          </label>
          <input id="analitza-m2" type="number" inputMode="numeric" min={5} max={500} className={inputCls} value={v.surfaceM2} onChange={(e) => set({ surfaceM2: e.target.value })} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls} htmlFor="analitza-hab">
            {ca ? "Habitacions" : "Habitaciones"}
          </label>
          <input id="analitza-hab" type="number" inputMode="numeric" min={0} max={12} className={inputCls} value={v.rooms} onChange={(e) => set({ rooms: e.target.value })} />
        </div>
      </div>

      {/* tipus de contracte */}
      <div>
        <label className={labelCls} htmlFor="analitza-tipus">
          {ca ? "Tipus de contracte *" : "Tipo de contrato *"}
        </label>
        <select id="analitza-tipus" className={inputCls} value={v.contractType} onChange={(e) => set({ contractType: e.target.value as ContractType })}>
          <option value="HABITATGE">{ca ? "Habitatge habitual" : "Vivienda habitual"}</option>
          <option value="TEMPORADA">{ca ? "Temporada (ús diferent de l'habitatge habitual)" : "Temporada (uso distinto de la vivienda habitual)"}</option>
          <option value="HABITACIO">{ca ? "Habitació (compartir pis)" : "Habitación (compartir piso)"}</option>
        </select>
      </div>

      {/* camps avançats */}
      <details className="rounded-xl border border-line bg-card px-3.5 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-moss flex items-center gap-1.5 select-none">
          {ca ? "Més dades (millora la precisió)" : "Más datos (mejora la precisión)"}
          <ChevronDown className="w-4 h-4" />
        </summary>
        <div className="grid grid-cols-2 gap-3 py-3">
          <div>
            <label className={labelCls} htmlFor="analitza-any">
              {ca ? "Any de construcció" : "Año de construcción"}
            </label>
            <input id="analitza-any" type="number" min={1800} max={2026} className={inputCls} value={v.builtYear} onChange={(e) => set({ builtYear: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="analitza-ant">
              {ca ? "Renta del contracte anterior (€/mes)" : "Renta del contrato anterior (€/mes)"}
            </label>
            <input id="analitza-ant" type="number" min={50} max={20000} className={inputCls} value={v.previousRent} onChange={(e) => set({ previousRent: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={labelCls} htmlFor="analitza-notes">
              {ca ? "Informació addicional (opcional)" : "Información adicional (opcional)"}
            </label>
            <textarea id="analitza-notes" rows={2} maxLength={300} className={`${inputCls} resize-y`} value={v.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={ca ? "Ex.: reformada el 2025, moblat, àtic…" : "Ej.: reformado en 2025, amueblado, ático…"} />
          </div>
        </div>
      </details>

      {/* mapa (variant full): la vista hi injecta Leaflet sobre aquest contenidor */}
      {variant === "full" && (
        <div>
          <label className={labelCls}>
            {ca ? "O marca el punt exacte al mapa (opcional)" : "O marca el punto exacto en el mapa (opcional)"}
          </label>
          <div id="analitza-map" className="h-56 sm:h-64 w-full rounded-xl border border-line overflow-hidden z-0" />
          <p className="mt-1 text-[11px] text-stone">
            {v.lat != null && v.lng != null
              ? `${ca ? "Punt marcat" : "Punto marcado"}: ${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`
              : (ca ? "Clic al mapa per marcar la ubicació de la vivenda (cartografia ICGC)." : "Haz clic en el mapa para marcar la ubicación de la vivienda (cartografía ICGC).")}
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm font-semibold text-ember3" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-ember text-white font-bold text-base px-6 py-3.5 hover:bg-ember2 transition-all hover:shadow-lg hover:shadow-orange-200 disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        {loading
          ? (ca ? "Consultant dades oficials…" : "Consultando datos oficiales…")
          : (ca ? "Compara l'anunci amb la referència oficial" : "Compara el anuncio con la referencia oficial")}
      </button>
      <p className="text-[11px] text-stone leading-relaxed">
        {ca
          ? "Gratuït i sense registre. Cap dada personal: només municipi, característiques de la vivenda i el preu que vols comprovar. Comparació estadística: el resultat no valora el teu habitatge."
          : "Gratuito y sin registro. Ningún dato personal: solo municipio, características de la vivienda y el precio que quieres comprobar. Comparación estadística: el resultado no valora tu vivienda."}
      </p>
    </form>
  );
}
