/**
 * Preureal — v44 «Analitza el teu futur lloguer»: lògica PURA (sense BD ni
 * xarxa) del nou analitzador d'una vivenda concreta abans de signar.
 *
 * Reutilitza el motor de valoració validat (src/lib/territorial.ts:
 * computeValuation, ajustos hedònics v2) i afegeix:
 *  - A. anàlisi de preu: €/m² de l'anunci, referència Incasòl municipal
 *    (o referència de comarca marcada com a ESTIMACIÓ), desviació, veredicte
 *    per llindars explícits, evolució i municipis propers.
 *  - B. comprovació normativa: zona tensada (Resolucions TER/3739/2026 i
 *    TER/3740/2026, DOGC 19-10-2026), tipus de contracte, renta anterior,
 *    gran tenedor i sistema estatal (SERPAVI), actualització anual IRAV.
 *    MAI declara legalitat: estats «compatible», «requereix comprovacions»
 *    o «possible incompliment», sempre amb font i data de consulta.
 *  - C. serveis d'ubicació (parser d'Overpass/OpenStreetMap + distàncies).
 *  - D. llista de comprovació abans de signar (contingut fix, amb fonts).
 *
 * Regla d'or del projecte: dada no disponible → null, mai inventada.
 */

// ── Tipus d'entrada ──────────────────────────────────────────────────────────

export type ContractType = "HABITATGE" | "TEMPORADA" | "HABITACIO";

export interface AnalitzaInput {
  municipalityCode: string;
  municipalityName: string;
  priceEurMonth: number;
  surfaceM2: number | null;
  rooms: number | null;
  contractType: ContractType;
  builtYear: number | null;
  previousRent: number | null;
  notes: string | null;
}

// ── Utilitats numèriques ─────────────────────────────────────────────────────

export function validNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

/** Distància haversine en metres (línia recta — sempre etiquetada «aprox.»). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ── A. Anàlisi de preu ───────────────────────────────────────────────────────

/** €/m²·mes de l'anunci: derivat, mai de la font oficial. Null sense superfície. */
export function announcedEurM2(price: number, surface: number | null): number | null {
  if (!validNum(surface) || surface < 5) return null;
  return Math.round((price / surface) * 100) / 100;
}

/**
 * Desviació (%) de l'anunci respecte una referència. Si la referència és de
 * comarca, la UI ho marca com a ESTIMACIÓ (la fiança municipal no hi és).
 */
export function deltaPct(price: number, reference: number | null): number | null {
  if (!validNum(reference) || reference <= 0) return null;
  return Math.round(((price - reference) / reference) * 1000) / 10;
}

export type PriceVerdict = "VERY_BELOW" | "BELOW" | "IN_RANGE" | "ABOVE" | "VERY_ABOVE" | null;

/**
 * Veredicte per llindars EXPLICITS (maig de llindars ocults):
 *  ≤ −25 % MOLT ABAIX (revisar: pot ser anunci esbiaixat o pis il·legal),
 *  −25…−5 % ABAIX, −5…+5 % EN RANG, +5…+15 % PER DAVANT, > +15 % MOLT PER DAVANT.
 */
export function priceVerdict(delta: number | null): PriceVerdict {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (delta <= -25) return "VERY_BELOW";
  if (delta <= -5) return "BELOW";
  if (delta <= 5) return "IN_RANGE";
  if (delta <= 15) return "ABOVE";
  return "VERY_ABOVE";
}

export interface PriceCheckInput {
  priceEurMonth: number;
  surfaceM2: number | null;
  /** €/mes vigent del municipi (fiança Incasòl) o null. */
  muniRent: number | null;
  /** true = la referència és la fiança municipal OFICIAL; false = ref. comarca. */
  isMuniOfficial: boolean;
  /** €/mes esperat per a AQUESTA vivenda (motor computeValuation) o null. */
  expectedCentral: number | null;
}

export interface PriceCheckResult {
  eurM2: number | null;
  reference: number | null;
  referenceIsEstimate: boolean;
  deltaVsReferencePct: number | null;
  deltaVsExpectedPct: number | null;
  verdict: PriceVerdict;
}

export function buildPriceCheck(input: PriceCheckInput): PriceCheckResult {
  const ref = validNum(input.muniRent) && input.muniRent > 0 ? input.muniRent : null;
  const eurM2 = announcedEurM2(input.priceEurMonth, input.surfaceM2);
  const dRef = deltaPct(input.priceEurMonth, ref);
  const dExp = validNum(input.expectedCentral)
    ? deltaPct(input.priceEurMonth, input.expectedCentral)
    : null;
  return {
    eurM2,
    reference: ref,
    referenceIsEstimate: !input.isMuniOfficial && ref !== null,
    deltaVsReferencePct: dRef,
    deltaVsExpectedPct: dExp,
    // el veredicte usa la referència més ajustada disponible (valoració d'habitatge)
    verdict: priceVerdict(dExp ?? dRef),
  };
}

