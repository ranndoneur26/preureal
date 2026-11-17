/**
 * PreuReal — utilitats estadístiques robustes (v60).
 *
 * Objectiu (encàrrec «motor de dades»): descartar VALORS ATÍPICS abans de
 * calcular agregats i bandes, perquè errors de font o tipogràfics als registres
 * no desplacin gràfiques ni rangs. MAI altera la sèrie oficial publicada:
 * només s'aplica a mostres d'edifici/illa i dades aportades, i només quan hi ha
 * mostres suficients (per sota del mínim, el filtre no-op garanteix que els
 * municipis petits surten idèntics a abans — zero regressió).
 *
 * Mètodes (tots purs, sense dependències, testables amb bun test):
 *  - IQR (rang interquartílic, Tukey k=1.5): rebutja valors fora de
 *    [Q1 − k·IQR, Q3 + k·IQR] amb quartils tipus 7 (PERCENTILE.INC).
 *  - Z-score robust (MAD): z = 0.6745·(x − mediana)/MAD; rebutja |z| > llindar
 *    (3.5 per defecte, Iglewicz & Hoaglin). Amb MAD=0 no filtra (mai divideix
 *    per zero).
 */

// ── Quantils tipus 7 (el mateix criteri que territorial.ts) ─────────────────

export interface Quartiles {
  q1: number;
  median: number;
  q3: number;
}

/** Quartils tipus 7 sobre una còpia ordenada (mai muta l'entrada). */
export function quartilesSorted(values: number[]): Quartiles | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const at = (p: number): number => {
    const h = p * (s.length - 1);
    const lo = Math.floor(h);
    const hi = Math.min(lo + 1, s.length - 1);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  };
  return { q1: at(0.25), median: at(0.5), q3: at(0.75) };
}

// ── Filtre IQR (Tukey) ───────────────────────────────────────────────────────

export interface IqrBounds {
  lo: number;
  hi: number;
  q1: number;
  q3: number;
  iqr: number;
}

/** Fronteres de Tukey [Q1 − k·IQR, Q3 + k·IQR]. Null sense dades. */
export function iqrBounds(values: number[], k = 1.5): IqrBounds | null {
  const q = quartilesSorted(values);
  if (!q) return null;
  const iqr = q.q3 - q.q1;
  if (!Number.isFinite(iqr) || iqr <= 0) return null;
  return { lo: q.q1 - k * iqr, hi: q.q3 + k * iqr, q1: q.q1, q3: q.q3, iqr };
}

export interface OutlierFilterResult {
  kept: number[];
  removed: number[];
  bounds: IqrBounds | null;
  /** true si el filtre es va aplicar de veritat (n ≥ minN i hi havia fronteres) */
  applied: boolean;
}

/**
 * Filtre IQR simple. Amb n < minN NO filtra (devolució idèntica) — protegeix
 * els municipis amb pocs registres on l'IQR és inestable.
 */
export function filterOutliersIqr(values: number[], k = 1.5, minN = 8): OutlierFilterResult {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < minN) return { kept: clean, removed: [], bounds: null, applied: false };
  const bounds = iqrBounds(clean, k);
  if (!bounds) return { kept: clean, removed: [], bounds: null, applied: false };
  const kept: number[] = [];
  const removed: number[] = [];
  for (const v of clean) {
    if (v >= bounds.lo && v <= bounds.hi) kept.push(v);
    else removed.push(v);
  }
  return { kept, removed, bounds, applied: removed.length > 0 };
}

// ── Z-score robust (mediana/MAD) ─────────────────────────────────────────────

export interface RobustZResult {
  z: number[];
  median: number;
  mad: number;
}

/**
 * Z-scores robusts: z_i = 0.6745·(x_i − mediana)/MAD (desviació absoluta
 * mediana). MAD=0 (mitat de les dades iguals) → null: el filtre no-op.
 */
export function robustZScores(values: number[]): RobustZResult | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  const devs = s.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const midDev = Math.floor(devs.length / 2);
  const mad = devs.length % 2 ? devs[midDev] : (devs[midDev - 1] + devs[midDev]) / 2;
  if (mad === 0) return null;
  return { z: s.map((v) => (0.6745 * (v - median)) / mad), median, mad };
}

/**
 * Filtre per z-score robust (Iglewicz & Hoaglin, |z| > maxZ). Mateixa
 * garantia no-op amb n < minN o MAD=0.
 */
export function filterOutliersRobustZ(values: number[], maxZ = 3.5, minN = 8): OutlierFilterResult {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < minN) return { kept: clean, removed: [], bounds: null, applied: false };
  const rz = robustZScores(clean);
  if (!rz) return { kept: clean, removed: [], bounds: null, applied: false };
  const kept: number[] = [];
  const removed: number[] = [];
  for (const v of clean) {
    const z = Math.abs((0.6745 * (v - rz.median)) / rz.mad);
    if (z <= maxZ) kept.push(v);
    else removed.push(v);
  }
  return { kept, removed, bounds: null, applied: removed.length > 0 };
}

// ── Filtre IQR PONDERAT (mostres d'edifici amb nº de contractes) ─────────────

export interface WeightedSample {
  value: number;
  weight?: number | null;
}

/**
 * Filtre IQR amb quartils ponderats pel pes (nº de contractes de la mostra):
 * equival a expandir cada mostra w vegades per calcular Q1/Q3, però cada
 * edifici es decideix UN cop (el pes mai multiplica el rebuig).
 *minN compta EDIFICIS distints (no el pes total): amb pocs edificis no-op.
 */
export function filterWeightedOutliersIqr(
  samples: WeightedSample[] | null | undefined,
  k = 1.5,
  minN = 8,
): { kept: WeightedSample[]; removedCount: number; bounds: IqrBounds | null; applied: boolean } {
  if (!samples || samples.length === 0) return { kept: [], removedCount: 0, bounds: null, applied: false };
  const clean = samples.filter((s) => Number.isFinite(s.value) && s.value > 0);
  if (clean.length < minN) return { kept: clean, removedCount: 0, bounds: null, applied: false };
  // quartils sobre l'array expandit virtual (mateix criteri que bandQuantiles)
  const withW = clean
    .map((s) => ({ v: s.value, w: Number.isFinite(s.weight ?? NaN) && (s.weight as number) >= 1 ? Math.round(s.weight as number) : 1 }))
    .sort((a, b) => a.v - b.v || a.w - b.w);
  const N = withW.reduce((acc, s) => acc + s.w, 0);
  if (N <= 0) return { kept: clean, removedCount: 0, bounds: null, applied: false };
  const atRank = (r: number): number => {
    let acc = 0;
    for (const s of withW) {
      acc += s.w;
      if (r < acc) return s.v;
    }
    return withW[withW.length - 1].v;
  };
  const q = (p: number): number => {
    const h = p * (N - 1);
    const lo = Math.floor(h);
    const hi = Math.min(lo + 1, N - 1);
    return atRank(lo) + (h - lo) * (atRank(hi) - atRank(lo));
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr <= 0) return { kept: clean, removedCount: 0, bounds: null, applied: false };
  const lo = q1 - k * iqr;
  const hi = q3 + k * iqr;
  const kept: WeightedSample[] = [];
  let removedCount = 0;
  for (const s of clean) {
    if (s.value >= lo && s.value <= hi) kept.push(s);
    else removedCount++;
  }
  return { kept, removedCount, bounds: { lo, hi, q1, q3, iqr }, applied: removedCount > 0 };
}
