"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Ruler, WandSparkles } from "lucide-react";
import { useApp } from "@/components/app-context";
import { ESTIMA_SURFACE_MIN, ESTIMA_SURFACE_MAX } from "@/lib/estima";

/**
 * F2 «Estima el lloguer del teu habitatge» — formulari PROGRESSIU de 2 passos.
 * variant "compact": a la portada (pestanya «Estima»). variant "full": a #/estima.
 *
 * Demana EXACTAMENT el que el nivell N1 usa (regla d'or): municipi + superfície.
 * Cap adreça, cap referència catastral, cap característica que encara no es
 * calcula (estat, ascensor… arriben amb el nivell N2/F3) i cap dada personal.
 */

export interface EstimaMuniLite {
  code: string;
  name: string;
  comarca: string | null;
  lat: number;
  lng: number;
  isTense?: boolean;
}

export interface EstimaPayload {
  ok: boolean;
  available: boolean;
  reason?: string;
  generatedAt: string;
  input?: {
    municipalityCode: string;
    municipalityName: string;
    comarca: string | null;
    province: string | null;
    surfaceM2: number;
    isTense: boolean;
  };
  estimation?: import("@/lib/estima").EstimationResult;
  disclaimer?: { ca: string; es: string };
  serpaviUrl?: string;
  message?: string;
}

