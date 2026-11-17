/**
 * PreuReal — projecció de tendència del lloguer (v60).
 *
 * Encàrrec: afegir una proyecció a 12–24 mesos basada en sèries temporals
 * als informes de municipis. S'usa una REGRESSIÓ LINEAL SIMPLE (OLS) sobre
 * els punts ANUALS oficials (fiances Incasòl), mai interpolació de mesos ni
 * dades inventades, i la sortida sempre va etiquetada com a TENDÈNCIA
 * ORIENTATIVA: no és una valoració, no és una previsió oficial.
 *
 * Garanties:
 *  - <4 punts anuals → null (una recta amb 3 punts és statistically fràgil).
 *  - Horitzó 1–2 anys (12–24 mesos) — mai més enllà.
 *  - Bandes ±1.28σ dels residuals (interval aproximat del 80%) per punt.
 *  - Les projeccions negatives es trunquen (mai un lloguer negatiu).
 *  - Cap dependència externa; pur i testable.
 */

export interface SeriePoint {
  year: string;
  value: number;
}

export interface ForecastPoint {
  year: string;
  value: number;
  lo: number;
  hi: number;
}

export interface ForecastResult {
  method: "linear";
  /** €/any de pendent de la recta ajustada (pot ser negatiu: tendència a la baixa) */
  slopeEurYear: number;
  /** R² de l'ajust (0–1): quanta variància explica la recta */
  r2: number;
  baseYear: string;
  baseValue: number;
  /** projeccions futures (mai inclou punts històrics) */
  points: ForecastPoint[];
  horizonYears: 1 | 2;
  /** true si la |pendent| anual supera el 15% del valor base: lectura amb compte */
  volatile: boolean;
}

/**
 * Recta de mínims quadrats (x = índex d'any) + projecció 1–2 anys.
 * Retorna null si la sèrie és massa curta o sense variància vàlida.
 */
export function buildLinearForecast(serie: SeriePoint[], horizonYears: 1 | 2 = 2): ForecastResult | null {
  if (horizonYears !== 1 && horizonYears !== 2) return null;
  const clean = (serie || [])
    .filter((p) => /^\d{4}$/.test(String(p.year)))
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => a.year.localeCompare(b.year));
  if (clean.length < 4) return null;

  const n = clean.length;
  const xs = clean.map((_, i) => i);
  const ys = clean.map((p) => p.value);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
    syy += (ys[i] - meanY) ** 2;
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;

  // residuals → σ (desviació dels residuals) → banda ±1.28σ (~80%)
  const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept));
  const rss = residuals.reduce((a, r) => a + r * r, 0);
  const sigma = Math.sqrt(rss / n);
  const r2 = syy > 0 ? Math.max(0, Math.min(1, 1 - rss / syy)) : 0;

  const last = clean[n - 1];
  const points: ForecastPoint[] = [];
  for (let h = 1; h <= horizonYears; h++) {
    const year = String(Number(last.year) + h);
    const raw = slope * (n - 1 + h) + intercept;
    if (!Number.isFinite(raw) || raw <= 0) break; // mai un lloguer negatiu
    const lo = Math.max(0, raw - 1.28 * sigma);
    const hi = raw + 1.28 * sigma;
    points.push({
      year,
      value: Math.round(raw * 100) / 100,
      lo: Math.round(lo * 100) / 100,
      hi: Math.round(hi * 100) / 100,
    });
  }
  if (points.length === 0) return null;

  return {
    method: "linear",
    slopeEurYear: Math.round(slope * 100) / 100,
    r2: Math.round(r2 * 1000) / 1000,
    baseYear: last.year,
    baseValue: last.value,
    points,
    horizonYears,
    volatile: Math.abs(slope) > last.value * 0.15,
  };
}
