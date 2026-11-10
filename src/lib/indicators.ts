/**
 * PreuReal.cat — Fase 3: servei de càlcul d'indicadors (fonts oficials).
 *
 * Funcions PURA: cap BD, cap xarxa → testables offline amb dades REALS
 * (fixtures INE de data/fixtures/ + snapshot real de fiances de
 * data/municipalities.json). La capa de lectura de BD
 * (src/lib/indicators-data.ts) només consulta Prisma i crida aquestes
 * funcions, seguint el patró ine-parse (purs) / ine-import (fins).
 *
 * Indicadors de l'encàrrec (Taula 6 de la proposta aprovada):
 *  - POS_VS_MEDIAN   posició del preu davant la mediana de l'entorn
 *  - REF_BAND        banda de referència [P25, P75] de l'entorn
 *  - TERR_DELTA      diferència territorial absoluta i %
 *  - IPVA_ANUAL/ACUM evolució del mercat (ÍNDEX, mai €)
 *  - EFFORT          esforç econòmic (renda neta mitjana per LLAR)
 *  - EFFORT_PCAP     variant amb renda neta mitjana per PERSONA
 * (AID_MATCH arribarà amb la taula d'ajudes editorial: Fase 4/5.)
 *
 * Regla d'or metodològica (proposta §4.4): les fiances Incasòl descriuen el
 * mercat registrat; l'IPVA descriu l'EVOLUCIÓ (és un índex, no €); l'Atlas
 * descriu la RENDA; SERPAVI (quan obri dades) descriurà la referència
 * oficial. Cap xifra no surt sense font, unitat i període: tots els
 * resultats porten la seva procedència i els valors no disponibles es
 * tornen com a null (MAI s'inventen ni s'interpolen).
 */

// ── Tipus públics ────────────────────────────────────────────────────────────

export type Direction = "ABOVE" | "BELOW" | "AT";
export type BandPosition = "BELOW" | "WITHIN" | "ABOVE";

export interface SeriesPoint {
  period: string; // "2015" | "2024" (anual; admetrà "2026-T3")
  value: number;
}

/** Fila mínima d'observació estadística (ja prové de StatObservation o de fixture). */
export interface StatObsLite {
  sourceCode: string; // INE_IPVA | INE_ATLAS_RENTA
  variable: string; // IPVA_INDICE | IPVA_TASA_ANUAL | RENTA_NETA_MEDIA_*
  geoLevel: string; // ESTATAL | CCAA | PROV | MUNI
  geoCode: string; // "ES" | "09" | "08" | ineCode 5 dígits
  geoName: string | null;
  municipalityCode: string | null;
  period: string;
  value: number;
  unit: string | null;
}

// ── Metadades dels indicadors (per la UI, el PDF i la procedència) ───────────

export interface IndicatorMeta {
  code: string;
  label: { ca: string; es: string };
  formula: string;
  avis: { ca: string; es: string };
}