export default function EstimaForm({
  variant,
  onResult,
  onLoadingChange,
}: {
  variant: "compact" | "full";
  onResult: (data: EstimaPayload) => void;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [step, setStep] = useState<1 | 2>(1);
  const [muni, setMuni] = useState<EstimaMuniLite | null>(null);
  const [munQuery, setMunQuery] = useState("");
  const [munOptions, setMunOptions] = useState<EstimaMuniLite[]>([]);
  const [surface, setSurface] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const munBoxRef = useRef<HTMLDivElement>(null);

  // cerca de municipis (BD local, instantània) — debounce curt; les neteges de
  // consultes curtes es fan durant el render (patró AnalitzaForm/MapView)
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

  if (munQuery.trim().length < 2 && munOptions.length > 0) setMunOptions([]);

  // tancar el desplegable en clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (munBoxRef.current && !munBoxRef.current.contains(e.target as Node)) setMunOptions([]);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pickMuni = (m: EstimaMuniLite) => {
    setMuni(m);
    setMunQuery("");
    setMunOptions([]);
    setStep(2);
    setError(null);
  };

  const submit = async () => {
    if (!muni) {
      setStep(1);
      setError(ca ? "Tria el municipi per començar." : "Elige el municipio para empezar.");
      return;
    }
    const m2 = Number(surface);
    if (!Number.isFinite(m2) || m2 < ESTIMA_SURFACE_MIN || m2 > ESTIMA_SURFACE_MAX) {
      setError(ca
        ? `Introdueix la superfície (entre ${ESTIMA_SURFACE_MIN} i ${ESTIMA_SURFACE_MAX} m²).`
        : `Introduce la superficie (entre ${ESTIMA_SURFACE_MIN} y ${ESTIMA_SURFACE_MAX} m²).`);
      return;
    }
    setError(null);
    setLoading(true);
    onLoadingChange?.(true);
    try {
      const res = await fetch("/api/estima", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipalityCode: muni.code,
          municipalityName: muni.name,
          surfaceM2: m2,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d?.message || (ca ? "No s'ha pogut calcular l'estimació. Revisa les dades." : "No se ha podido calcular la estimación. Revisa los datos."));
        return;
      }
      onResult(d as EstimaPayload);
    } catch {
      setError(ca ? "Error de xarxa. Reintenta en uns instants." : "Error de red. Reintenta en unos instantes.");
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-[15px] outline-none focus:border-pine min-h-[48px]";
  const labelCls = "block text-xs font-bold text-moss mb-1.5";

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-1" aria-hidden="true">
      {[1, 2].map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-full flex-1 transition-colors ${step >= n ? "bg-pine" : "bg-line"}`}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3.5">
      {stepIndicator}
      <p className="text-[11px] font-semibold text-stone" aria-live="polite">
        {ca
          ? step === 1
            ? "Pas 1 de 2 · Municipi"
            : `Pas 2 de 2 · Superfície — ${muni?.name ?? ""}`
          : step === 1
            ? "Paso 1 de 2 · Municipio"
            : `Paso 2 de 2 · Superficie — ${muni?.name ?? ""}`}
      </p>

      {step === 1 ? (
        <div ref={munBoxRef} className="relative">
          <label className={labelCls} htmlFor="estima-muni">
            {ca ? "Municipi de l'habitatge *" : "Municipio de la vivienda *"}
          </label>
          <input
            id="estima-muni"
            type="text"
            autoComplete="off"
            className={inputCls}
            placeholder={ca ? "Ex.: Manresa, Barcelona, Girona…" : "Ej.: Manresa, Barcelona, Girona…"}
            value={munQuery || muni?.name || ""}
            onChange={(e) => {
              setMunQuery(e.target.value);
              if (e.target.value.trim() !== muni?.name) setMuni(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && muni) {
                e.preventDefault();
                setStep(2);
              }
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
          {munQuery.trim().length >= 2 && munOptions.length === 0 && (
            <p className="mt-1 text-xs text-stone">{ca ? "Cap municipi trobat amb aquest nom." : "Ningún municipio encontrado con ese nombre."}</p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-sand border border-line px-3.5 py-2.5 text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-pine shrink-0" />
            <span className="font-semibold">{muni?.name}</span>
            <span className="text-stone text-xs">{muni?.comarca ?? ""}{muni?.isTense ? (ca ? " · zona tensada" : " · zona tensionada") : ""}</span>
            <button
              type="button"
              onClick={() => { setStep(1); }}
              className="ml-auto text-xs font-semibold text-pine hover:underline flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {ca ? "Canvia" : "Cambia"}
            </button>
          </div>
          <div>
            <label className={labelCls} htmlFor="estima-m2">
              {ca ? "Superfície de l'habitatge (m²) *" : "Superficie de la vivienda (m²) *"}
            </label>
            <input
              id="estima-m2"
              type="number"
              inputMode="numeric"
              min={ESTIMA_SURFACE_MIN}
              max={ESTIMA_SURFACE_MAX}
              className={inputCls}
              placeholder={ca ? "Ex.: 75" : "Ej.: 75"}
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <p className="mt-1 text-[11px] text-stone">
              {ca
                ? "Superfície aproximada (útil o construïda): el motor la satura dins del rang calibrat i t'ho indica."
                : "Superficie aproximada (útil o construida): el motor la satura dentro del rango calibrado y te lo indica."}
            </p>
          </div>
        </>
      )}

      {error && <p className="text-sm font-semibold text-ember3" role="alert">{error}</p>}

      {step === 2 ? (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading}
          className="w-full rounded-xl bg-ember text-white font-bold text-base px-6 py-3.5 hover:bg-ember2 transition-all hover:shadow-lg hover:shadow-orange-200 disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <WandSparkles className="w-5 h-5" />}
          {loading
            ? (ca ? "Calculant amb la base oficial…" : "Calculando con la base oficial…")
            : (ca ? "Estima el rang orientatiu (N1)" : "Estima el rango orientativo (N1)")}
        </button>
      ) : (
        <p className="text-[11px] text-stone flex items-center gap-1.5">
          <ArrowRight className="w-3.5 h-3.5 text-pine shrink-0" />
          {ca ? "Després et demanaré només la superfície — res més." : "Después te pediré solo la superficie — nada más."}
        </p>
      )}

      <p className="text-[11px] text-stone leading-relaxed flex items-start gap-1.5">
        <Ruler className="w-3.5 h-3.5 text-pine shrink-0 mt-0.5" />
        {ca
          ? "Nivell N1: base estadística oficial (fiança municipal Incasòl) escalada per superfície. Cap dada personal: no demanem adreça ni referència catastral i res no s'associa al teu usuari. El resultat és sempre un RANG orientatiu, mai una taxació."
          : "Nivel N1: base estadística oficial (fianza municipal Incasòl) escalada por superficie. Ningún dato personal: no pedimos dirección ni referencia catastral y nada se asocia a tu usuario. El resultado es siempre un RANGO orientativo, nunca una tasación."}
      </p>
    </div>
  );
}