// ── B. Comprovació normativa ─────────────────────────────────────────────────

export type NormState = "OK" | "PENDING" | "ALERT" | "INFO" | "NA";

/** Fets normatius vigents, amb font i data — revisar quan canviïn les normes. */
export const NORM_FACTS = {
  /** Resolucions vigents de zones tensades (DOGC 19-10-2026): 118 prorrogades + 53 noves. */
  tenseResolutions: [
    "Resolució TER/3739/2026 (pròrroga, 118 municipis)",
    "Resolució TER/3740/2026 (nous, 53 municipis)",
  ],
  tenseSource: "https://dogc.gencat.cat/",
  /** LAU art. 17.2 (Llei 12/2023): nous contractes en zona tensada d'habitatge
   *  habitual — renta ≤ la del darrer contracte dels 5 anys anteriors (amb les
   *  seves clàusules d'actualització); increments excepcionals tipificats
   *  després del RDL 29/2026 (rehabilitació, eficiència energètica,
   *  accessibilitat o contractes de llarga durada, màx. +10 %). */
  newContractLimitSource:
    "Ley 29/1994 (LAU), art. 17.2 (redacció Llei 12/2023) i art. 17.6-17.7 (RDL 29/2026)",
  /** SERPAVI — Sistema Estatal de Referència de Preus de lloguer, obligatori
   *  per a grans tenedores en zona tensada des del 8-10-2026 (RDL 29/2026).
   *  Definició de gran tenedor: LAU art. 2 (10+ vivendes; o 5+ dins la mateixa
   *  zona tensada). Consulta oficial: calculadora MIVAU. */
  serpaviSource: "https://www.mivau.gob.es/vivienda/calculadora-precio-alquiler",
  granTenedorSource: "Ley 29/1994 (LAU), art. 2 (gran tenedor: 10+ vivendes; o 5+ en la mateixa zona)",
  /** Actualització anual de renta: IRAV (INE), Llei 12/2023 DA 11ª / LAU art. 18. */
  iravSource: "https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254746177317",
  iravLatestPct: 2.54,
  iravLatestPeriod: "setembre 2026 (aplicable a l'actualització de novembre de 2026)",
  /** Els contractes de temporada (LAU art. 3) i lloguer d'habitació no tenen
   *  el límit de renta de l'art. 17.2; tenen altres regles (durada màxima). */
  temporadaSource: "Ley 29/1994 (LAU), art. 3 (uso distinto de vivienda habitual)",
  /** Certificat d'amiant obligatori per vendre o llogar a Catalunya des del 3-10-2026. */
  amiantNote: "Certificat de presència o absència d'amiant, obligatori a Catalunya des del 3-10-2026 (Generalitat)",
};

export interface NormCheck {
  id: string;
  state: NormState;
  /** Claus de traducció/etiqueta — la UI les mostra en ca/es. */
  detail: string;
}

export interface NormativeResult {
  tense: boolean;
  appliesRentLimits: boolean;
  checks: NormCheck[];
  consultedAt: string;
}

/**
 * Motor normatiu — mai no determina LEGALITAT global: assigna estats per
 * comprovació amb la informació disponible i marca la resta com a PENDING.
 * Regles:
 *  - Límits de renta (art. 17.2): només habitatge habitual. Temporada/
 *    habitació → NA amb explicació.
 *  - Renta anterior coneguda + anunci > renta anterior → ALERT («possible
 *    incompliment: revisar»), amb l'avís que els supòsits excepcionals
 *    (+10 %) o dades de millora poden canviar la lectura.
 *  - Renta anterior coneguda + anunci ≤ renta anterior → OK «compatible amb
 *    les dades consultades» (resta de comprovacions queden pendents).
 *  - Zona NO tensada → la comparació de renta anterior no aplica (lloguer lliure
 *    d'habitatge nou, però l'actualització anual IRAV sempre aplica).
 */