export const INDICATOR_META: Record<string, IndicatorMeta> = {
  POS_VS_MEDIAN: {
    code: "POS_VS_MEDIAN",
    label: { ca: "Posició davant la mediana", es: "Posición frente a la mediana" },
    formula: "(preu − mediana de l'entorn) / mediana × 100",
    avis: {
      ca: "Comparació amb la mediana TERRITORIAL de l'entorn; no és una valoració exacta de l'immoble.",
      es: "Comparación con la mediana TERRITORIAL del entorno; no es una valoración exacta del inmueble.",
    },
  },
  REF_BAND: {
    code: "REF_BAND",
    label: { ca: "Banda de referència [P25, P75]", es: "Banda de referencia [P25, P75]" },
    formula: "comparació del preu amb [P25, P75] de l'entorn",
    avis: {
      ca: "Fins que SERPAVI publiqui dades obertes, la banda deriva del mercat registrat (fiances Incasòl a nivell d'edifici/illa); la base sempre s'indica al costat del resultat.",
      es: "Hasta que SERPAVI publique datos abiertos, la banda deriva del mercado registrado (fianzas Incasòl a nivel de edificio/illa); la base se indica siempre junto al resultado.",
    },
  },
  TERR_DELTA: {
    code: "TERR_DELTA",
    label: { ca: "Diferència territorial", es: "Diferencia territorial" },
    formula: "(valor A − valor B) / valor B × 100",
    avis: {
      ca: "Diferència entre mitjanes territorials: no compara immobles individuals.",
      es: "Diferencia entre medias territoriales: no compara inmuebles individuales.",
    },
  },
  IPVA_ANUAL: {
    code: "IPVA_ANUAL",
    label: { ca: "Evolució IPVA (variació anual)", es: "Evolución IPVA (variación anual)" },
    formula: "taxa interanual de l'índex IPVA (o derivada de la sèrie d'índexs)",
    avis: {
      ca: "L'IPVA és un ÍNDEX d'evolució (base 2015=100), NO un preu en euros: mai es converteix a € ni es barreja amb les mitjanes de fiances.",
      es: "El IPVA es un ÍNDICE de evolución (base 2015=100), NO un precio en euros: nunca se convierte a € ni se mezcla con las medias de fianzas.",
    },
  },
  IPVA_ACUM: {
    code: "IPVA_ACUM",
    label: { ca: "Variació acumulada IPVA des de 2015", es: "Variación acumulada IPVA desde 2015" },
    formula: "índex − 100 (base 2015=100)",
    avis: {
      ca: "Acumulació de l'índex des de l'any base; no inclou l'efecte de la inflació total, només l'evolució relativa del lloguer.",
      es: "Acumulación del índice desde el año base; no incluye el efecto de la inflación total, solo la evolución relativa del alquiler.",
    },
  },
  EFFORT: {
    code: "EFFORT",
    label: { ca: "Esforç econòmic (renda per llar)", es: "Esfuerzo económico (renta por hogar)" },
    formula: "(lloguer mitjà mensual del municipi × 12) / renda neta mitjana anual per llar × 100",
    avis: {
      ca: "Indicador de CONTEXT TERRITORIAL: quina part de la renda mitjana PER LLAR del municipi representaria el lloguer mitjà. NO mesura la capacitat d'un habitatge concret ni d'un usuari.",
      es: "Indicador de CONTEXTO TERRITORIAL: qué parte de la renta media POR HOGAR del municipio representaría el alquiler medio. NO mide la capacidad de un inmueble concreto ni de un usuario.",
    },
  },
  EFFORT_PCAP: {
    code: "EFFORT_PCAP",
    label: { ca: "Esforç econòmic (renda per persona)", es: "Esfuerzo económico (renta por persona)" },
    formula: "(lloguer mitjà mensual del municipi × 12) / renda neta mitjana anual per persona × 100",
    avis: {
      ca: "Variant informativa amb renda per persona (una llar mitjana té més d'un perceptor): MAI s'ha d'interpretar com a salari net individual.",
      es: "Variante informativa con renta por persona (un hogar medio tiene más de un perceptor): NUNCA debe interpretarse como salario neto individual.",
    },
  },
};

/** Mínim de mostres per publicar una banda (per sota → «no disponible»). */
export const MIN_SAMPLES_BAND = 5;

const CODES_CCAA_CAT = "09";
const GEO_ES = "ES";

