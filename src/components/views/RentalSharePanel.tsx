"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Skeleton } from "@/components/ui/skeletons";

/**
 * v41 — Bloc «PARC D'HABITATGES I MERCAT DEL LLOGUER» de la fitxa municipal
 * de l'aplicació (al costat de DemografiaPanel). Font: GET /api/rental-share.
 * Degradació elegant: sense dades → estat explicatiu, mai s'inventen valors.
 * Estètica idèntica a la resta de la fitxa (cards border-line).
 */

interface RsResponse {
  ok: boolean;
  muni: { code: string; name: string } | null;
  current: {
    referenceKey: string;
    rentalPercentage: number | null;
    dataStatus: string;
    warnings: string[];
    methodologyVersion: string;
    incasolActiveDeposits: number | null;
    incasolPeriod: string | null;
    incasolDepositsPeriod: number | null;
    incasolFluxPeriod: string | null;
    residentialProperties: number | null;
    cadastreYear: string | null;
    censusMainRental: number | null;
    censusMainTotal: number | null;
    censusRentalPercentage: number | null;
    censusYear: string | null;
    sources: { incasol: string | null; cadastre: string | null; census: string | null };
  } | null;
  flujoSerie: Array<{ year: string; contractes: number }>;
  catalunyaCensus: { rental: number | null; total: number | null; pct: number | null } | null;
}

const fmt0 = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => n.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RentalSharePanel({ muniCode }: { muniCode: string }) {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [d, setD] = useState<RsResponse | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    fetch(`/api/rental-share?muni=${muniCode}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (dead) return;
        setD(json as RsResponse);
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
  }, [muniCode]);

  const pending = loadedFor !== muniCode;
  const c = d?.current ?? null;
  const flujo = d?.flujoSerie ?? [];

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-xs font-semibold text-stone uppercase tracking-wide mb-3">
        {ca ? "Parc d'habitatges i mercat del lloguer" : "Parque de viviendas y mercado del alquiler"}
      </div>

      {pending && !failed && (
        // v60 — esqueleto que imita la forma del contingut (transició sense salts)
        <div className="py-3 space-y-2" role="status" aria-live="polite">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
      {failed && (
        <div className="text-xs text-stone py-2">
          {ca ? "Indicador no disponible ara mateix." : "Indicador no disponible ahora mismo."}
        </div>
      )}

      {!pending && !failed && (
        <div className="space-y-3">
          {/* % estimat compost */}
          {c?.rentalPercentage != null ? (
            <div className="rounded-lg bg-sand/60 px-3 py-2">
              <div className="text-[10px] font-semibold text-stone uppercase tracking-wide">
                {ca ? "% aproximat de lloguer sobre el parc residencial" : "% aproximado de alquiler sobre el parque residencial"}
              </div>
              <div className="text-2xl font-black text-ember3 leading-tight">{fmtPct(c.rentalPercentage)}%</div>
              <div className="text-[10px] text-stone">
                {ca ? "Fiances vigents" : "Fianzas vigentes"}: {c.incasolActiveDeposits != null ? fmt0(c.incasolActiveDeposits) : "—"}
                {" · "}
                {ca ? "Parc residencial" : "Parque residencial"}: {c.residentialProperties != null ? fmt0(c.residentialProperties) : "—"}
                {c.incasolPeriod ? ` · ${c.incasolPeriod}` : ""}
                {c.cadastreYear ? ` / ${c.cadastreYear}` : ""}
              </div>
              {c.dataStatus === "TIMING_MISMATCH" && (
                <div className="mt-1 text-[10px] text-ember3">
                  {ca ? "Desfasament temporal entre fonts: valor indicatiu." : "Desfase temporal entre fuentes: valor indicativo."}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-sand/60 px-3 py-2 text-[11px] text-moss leading-relaxed">
              <b className="text-pine">{ca ? "% aproximat de lloguer sobre el parc residencial — sense informació suficient" : "% aproximado de alquiler sobre el parque residencial — sin información suficiente"}.</b>{" "}
              {ca
                ? "El numerador (fiances vigents Incasòl) i el denominador (parc residencial catastral) no tenen publicació oficial municipal oberta encara. Mai s'inventen valors."
                : "El numerador (fianzas vigentes Incasòl) y el denominador (parque residencial catastral) no tienen todavía publicación oficial municipal abierta. Nunca se inventan valores."}
            </div>
          )}

          {/* referència censal oficial */}
          {c?.censusRentalPercentage != null && (
            <div className="text-xs text-moss">
              <b className="text-pine">{fmtPct(c.censusRentalPercentage)}%</b>{" "}
              {ca ? "de les vivendes principals en lloguer — Cens" : "de las viviendas principales en alquiler — Censo"}{" "}
              {c.censusYear ?? "2021"}
              {c.censusMainRental != null && c.censusMainTotal != null
                ? `: ${fmt0(c.censusMainRental)} / ${fmt0(c.censusMainTotal)}`
                : ""}
              {d?.catalunyaCensus?.pct != null ? ` · ${ca ? "CAT" : "ESP"} ${fmtPct(d.catalunyaCensus.pct)}%` : ""}
            </div>
          )}

          {/* flux anual (últims anys) */}
          {flujo.length > 0 && (
            <div className="text-xs text-moss">
              {ca ? "Contractes amb fiança dipositada (flux)" : "Contratos con fianza depositada (flujo)"}:{" "}
              <b className="text-pine">
                {[...flujo]
                  .slice(-4)
                  .reverse()
                  .map((f) => `${f.year}: ${fmt0(f.contractes)}`)
                  .join(" · ")}
              </b>
              <div className="mt-1 text-[10px] text-stone leading-relaxed">
                {ca
                  ? "Flux anual d'altes al Registre de fiances (Incasòl): activitat del mercat, no vivendes llogades ni estoc."
                  : "Flujo anual de altas en el Registro de fianzas (Incasòl): actividad del mercado, ni viviendas alquiladas ni stock."}
              </div>
            </div>
          )}

          <div className="text-[10px] text-stone leading-relaxed">
            {ca ? "Fonts" : "Fuentes"}: Incasòl (Registre de fiances, via Dades Obertes), Idescat (Cens 2021),
            Cadastre ({ca ? "pendent de publicació verificada" : "pendiente de publicación verificada"}).{" "}
            {ca ? "Elaboració pròpia; metodologia i limitacions a" : "Elaboración propia; metodología y limitaciones en"}{" "}
            <a href="/metodologia" className="underline">/metodologia</a>.
          </div>
        </div>
      )}
    </div>
  );
}
