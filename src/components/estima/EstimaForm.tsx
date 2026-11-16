"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Ruler, WandSparkles } from "lucide-react";
import { useApp } from "@/components/app-context";
import {
  EmailFirstField,
  GateLockedPanel,
  GateMagicPanel,
  GateQuotaPanel,
  GateSignupPanel,
  useDraftAutoRun,
  useEmailFirst,
} from "@/components/emailfirst/EmailFirst";
import { ESTIMA_SURFACE_MIN, ESTIMA_SURFACE_MAX, ESTIMA_ROOMS_MAX } from "@/lib/estima";
import { buildSignupRedirect, returnRouteFor } from "@/lib/email-first";

/**
 * F2/F3 «Estima el lloguer del teu habitatge» — formulari PROGRESSIU de 2 passos.
 * variant "compact": a la portada (pestanya «Estima»). variant "full": a #/estima.
 *
 * v46 — flux EMAIL-FIRST amb registre obligatori: l'e-mail és la PRIMERA
 * casella del formulari (precarregat de la sessió amb «Canvia d'usuari»);
 * sense compte, el panell de resultats mostra «Registra't primer» i el
 * bloqueig REAL és al servidor (401 REGISTRAT_PRIMER a /api/estima + quota
 * per user_id). La taula de decisió completa viu a useEmailFirst().submitGate().
 *
 * Demana EXACTAMENT el que el càlcul usa (regla d'or): municipi + superfície
 * sempre (N1); estat de conservació i habitacions OPCIONALS (N2, els únics
 * ajustos amb coeficient documentat i validat al motor). Cap adreça, cap
 * referència catastral, cap característica sense coeficient documentat
 * (ascensor, aparcament, moblat, planta… no es demanen). L'e-mail només
 * identifica el compte i aplica la quota: mai s'envia al body ni a analytics.
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
    rooms?: number | null;
    estat?: string | null;
    isTense: boolean;
  };
  estimation?: import("@/lib/estima").EstimationResult;
  disclaimer?: { ca: string; es: string };
  serpaviUrl?: string;
  message?: string;
}

interface EstimaValues {
  municipalityCode: string;
  municipalityName: string;
  surfaceM2: string;
  rooms: string;
  estat: string;
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
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const [step, setStep] = useState<1 | 2>(1);
  const [muni, setMuni] = useState<EstimaMuniLite | null>(null);
  const [munQuery, setMunQuery] = useState("");
  const [munOptions, setMunOptions] = useState<EstimaMuniLite[]>([]);
  const [surface, setSurface] = useState("");
  const [rooms, setRooms] = useState("");
  const [estat, setEstat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const munBoxRef = useRef<HTMLDivElement>(null);

  // v46 — flux email-first (e-mail primera casella + taula de decisió)
  const ef = useEmailFirst("estima");

  // N2 real: només si un ajust de característica s'aplicarà de debò (mateixa
  // semàntica que el motor: estat declarat, o habitacions ≥1 amb superfície).
  const n2 = estat !== "" || (rooms !== "" && Number(rooms) >= 1);

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

  /** Consulta real (el servidor aplica sessió + quota: 401/402 mapejats). */
  const executeQuery = async (vals: EstimaValues) => {
    if (!vals.municipalityCode) {
      setStep(1);
      setError(ca ? "Tria el municipi per començar." : "Elige el municipio para empezar.");
      return;
    }
    const m2 = Number(vals.surfaceM2);
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
          municipalityCode: vals.municipalityCode,
          municipalityName: vals.municipalityName,
          surfaceM2: m2,
          ...(vals.rooms !== "" ? { rooms: Number(vals.rooms) } : {}),
          ...(vals.estat !== "" ? { estat: vals.estat } : {}),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.ok) {
        // v46 — bloquejos del SERVIDOR al panell de bloqueig (mai un error sec)
        if (ef.applyServerError(res.status, d)) return;
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

  const currentValues = (): EstimaValues => ({
    municipalityCode: muni?.code ?? "",
    municipalityName: muni?.name ?? "",
    surfaceM2: surface,
    rooms,
    estat,
  });

  /** Submit del formulari = flux email-first (guarda esborrany + decideix). */
  const handleEmailFirstSubmit = () => {
    const vals = currentValues();
    void ef.submitGate(vals as unknown as Record<string, unknown>, () => executeQuery(vals));
  };

  // v46 — esborrany: en tornar del registre/magic link (sessió nova), restaura
  // els valors i executa l'estimació automàticament (l'usuari no torna a
  // escriure res). Sense sessió l'esborrany espera: mai es perd.
  useDraftAutoRun(
    "estima",
    ef.sessionEmail,
    (d) => {
      const values = (d.values ?? {}) as Partial<EstimaValues>;
      if (values.municipalityCode) {
        setMuni({
          code: values.municipalityCode,
          name: values.municipalityName ?? "",
          comarca: null,
          lat: 0,
          lng: 0,
        });
        setStep(2);
      }
      if (typeof values.surfaceM2 === "string") setSurface(values.surfaceM2);
      if (typeof values.rooms === "string") setRooms(values.rooms);
      if (typeof values.estat === "string") setEstat(values.estat);
      if (d.autoRun && values.municipalityCode && Number(values.surfaceM2) >= ESTIMA_SURFACE_MIN) {
        void executeQuery({
          municipalityCode: values.municipalityCode,
          municipalityName: values.municipalityName ?? "",
          surfaceM2: values.surfaceM2 ?? "",
          rooms: values.rooms ?? "",
          estat: values.estat ?? "",
        });
      }
    },
    (values) => Boolean(values.municipalityCode) && Number(values.surfaceM2) >= ESTIMA_SURFACE_MIN,
    () => {},
  );

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

  // panell de bloqueig segons l'estat del flux (neix bloquejat sense compte)
  const gatePanel = ef.gate === "locked" ? (
    ef.redirecting
      ? <GateSignupPanel ca={ca} />
      : (
        <GateLockedPanel
          ca={ca}
          onSignup={() => {
            const em = ef.email.trim().toLowerCase();
            navigate(buildSignupRedirect(em, returnRouteFor("estima", variant)));
          }}
        />
      )
  ) : ef.gate === "magic" ? (
    <GateMagicPanel ca={ca} />
  ) : ef.gate === "quota" ? (
    <GateQuotaPanel onPlans={() => navigate("/preus")} />
  ) : null;

  return (
    <div className="flex flex-col gap-3.5">
      {/* v46 — PRIMERA casella: l'e-mail (registre obligatori, flux email-first) */}
      <EmailFirstField
        value={ef.email}
        onChange={(x) => { ef.setEmail(x); ef.setEmailError(null); }}
        readOnly={Boolean(ef.sessionEmail)}
        error={ef.emailError}
        inputRef={ef.emailRef}
        ca={ca}
        onSwitchUser={() => void ef.switchUser()}
        onEnter={() => { if (step === 2) handleEmailFirstSubmit(); }}
      />

      {stepIndicator}
      <p className="text-[11px] font-semibold text-stone" aria-live="polite">
        {ca
          ? step === 1
            ? "Pas 1 de 2 · Municipi"
            : `Pas 2 de 2 · Superfície i característiques — ${muni?.name ?? ""}`
          : step === 1
            ? "Paso 1 de 2 · Municipio"
            : `Paso 2 de 2 · Superficie y características — ${muni?.name ?? ""}`}
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
                  handleEmailFirstSubmit();
                }
              }}
            />
            <p className="mt-1 text-[11px] text-stone">
              {ca
                ? "Superfície aproximada (útil o construïda): el motor la satura dins del rang calibrat i t'ho indica."
                : "Superficie aproximada (útil o construida): el motor la satura dentro del rango calibrado y te lo indica."}
            </p>
          </div>

          {/* F3 (N2): característiques OPCIONALS amb coeficient documentat */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="estima-rooms">
                {ca ? "Habitacions" : "Habitaciones"} <span className="text-stone font-normal">({ca ? "opcional" : "opcional"})</span>
              </label>
              <input
                id="estima-rooms"
                type="number"
                inputMode="numeric"
                min={0}
                max={ESTIMA_ROOMS_MAX}
                className={inputCls}
                placeholder={ca ? "Ex.: 3" : "Ej.: 3"}
                value={rooms}
                onChange={(e) => setRooms(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="estima-estat">
                {ca ? "Estat de conservació" : "Estado de conservación"} <span className="text-stone font-normal">({ca ? "opcional" : "opcional"})</span>
              </label>
              <select
                id="estima-estat"
                className={inputCls}
                value={estat}
                onChange={(e) => setEstat(e.target.value)}
              >
                <option value="">{ca ? "No ho sé" : "No lo sé"}</option>
                <option value="A_REFORMAR">{ca ? "A reformar" : "A reformar"}</option>
                <option value="BON_ESTAT">{ca ? "Bon estat" : "Buen estado"}</option>
                <option value="REFORMADA">{ca ? "Reformada" : "Reformada"}</option>
                <option value="OBRA_NOVA">{ca ? "Obra nova" : "Obra nueva"}</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-stone leading-relaxed">
            {ca
              ? "Només aquestes dues característiques tenen coeficient documentat i s'apliquen (estat i densitat m²/habitació); si les deixes en blanc, l'estimació segueix sent N1. No demanem ascensor, aparcament, moblat, planta ni energia: sense coeficient documentat, no els apliquem ni els inventem."
              : "Solo estas dos características tienen coeficiente documentado y se aplican (estado y densidad m²/habitación); si las dejas en blanco, la estimación sigue siendo N1. No pedimos ascensor, aparcamiento, amueblado, planta ni energía: sin coeficiente documentado, no los aplicamos ni los inventamos."}
          </p>
        </>
      )}

      {error && <p className="text-sm font-semibold text-ember3" role="alert">{error}</p>}

      {step === 2 ? (
        <button
          type="button"
          onClick={handleEmailFirstSubmit}
          disabled={loading || ef.busy || ef.redirecting}
          className="w-full rounded-xl bg-ember text-white font-bold text-base px-6 py-3.5 hover:bg-ember2 transition-all hover:shadow-lg hover:shadow-orange-200 disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
        >
          {loading || ef.busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <WandSparkles className="w-5 h-5" />}
          {loading || ef.busy
            ? (ca ? "Comprovant el compte…" : "Comprobando la cuenta…")
            : (ca ? `Estima el rang orientatiu (N${n2 ? "2" : "1"})` : `Estima el rango orientativo (N${n2 ? "2" : "1"})`)}
        </button>
      ) : (
        <p className="text-[11px] text-stone flex items-center gap-1.5">
          <ArrowRight className="w-3.5 h-3.5 text-pine shrink-0" />
          {ca
            ? "Després et demanaré la superfície i, si vols, estat i habitacions — res més."
            : "Después te pediré la superficie y, si quieres, estado y habitaciones — nada más."}
        </p>
      )}

      {/* v46 — panells de bloqueig del flux email-first */}
      {gatePanel}

      <p className="text-[11px] text-stone leading-relaxed flex items-start gap-1.5">
        <Ruler className="w-3.5 h-3.5 text-pine shrink-0 mt-0.5" />
        {ca
          ? "Nivells N1 i N2: base estadística oficial (fiança municipal Incasòl) escalada per superfície, amb ajustos opcionals per estat de conservació i habitacions (coeficients documentats). Gratuït amb registre Free: l'e-mail només identifica el compte i aplica la quota; no demanem adreça ni referència catastral. El resultat és sempre un RANG orientatiu, mai una taxació."
          : "Niveles N1 y N2: base estadística oficial (fianza municipal Incasòl) escalada por superficie, con ajustos opcionales por estado de conservación y habitaciones (coeficientes documentados). Gratuito con registro Free: el e-mail solo identifica la cuenta y aplica la cuota; no pedimos dirección ni referencia catastral. El resultado es siempre un RANGO orientativo, nunca una tasación."}
      </p>
    </div>
  );
}
