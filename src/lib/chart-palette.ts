/**
 * PreuReal — paleta cromàtica ÚNICA de visualització de dades (v60).
 *
 * Encàrrec: estandarditzar les escalas cromàtiques dels gràfics (LineChart,
 * BarChart, comparador, fitxa, anàlisi). Abans cada caller duien colors
 * hardcodeats inline; ara tots comparteixen aquesta font de veritat:
 *  - sèries: colors corporatius distingibles (ember/pine/verd/ambre/violet/pedra)
 *  - malla i eixos: neutres del design system (line/stone/pine)
 *  - escala de renda: semàntica controlada (verd = accessible, ambre = intermedi,
 *    vermell = car) amb els mateixos llindars 550/700/850/1000 € que el mapa
 *  - to semàntic de variacions: pujades crítiques en tonos d'alerta controlats,
 *    estables en monocrom corporatiu
 */

/** Colors de sèrie (ordre estable: la primera sèrie sempre ember). */
export const CHART_COLORS = ["#e8673c", "#0f2e21", "#1e7a41", "#9a6a1a", "#5d5480", "#6b6f68"] as const;

/** Color de sèrie n per índex (rotació segura amb més sèries que colors). */
export function seriesColor(index: number): string {
  return CHART_COLORS[((index % CHART_COLORS.length) + CHART_COLORS.length) % CHART_COLORS.length];
}

/** Tokens neutres dels gràfics (mateixos valors que el design system). */
export const CHART_GRID = "#e5e1da";
export const CHART_AXIS = "#6b6f68";
export const CHART_STONE = "#6b6f68";
export const CHART_PINE = "#0f2e21";
export const CHART_EMBER = "#e8673c";
export const CHART_EMBER_DEEP = "#d95a31";

/** Escala de renda vigent (€/mes) compartida per comparador i mapa. */
export const RENT_SCALE = ["#63b57c", "#93c47d", "#e5c46a", "#e89a4b", "#dd5a35"] as const;

/** Color dels llindars de la escala de renda (550/700/850/1000 €/mes). */
export function rentBandColor(rent: number): string {
  if (rent < 550) return RENT_SCALE[0];
  if (rent < 700) return RENT_SCALE[1];
  if (rent < 850) return RENT_SCALE[2];
  if (rent < 1000) return RENT_SCALE[3];
  return RENT_SCALE[4];
}

/** Gradient horitzontal per a barres de renda (color + versió translúcida). */
export function rentBandGradient(rent: number): string {
  const c = rentBandColor(rent);
  return `linear-gradient(90deg, ${c}, ${c}cc)`;
}

export type DeltaTone = "up" | "down" | "flat";

/** Tons semàntics de variació (pct > 0 és una PUGADA de preu). */
export function deltaTone(pct: number | null | undefined): DeltaTone {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}

/** Classe Tailwind del xip de variació segons el to (controlat, mai saturat). */
export function deltaChipCls(tone: DeltaTone): string {
  if (tone === "up") return "bg-ambersoft2 text-ambertext";
  if (tone === "down") return "bg-mintsoft text-green2";
  return "bg-sand text-stone";
}
