"use client";

/**
 * PreuReal.cat — Noves funcionalitats (F4): panell de valoració orientativa
 * de la renta d'una vivenda concreta (Premium/Pro).
 *
 * El formulari només recull característiques (superfície, habitacions, estat);
 * TOTA la valoració la fa el servidor (POST /api/valuation) amb la fiança
 * Incasòl vigent (base oficial, vivenda típica ~85 m²) + ajustos hedònics
 * aproximats i VISIBLES al desglossament (motor v2, constants documentades a
 * src/lib/territorial.ts). El client mai decideix res: sense sessió
 * Premium/Pro la resposta és 403, sense quota 402. L'horquilla és TERRITORIAL
 * (dispersió mesurada de la comarca/província el mateix any).
 */

import { useState } from "react";
import { useApp } from "@/components/app-context";
import { useUserPlan } from "@/hooks/use-user-plan";
import { Calculator, Lock, Info } from "lucide-react";

interface ValuationAdjustment {
  key: "AJUST_SUPERFICIE" | "AJUST_ESTAT" | "AJUST_HABITACIONS";
  factor: number;
  detail: string;
}

interface ValuationResult {
  central: number;
  baseCentral: number;
  typical: boolean;
  adjustments: ValuationAdjustment[];
  min: number;
  max: number;
  bandBasis: "COMARCA" | "PROVINCIA" | "HISTORICA";
  bandN: number;
  bandYear: string | null;
  relativeDispersion: number;
  confidence: "ALTA" | "MITJANA" | "BAIXA";
  confidenceKeys: string[];
  eurM2: number | null;
  notes: { rooms: string | null; estat: string | null; surface: string | null };
}

const ESTATS: Array<{ id: string; ca: string; es: string }> = [
  { id: "A_REFORMAR", ca: "A reformar", es: "A reformar" },
  { id: "BON_ESTAT", ca: "Bon estat", es: "Buen estado" },
  { id: "REFORMADA", ca: "Reformada", es: "Reformada" },
  { id: "OBRA_NOVA", ca: "Obra nova", es: "Obra nueva" },
];

function estatNote(id: string | null, ca: boolean): string | null {
  if (!id) return null;
  switch (id) {
    case "A_REFORMAR":
      return ca
        ? "A reformar: descompte aproximat del 20% sobre la fiança municipal (referència de mercat: reformar pot pujar la renta un ~30%)."
        : "A reformar: descuento aproximado del 20% sobre la fianza municipal (referencia de mercado: reformar puede subir la renta un ~30%).";
    case "BON_ESTAT":
      return ca
        ? "Bon estat: sense ajust; és la referència del parc de lloguer."
        : "Buen estado: sin ajuste; es la referencia del parque de alquiler.";
    case "REFORMADA":
      return ca
        ? "Reformada: prima aproximada del 6% sobre la fiança municipal."
        : "Reformada: prima aproximada del 6% sobre la fianza municipal.";
    default:
      return ca
        ? "Obra nova: prima aproximada del 12% sobre la fiança municipal."
        : "Obra nueva: prima aproximada del 12% sobre la fianza municipal.";
  }
}

function roomsNote(id: string | null, ca: boolean): string | null {
  if (!id) return null;
  if (id === "ROOMS_LOW")
    return ca
      ? "Formats petits (1-2 hab): la superfície típica estimada és menor que la vivenda mitjana i el preu s'ajusta a la baixa."
      : "Formatos pequeños (1-2 hab): la superficie típica estimada es menor que la vivienda media y el precio se ajusta a la baja.";
  if (id === "ROOMS_MID")
    return ca
      ? "Format modal del mercat (3-4 hab): superfície típica propera a la vivenda mitjana (~85 m²)."
      : "Formato modal del mercado (3-4 hab): superficie típica cercana a la vivienda media (~85 m²).";
  return ca
    ? "Formats grans: més superfície típica, però amb €/m² menor (efecte mida)."
    : "Formatos grandes: más superficie típica, pero con €/m² menor (efecto tamaño).";
}

