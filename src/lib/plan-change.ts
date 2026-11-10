/**
 * v31 — Cambio de plan self-service: cálculo PURO de qué se gana/pierde.
 *
 * Archivo 100% puro (sin db, sin fetch, sin React): lo importan el endpoint
 * /api/subscription/change (servidor) y PanelView (cliente) y trabajan sobre
 * la MISMA fuente (/api/plans = PlanSetting + PLANS), de modo que el aviso
 * que ve el usuario siempre describe exactamente lo que el backend aplica.
 *
 * Convención de etiquetas: pares [ca, es] como planName() en plans.ts.
 */

export type PlanIdLite = "FREE" | "PREMIUM" | "PRO";

export interface PlanShapeLite {
  quotaMonth: number; // -1 = ilimitadas
  comparatorMax: number;
  features: Record<string, boolean>;
}

export type DiffKey =
  | "unlimitedQueries"
  | "comparator6"
  | "exportCsv"
  | "historial"
  | "preferits"
  | "pdfMunicipi"
  | "pdfEdifici"
  | "referenciaAmpliada"
  | "indicadorsTerritorials"
  | "comparadorAvancat";

/** Etiquetas [ca, es] de cada capacidad que puede cambiar entre planes. */
export const DIFF_LABELS: Record<DiffKey, [string, string]> = {
  unlimitedQueries: [
    "Consultes de detall il·limitades",
    "Consultas de detalle ilimitadas",
  ],
  comparator6: [
    "Comparar fins a 6 municipis o edificis per consulta",
    "Comparar hasta 6 municipios o edificios por consulta",
  ],
  exportCsv: ["Exportació CSV de dades", "Exportación CSV de datos"],
  historial: ["Historial de consultes", "Historial de consultas"],
  preferits: ["Preferits (municipis i edificis)", "Favoritos (municipios y edificios)"],
  pdfMunicipi: ["Informe PDF de municipi", "Informe PDF de municipio"],
  pdfEdifici: ["Informe PDF d'edifici", "Informe PDF de edificio"],
  referenciaAmpliada: [
    "Banda de referència P25/mediana/P75 i posició del teu preu",
    "Banda de referencia P25/mediana/P75 y posición de tu precio",
  ],
  indicadorsTerritorials: [
    "Indicadors oficials (IPVA, renda, esforç econòmic)",
    "Indicadores oficiales (IPVA, renta, esfuerzo económico)",
  ],
  comparadorAvancat: [
    "Columnes avançades del comparador",
    "Columnas avanzadas del comparador",
  ],
};

/** Nota transversal sobre datos (la respuesta a «¿pierdo información?»): NO. */
export const DATA_NOTE: [string, string] = [
  "Les teves dades no s'esborren mai: preferits, historial i comparacions es conserven. Si baixes de pla, simplement no tindran accés fins que tornis a un pla que les inclogui.",
  "Tus datos no se borran nunca: favoritos, historial y comparaciones se conservan. Si bajas de plan, simplemente no tendrás acceso a ellos hasta que vuelvas a un plan que los incluya.",
];

/**
 * Difus de capacitats entre dos plans sobre la configuració efectiva
 * (la mateixa que retorna /api/plans). Mai llança: si falta una feature
 * nova als plans antics simplement no apareix al difus.
 */
export function diffPlanKeys(
  from: PlanIdLite,
  to: PlanIdLite,
  plans: Partial<Record<PlanIdLite, PlanShapeLite>>,
): { gained: DiffKey[]; lost: DiffKey[] } {
  const a = plans[from];
  const b = plans[to];
  const gained: DiffKey[] = [];
  const lost: DiffKey[] = [];
  if (!a || !b || from === to) return { gained, lost };

  // consultes de detall: -1 = il·limitades
  if (a.quotaMonth < 0 && b.quotaMonth >= 0) lost.push("unlimitedQueries");
  if (a.quotaMonth >= 0 && b.quotaMonth < 0) gained.push("unlimitedQueries");

  // comparador: límit d'entitats per consulta
  if ((b.comparatorMax ?? 0) > (a.comparatorMax ?? 0)) gained.push("comparator6");
  if ((b.comparatorMax ?? 0) < (a.comparatorMax ?? 0)) lost.push("comparator6");

  // features booleanes
  const keys = new Set([...Object.keys(a.features || {}), ...Object.keys(b.features || {})]);
  for (const k of keys) {
    if (!(k in DIFF_LABELS)) continue; // feature nova sense etiqueta: ignora
    const was = Boolean(a.features?.[k]);
    const will = Boolean(b.features?.[k]);
    if (!was && will) gained.push(k as DiffKey);
    if (was && !will) lost.push(k as DiffKey);
  }
  return { gained, lost };
}

export function labelForDiffKey(key: DiffKey, locale: "ca" | "es"): string {
  return DIFF_LABELS[key][locale === "es" ? 1 : 0];
}

export function dataNote(locale: "ca" | "es"): string {
  return DATA_NOTE[locale === "es" ? 1 : 0];
}
