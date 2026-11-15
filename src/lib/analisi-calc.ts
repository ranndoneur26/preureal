/**
 * v42 — Càlcul PUR de l'eina «Anàlisi del mercat residencial» (encàrrec:
 * creuar el preu mitjà real del lloguer, l'evolució dels contractes i el
 * creixement demogràfic). Sense BD ni fetch — testable amb bun test.
 *
 * Regles de dades (mateix principi que la resta del projecte):
 *  - només es creuen ANYS AMB DADA REAL a les dues sèries; mai s'interpola
 *    ni s'inventa cap any;
 *  - el volum de mercat és una APROXIMACIÓ (mediana de fiances de l'any ×
 *    12 × contractes amb fiança de l'any) i sempre s'etiqueta com a tal —
 *    no és el stock de fiances vigents ni el volum exacte del mercat;
 *  - les lectures (interpretació) són descriptives i NO causals;
 *  - creixements: darrer valor vs valor de fa N anys disponibles (mai
 *    substituït per un valor d'una altra data sense avís).
 */

// ── Tipus ────────────────────────────────────────────────────────────────────

export interface SeriePoint {
  year: string;
  value: number;
}

export interface CrossoverPoint {
  year: string;
  /** mediana mensual de fiances de l'any (€/mes) */
  rent: number;
  /** contractes amb fiança de l'any (flux anual) */
  contracts: number;
  /** població a 1 de gener de l'any, si existeix */
  population: number | null;
  /** volum aproximat de mercat: rent × 12 × contracts (€/any) */
  volumeEur: number;
  /** contractes per 1.000 habitants (null si falta població) */
  contractsPer1k: number | null;
}

// ── Helpers de sèrie ─────────────────────────────────────────────────────────

/** Parseja el JSON rentHistory de Municipality ({"2005": 550.2, ...}) defensivament. */
export function parseRentHistory(raw: string | null | undefined): SeriePoint[] {
  if (!raw) return [];
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const out: SeriePoint[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!/^\d{4}$/.test(k)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    out.push({ year: k, value: n });
  }
  out.sort((a, b) => a.year.localeCompare(b.year));
  return out;
}

/** Creixement % entre el darrer valor i el valor de fa `window` anys disponibles. */
export function growthPct(points: SeriePoint[], window: number): { pct: number | null; fromYear: string | null; toYear: string | null; abs: number | null } {
  if (points.length === 0) return { pct: null, fromYear: null, toYear: null, abs: null };
  const last = points[points.length - 1];
  const targetYear = String(Number(last.year) - window);
  // valor del any exacte o del anterior disponible més proper (mai futur)
  let base: SeriePoint | null = null;
  for (const p of points) {
    if (Number(p.year) <= Number(targetYear)) base = p;
  }
  if (!base || base.value <= 0) return { pct: null, fromYear: null, toYear: last.year, abs: null };
  const pct = ((last.value - base.value) / base.value) * 100;
  return { pct: Math.round(pct * 10) / 10, fromYear: base.year, toYear: last.year, abs: Math.round(last.value - base.value) };
}

// ── Cruïlla de sèries ────────────────────────────────────────────────────────

/**
 * Creua renda mensual, contractes anuals i població any a any. Només anys
 * presents a la sèrie de renda I la de contractes (l'eix comú); la població
 * s'afegeix quan existeix exactament el mateix any (mai interpolada).
 */
export function buildCrossover(
  rentSerie: SeriePoint[],
  contractsSerie: SeriePoint[],
  populationSerie: SeriePoint[]
): CrossoverPoint[] {
  const byYearContracts = new Map(contractsSerie.map((p) => [p.year, p.value]));
  const byYearPop = new Map(populationSerie.map((p) => [p.year, p.value]));
  const out: CrossoverPoint[] = [];
  const years = new Set([...rentSerie, ...contractsSerie].map((p) => p.year));
  for (const year of [...years].sort()) {
    const rent = rentSerie.find((p) => p.year === year)?.value ?? null;
    const contracts = byYearContracts.get(year) ?? null;
    if (rent == null || contracts == null) continue; // cruïlla exigeix les dues
    const population = byYearPop.get(year) ?? null;
    out.push({
      year,
      rent,
      contracts,
      population,
      volumeEur: Math.round(rent * 12 * contracts),
      contractsPer1k: population != null && population > 0 ? Math.round((contracts / population) * 1000 * 100) / 100 : null,
    });
  }
  return out;
}

