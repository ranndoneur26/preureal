/**
 * Preureal — F2/F3 «Estima el lloguer del teu habitatge» (redisseny de la
 * Home): lògica PURA (sense BD ni xarxa) de l'estimació progressiva de la
 * renta d'UNA vivenda introduïda per l'usuari.
 *
 * F2 entrega el NIVELL 1 (N1): base estadística oficial — la fiança municipal
 * vigent d'Incasòl (€/mes, vivenda típica ≈85 m²) — escalada per superfície
 * amb l'elasticitat documentada (VAL_BETA_SUPERFICIE = 0,8).
 * F3 entrega el NIVELL 2 (N2): ajustos MULTIPLICATIUS per característiques
 * amb coeficient documentat i validat al motor (estat de conservació
 * VAL_ESTAT_MULT i densitat m²/habitació VAL_ROOMS_*, limitada ±5%). Les
 * demés variables SERPAVI (ascensor, aparcament, any construcció, moblat,
 * planta, energia, piscina, zones comunitàries) NO es demanen: sense
 * coeficient documentat no s'inventa res (regla d'or).
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
  type EstatConservacio,
  type ValuationAdjustment,
  type ValuationData,
  type ValuationWarning,
} from "./territorial";
import { ORIENTATION_DISCLAIMER, SERPAVI_URL } from "./analitza";

// ── Tipus ────────────────────────────────────────────────────────────────────

/** F2 = N1 (municipi + superfície). F3 = N2 (ajustos per característiques
 *  documentades del motor validat: estat de conservació i habitacions).
 *  El nivell només puja a N2 quan un ajust de característica S'HA APLICAT
 *  de debò (mai només per haver omplert un camp sense efecte). */
export type EstimaLevel = "N1" | "N2";

/** Entrada de l'estimació: les dades que el càlcul utilitza. F3 (N2) afegeix
 *  habitacions i estat de conservació COM A OPCIONALS («no ho sé» → null →
 *  l'estimació continua sent N1). Les altres variables del formulari SERPAVI
 *  (ascensor, aparcament, any construcció, moblat, planta, energia, piscina,
 *  zones comunitàries) NO es demanen: sense coeficients documentats validats,
 *  demanar-les seria demanar dades que el càlcul no usa (regla d'or). */