export function buildNormative(
  input: AnalitzaInput,
  tense: boolean,
  now: Date = new Date()
): NormativeResult {
  const checks: NormCheck[] = [];
  const isHabitatge = input.contractType === "HABITATGE";

  // 1) zona tensada (data de la BD: resolucions vigents)
  checks.push({
    id: "ZONA_TENSADA",
    state: "INFO", // informatiu: ser-hi o no ser-hi en zona tensada no és un incompliment
    detail: tense
      ? "MUNI_TENSAT"
      : "MUNI_NO_TENSAT",
  });

  // 2) límits de renta del nou contracte (només habitatge habitual)
  if (!isHabitatge) {
    checks.push({
      id: "LIMIT_RENTA_ART172",
      state: "NA",
      detail:
        input.contractType === "TEMPORADA"
          ? "TEMPORADA_FORA_LIMIT"
          : "HABITACIO_FORA_LIMIT",
    });
  } else if (!tense) {
    checks.push({ id: "LIMIT_RENTA_ART172", state: "NA", detail: "NO_TENSAT_LLIURE" });
  } else if (input.previousRent === null) {
    checks.push({ id: "LIMIT_RENTA_ART172", state: "PENDING", detail: "FALTA_RENTA_ANTERIOR" });
  } else if (input.priceEurMonth > input.previousRent) {
    checks.push({ id: "LIMIT_RENTA_ART172", state: "ALERT", detail: "SUPERIOR_ANTERIOR" });
  } else {
    checks.push({ id: "LIMIT_RENTA_ART172", state: "OK", detail: "NO_SUPERIOR_ANTERIOR" });
  }

  // 3) gran tenedor + SERPAVI (només habitatge habitual en zona tensada)
  checks.push({
    id: "GRAN_TENEDOR_SERPAVI",
    state: isHabitatge && tense ? "PENDING" : "NA",
    detail: isHabitatge && tense ? "CONSULTA_SERPAVI" : "NO_APLICA_SERPAVI",
  });

  // 4) actualització anual (IRAV) — sempre informatiu
  checks.push({ id: "ACTUALITZACIO_IRAV", state: "INFO", detail: "IRAV_VIGENT" });

  return {
    tense,
    appliesRentLimits: isHabitatge && tense,
    checks,
    consultedAt: now.toISOString().slice(0, 10),
  };
}

// ── C. Serveis d'ubicació (OpenStreetMap via Overpass) ───────────────────────

export type PoiCategory =
  | "TRANSPORT"
  | "SALUT"
  | "EDUCACIO"
  | "COMPRA"
  | "VERD";

export interface Poi {
  category: PoiCategory;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
}

/** Classificació d'una etiqueta Overpass (nodes i ways amb centre) → categoria. */
export function classifyPoi(tags: Record<string, string> | undefined | null): PoiCategory | null {
  if (!tags) return null;
  const a = tags.amenity ?? "";
  const s = tags.shop ?? "";
  const l = tags.leisure ?? "";
  const r = tags.railway ?? "";
  const p = tags.public_transport ?? "";
  const hw = tags.highway ?? "";
  if (["bus_stop", "bus_station"].includes(hw) || ["station", "halt", "tram_stop"].includes(r) || p === "stop_position" || p === "platform") {
    return "TRANSPORT";
  }
  if (["pharmacy", "doctors", "clinic", "hospital", "dentist"].includes(a)) return "SALUT";
  if (["school", "kindergarten", "college", "university", "library"].includes(a)) return "EDUCACIO";
  if (["supermarket", "convenience"].includes(s)) return "COMPRA";
  if (["park", "garden", "playground"].includes(l)) return "VERD";
  return null;
}

/**
 * Converteix la sortida Overpass (elements node/way amb center) en POIs amb
 * distància al punt de consulta, ordenats per proximitat i sense duplicats
 * per nom+categoria (mateixa parada repetida amb nivells). Màxim per categoria
 * controlat a la UI.
 */
