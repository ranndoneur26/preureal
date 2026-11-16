/**
 * Preureal — F2 «Estima el lloguer del teu habitatge» (redisseny de la Home):
 * lògica PURA (sense BD ni xarxa) de l'estimació progressiva de la renta
 * d'UNA vivenda introduïda per l'usuari.
 *
 * F2 entrega el NIVELL 1 (N1): base estadística oficial — la fiança municipal
 * vigent d'Incasòl (€/mes, vivenda típica ≈85 m²) — escalada per superfície
 * amb l'elasticitat documentada (VAL_BETA_SUPERFICIE = 0,8) i horquilla amb la
 * dispersió MESURADA del pool territorial (comarca ≥5 municipis; si no
 * província ≥10; si no, sèrie històrica del municipi). Reutilitza el motor
 * validat computeValuation (src/lib/territorial.ts) SENSE els ajustos de
 * característiques: a F2 només es demana municipi + superfície, perquè és
 * l'única cosa que el càlcul usa (regla d'or: no demanar dades que no s'utilitzen).
 *
 * Garanties de transparència (compte amb el criteri del projecte):
 *  - el resultat és SEMPRE un RANG orientatiu (mai una xifra única de taxació);
 *  - traçabilitat completa: font, període, nº contractes, mètode i dispersió;
 *  - degradació honesta: sense fiança municipal ni referència de comarca →
 *    «dades insuficients» + consulta oficial SERPAVI (mai inventar res);
 *  - la referència de comarca (municipis sense fiança publicada) es marca
 *    sempre com a ESTIMACIÓ amb confiança BAIXA (ho força el motor validat);
 *  - el rang amb validesa legal només el dóna SERPAVI (MIVAU): enllaç oficial
 *    sempre disponible i avís legal en zones tensades (Llei 12/2023).
 */

import {
  computeValuation,
  round1,
  VAL_REF_M2,
  type ValuationData,
  type ValuationWarning,
} from "./territorial";
import { ORIENTATION_DISCLAIMER, SERPAVI_URL } from "./analitza";

// ── Tipus ────────────────────────────────────────────────────────────────────

export type EstimaLevel = "N1";

/** Entrada mínima de F2 — exactament les dades que el càlcul N1 utilitza. */
export interface EstimaInput {
  municipalityCode: string;
  municipalityName: string;
  surfaceM2: number;
}

/** Dades preparades per l'API (BD local, mateixes fonts que Analitza). */
export interface EstimaData {
  /** Fiança municipal OFICIAL Incasòl (€/mes) o null si el municipi no la publica. */
  rentLatest: number | null;
  rentPeriod: string | null;
  /** nº de contractes amb fiança depositada (mostra municipal). */
  contracts: number | null;
  /** Sèrie històrica municipal {"2025": 750.5, ...} (fallback de l'horquilla). */
  history: Record<string, number> | null;
  /** Fiances dels municipis de la comarca el mateix any (dispersió MESURADA). */
  comarcaValues: number[];
  /** Idem província (pool més ampli si la comarca té <5 municipis amb dada). */
  provinciaValues: number[];
  /** Referència de comarca ponderada (ESTIMACIÓ) quan no hi ha fiança municipal. */
  comarcaRefLatest: number | null;
  comarcaRefPeriod: string | null;
  /** Zona tensada (Resolucions TER/3739/2026 i TER/3740/2026, DOGC 19-10-2026). */
  tense: boolean;
}

export type EstimaFailureReason = "NO_RENT" | "BAD_INPUT";

export type EstimaOutcome =
  | { ok: true; result: EstimationResult }
  | { ok: false; reason: EstimaFailureReason };

export interface EstimationResult {
  level: EstimaLevel;
  /** RANG orientatiu — el resultat no es presenta mai fora d'aquest rang. */
  min: number;
  max: number;
  central: number;
  /** Base estadística exposada intacta (traçabilitat). */
  baseCentral: number;
  baseSource: "MUNICIPI" | "COMARCA_REF";
  basePeriod: string | null;
  contracts: number | null;
  surfaceM2: number;
  /** DERIVAT: baseCentral / 85 m² de la vivenda típica (€/m²·mes típic). */
  eurM2Typical: number | null;
  /** DERIVAT: central / superfície introduïda (mai de la font). */
  eurM2: number | null;
  bandBasis: "COMARCA" | "PROVINCIA" | "HISTORICA";
  bandN: number;
  bandYear: string | null;
  relativeDispersion: number;
  confidence: "ALTA" | "MITJANA" | "BAIXA";
  confidenceKeys: string[];
  /** En N1 sempre ["AJUST_SUPERFICIE"] — cap ajust de característiques. */
  adjustmentKeys: string[];
  /** Avisos d'habitabilitat informatius (Decret 141/2012), no alteren el càlcul. */
  warnings: ValuationWarning[];
  tense: boolean;
}

// ── Constants i sanitització ────────────────────────────────────────────────

/** Rang de superfície acceptat (mateixos llindars que Analitza). El motor
 *  satura fora del rang calibrat (20–400 m²) i ho exposa a warnings. */
export const ESTIMA_SURFACE_MIN = 5;
export const ESTIMA_SURFACE_MAX = 500;

export function sanitizeEstimaSurface(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= ESTIMA_SURFACE_MIN && n <= ESTIMA_SURFACE_MAX ? n : null;
}

export function sanitizeEstimaMunicipalityCode(v: unknown): string | null {
  const s = String(v ?? "").slice(0, 6);
  return /^\d{6}$/.test(s) ? s : null;
}

