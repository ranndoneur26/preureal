/**
 * PreuReal.cat — Noves funcionalitats (F1-F4): agregacions territorials i
 * motor de valoració de renta.
 *
 * Funcions PURA (cap BD, cap xarxa) seguint el patró indicators.ts /
 * ine-parse.ts: la capa de lectura (territorial-data.ts, aquí sota com a
 * part de indicators-data) consulta Prisma i crida aquestes funcions.
 *
 * Metodologia VALIDADA pel propietari (INFORME_AUDITORIA_FUNCIONALIDADES.md §5):
 *  1. Unitat: sempre €/mes per HABITATGE (les fiances Incasòl no publiquen €/m²).
 *  2. Comarca/província = MEDIANA dels municipis amb dada EL MATEIX ANY
 *     (període homogeni garantit; mai es barregen anys ni s'interpola).
 *  3. Valoració v1: horquilla territorial (dispersió MESURA, no coeficients
 *     inventats); superfície/habitacions/estat només orientació qualitativa.
 *  4. Secció censal/districte: no hi ha font oficial → mai es fabriquen.
 *
 * Regla d'or: valors no disponibles → null (mai inventats ni interpolats).
 */

// ── Tipus ────────────────────────────────────────────────────────────────────

export interface MuniRentRow {
  name: string;
  comarca: string | null;
  province: string | null;
  /** JSON de Municipality.rentHistory ja parsejat: { "2005": 550.2, ... } */
  history: Record<string, number> | null;
  latest: number | null; // rentLatest
  period: string | null; // rentPeriod ("2025" | "2026 I trim." | ...)
  contracts: number | null; // contractsLatest (proxy de grandària de mostra)
}

export interface AggPoint {
  year: string; // "2015"
  median: number; // €/mes per habitatge
  n: number; // municipis amb dada aquell any
}

export interface YearPoint {
  year: string;
  value: number;
}

export interface Extreme {
  name: string;
  value: number;
}