// ── Utilitats ────────────────────────────────────────────────────────────────

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function valid(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Últim punt d'una sèrie (els períodes ordenen bé com a text: "2015"<"2024"<"2026-T3"). */
function latest(series: SeriesPoint[]): SeriesPoint | null {
  if (series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.period.localeCompare(b.period));
  return sorted[sorted.length - 1];
}

// ── POS_VS_MEDIAN — posició davant la mediana de l'entorn ────────────────────

export interface PosVsMedianResult {
  absDiff: number; // €/mes (preu − mediana)
  pctDiff: number; // % (arrodonit a 2 decimals)
  direction: Direction;
  median: number;
}

/**
 * (preu − mediana) / mediana × 100. Retorna null si falta cap valor o no
 * és vàlid (mai llança, mai NaN).
 */
export function posVsMedian(price: number | null | undefined, median: number | null | undefined): PosVsMedianResult | null {
  if (!valid(price) || !valid(median) || price <= 0 || median <= 0) return null;
  const absDiff = price - median;
  const pct = round2((absDiff / median) * 100);
  return {
    absDiff: round2(absDiff),
    pctDiff: pct,
    direction: absDiff === 0 ? "AT" : absDiff > 0 ? "ABOVE" : "BELOW",
    median,
  };
}

// ── REF_BAND — banda de referència [P25, P75] ────────────────────────────────

/**
 * Posició del preu dins de la banda [P25, P75] (límits INCLUSIUS).
 * La banda la compon el caller (mercat registrat avui; SERPAVI quan hi hagi
 * dades obertes) i en indica la base. Null si falta dada.
 */
export function refBand(
  price: number | null | undefined,
  p25: number | null | undefined,
  p75: number | null | undefined,
): BandPosition | null {
  if (!valid(price) || !valid(p25) || !valid(p75) || price <= 0 || p25 <= 0 || p75 <= 0) return null;
  if (p75 < p25) return null; // banda mal formada → no disponible
  if (price < p25) return "BELOW";
  if (price > p75) return "ABOVE";
  return "WITHIN";
}

export function refBandLabel(position: BandPosition, locale: "ca" | "es"): string {
  const ca = { BELOW: "Per sota del rang de referència", WITHIN: "Dins del rang de referència", ABOVE: "Per sobre del rang de referència" };
  const es = { BELOW: "Por debajo del rango de referencia", WITHIN: "Dentro del rango de referencia", ABOVE: "Por encima del rango de referencia" };
  return locale === "es" ? es[position] : ca[position];
}

// ── Banda P25 / mediana / P75 a partir de mostres (mercat registrat) ─────────

export interface BandSample {
  value: number; // €/mes (mitjana de fiances de l'edifici/illa)
  weight?: number; // mostres (contractes) de les quals surt la mitjana
}
export interface BandResult {
  p25: number;
  p50: number;
  p75: number;
  n: number; // nº d'edificis/illes amb dada
  totalWeight: number; // nº total de contractes (suma de mostres)
  basis: string; // què representa la banda (traçabilitat)
}

/**
 * Quartils (tipus 7, el mateix que numpy/Excel PERCENTILE.INC) amb pesos
 * ENTERS (nº de contractes per edifici). Equivalent a expandir cada mostra
 * w vegades. Retorna null amb mostres buides/invàlides.
 */
export function bandQuantiles(samples: BandSample[] | null | undefined, basis = "mercat registrat (fiances Incasòl)"): BandResult | null {
  if (!samples || samples.length === 0) return null;
  const clean = samples.filter((s) => valid(s.value) && s.value > 0);
  if (clean.length === 0) return null;
  const withW = clean.map((s) => ({ v: s.value, w: valid(s.weight) && s.weight >= 1 ? Math.round(s.weight) : 1 }));
  withW.sort((a, b) => a.v - b.v || a.w - b.w);
  const N = withW.reduce((acc, s) => acc + s.w, 0);
  if (N <= 0) return null;

  // valor al rang r (0-indexat) de l'array expandit virtual
  const atRank = (r: number): number => {
    let acc = 0;
    for (const s of withW) {
      acc += s.w;
      if (r < acc) return s.v;
    }
    return withW[withW.length - 1].v;
  };
  const q = (p: number): number => {
    const h = p * (N - 1); // posició virtual (tipus 7)
    const lo = Math.floor(h);
    const hi = Math.min(lo + 1, N - 1);
    return atRank(lo) + (h - lo) * (atRank(hi) - atRank(lo));
  };
  return { p25: round2(q(0.25)), p50: round2(q(0.5)), p75: round2(q(0.75)), n: withW.length, totalWeight: N, basis };
}

// ── TERR_DELTA — diferència territorial ──────────────────────────────────────

export interface TerrDeltaResult {
  absDiff: number; // A − B (unitat de la magnitud)
  pctDiff: number; // (A − B)/B × 100, arrodonit a 2 decimals
  valueA: number;
  valueB: number;
  periodA: string;
  periodB: string;
  otherGeoName: string | null; // nom oficial del territori B segons la font
}

/** Diferència A vs B (B = referència). Null si falta dada o B=0. */
export function terrDelta(
  a: { value: number | null | undefined; period: string },
  b: { value: number | null | undefined; period: string; geoName?: string | null },
): TerrDeltaResult | null {
  if (!valid(a.value) || !valid(b.value) || b.value === 0) return null;
  const absDiff = a.value - b.value;
  return {
    absDiff: round2(absDiff),
    pctDiff: round2((absDiff / Math.abs(b.value)) * 100),
    valueA: a.value,
    valueB: b.value,
    periodA: a.period,
    periodB: b.period,
    otherGeoName: b.geoName ?? null,
  };
}

// ── EFFORT / EFFORT_PCAP — esforç econòmic ───────────────────────────────────

export interface EffortSide {
  pct: number; // % de la renda anual que representa el lloguer anual mitjà
  rentEurMonth: number; // €/mes (mitjana de fiances del municipi)
  rentPeriod: string | null; // període de la mitjana de fiances
  rentaAnual: number; // €/any (renda neta mitjana de l'Atlas)
  rentaPeriod: string; // any de la renda
}

/**
 * (lloguer mitjà mensual × 12) / renda neta mitjana anual × 100.
 * Exemple de la proposta: 792,7 €/mes i renda llar 45.000 €/any → 21,14 %
 * (es publica com a «≈ 21,1 %»). Null si falta dada vàlida.
 */
export function effortEconomic(
  rentEurMonth: number | null | undefined,
  rentaAnual: number | null | undefined,
  ctx: { rentPeriod?: string | null; rentaPeriod?: string | null } = {},
): EffortSide | null {
  if (!valid(rentEurMonth) || !valid(rentaAnual) || rentEurMonth <= 0 || rentaAnual <= 0) return null;
  const pct = (rentEurMonth * 12) / rentaAnual * 100;
  return {
    pct: round2(pct),
    rentEurMonth,
    rentPeriod: ctx.rentPeriod ?? null,
    rentaAnual,
    rentaPeriod: ctx.rentaPeriod ?? "",
  };
}

// ── IPVA — evolució del mercat (ÍNDEX, mai €) ────────────────────────────────

export interface IpvaTerritory {
  geoLevel: string;
  geoCode: string;
  geoName: string | null;
  unit: string | null;
  indice: SeriesPoint[]; // sèrie d'índex (base 2015=100)
  tasaAnual: SeriesPoint[]; // sèrie de variació anual OFICIAL de la font (%)
  latestAnual: SeriesPoint | null; // taxa oficial més recent (preferim-la)
  latestAnualComputed: SeriesPoint | null; // derivada dels dos últims índexs (fallback)
  acum2015: SeriesPoint | null; // índex més recent − 100
}

/** Variació acumulada des de 2015: índex − 100 (base 2015=100). */
export function ipvaAcum(indexValue: number | null | undefined): number | null {
  if (!valid(indexValue) || indexValue <= 0) return null;
  return round1(indexValue - 100);
}

/** Taxa interanual derivada de la sèrie d'índexs (últims 2 anys consecutius). */
export function ipvaAnualFromIndex(indice: SeriesPoint[]): SeriesPoint | null {
  const sorted = [...indice].filter((p) => valid(p.value) && p.value > 0).sort((a, b) => a.period.localeCompare(b.period));
  if (sorted.length < 2) return null;
  const prev = sorted[sorted.length - 2];
  const last = sorted[sorted.length - 1];
  const pct = round1((last.value / prev.value - 1) * 100);
  return { period: last.period, value: pct };
}

/** Construeix el territori IPVA (índex + taxa) des de les observacions. */
export function buildIpvaTerritory(
  observations: StatObsLite[],
  scope: { geoLevel: string; geoCode: string },
): IpvaTerritory | null {
  const rows = observations.filter((o) => o.geoLevel === scope.geoLevel && o.geoCode === scope.geoCode);
  const indice = rows
    .filter((o) => o.variable === "IPVA_INDICE")
    .map((o) => ({ period: o.period, value: o.value }))
    .sort((a, b) => a.period.localeCompare(b.period));
  const tasaAnual = rows
    .filter((o) => o.variable === "IPVA_TASA_ANUAL")
    .map((o) => ({ period: o.period, value: o.value }))
    .sort((a, b) => a.period.localeCompare(b.period));
  if (indice.length === 0 && tasaAnual.length === 0) return null;
  const sample = rows[0];
  return {
    geoLevel: scope.geoLevel,
    geoCode: scope.geoCode,
    geoName: sample?.geoName ?? null,
    unit: sample?.unit ?? null,
    indice,
    tasaAnual,
    latestAnual: latest(tasaAnual),
    latestAnualComputed: ipvaAnualFromIndex(indice),
    acum2015: (() => {
      const l = latest(indice);
      if (!l) return null;
      const acum = ipvaAcum(l.value);
      return acum === null ? null : { period: l.period, value: acum };
    })(),
  };
}

// ── Renda (Atlas ADRH) ───────────────────────────────────────────────────────

export interface RentaTerritory {
  variable: string; // RENTA_NETA_MEDIA_HOGAR | RENTA_NETA_MEDIA_PERSONA
  geoLevel: string;
  geoCode: string;
  geoName: string | null;
  unit: string | null;
  series: SeriesPoint[];
  latest: SeriesPoint | null;
}

/** Sèrie de renda neta mitjana per a una variable i territori. */
export function buildRentaTerritory(
  observations: StatObsLite[],
  scope: { variable: string; geoLevel: string; geoCode: string },
): RentaTerritory | null {
  const rows = observations.filter(
    (o) => o.variable === scope.variable && o.geoLevel === scope.geoLevel && o.geoCode === scope.geoCode,
  );
  if (rows.length === 0) return null;
  const series = rows
    .map((o) => ({ period: o.period, value: o.value }))
    .sort((a, b) => a.period.localeCompare(b.period));
  const sample = rows[0];
  return {
    variable: scope.variable,
    geoLevel: scope.geoLevel,
    geoCode: scope.geoCode,
    geoName: sample.geoName ?? null,
    unit: sample.unit ?? null,
    series,
    latest: latest(series),
  };
}

// ── Assemblador del bloc d'indicadors d'un municipi ──────────────────────────

export interface AssembleMuniInput {
  muni: {
    code: string; // codi 6 dígits Gencat
    ineCode: string | null; // codi INE 5 dígits
    name: string;
    comarca: string | null;
    province: string | null;
    rentLatest: number | null; // €/mes — mitjana de fiances Incasòl
    rentPeriod: string | null;
  };
  /** Observacions rellevants: MUNI (ineCode) + PROV + CCAA 09 + ESTATAL ES, IPVA + Atlas. */
  observations: StatObsLite[];
  /** Mostres del mercat registrat a nivell edifici/illa del municipi (opcional). */
  bandSamples?: BandSample[] | null;
  /** Base de la banda (traçabilitat). Per defecte, fiances Incasòl. */
  bandBasis?: string;
  /** Preu concret consultat (€/mes) — opcional, activa POS_VS_MEDIAN i REF_BAND. */
  price?: number | null;
}

export interface MuniIndicators {
  muni: AssembleMuniInput["muni"];
  generatedAt: string;
  price: number | null;
  band: BandResult | null;
  posVsMedian: (PosVsMedianResult & { basis: string }) | null;
  refBand: { position: BandPosition; labelCa: string; labelEs: string; p25: number; p75: number; basis: string } | null;
  ipva: {
    catalunya: IpvaTerritory | null;
    provincia: IpvaTerritory | null;
    municipi: IpvaTerritory | null; // només municipis >10.000 hab (cobertura INE)
  };
  renta: {
    municipi: { hogar: RentaTerritory | null; persona: RentaTerritory | null };
  };
  effort: { hogar: EffortSide | null; persona: EffortSide | null };
  terrDelta: {
    rentaVsProvincia: TerrDeltaResult | null;
    rentaVsCatalunya: TerrDeltaResult | null;
    rentaVsEspanya: TerrDeltaResult | null;
  };
  fontsUsed: string[]; // codis de DataSource que han aportat dada
  avisos: string[]; // codis d'avís (claus de INDICATOR_META + regles)
}

/**
 * Assembla TOTS els indicadors d'un municipi. Mai llança: si una peça falta,
 * el camp corresponent és null amb l'avís «no disponible».
 */
export function assembleMuniIndicators(input: AssembleMuniInput): MuniIndicators {
  const { muni, observations } = input;
  const provCode = muni.code.slice(0, 2); // "080193" → "08"
  const fonts = new Set<string>();
  const avisos = new Set<string>();

  // banda del mercat registrat (només amb mostres suficients)
  const band = bandQuantiles(input.bandSamples ?? null, input.bandBasis);
  const hasBand = band !== null && band.n >= MIN_SAMPLES_BAND;

  // POS_VS_MEDIAN + REF_BAND (només amb preu consultat)
  const pos = hasBand && input.price ? posVsMedian(input.price, band!.p50) : null;
  const bandPos = hasBand && input.price ? refBand(input.price, band!.p25, band!.p75) : null;

  // IPVA: Catalunya + província + municipi (si hi ha cobertura)
  const ipvaCat = buildIpvaTerritory(observations, { geoLevel: "CCAA", geoCode: CODES_CCAA_CAT });
  const ipvaProv = buildIpvaTerritory(observations, { geoLevel: "PROV", geoCode: provCode });
  const ipvaMuni = muni.ineCode
    ? buildIpvaTerritory(observations, { geoLevel: "MUNI", geoCode: muni.ineCode })
    : null;
  if (ipvaCat || ipvaProv || ipvaMuni) {
    fonts.add("INE_IPVA");
    avisos.add("IPVA_ANUAL");
  }

  // renda del municipi (llar + persona)
  const rentaHogar = muni.ineCode
    ? buildRentaTerritory(observations, { variable: "RENTA_NETA_MEDIA_HOGAR", geoLevel: "MUNI", geoCode: muni.ineCode })
    : null;
  const rentaPersona = muni.ineCode
    ? buildRentaTerritory(observations, { variable: "RENTA_NETA_MEDIA_PERSONA", geoLevel: "MUNI", geoCode: muni.ineCode })
    : null;
  if (rentaHogar || rentaPersona) fonts.add("INE_ATLAS_RENTA");

  // esforç econòmic: fiances (mercat registrat) + renda Atlas
  const effortHogar = rentaHogar?.latest
    ? effortEconomic(muni.rentLatest, rentaHogar.latest.value, {
        rentPeriod: muni.rentPeriod,
        rentaPeriod: rentaHogar.latest.period,
      })
    : null;
  const effortPersona = rentaPersona?.latest
    ? effortEconomic(muni.rentLatest, rentaPersona.latest.value, {
        rentPeriod: muni.rentPeriod,
        rentaPeriod: rentaPersona.latest.period,
      })
    : null;
  if (effortHogar) {
    avisos.add("EFFORT");
    fonts.add("INE_ATLAS_RENTA");
  }

  // diferències territorials de renda (muni vs província/Catalunya/Espanya)
  const rentaProv = buildRentaTerritory(observations, {
    variable: "RENTA_NETA_MEDIA_HOGAR",
    geoLevel: "PROV",
    geoCode: provCode,
  });
  const rentaCat = buildRentaTerritory(observations, {
    variable: "RENTA_NETA_MEDIA_HOGAR",
    geoLevel: "CCAA",
    geoCode: CODES_CCAA_CAT,
  });
  const rentaEs = buildRentaTerritory(observations, {
    variable: "RENTA_NETA_MEDIA_HOGAR",
    geoLevel: "ESTATAL",
    geoCode: GEO_ES,
  });
  const delta = (
    base: RentaTerritory | null,
    altre: RentaTerritory | null,
  ): TerrDeltaResult | null => {
    if (!base?.latest || !altre?.latest) return null;
    return terrDelta(
      { value: base.latest.value, period: base.latest.period },
      { value: altre.latest.value, period: altre.latest.period, geoName: altre.geoName },
    );
  };
  const terrDeltaResult = {
    rentaVsProvincia: delta(rentaHogar, rentaProv),
    rentaVsCatalunya: delta(rentaHogar, rentaCat),
    rentaVsEspanya: delta(rentaHogar, rentaEs),
  };
  if (terrDeltaResult.rentaVsCatalunya || terrDeltaResult.rentaVsEspanya) avisos.add("TERR_DELTA");

  return {
    muni,
    generatedAt: new Date().toISOString(),
    price: input.price ?? null,
    band: hasBand ? band : null,
    posVsMedian: pos && band ? { ...pos, basis: band.basis } : null,
    refBand:
      bandPos && band
        ? {
            position: bandPos,
            labelCa: refBandLabel(bandPos, "ca"),
            labelEs: refBandLabel(bandPos, "es"),
            p25: band.p25,
            p75: band.p75,
            basis: band.basis,
          }
        : null,
    ipva: { catalunya: ipvaCat, provincia: ipvaProv, municipi: ipvaMuni },
    renta: { municipi: { hogar: rentaHogar, persona: rentaPersona } },
    effort: { hogar: effortHogar, persona: effortPersona },
    terrDelta: terrDeltaResult,
    fontsUsed: [...fonts].sort(),
    avisos: [...avisos].sort(),
  };
}
