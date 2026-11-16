"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, Loader2, ChevronDown, BadgeCheck } from "lucide-react";
import { useApp } from "@/components/app-context";
import {
  EmailFirstField,
  GateLockedPanel,
  GateMagicPanel,
  GateQuotaPanel,
  GateSignupPanel,
  useDraftAutoRun,
  useEmailFirst,
  type GateKind,
} from "@/components/emailfirst/EmailFirst";
import { buildSignupRedirect, returnRouteFor } from "@/lib/email-first";

/**
 * F1 «Consulta el preu real registrat» — formulari compartit.
 * variant "compact": a la portada (camps avançats plegats).
 * variant "full": a #/analitza (amb mapa ICGC per marcar el punt exacte).
 *
 * v46 — flux EMAIL-FIRST amb registre obligatori: l'e-mail és la PRIMERA
 * casella (precarregat de la sessió amb «Canvia d'usuari»); el panell de
 * resultats neix bloquejat («Registra't primer») i el bloqueig REAL és al
 * servidor (401 REGISTRAT_PRIMER + quota per user_id a /api/analitza). La
 * taula de decisió completa viu a useEmailFirst().submitGate(): no registrat
 * → registre Free amb e-mail precarregat i esborrany conservat; registrat
 * sense sessió → magic link; en tornar, l'esborrany es restaura i la consulta
 * s'executa sola. L'e-mail és dada personal: només identifica el compte i
 * aplica la quota; mai s'envia al body de la consulta ni a analytics.
 *
 * Dades demanades: mínimes per a l'anàlisi. L'adreça usa el Geocodificador
 * oficial ICGC (via /api/geocode) i omple municipi i punt. El resultat és una
 * COMPARACIÓ ESTADÍSTICA, mai una valoració individual.
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
  builtYear: string;
  previousRent: string;
  notes: string;
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
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const [v, setV] = useState<AnalitzaFormValues>(emptyValues);
  const [munQuery, setMunQuery] = useState("");
  const [munOptions, setMunOptions] = useState<MuniLite[]>([]);
  const [geoOptions, setGeoOptions] = useState<GeocodeLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const munBoxRef = useRef<HTMLDivElement>(null);
  const geoBoxRef = useRef<HTMLDivElement>(null);

  // v46 — flux email-first (e-mail primera casella + taula de decisió)
  const ef = useEmailFirst("analitza");

  const set = (patch: Partial<AnalitzaFormValues>) => {
    setV((prev) => {
      const next = { ...prev, ...patch };
      if (patch.lat != null && patch.lng != null) onPointChange?.({ lat: patch.lat, lng: patch.lng });
      if (patch.lat === null && patch.lng === null) onPointChange?.(null);
      return next;
    });
  };

  /** Consulta real (el servidor aplica sessió + quota: 401/402 mapejats). */
  const executeQuery = async (vals: AnalitzaFormValues) => {
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
          // v48 — sense contractType: el servidor el fixa a HABITATGE (les
          // dades oficials de fiances Incasòl només cobreixen habitatge habitual)
          builtYear: vals.builtYear ? Number(vals.builtYear) : undefined,
          previousRent: vals.previousRent ? Number(vals.previousRent) : undefined,
          notes: vals.notes || undefined,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) {
        // v46 — bloquejos del SERVIDOR al panell de bloqueig (mai un error sec)
        if (ef.applyServerError(res.status, d)) return;
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

  /** Submit del formulari = flux email-first (guarda esborrany + decideix). */
  const handleEmailFirstSubmit = () => {
    void ef.submitGate(v as unknown as Record<string, unknown>, () => executeQuery(v));
  };

  // v46 — esborrany: en tornar del registre/magic link (sessió nova), restaura
  // els valors i executa la consulta automàticament (l'usuari no torna a
  // escriure res). Sense sessió l'esborrany espera: mai es perd.
  useDraftAutoRun(
    "analitza",
    ef.sessionEmail,
    (d) => {
      const filled = { ...emptyValues, ...(d.values as Partial<AnalitzaFormValues>) };
      // v48 — els esborranys anteriors (< v48) poden portar contractType
      // (TEMPORADA/HABITACIO): el camp ja no existeix al formulari ni al body,
      // el servidor coacciona qualsevol valor a HABITATGE. Mai es restaura.
      delete (filled as { contractType?: unknown }).contractType;
      setV(filled);
      if (filled.lat != null && filled.lng != null) onPointChange?.({ lat: filled.lat, lng: filled.lng });
      if (d.autoRun && filled.municipalityCode && Number(filled.priceEurMonth) >= 50) {
        void executeQuery(filled);
      }
    },
    (values) => Boolean(values.municipalityCode) && Number(values.priceEurMonth) >= 50,
    () => {},
  );

  // punt marcat al mapa (vista full): sincronitza al formulari durant el render
  // (patró React d'ajust d'estat quan canvien les props — l'estat del pare ja és
  // el mateix punt, no cal notificar de tornada: mai bucles)
  if (externalPoint && (externalPoint.lat !== v.lat || externalPoint.lng !== v.lng)) {
    setV((prev) => ({ ...prev, lat: externalPoint.lat, lng: externalPoint.lng }));
  }
  // neteja de desplegables amb consultes massa curtes (durant el render, patró MapView)
  if (munQuery.trim().length < 2 && munOptions.length > 0) setMunOptions([]);
  if ((v.address ?? "").trim().length < 5 && geoOptions.length > 0) setGeoOptions([]);

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

  // panell de bloqueig segons l'estat del flux (neix bloquejat sense compte)
  const gatePanel = ef.gate === "locked" ? (
    ef.redirecting
      ? <GateSignupPanel ca={ca} />
      : (
        <GateLockedPanel
          ca={ca}
          onSignup={() => {
            const em = ef.email.trim().toLowerCase();
            navigate(buildSignupRedirect(em, returnRouteFor("analitza", variant)));
          }}
        />
      )
  ) : ef.gate === "magic" ? (
    <GateMagicPanel ca={ca} />
  ) : ef.gate === "quota" ? (
    <GateQuotaPanel onPlans={() => navigate("/preus")} />
  ) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleEmailFirstSubmit();
      }}
      className="flex flex-col gap-3.5"
    >
      {/* v46 — PRIMERA casella: l'e-mail (registre obligatori, flux email-first) */}
      <EmailFirstField
        value={ef.email}
        onChange={(x) => { ef.setEmail(x); ef.setEmailError(null); }}
        readOnly={Boolean(ef.sessionEmail)}
        error={ef.emailError}
        inputRef={ef.emailRef}
        ca={ca}
        onSwitchUser={() => void ef.switchUser()}
      />

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

      {/* v49 — etiqueta FIXA visible (mai un selector): «habitatge habitual»
          és l'única modalitat amb dades oficials aplicables (fiances Incasòl);
          el servidor fixa HABITATGE (v48) i l'informe ho documenta. */}
      <div>
        <span className={labelCls}>{ca ? "Tipus de contracte" : "Tipo de contrato"}</span>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-cream px-3.5 min-h-[44px] text-sm font-semibold text-moss" aria-live="polite">
          <BadgeCheck className="w-4 h-4 text-pine shrink-0" aria-hidden="true" />
          <span>{ca ? "Habitatge habitual" : "Vivienda habitual"}</span>
          <span className="ml-auto text-[10px] font-semibold text-stone uppercase tracking-wide">{ca ? "fixat" : "fijo"}</span>
        </div>
        <p className="mt-1 text-[11px] text-stone leading-relaxed">
          {ca
            ? "Única modalitat amb dades oficials aplicables (fiances Incasòl): la comparació és per a l'habitatge habitual."
            : "Única modalidad con datos oficiales aplicables (fianzas Incasòl): la comparación es para la vivienda habitual."}
        </p>
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
        disabled={loading || ef.busy || ef.redirecting}
        className="w-full rounded-xl bg-ember text-white font-bold text-base px-6 py-3.5 hover:bg-ember2 transition-all hover:shadow-lg hover:shadow-orange-200 disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
      >
        {loading || ef.busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
        {loading || ef.busy
          ? (ca ? "Comprovant el compte…" : "Comprobando la cuenta…")
          : (ca ? "Compara l'anunci amb la referència oficial" : "Compara el anuncio con la referencia oficial")}
      </button>

      {/* v46 — panells de bloqueig del flux email-first (ara sota el botó) */}
      {gatePanel}

      <p className="text-[11px] text-stone leading-relaxed">
        {ca
          ? "Gratuït amb registre Free (3 consultes detallades al mes). L'e-mail només identifica el compte i aplica la quota al servidor; no demanem cap altra dada personal i res no s'associa al teu usuari sense compte. Comparació estadística: el resultat no valora el teu habitatge."
          : "Gratuito con registro Free (3 consultas detalladas al mes). El e-mail solo identifica la cuenta y aplica la cuota en el servidor; no pedimos ningún otro dato personal y nada se asocia a tu usuario sin cuenta. Comparación estadística: el resultado no valora tu vivienda."}
      </p>
    </form>
  );
}