// ── Utilitats bàsiques ───────────────────────────────────────────────────────

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function valid(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Mediana clàssica (parell → mitjana dels dos centrals). Null si buit. */
export function medianOf(values: Array<number | null | undefined>): number | null {
  const clean = (values ?? []).filter((v): v is number => valid(v) && v > 0);
  if (clean.length === 0) return null;
  const s = [...clean].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Any d'un període: "2025" → "2025"; "2026 I trim." → "2026".
 * Null si no es pot extreure un any de 4 dígits.
 */
export function yearOfPeriod(period: string | null | undefined): string | null {
  if (!period) return null;
  const m = /^(\d{4})/.exec(period.trim());
  return m ? m[1] : null;
}

/** Valor d'una fila per a un any: history[any] o, si és el seu període vigent, latest. */
export function valueForYear(row: MuniRentRow, year: string): number | null {
  const h = row.history?.[year];
  if (valid(h) && h > 0) return h;
  if (yearOfPeriod(row.period) === year && valid(row.latest) && row.latest > 0) return row.latest;
  return null;
}

// ── Agregació per anys (comarca / província / Catalunya) ─────────────────────

/**
 * Sèrie de medianes per any a partir de les files de municipis d'un àmbit.
 * Cada any només amb els municipis que TENEN dada aquell any (període
 * homogeni; sense interpolació). Anys amb n < minN queden fora.
 */
export function aggregateByYear(rows: MuniRentRow[], minN = 3): AggPoint[] {
  const byYear = new Map<string, number[]>();
  for (const r of rows) {
    const hist = r.history ?? {};
    const years = new Set([...Object.keys(hist), ...(yearOfPeriod(r.period) ? [yearOfPeriod(r.period)!] : [])]);
    for (const y of years) {
      const v = valueForYear(r, y);
      if (v === null) continue;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(v);
    }
  }
  const out: AggPoint[] = [];
  for (const [year, vals] of [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const med = medianOf(vals);
    if (med !== null && vals.length >= minN) out.push({ year, median: round1(med), n: vals.length });
  }
  return out;
}

/**
 * Extrems (més car / més barat) d'un àmbit per a UN any, amb el nom del
 * municipi. Null si menys de minN municipis amb dada.
 */
export function extremesOfYear(rows: MuniRentRow[], year: string, minN = 3): { car: Extreme; barat: Extreme } | null {
  const pairs: Extreme[] = [];
  for (const r of rows) {
    const v = valueForYear(r, year);
    if (v !== null) pairs.push({ name: r.name, value: v });
  }
  if (pairs.length < minN) return null;
  pairs.sort((a, b) => a.value - b.value);
  return { barat: pairs[0], car: pairs[pairs.length - 1] };
}

/** Sèrie d'un municipi a partir del seu history (ordenada, sense forats falsos). */
export function muniSeries(history: Record<string, number> | null | undefined): YearPoint[] {
  if (!history) return [];
  return Object.entries(history)
    .filter(([, v]) => valid(v) && v > 0)
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

/**
 * Variació interanual (%) només entre ANYS CONSECUTIUS (mai a través de
 * forats: si falta 2019, el salt 2018→2020 NO es publica com a interanual).
 */
export function interannualPct(series: YearPoint[]): Array<{ year: string; pct: number }> {
  const out: Array<{ year: string; pct: number }> = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (!valid(prev.value) || !valid(cur.value) || prev.value <= 0) continue;
    if (Number(cur.year) - Number(prev.year) !== 1) continue; // forat → sense dada
    out.push({ year: cur.year, pct: round1(((cur.value - prev.value) / prev.value) * 100) });
  }
  return out;
}

// ── Dispersió (base de l'horquilla de valoració) ─────────────────────────────

/** Quartils tipus 7 (PERCENTILE.INC) sobre valors sense pesos. */
export function quartilesOf(values: Array<number | null | undefined>): { p25: number; p50: number; p75: number } | null {
  const clean = (values ?? []).filter((v): v is number => valid(v) && v > 0);
  if (clean.length === 0) return null;
  const s = [...clean].sort((a, b) => a - b);
  const q = (p: number): number => {
    const h = p * (s.length - 1);
    const lo = Math.floor(h);
    const hi = Math.min(lo + 1, s.length - 1);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  };
  return { p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}

/**
 * Rang interquartílic RELATIU: (P75 − P25) / P50. Mesura de dispersió
 * adimensional que serveix d'amplada de l'horquilla de valoració.
 */
export function relativeIqr(values: Array<number | null | undefined>): number | null {
  const q = quartilesOf(values);
  if (!q || q.p50 <= 0) return null;
  return (q.p75 - q.p25) / q.p50;
}

// ── F4 — Motor de valoració de renta (v1 territorial validada) ───────────────

export type EstatConservacio = "A_REFORMAR" | "BON_ESTAT" | "REFORMADA" | "OBRA_NOVA";

export interface ValuationInput {
  surfaceM2?: number | null;
  rooms?: number | null;
  estat?: EstatConservacio | null;
}

export interface ValuationData {
  rentLatest: number | null; // €/mes per habitatge (central)
  rentPeriod: string | null;
  contracts: number | null; // proxy de grandària de mostra municipal
  history: Record<string, number> | null;
  /** Valors (€/mes) dels municipis de la comarca EL MATEIX ANY del període vigent. */
  comarcaValues: number[];
  /** Idem per a la província (sense el municipi exclòs: la mediana no hi és sensible). */
  provinciaValues: number[];
}

export type ValuationConfidence = "ALTA" | "MITJANA" | "BAIXA";
export type ValuationBandBasis = "COMARCA" | "PROVINCIA" | "HISTORICA";

export interface ValuationResult {
  central: number; // €/mes (mediana municipal vigent)
  min: number; // €/mes
  max: number; // €/mes
  bandBasis: ValuationBandBasis; // d'on surt l'amplada (traçabilitat)
  bandN: number; // grandària del pool que fa l'amplada
  bandYear: string | null; // any del pool
  relativeDispersion: number; // (P75−P25)/P50 del pool (MESURADA)
  confidence: ValuationConfidence;
  confidenceKeys: string[]; // claus d'explicació per a la UI
  eurM2: number | null; // DERIVAT: central / superfície introduïda (mai de la font)
  /** Notes qualitatives (claus UI, cap coeficient numèric). */
  notes: { rooms: string | null; estat: string | null; surface: string | null };
}

export type ValuationOutcome = { ok: true; result: ValuationResult } | { ok: false; reason: string };

/** Llindars de pool per usar comarca (si no, província; si no, històrica). */
export const MIN_POOL_COMARCA = 5;
export const MIN_POOL_PROVINCIA = 10;

/**
 * Motor v1 (metodologia validada §5 de l'informe):
 *  - central = rentLatest municipal (mercat registrat vigent)
 *  - amplada = dispersió interquartílica RELATIVA del pool territorial el
 *    mateix any (comarca ≥5 munis; si no província ≥10; si no, rang
 *    històric del propi municipi) → horquilla = central × (1 ± disp/2)
 *  - superfície/habitacions/estat: orientació QUALITATIVA (claus UI),
 *    mai multiplicadors (els coeficients no es poden calibrar amb fiances
 *    agregades: no s'inventen)
 *  - confiança per regles explícites i visibles
 * Mai llança: si falta la dada central → { ok: false, reason }.
 */
export function computeValuation(data: ValuationData, input: ValuationInput): ValuationOutcome {
  if (!valid(data.rentLatest) || data.rentLatest <= 0) {
    return { ok: false, reason: "NO_RENT" };
  }
  const central = data.rentLatest;
  const year = yearOfPeriod(data.rentPeriod);

  // 1) amplada de l'horquilla: dispersió MESURADA del pool més gran disponible
  let basis: ValuationBandBasis = "HISTORICA";
  let pool: number[] = [];
  if (data.comarcaValues.length >= MIN_POOL_COMARCA) {
    basis = "COMARCA";
    pool = data.comarcaValues;
  } else if (data.provinciaValues.length >= MIN_POOL_PROVINCIA) {
    basis = "PROVINCIA";
    pool = data.provinciaValues;
  }
  let disp: number | null = pool.length > 0 ? relativeIqr(pool) : null;
  if (disp !== null && (!valid(disp) || disp < 0)) disp = null;

  // fallback històric: rang relatiu dels últims ≤8 punts del municipi
  if (disp === null) {
    const s = muniSeries(data.history).slice(-8).map((p) => p.value);
    const med = medianOf(s);
    if (s.length >= 3 && med && med > 0) {
      disp = (Math.max(...s) - Math.min(...s)) / med;
    }
  }
  if (disp === null || !valid(disp) || disp <= 0) disp = 0.2; // última xarxa conservadora (±10 %)
  disp = Math.min(disp, 0.6); // saturació: mai horquilles > ±30 %

  const half = central * (disp / 2);
  const min = round1(Math.max(central * 0.5, central - half));
  const max = round1(central + half);

  // 2) confiança per regles explícites
  const yearNum = year ? Number(year) : null;
  const contracts = valid(data.contracts) ? data.contracts : 0;
  const confidenceKeys: string[] = [];
  let confidence: ValuationConfidence;
  if (yearNum !== null && yearNum >= 2024 && contracts >= 100 && basis === "COMARCA") {
    confidence = "ALTA";
    confidenceKeys.push("CONF_PERIODE_RECENT", "CONF_CONTRACTS_ALTS", "CONF_BASE_COMARCA");
  } else if (yearNum !== null && yearNum >= 2020 && contracts >= 30) {
    confidence = "MITJANA";
    if (yearNum < 2024) confidenceKeys.push("CONF_PERIODE_VELL");
    if (contracts < 100) confidenceKeys.push("CONF_CONTRACTS_MIG");
    if (basis !== "COMARCA") confidenceKeys.push("CONF_BASE_AMPLA");
  } else {
    confidence = "BAIXA";
    confidenceKeys.push("CONF_DADES_MIGUES");
    if (yearNum === null || yearNum < 2020) confidenceKeys.push("CONF_PERIODE_VELL");
    if (contracts < 30) confidenceKeys.push("CONF_CONTRACTS_POCS");
  }

  // 3) notes qualitatives (cap número inventat)
  const surface = valid(input.surfaceM2) && input.surfaceM2! > 0 ? input.surfaceM2! : null;
  const rooms = valid(input.rooms) ? input.rooms! : null;
  const notes = {
    rooms: rooms === null ? null : rooms <= 2 ? "ROOMS_LOW" : rooms <= 4 ? "ROOMS_MID" : "ROOMS_HIGH",
    estat: input.estat ?? null,
    surface: surface ? "SURFACE_DERIVED" : null,
  };

  return {
    ok: true,
    result: {
      central: round1(central),
      min,
      max,
      bandBasis: basis,
      bandN: pool.length,
      bandYear: year,
      relativeDispersion: Math.round(disp * 1000) / 1000,
      confidence,
      confidenceKeys,
      eurM2: surface ? round1(central / surface) : null,
      notes,
    },
  };
}