export function parseOverpassElements(
  elements: Array<Record<string, unknown>> | undefined | null,
  originLat: number,
  originLng: number
): Poi[] {
  const out: Poi[] = [];
  const seen = new Set<string>();
  for (const el of elements ?? []) {
    const tags = (el?.tags ?? null) as Record<string, string> | null;
    const cat = classifyPoi(tags);
    if (!cat) continue;
    let lat: number | undefined;
    let lng: number | undefined;
    if (el?.type === "node" && Number.isFinite(el.lat as number) && Number.isFinite(el.lon as number)) {
      lat = Number(el.lat);
      lng = Number(el.lon);
    } else {
      const center = el?.center as { lat?: unknown; lon?: unknown } | undefined;
      if (center && Number.isFinite(center.lat as number) && Number.isFinite(center.lon as number)) {
        lat = Number(center.lat);
        lng = Number(center.lon);
      }
    }
    if (lat === undefined || lng === undefined) continue;
    const name = String(tags?.name ?? (cat === "TRANSPORT" ? "Parada" : cat === "SALUT" ? "Servei sanitari" : cat === "EDUCACIO" ? "Centre educatiu" : cat === "COMPRA" ? "Botiga" : "Espai verd"));
    const key = `${cat}|${name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      category: cat,
      name,
      lat,
      lng,
      distanceM: haversineMeters(originLat, originLng, lat, lng),
    });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

/** Consulta Overpass per al punt (ràdio fix 800 m a peu). Server-side. */
export function buildOverpassQuery(lat: number, lng: number, radius = 800): string {
  const around = `(around:${radius},${lat.toFixed(5)},${lng.toFixed(5)})`;
  return [
    "[out:json][timeout:20];",
    "(",
    `node${around}[highway~"^(bus_stop|bus_station)$"];`,
    `node${around}[railway~"^(station|halt|tram_stop)$"];`,
    `node${around}[public_transport~"^(stop_position|platform)$"];`,
    `node${around}[amenity~"^(pharmacy|doctors|clinic|hospital|dentist)$"];`,
    `node${around}[amenity~"^(school|kindergarten|college|university|library)$"];`,
    `node${around}[shop~"^(supermarket|convenience)$"];`,
    `way${around}[leisure~"^(park|garden|playground)$"];`,
    ");",
    "out center 150;",
  ].join("\n");
}

// ── D. Llista de comprovació (contingut fix amb fonts) ──────────────────────

export interface ChecklistItem {
  id: string;
  source: string | null;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: "IDENTITAT", source: "Registre de la Propietat (nota simple) + LAU art. 9" },
  { id: "MODALITAT_DURADA", source: "LAU arts. 3, 7 i 8" },
  { id: "PREU_REGLES", source: "LAU art. 17 (i art. 17.2 en zona tensada)" },
  { id: "FIANZA_GARANTIES", source: "LAU art. 36 (fiança 1 mes a Incasòl; garantia addicional màx. 2 mesos)" },
  { id: "DESPESES_SUMINISTRES", source: "LAU art. 20" },
  { id: "CEDULA_HABITABILITAT", source: "Decret 141/2012 (DOGC 6254)" },
  { id: "CERTIFICAT_ENERGETIC", source: "RD 390/2021" },
  { id: "CONSERVACIO_DES_PERFECTES", source: "LAU art. 21.2 (inventari amb fotos abans de signar)" },
  { id: "AMIANT", source: NORM_FACTS.amiantNote },
];

// ── Fonts i limitacions (metadades de l'informe) ────────────────────────────

export const ANALITZA_SOURCES = [
  { t: "Fiances de lloguer (Incasòl)", u: "https://incasol.gencat.cat/", d: "preu mitjà mensual i contractes per municipi; explotació d'habitatge.gencat.cat" },
  { t: "Geocodificador ICGC", u: "https://openicgc.github.io/geocodificador-doc/", d: "adreces i punts sobre el mapa (CC-BY 4.0)" },
  { t: "Cartografia base ICGC", u: "https://www.icgc.cat/", d: "mapa base per marcar la vivenda" },
  { t: "Serveis d'entorn (OpenStreetMap)", u: "https://www.openstreetmap.org/copyright", d: "transport, salut, educació, comerç i zones verdes propers; dades col·laboratives ODbL — distances en línia recta, aprox." },
  { t: "Zones tensades", u: NORM_FACTS.tenseSource, d: `${NORM_FACTS.tenseResolutions.join(" · ")} (DOGC 19-10-2026)` },
  { t: "Calculadora oficial de preus i límits (MIVAU)", u: NORM_FACTS.serpaviSource, d: "sistema estatal de referència per parcel·la (SERPAVI)" },
  { t: "IRAV — índex d'actualització anual (INE)", u: NORM_FACTS.iravSource, d: `últim valor ${NORM_FACTS.iravLatestPct} % (${NORM_FACTS.iravLatestPeriod})` },
  { t: "Índex de lloguer — Agència d'Habitatge de Catalunya", u: "https://agenciahabitatge.gencat.cat/indexdelloguer", d: "consulta oficial de referències per habitatge a Catalunya" },
];

export const ANALITZA_LIMITATIONS = [
  "LIMIT_REF_MUNICIPAL: la referència és la fiança mitjana MUNICIPAL de la vivenda típica registrada a Incasòl; mai el preu real de l'edifici ni de la vivenda concreta.",
  "LIMIT_ESTIMACIO_COMARCA: si el municipi no té fiança publicada, es mostra la referència de comarca marcada explícitament com a ESTIMACIÓ (mai dada municipal inventada).",
  "LIMIT_SERVEIS_APROX: distàncies en línia recta (no temps reals ni recorreguts) amb dades col·laboratives OpenStreetMap de resolució variable.",
  "LIMIT_NORMATIU: la comprovació normativa és informativa, no assessorament jurídic; cal consultar la calculadora oficial (MIVAU) i les fonts per determinar la legalitat.",
  "LIMIT_PENDENTS: soroll, qualitat de l'aire, risc d'inundació i cobertura de fibra queden pendents d'integració amb fonts oficials (mapa de soroll, XVPCA, SINCRO/ICGC); no s'inventen valors.",
];