const confidenceStyle: Record<string, { bg: string; fg: string }> = {
  ALTA: { bg: "#e4f2e8", fg: "#1e7a41" },
  MITJANA: { bg: "#fdf3e0", fg: "#9a6a1a" },
  BAIXA: { bg: "#fbe9e2", fg: "#b0431c" },
};

const ESTAT_LABEL: Record<string, { ca: string; es: string }> = {
  A_REFORMAR: { ca: "A reformar", es: "A reformar" },
  BON_ESTAT: { ca: "Bon estat", es: "Buen estado" },
  REFORMADA: { ca: "Reformada", es: "Reformada" },
  OBRA_NOVA: { ca: "Obra nova", es: "Obra nueva" },
};

const AJUST_LABEL: Record<string, { ca: string; es: string }> = {
  AJUST_SUPERFICIE: { ca: "Superfície", es: "Superficie" },
  AJUST_ESTAT: { ca: "Estat", es: "Estado" },
  AJUST_HABITACIONS: { ca: "Habitacions", es: "Habitaciones" },
};

function pctFactor(f: number): string {
  const p = Math.round((f - 1) * 100);
  return p === 0 ? "0%" : `${p > 0 ? "+" : ""}${p}%`;
}

export default function ValuationPanel({ muniCode, muniName }: { muniCode: string; muniName: string }) {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const { hasPremiumAccess, loading: planLoading, refresh } = useUserPlan();

  const [surface, setSurface] = useState("");
  const [rooms, setRooms] = useState("");
  const [estat, setEstat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [result, setResult] = useState<ValuationResult | null>(null);

  const fmt = (v: number): string => v.toLocaleString(ca ? "ca-ES" : "es-ES");

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipalityCode: muniCode,
          surfaceM2: parseFloat(surface) || null,
          rooms: rooms === "" ? null : parseInt(rooms, 10),
          estat: estat || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(d.valuation as ValuationResult);
        setQuota(d.quota ?? null);
        refresh();
      } else if (res.status === 402) {
        setError(
          ca
            ? `Has arribat al límit de ${d.quota?.limit ?? "?"} valoracions aquest mes.`
            : `Has llegado al límite de ${d.quota?.limit ?? "?"} valoraciones este mes.`,
        );
      } else if (res.status === 422) {
        setError(d.message ?? (ca ? "Aquest municipi no té dada vigent de fiances." : "Este municipio no tiene dato vigente de fianzas."));
      } else if (res.status === 403) {
        setError(ca ? "La valoració és per a comptes Premium o Pro." : "La valoración es para cuentas Premium o Pro.");
      } else {
        setError(ca ? "No s'ha pogut calcular la valoració. Torna-ho a provar." : "No se ha podido calcular la valoración. Inténtalo de nuevo.");
      }
    } catch {
      setError(ca ? "Error de xarxa. Torna-ho a provar." : "Error de red. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-[#0f2e21] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-[#e8673c]" />
        <div className="font-bold text-[#0f2e21] text-sm">
          {ca ? "Valoració orientativa de lloguer" : "Valoración orientativa de alquiler"}
        </div>
      </div>

      {planLoading ? null : !hasPremiumAccess ? (
        <div className="rounded-lg border border-[#f3d9b0] bg-[#fdf6ec] p-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#b0431c] shrink-0" />
          <p className="text-xs text-[#7a4a1c] flex-1">
            {ca
              ? "Amb Premium o Pro: horquilla de lloguer orientativa per a la teva vivenda a partir de les fiances oficials d'Incasòl i la dispersió real de la teva comarca."
              : "Con Premium o Pro: horquilla de alquiler orientativa para tu vivienda a partir de las fianzas oficiales de Incasòl y la dispersión real de tu comarca."}
          </p>
          <button onClick={() => navigate("/preus")} className="px-3 py-1.5 rounded-lg bg-[#e8673c] text-white text-[11px] font-bold shrink-0 hover:bg-[#d95a31]">
            {ca ? "Veure plans" : "Ver planes"}
          </button>
        </div>
      ) : (
        <>
          {!result && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-[10px] font-semibold text-[#6b6f68] uppercase">{ca ? "Superfície (m²)" : "Superficie (m²)"}</span>
                  <input
                    inputMode="numeric"
                    value={surface}
                    onChange={(e) => setSurface(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="75"
                    className="mt-0.5 w-full rounded-lg border border-[#e5e1da] px-2 py-1.5 text-sm focus:outline-none focus:border-[#e8673c]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold text-[#6b6f68] uppercase">{ca ? "Habitacions" : "Habitaciones"}</span>
                  <select value={rooms} onChange={(e) => setRooms(e.target.value)} className="mt-0.5 w-full rounded-lg border border-[#e5e1da] px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#e8673c]">
                    <option value="">{ca ? "—" : "—"}</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold text-[#6b6f68] uppercase">{ca ? "Estat" : "Estado"}</span>
                  <select value={estat} onChange={(e) => setEstat(e.target.value)} className="mt-0.5 w-full rounded-lg border border-[#e5e1da] px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#e8673c]">
                    <option value="">{ca ? "—" : "—"}</option>
                    {ESTATS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {ca ? e.ca : e.es}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                onClick={submit}
                disabled={busy}
                className="w-full rounded-lg bg-[#e8673c] py-2 text-sm font-bold text-white hover:bg-[#d95a31] disabled:opacity-50"
              >
                {busy ? (ca ? "Calculant…" : "Calculando…") : ca ? `Valorar a ${muniName}` : `Valorar en ${muniName}`}
              </button>
              <p className="text-[10px] text-[#6b6f68]">
                {ca
                  ? "Central: fiança municipal oficial d'Incasòl per a la vivenda típica (~85 m²). Superfície, habitacions i estat apliquen ajustos aproximats de mercat que veuràs desglossats. Horquilla: dispersió real de la comarca el mateix any."
                  : "Central: fianza municipal oficial de Incasòl para la vivienda típica (~85 m²). Superficie, habitaciones y estado aplican ajustes aproximados de mercado que verás desglosados. Horquilla: dispersión real de la comarca el mismo año."}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-[#f3d9b0] bg-[#fdf6ec] p-2.5 text-xs text-[#7a4a1c] flex items-center justify-between gap-2">
              <span>{error}</span>
              {(error.includes("límit") || error.includes("límite")) && (
                <button onClick={() => navigate("/preus")} className="shrink-0 underline font-bold">
                  {ca ? "Veure plans" : "Ver planes"}
                </button>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2.5">
              <div className="rounded-lg bg-[#faf9f7] border border-[#e5e1da] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[11px] text-[#6b6f68]">{ca ? "Horquilla orientativa /mes" : "Horquilla orientativa /mes"}</div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: confidenceStyle[result.confidence].bg, color: confidenceStyle[result.confidence].fg }}>
                    {ca ? "Confiança" : "Confianza"}: {result.confidence}
                  </span>
                </div>
                <div className="mt-1.5 flex items-end justify-center gap-2">
                  <div className="text-center">
                    <div className="text-sm font-bold text-[#4b5349]">{fmt(result.min)} €</div>
                    <div className="text-[9px] text-[#6b6f68]">{ca ? "mínima" : "mínima"}</div>
                  </div>
                  <div className="text-center px-3">
                    <div className="text-2xl font-black text-[#0f2e21]">{fmt(result.central)} €</div>
                    <div className="text-[9px] text-[#6b6f68]">{ca ? "central / més probable" : "central / más probable"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-[#4b5349]">{fmt(result.max)} €</div>
                    <div className="text-[9px] text-[#6b6f68]">{ca ? "màxima" : "máxima"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#e5e1da] bg-white p-3 space-y-1">
                <div className="text-[10px] font-semibold text-[#6b6f68] uppercase">
                  {ca ? "Com es calcula" : "Cómo se calcula"}
                </div>
                <div className="flex justify-between text-xs text-[#4b5349]">
                  <span>{ca ? "Fiança municipal (vivenda típica)" : "Fianza municipal (vivienda típica)"}</span>
                  <b>{fmt(result.baseCentral)} €</b>
                </div>
                {result.adjustments.map((a) => (
                  <div key={a.key} className="flex justify-between text-xs text-[#4b5349]">
                    <span>
                      {ca ? AJUST_LABEL[a.key]?.ca : AJUST_LABEL[a.key]?.es}{" "}
                      <span className="text-[10px] text-[#6b6f68]">
                        · {a.key === "AJUST_ESTAT" ? (ca ? ESTAT_LABEL[a.detail]?.ca ?? a.detail : ESTAT_LABEL[a.detail]?.es ?? a.detail) : a.detail}
                      </span>
                    </span>
                    <b className={a.factor >= 1 ? "text-[#1e7a41]" : "text-[#b0431c]"}>{pctFactor(a.factor)}</b>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-[#0f2e21] border-t border-[#e5e1da] pt-1">
                  <span className="font-semibold">{ca ? "Central ajustada" : "Central ajustada"}</span>
                  <b>{fmt(result.central)} €</b>
                </div>
              </div>

              {result.eurM2 !== null && (
                <div className="text-xs text-[#4b5349]">
                  ≈ <b>{fmt(result.eurM2)} €/m²·mes</b>{" "}
                  <span className="text-[10px] text-[#6b6f68]">
                    ({ca ? "derivat de la superfície introduïda; la font oficial no publica €/m²" : "derivado de la superficie introducida; la fuente oficial no publica €/m²"})
                  </span>
                </div>
              )}

              <ul className="space-y-1">
                {roomsNote(result.notes.rooms, ca) && (
                  <li className="text-[11px] text-[#4b5349] flex gap-1.5">
                    <Info className="w-3 h-3 mt-0.5 shrink-0 text-[#6b6f68]" />
                    {roomsNote(result.notes.rooms, ca)}
                  </li>
                )}
                {estatNote(result.notes.estat, ca) && (
                  <li className="text-[11px] text-[#4b5349] flex gap-1.5">
                    <Info className="w-3 h-3 mt-0.5 shrink-0 text-[#6b6f68]" />
                    {estatNote(result.notes.estat, ca)}
                  </li>
                )}
              </ul>

              <div className="text-[10px] text-[#6b6f68] leading-relaxed">
                {ca ? "Amplada de l'horquilla: " : "Anchura de la horquilla: "}
                {result.bandBasis === "COMARCA"
                  ? ca ? "dispersió de la comarca" : "dispersión de la comarca"
                  : result.bandBasis === "PROVINCIA"
                    ? ca ? "dispersió de la província" : "dispersión de la provincia"
                    : ca ? "rang històric del municipi" : "rango histórico del municipio"}
                {result.bandYear ? ` · any ${result.bandYear}` : ""}
                {result.bandN ? ` · n=${result.bandN} municipis` : ""}
                {" · "}
                {ca
                  ? "ajustos de mercat aproximats sobre la fiança oficial: no és una taxació d'immoble"
                  : "ajustes de mercado aproximados sobre la fianza oficial: no es una tasación de inmueble"}
                {quota && quota.limit >= 0 ? ` · ${quota.used}/${quota.limit} ${ca ? "valoracions aquest mes" : "valoraciones este mes"}` : ""}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setResult(null); setError(null); }} className="flex-1 rounded-lg border border-[#e5e1da] py-2 text-xs font-bold text-[#0f2e21] hover:bg-[#f0ede8]">
                  {ca ? "Nova valoració" : "Nueva valoración"}
                </button>
                <button onClick={() => navigate("/panell")} className="flex-1 rounded-lg bg-[#0f2e21] py-2 text-xs font-bold text-white hover:bg-[#1a3d2e]">
                  {ca ? "Al meu panell" : "A mi panel"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
