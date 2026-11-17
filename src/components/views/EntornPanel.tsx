"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Zap, Train, Bus, GraduationCap, HeartPulse, Landmark, Bike, BadgeCheck, SearchX } from "lucide-react";
import { PanelSkeleton } from "@/components/ui/skeletons";

/**
 * v40 — Bloc «SERVEIS I QUALITAT DE L'ENTORN» de la fitxa d'edifici (Fase A).
 * Font: GET /api/entorn/:buildingId (ICAEN + fonts puntuals de la Generalitat).
 * Degradació elegant: sense dades → es diu clarament, mai s'inventa.
 * Distàncies en línia recta (haversine), sempre etiquetades com a tals.
 * Estètica idèntica a la resta de la fitxa (cards border-line, DemografiaPanel).
 */

interface EntornResponse {
  ok: boolean;
  buildingId: string;
  refcat: string | null;
  energia: {
    disponible: boolean;
    certificats: Array<{
      numCas: string;
      us: string | null;
      qualificacioConsum: string | null;
      qualificacioEmissions: string | null;
      consumKwhM2: number | null;
      emissionsCo2KgM2: number | null;
      eina: string | null;
      motiu: string | null;
      dataEntrada: string | null;
    }>;
    refcatUsada: string | null;
    nota: string;
  };
  mobilitat: {
    disponible: boolean;
    parades: Array<{ kind: string | null; nom: string; distM: number }>;
    grupsParades: Array<{ kind: string; nearest: Array<{ nom: string; distM: number }>; counts: Record<string, number> }>;
    recarrega: Array<{ nom: string; distM: number; props: Record<string, unknown> }>;
    countsParades: Record<string, number>;
    countsRecarrega: Record<string, number>;
  };
  serveis: {
    disponible: boolean;
    grups: Array<{ kind: string; nearest: Array<{ nom: string; distM: number }>; counts: Record<string, number> }>;
  };
  fonts: Array<{ code: string; name: string; institution: string; license: string }>;
  distanciesNota: string;
  generatedAt: string;
}

const RADIOS = [300, 500, 1000, 2000];

/** Color de la qualificació energètica (escala oficial A-G). */
function ratingCls(r: string | null): string {
  switch ((r ?? "").toUpperCase()) {
    case "A":
      return "bg-green-100 text-green-800 border-green-300";
    case "B":
      return "bg-lime-100 text-lime-800 border-lime-300";
    case "C":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "D":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "E":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "F":
    case "G":
      return "bg-red-100 text-red-800 border-red-300";
    default:
      return "bg-sand text-stone border-line";
  }
}

function kindIcon(kind: string, className: string) {
  if (kind.startsWith("FARMACIA")) return <HeartPulse className={className} />;
  if (kind.startsWith("EDUCAC")) return <GraduationCap className={className} />;
  if (kind.startsWith("CULTURA") || kind.startsWith("BIBLIOT")) return <Landmark className={className} />;
  if (kind.startsWith("ESPORT")) return <Bike className={className} />;
  if (kind.startsWith("METRO") || kind.startsWith("TREN") || kind.startsWith("FGC") || kind.startsWith("RODALIES") || kind.startsWith("TRAM")) return <Train className={className} />;
  if (kind.startsWith("BUS")) return <Bus className={className} />;
  return <MapPinLike className={className} />;
}