// ── Motor N1 ────────────────────────────────────────────────────────────────

/**
 * Estimació N1: base oficial × escalat per superfície, amb horquilla de
 * dispersió mesurada i confiança per regles explícites (tot això el fa el
 * motor validat computeValuation; aquest embolcall exposa el resultat amb el
 * nivell N1 i la traçabilitat que la UI ha de mostrar SEMPRE).
 */
export function buildEstimation(data: EstimaData, input: EstimaInput): EstimaOutcome {
  const surface = sanitizeEstimaSurface(input.surfaceM2);
  if (!surface) return { ok: false, reason: "BAD_INPUT" };

  const valuationData: ValuationData = {
    rentLatest: data.rentLatest,
    rentPeriod: data.rentPeriod,
    contracts: data.contracts,
    history: data.history,
    comarcaValues: data.comarcaValues,
    provinciaValues: data.provinciaValues,
    comarcaRefLatest: data.comarcaRefLatest,
    comarcaRefPeriod: data.comarcaRefPeriod,
  };
  // N1: NOMÉS superfície — cap ajust de característiques (estat, habitacions…):
  // són els nivells següents del redisseny i NO es demanen ni s'apliquen aquí.
  const outcome = computeValuation(valuationData, { surfaceM2: surface, rooms: null, estat: null });
  if (!outcome.ok) return { ok: false, reason: "NO_RENT" };
  const r = outcome.result;

  return {
    ok: true,
    result: {
      level: "N1",
      central: r.central,
      min: r.min,
      max: r.max,
      baseCentral: r.baseCentral,
      baseSource: r.baseSource,
      basePeriod: data.rentPeriod ?? data.comarcaRefPeriod ?? null,
      contracts: data.contracts,
      surfaceM2: surface,
      eurM2Typical: r.baseCentral > 0 ? round1(r.baseCentral / VAL_REF_M2) : null,
      eurM2: r.eurM2,
      bandBasis: r.bandBasis,
      bandN: r.bandN,
      bandYear: r.bandYear,
      relativeDispersion: r.relativeDispersion,
      confidence: r.confidence,
      confidenceKeys: r.confidenceKeys,
      adjustmentKeys: r.adjustments.map((a) => a.key),
      warnings: r.warnings,
      tense: data.tense,
    },
  };
}

// ── Constants de transparència (compartides amb Analitza/F1) ────────────────

/**
 * Text fix de transparència: el mateix que a «Consulta el preu real registrat».
 * S'ha de mostrar a TOTA tarjeta de resultat de l'estimació.
 */
export const ESTIMA_DISCLAIMER = ORIENTATION_DISCLAIMER;

/** Portal oficial SERPAVI (MIVAU): el rang amb validesa legal només el dóna ell. */
export const ESTIMA_SERPAVI_URL = SERPAVI_URL;

export const ESTIMA_SOURCES = [
  {
    t: "Fiances de lloguer (Incasòl)",
    u: "https://incasol.gencat.cat/",
    d: "fiança mitjana mensual i nº de contractes per municipi; explotació d'habitatge.gencat.cat — base estadística del nivell N1",
  },
  {
    t: "Metodologia del motor de valoració (constants documentades)",
    u: "https://github.com/ranndoneur26/preureal/blob/main/src/lib/territorial.ts",
    d: "superfície de referència (85 m², Observatori del Lloguer + INE 2023) i elasticitat renta-superfície (0,8; estudis hedònics UB/DIW)",
  },
  {
    t: "SERPAVI — Sistema Estatal de Referència de Preus de lloguer (MIVAU)",
    u: SERPAVI_URL,
    d: "consulta oficial del rang de referència per parcel·la: l'única xifra amb validesa legal",
  },
  {
    t: "Zones tensades",
    u: "https://dogc.gencat.cat/",
    d: "Resolució TER/3739/2026 (pròrroga, 118 municipis) i TER/3740/2026 (nous, 53 municipis), DOGC 19-10-2026",
  },
] as const;

export const ESTIMA_LIMITATIONS = [
  "LIMIT_N1_BASE_MUNICIPAL: la base és la fiança mitjana MUNICIPAL de la vivenda típica registrada a Incasòl (≈85 m²); l'escalat per superfície és estadístic i no considera característiques concretes (estat, ascensor, moblat, planta): són els ajustos del nivell N2, pendents d'arribar amb les fases següents del redisseny.",
  "LIMIT_COMARCA_REF: si el municipi no té fiança publicada (mostra petita), la base és la referència de comarca ponderada pel nº de contractes, marcada sempre com a ESTIMACIÓ amb confiança BAIXA — mai dada municipal inventada.",
  "LIMIT_HORQUILLA_MESURADA: l'amplada del rang és la dispersió relativa mesurada (IQR) del pool territorial (comarca ≥5 municipis amb dada; si no, província ≥10; si no, sèrie històrica municipal) — mai un percentil inventat.",
  "LIMIT_SERPAVI_LEGAL: aquest rang és una estimació estadística orientativa; el rang amb validesa legal per a la teva parcel·la només el dóna SERPAVI (MIVAU), sobretot en zones tensades i per a grans tenedores.",
  "LIMIT_HABITABILITAT: superfícies < 20 m² (o < 5 m² per habitació) generen avisos informatius d'habitabilitat (Decret 141/2012) que no alteren el càlcul.",
  "LIMIT_PRIVACITAT: el nivell N1 no demana adreça ni referència catastral; no es guarda cap dada personal ni s'associa la consulta a cap usuari.",
] as const;
