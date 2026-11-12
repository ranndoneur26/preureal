"use client";

/**
 * Passos de l'onboarding persistent (v38.2) — checklist de primer ús:
 *   1. mapa       → has explorat el mapa
 *   2. comparador → has comparat municipis
 *   3. informe    → has descarregat un informe PDF
 * Emmagatzematge: localStorage "pr_steps" (JSON). Cada canvi emet
 * l'event "pr:steps-changed" perquè la UI es refresqui.
 */

export type PrSteps = { mapa?: boolean; comparador?: boolean; informe?: boolean };

const KEY = "pr_steps";

export function getSteps(): PrSteps {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as PrSteps;
  } catch {
    return {};
  }
}

export function markStep(step: keyof PrSteps) {
  try {
    const cur = getSteps();
    if (cur[step]) return;
    localStorage.setItem(KEY, JSON.stringify({ ...cur, [step]: true }));
    window.dispatchEvent(new CustomEvent("pr:steps-changed"));
  } catch {}
}