function MapPinLike({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default function EntornPanel({ buildingId }: { buildingId: string | null }) {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [d, setD] = useState<EntornResponse | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [radius, setRadius] = useState(500);

  useEffect(() => {
    // sense edifici no hi ha res a carregar: la UI retorna null (veure baix)
    if (!buildingId) return;
    let dead = false;
    fetch(`/api/entorn/${encodeURIComponent(buildingId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (dead) return;
        setD(json as EntornResponse);
        setLoadedFor(buildingId);
      })
      .catch(() => {
        if (!dead) {
          setFailed(true);
          setLoadedFor(buildingId);
        }
      });
    return () => {
      dead = true;
    };
  }, [buildingId]);

  if (!buildingId) return null;
  // pending mentre el buildingId canvia (evita mostrar dades de l'edifici anterior)
  const pending = loadedFor !== buildingId;
  const cert = d?.energia.certificats[0];

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-semibold text-stone uppercase tracking-wide">
          {ca ? "Serveis i qualitat de l'entorn" : "Servicios y calidad del entorno"}
        </div>
        {/* Radios del encàrrec: 300/500/1000/2000 m */}
        <div className="flex gap-1">
          {RADIOS.map((r) => (
            <button
              key={r}
              onClick={() => setRadius(r)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                radius === r ? "bg-pine text-white border-pine" : "bg-transparent text-stone border-line hover:bg-sand"
              }`}
              title={r >= 1000 ? `${r / 1000} km` : `${r} m`}
            >
              {r >= 1000 ? `${r / 1000}k` : r}
            </button>
          ))}
        </div>
      </div>

      {pending && !failed && (
        // v60 — esqueleto (transició sense salts entre edificis)
        <div className="py-2" role="status" aria-live="polite">
          <PanelSkeleton rows={2} />
        </div>
      )}
      {failed && (
        <div className="text-xs text-stone py-2">
          {ca ? "Informació d'entorn no disponible ara mateix." : "Información del entorno no disponible ahora mismo."}
        </div>
      )}

      {!pending && d && (
        <div className="space-y-4">
          {/* ── EFICIÈNCIA ENERGÈTICA (ICAEN, per ref. catastral) ── */}
          <div className="rounded-lg bg-sand/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-stone uppercase tracking-wide">
              <BadgeCheck className="w-3 h-3" />
              {ca ? "Eficiència energètica (certificat)" : "Eficiencia energética (certificado)"}
            </div>
            {cert ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-black ${ratingCls(cert.qualificacioConsum)}`}>
                  {ca ? "Consum" : "Consumo"} {cert.qualificacioConsum ?? "—"}
                </span>
                <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-black ${ratingCls(cert.qualificacioEmissions)}`}>
                  CO₂ {cert.qualificacioEmissions ?? "—"}
                </span>
                {cert.consumKwhM2 != null && (
                  <span className="text-[11px] text-stone">
                    {cert.consumKwhM2} kWh/m²·any · {cert.emissionsCo2KgM2 != null ? `${cert.emissionsCo2KgM2} kgCO₂/m²·any` : ""}
                  </span>
                )}
                {cert.us && <span className="text-[11px] text-stone">· {cert.us}</span>}
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone">
                <SearchX className="w-3.5 h-3.5" />
                {ca ? "Sense informació disponible" : "Sin información disponible"}
              </div>
            )}
            <div className="mt-1 text-[10px] text-stone leading-relaxed">{d.energia.nota}</div>
          </div>

          {/* ── MOBILITAT (parades + recàrrega) ── */}
          <div>
            <div className="text-[11px] font-bold text-pine mb-1.5">
              {ca ? "Mobilitat" : "Movilidad"}
              <span className="font-normal text-stone"> · {ca ? "radi" : "radio"} {radius} m</span>
            </div>
            {d.mobilitat.disponible ? (
              <div className="space-y-2">
                {d.mobilitat.grupsParades
                  .filter((g) => Number(g.counts[String(radius)] ?? 0) > 0)
                  .map((g) => (
                    <div key={g.kind} className="flex items-start gap-2 text-[11px] text-stone">
                      <span className="text-pine mt-0.5">{kindIcon(g.kind, "w-3.5 h-3.5 shrink-0")}</span>
                      <span>
                        <b className="text-pine">{Number(g.counts[String(radius)] ?? 0)}</b>{" "}
                        {ca ? "parades" : "paradas"} · {g.nearest.slice(0, 2).map((n) => `${n.nom} (${n.distM} m)`).join(" · ")}
                      </span>
                    </div>
                  ))}
                {Number(d.mobilitat.countsRecarrega[String(radius)] ?? 0) > 0 && (
                  <div className="flex items-start gap-2 text-[11px] text-stone">
                    <Zap className="w-3.5 h-3.5 shrink-0 text-ember3 mt-0.5" />
                    <span>
                      <b className="text-pine">{d.mobilitat.countsRecarrega[String(radius)]}</b>{" "}
                      {ca ? "estacions de recàrrega" : "estaciones de recarga"} ·{" "}
                      {d.mobilitat.recarrega
                        .filter((r) => r.distM <= radius)
                        .slice(0, 2)
                        .map((r) => `${r.props.kw != null ? `${r.props.kw} kW` : ""} ${r.distM} m`)
                        .join(" · ")}
                    </span>
                  </div>
                )}
                {Number(d.mobilitat.countsParades[String(radius)] ?? 0) === 0 &&
                  Number(d.mobilitat.countsRecarrega[String(radius)] ?? 0) === 0 && (
                    <div className="text-[11px] text-stone">
                      {ca ? "Res dins del radi seleccionat — prova un radi més gran." : "Nada dentro del radio seleccionado — prueba un radio mayor."}
                    </div>
                  )}
              </div>
            ) : (
              <div className="text-[11px] text-stone">
                {ca ? "Sense informació disponible (importació en curs o sense punts propers)." : "Sin información disponible (importación en curso o sin puntos cercanos)."}
              </div>
            )}
          </div>

          {/* ── SERVEIS (salut, educació, cultura, esport...) ── */}
          <div>
            <div className="text-[11px] font-bold text-pine mb-1.5">
              {ca ? "Serveis" : "Servicios"}
              <span className="font-normal text-stone"> · {ca ? "radi" : "radio"} {radius} m</span>
            </div>
            {d.serveis.disponible ? (
              <div className="space-y-2">
                {d.serveis.grups
                  .filter((g) => Number(g.counts[String(radius)] ?? 0) > 0)
                  .slice(0, 6)
                  .map((g) => (
                    <div key={g.kind} className="flex items-start gap-2 text-[11px] text-stone">
                      <span className="text-pine mt-0.5">{kindIcon(g.kind, "w-3.5 h-3.5 shrink-0")}</span>
                      <span>
                        <b className="text-pine">{Number(g.counts[String(radius)] ?? 0)}</b> {g.kind.toLowerCase()} ·{" "}
                        {g.nearest
                          .filter((n) => n.distM <= radius)
                          .slice(0, 2)
                          .map((n) => `${n.nom} (${n.distM} m)`)
                          .join(" · ")}
                      </span>
                    </div>
                  ))}
                {d.serveis.grups.every((g) => Number(g.counts[String(radius)] ?? 0) === 0) && (
                  <div className="text-[11px] text-stone">
                    {ca ? "Res dins del radi seleccionat — prova un radi més gran." : "Nada dentro del radio seleccionado — prueba un radio mayor."}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-stone">
                {ca ? "Sense informació disponible (importació en curs o sense punts propers)." : "Sin información disponible (importación en curso o sin puntos cercanos)."}
              </div>
            )}
          </div>

          {/* Fonts + nota de distàncies (traçabilitat obligatòria) */}
          <div className="text-[10px] text-stone leading-relaxed">
            {d.distanciesNota}
            <br />
            {ca ? "Fonts" : "Fuentes"}: {d.fonts.map((f) => f.institution).join(" · ")}.{" "}
            {ca ? "Llicència" : "Licencia"}: {d.fonts[0]?.license}.{" "}
            {ca ? "Una estadística municipal mai no es presenta com a dada d'aquest edifici." : "Una estadística municipal nunca se presenta como dato de este edificio."}
          </div>
        </div>
      )}
    </div>
  );
}