export interface EstimaInput {
  municipalityCode: string;
  municipalityName: string;
  surfaceM2: number;
  /** nº d'habitacions (0 = estudi). Null = no s'ha introduït. */
  rooms?: number | null;
  /** Estat de conservació declarat. Null = no s'ha introduït. */
  estat?: EstatConservacio | null;
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
  /** Característiques introduïdes (traçabilitat de l'entrada; null = no demanades). */
  rooms: number | null;
  estat: EstatConservacio | null;
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
  /** Claus dels ajustos APLICATS en ordre d'aplicació. En N1 sempre
   *  ["AJUST_SUPERFICIE"]; en N2 pot incloure AJUST_ESTAT/AJUST_HABITACIONS. */
  adjustmentKeys: string[];
  /** Ajustos APLICATS amb detall visible (factor × descripció) per a la
   *  traçabilitat completa a la UI — mateixa semàntica que Analitza/F4. */
  adjustments: ValuationAdjustment[];
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

/** Habitacions: enter 0–12 (0 = estudi, mateix rang que Analitza).
 *  Null si falta o surt del rang — mai inventar. */
export const ESTIMA_ROOMS_MAX = 12;
export function sanitizeEstimaRooms(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= ESTIMA_ROOMS_MAX ? n : null;
}

/** Estat de conservació: una de les 4 categories del motor validat, o null. */
const ESTIMA_ESTATS: EstatConservacio[] = ["A_REFORMAR", "BON_ESTAT", "REFORMADA", "OBRA_NOVA"];
export function sanitizeEstimaEstat(v: unknown): EstatConservacio | null {
  const s = String(v ?? "");
  return (ESTIMA_ESTATS as string[]).includes(s) ? (s as EstatConservacio) : null;
}

// ── Motor N1 ────────────────────────────────────────────────────────────────

/**
 * Estimació progressiva F2/F3: base oficial × escalat per superfície (N1) +
 * ajustos per característiques documentades (N2: estat de conservació i
 * habitacions), amb horquilla de dispersió mesurada i confiança per regles
 * explícites (tot això el fa el motor validat computeValuation; aquest
 * embolcall exposa el resultat amb el nivell REAL i la traçabilitat que la
 * UI ha de mostrar SEMPRE).
 *
 * Nivell: N2 només si un ajust de característica S'HA APLICAT de debò
 * (estat declarat, o habitacions ≥1 amb superfície); si l'usuari omple camps
 * sense efecte (p. ex. 0 habitacions), l'estimació continua sent N1.
 */
export function buildEstimation(data: EstimaData, input: EstimaInput): EstimaOutcome {
  const surface = sanitizeEstimaSurface(input.surfaceM2);
  if (!surface) return { ok: false, reason: "BAD_INPUT" };
  const rooms = sanitizeEstimaRooms(input.rooms);
  const estat = sanitizeEstimaEstat(input.estat);

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
  const outcome = computeValuation(valuationData, { surfaceM2: surface, rooms, estat });
  if (!outcome.ok) return { ok: false, reason: "NO_RENT" };
  const r = outcome.result;

  // Nivell REAL: un ajust de característica aplicat → N2; si no, N1.
  const level: EstimaLevel = r.adjustments.some((a) => a.key !== "AJUST_SUPERFICIE") ? "N2" : "N1";

  return {
    ok: true,
    result: {
      level,
      central: r.central,
      min: r.min,
      max: r.max,
      baseCentral: r.baseCentral,
      baseSource: r.baseSource,
      basePeriod: data.rentPeriod ?? data.comarcaRefPeriod ?? null,
      contracts: data.contracts,
      surfaceM2: surface,
      rooms,
      estat,
      eurM2Typical: r.baseCentral > 0 ? round1(r.baseCentral / VAL_REF_M2) : null,
      eurM2: r.eurM2,
      bandBasis: r.bandBasis,
      bandN: r.bandN,
      bandYear: r.bandYear,
      relativeDispersion: r.relativeDispersion,
      confidence: r.confidence,
      confidenceKeys: r.confidenceKeys,
      adjustmentKeys: r.adjustments.map((a) => a.key),
      adjustments: r.adjustments,
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
    d: "superfície de referència (85 m², Observatori del Lloguer + INE 2023), elasticitat renta-superfície (0,8; estudis hedònics UB/DIW), multiplicadors per estat de conservació (ancoratge Fotocasa 2021) i densitat m²/habitació (±5%)",
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
  "LIMIT_N1_BASE_MUNICIPAL: la base és la fiança mitjana MUNICIPAL de la vivenda típica registrada a Incasòl (≈85 m²); l'escalat per superfície és estadístic (elasticitat 0,8 documentada).",
  "LIMIT_N2_CARACTERISTIQUES: només s'apliquen els ajustos amb coeficient documentat i validat al motor (estat de conservació i densitat m²/habitació, limitada ±5%). Les altres variables SERPAVI (ascensor, aparcament, any de construcció, moblat, planta, qualificació energètica, piscina, zones comunitàries) NO es demanen ni s'apliquen: sense coeficient documentat, demanar-les seria fer servir dades que el càlcul no usa.",
  "LIMIT_N3_SECCIO_CENSAL: el rang oficial per parcel·la (per secció censal) només el calcula SERPAVI (MIVAU) amb fonts tributàries no públiques en bloc; aquesta eina NO simula consultes oficials ni inventa rangs per secció: sempre ofereix el botó oficial.",
  "LIMIT_COMARCA_REF: si el municipi no té fiança publicada (mostra petita), la base és la referència de comarca ponderada pel nº de contractes, marcada sempre com a ESTIMACIÓ amb confiança BAIXA — mai dada municipal inventada.",
  "LIMIT_HORQUILLA_MESURADA: l'amplada del rang és la dispersió relativa mesurada (IQR) del pool territorial (comarca ≥5 municipis amb dada; si no, província ≥10; si no, sèrie històrica municipal) — mai un percentil inventat.",
  "LIMIT_SERPAVI_LEGAL: aquest rang és una estimació estadística orientativa; el rang amb validesa legal per a la teva parcel·la només el dóna SERPAVI (MIVAU), sobretot en zones tensades i per a grans tenedores.",
  "LIMIT_HABITABILITAT: superfícies < 20 m² (o < 5 m² per habitació) generen avisos informatius d'habitabilitat (Decret 141/2012) que no alteren el càlcul.",
  "LIMIT_PRIVACITAT: el nivell N1 no demana adreça ni referència catastral; no es guarda cap dada personal ni s'associa la consulta a cap usuari.",
] as const;