// ── Lectures descriptives (no causals) ───────────────────────────────────────

const fmt0 = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 0 });

export function buildInterpretacio(
  input: {
    rentG10: { pct: number | null; fromYear: string | null; toYear: string | null };
    popG10: { pct: number | null; fromYear: string | null; toYear: string | null };
    contractsG5: { pct: number | null; fromYear: string | null; toYear: string | null };
    lastVolume: { year: string; volumeEur: number } | null;
    lastPer1k: { year: string; value: number } | null;
    censusPct: number | null;
    censusYear: string | null;
  },
  locale: "ca" | "es"
): string[] {
  const ca = locale === "ca";
  const out: string[] = [];
  const pctStr = (p: number | null) =>
    p == null ? "—" : `${p > 0 ? "+" : ""}${p.toLocaleString(ca ? "ca-ES" : "es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  if (input.rentG10.pct != null && input.popG10.pct != null && input.rentG10.fromYear) {
    const diff = Math.round((input.rentG10.pct - input.popG10.pct) * 10) / 10;
    out.push(
      ca
        ? `El preu mitjà de les fiances ha evolucionat un ${pctStr(input.rentG10.pct)} entre ${input.rentG10.fromYear} i ${input.rentG10.toYear}, mentre la població ho ha fet un ${pctStr(input.popG10.pct)} (diferència: ${pctStr(diff)}). Lectura descriptiva de les dues sèries oficials, sense relació causal.`
        : `El precio medio de las fianzas ha evolucionado un ${pctStr(input.rentG10.pct)} entre ${input.rentG10.fromYear} y ${input.rentG10.toYear}, mientras la población lo ha hecho un ${pctStr(input.popG10.pct)} (diferencia: ${pctStr(diff)}). Lectura descriptiva de las dos series oficiales, sin relación causal.`
    );
  }
  if (input.contractsG5.pct != null && input.contractsG5.fromYear) {
    out.push(
      ca
        ? `Els contractes amb fiança depositada per any han evolucionat un ${pctStr(input.contractsG5.pct)} entre ${input.contractsG5.fromYear} i ${input.contractsG5.toYear}: és el FLUX anual d'operacions registrades (activitat del mercat), no el nombre de vivendes alquilades.`
        : `Los contratos con fianza depositada por año han evolucionado un ${pctStr(input.contractsG5.pct)} entre ${input.contractsG5.fromYear} y ${input.contractsG5.toYear}: es el FLUJO anual de operaciones registradas (actividad del mercado), no el número de viviendas alquiladas.`
    );
  }
  if (input.lastVolume) {
    out.push(
      ca
        ? `Volum de mercat registrat aproximat el ${input.lastVolume.year}: ~${fmt0(input.lastVolume.volumeEur)} €/any (mediana mensual de fiances × 12 × contractes de l'any). Aproximació elaborada, mai el volum exacte ni el stock de fiances vigents.`
        : `Volumen de mercado registrado aproximado en ${input.lastVolume.year}: ~${fmt0(input.lastVolume.volumeEur)} €/año (mediana mensual de fianzas × 12 × contratos del año). Aproximación elaborada, nunca el volumen exacto ni el stock de fianzas vigentes.`
    );
  }
  if (input.lastPer1k) {
    out.push(
      ca
        ? `Dinamisme registrat el ${input.lastPer1k.year}: ${input.lastPer1k.value.toLocaleString(ca ? "ca-ES" : "es-ES")} contractes amb fiança per cada 1.000 habitants.`
        : `Dinamismo registrado en ${input.lastPer1k.year}: ${input.lastPer1k.value.toLocaleString(ca ? "ca-ES" : "es-ES")} contratos con fianza por cada 1.000 habitantes.`
    );
  }
  if (input.censusPct != null) {
    out.push(
      ca
        ? `Pes estructural de l'alquiler (Cens ${input.censusYear ?? "2021"}): el ${input.censusPct.toLocaleString(ca ? "ca-ES" : "es-ES")}% de les vivendes principals estaven en alquiler; el parc catastral no distingeix principals, secundàries i buides.`
        : `Peso estructural del alquiler (Censo ${input.censusYear ?? "2021"}): el ${input.censusPct.toLocaleString(ca ? "ca-ES" : "es-ES")}% de las viviendas principales estaban en alquiler; el parque catastral no distingue principales, secundarias y vacías.`
    );
  }
  return out;
}
