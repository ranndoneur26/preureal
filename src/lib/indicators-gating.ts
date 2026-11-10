/**
 * PreuReal.cat — Fase 4: gating dels indicadors oficials per pla.
 *
 * La Taula 8 de la proposta defineix el reparte gratuït/Premium:
 *  - GRATUÏT: mediana municipal de referència + teaser (avís de que la resta
 *    existeix i està disponible) + guia legal completa.
 *  - PREMIUM/PRO: banda completa P25/mediana/P75 + posició del preu
 *    (referenciaAmpliada) i IPVA + renda + esforç + deltas territorials
 *    (indicadorsTerritorials).
 *
 * La decisió SEMPRE al servidor: per a un pla gratuït les dades premium no
 * surten ni una sola vegada de l'API (el client només rep nulls i el teaser).
 * Funcions PURA → testables sense BD.
 */
import type { MuniIndicators } from "@/lib/indicators";

export type PlanIdLite = "FREE" | "PREMIUM" | "PRO";

export interface IndicatorAllowFlags {
  referenciaAmpliada: boolean;
  indicadorsTerritorials: boolean;
}

export interface GatedIndicators {
  plan: PlanIdLite;
  /** Visible per a TOTS els plans (Taula 8: mediana municipal de referència). */
  medianaMunicipal: { p50: number; n: number; basis: string } | null;
  /** Només FREE: avís de disponibilitat (només quan la dada existeix de debò). */
  teaser: { bandaDisponible: boolean; esforcDisponible: boolean } | null;
  /** PREMIUM/PRO amb referenciaAmpliada. */
  bandaCompleta: MuniIndicators["band"];
  posVsMedian: MuniIndicators["posVsMedian"];
  refBand: MuniIndicators["refBand"];
  /** PREMIUM/PRO amb indicadorsTerritorials. */
  ipva: MuniIndicators["ipva"] | null;
  renta: MuniIndicators["renta"] | null;
  effort: MuniIndicators["effort"] | null;
  terrDelta: MuniIndicators["terrDelta"] | null;
  fontsUsed: string[];
  avisos: string[];
  generatedAt: string;
}

/**
 * Talla el bloc complet d'indicadors segons el pla i els flags vigents.
 * Mai llança: amb qualsevol entrada retorna un payload segur.
 */
export function gateIndicators(
  full: MuniIndicators | null,
  plan: PlanIdLite,
  allows: IndicatorAllowFlags,
): GatedIndicators {
  const fullAccess = plan !== "FREE" && full !== null;
  const ampl = fullAccess && allows.referenciaAmpliada;
  const terr = fullAccess && allows.indicadorsTerritorials;
  return {
    plan,
    medianaMunicipal:
      full?.band != null ? { p50: full.band.p50, n: full.band.n, basis: full.band.basis } : null,
    teaser:
      full === null || plan !== "FREE"
        ? null
        : {
            bandaDisponible: full.band !== null,
            esforcDisponible: full.effort.hogar !== null,
          },
    bandaCompleta: ampl ? (full?.band ?? null) : null,
    posVsMedian: ampl ? (full?.posVsMedian ?? null) : null,
    refBand: ampl ? (full?.refBand ?? null) : null,
    ipva: terr ? (full?.ipva ?? null) : null,
    renta: terr ? (full?.renta ?? null) : null,
    effort: terr ? (full?.effort ?? null) : null,
    terrDelta: terr ? (full?.terrDelta ?? null) : null,
    fontsUsed: full?.fontsUsed ?? [],
    avisos: full?.avisos ?? [],
    generatedAt: full?.generatedAt ?? new Date().toISOString(),
  };
}
