/**
 * Preureal — Fase 2: parsers dels serveis de dades Tempus3 de l'INE.
 *
 * Funcions PURA: entren JSON cru de DATOS_TABLA i surten observacions
 * estadístiques normalitzades. Sense base de dades ni xarxa → testables
 * localment amb fixtures reals (data/fixtures/) i reutilitzables pels
 * importadors (src/lib/ine-import.ts).
 *
 * Fonts (verificades 10-11-2026):
 *  - IPVA: TABLAS_OPERACION/IPVA → índex NAC+CCAA (59056), províncies (59058),
 *    municipis >10.000 hab (59060). Índex base 2015=100 i variació anual.
 *  - ADRH (Atlas de distribució de la renda dels llars): TABLAS_OPERACION/ADRH
 *    → taula nacional CCAA+províncies (53689) i taules provincials (Barcelona
 *    30896, Girona 31016, Lleida 31079, Tarragona 31223) amb sèries municipals
 *    «Renta neta media por persona / por hogar», sèries 2015-2024.
 *
 * Regles de l'encàrrec respectades:
 *  - l'IPVA és un ÍNDEX (evolució), mai un nivell de preu en euros;
 *  - la renda de l'Atlas és renda neta MITJANA territorial (persona/llar),
 *    mai un salari individual;
 *  - els punts amb secreto estadístic (Secreto=true) NO es guarden.
 */

// ── Tipus públics ────────────────────────────────────────────────────────────

export type GeoLevel = "ESTATAL" | "CCAA" | "PROV" | "MUNI";

export interface MuniLite {
  code: string; // codi Municipality.code (6 dígits Gencat)
  ineCode: string | null; // codi INE 5 dígits
  name: string;
  province: string | null;
}

export interface RawObservation {
  variable: string;
  geoLevel: GeoLevel;
  geoCode: string;
  geoName: string;
  municipalityCode: string | null;
  period: string;
  value: number;
  unit: string;
  meta: string | null;
}

export interface ParseSkips {
  secreto: number; // punts amb secreto estadístic
  sinMunicipio: number; // municipis INE no mapejats amb el nostre catàleg
  fueraAmbito: number; // territoris fora de l'àmbit (altres CCAA/províncies)
  desglose: number; // sèries de districte/secció o per tipus d'edificació
  sinDatos: number; // punts sense valor
}

export interface ParseResult {
  observations: RawObservation[];
  skips: ParseSkips;
  /** Noms INE sense mapeig (màx 30, per diagnòstic) */
  unmatched: string[];
  warnings: string[];
}

// ── Variables canòniques ─────────────────────────────────────────────────────

export const IPVA_INDICE = "IPVA_INDICE"; // unitat: índex (base 2015=100)
export const IPVA_TASA_ANUAL = "IPVA_TASA_ANUAL"; // unitat: %
export const RENTA_NETA_MEDIA_PERSONA = "RENTA_NETA_MEDIA_PERSONA"; // €/any
export const RENTA_NETA_MEDIA_HOGAR = "RENTA_NETA_MEDIA_HOGAR"; // €/any

const UNIT_INDICE = "índex (base 2015=100)";
const UNIT_TASA = "%";
const UNIT_RENTA = "€/any (renda neta mitjana)";

// Codis INE oficials de l'àmbit Preureal
const CCAA_CATALUNYA = "09";
const PROV_CODES: Record<string, string> = {
  Barcelona: "08",
  Girona: "17",
  Lleida: "25",
  Tarragona: "43",
};

const MIN_ANY = 2015; // base de l'IPVA i primera sèrie de l'Atlas

// ── Normalització de noms de municipis ───────────────────────────────────────

/** minúscules, sense accents/diacrítics, espais col·lapsats */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘´`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ARTICLES = new Set(["el", "la", "els", "les", "lo", "l'", "sa", "es", "ses"]);

/** Genera les claus de cerca d'un nom oficial de municipi. El catàleg Gencat
 *  usa la forma invertida («Vendrell, el») i l'INE també («Vendrell, El»);
 *  els noms amb article davant («El Prat de Llobregat») generen també la
 *  forma invertida per si la font la publica al revés. */
function keysForName(name: string): string[] {
  const n = normName(name);
  const keys = new Set<string>([n]);
  const m = n.match(/^(.+),\s*(el|la|els|les|lo|l'|sa|es|ses)$/); // ja invertit
  if (m) keys.add(`${m[2]} ${m[1]}`);
  const d = n.match(/^((?:el|la|els|les|lo|l'|sa|es|ses)\s)\s*(.+)$/); // article davant
  if (d) keys.add(`${d[2]}, ${d[1].trim()}`);
  return [...keys];
}

/** Resol un nom publicat per l'INE (pot dur l'article invertit:
 *  «Vendrell, El») contra el nostre catàleg de municipis. */
export function buildMuniMatcher(munis: MuniLite[]): (ineName: string) => MuniLite | null {
  const index = new Map<string, MuniLite | "AMBIGU">();
  const add = (key: string, m: MuniLite) => {
    const prev = index.get(key);
    if (!prev) index.set(key, m);
    else if (prev !== "AMBIGU" && prev.code !== m.code) index.set(key, "AMBIGU");
  };
  for (const m of munis) {
    for (const k of keysForName(m.name)) add(k, m);
  }
  return (ineName: string): MuniLite | null => {
    const n = normName(ineName);
    let key = n;
    // resol l'article invertit de l'INE: «vendrell, el» → «el vendrell»
    const inv = n.match(/^(.+),\s*(el|la|els|les|lo|l'|sa|es|ses)$/);
    if (inv && ARTICLES.has(inv[2]) && !index.has(n)) key = `${inv[2]} ${inv[1]}`;
    const hit = index.get(key);
    return hit && hit !== "AMBIGU" ? hit : null;
  };
}

// ── Utilitats de sèries Tempus3 ──────────────────────────────────────────────

interface IneSerie {
  COD?: string;
  Nombre?: string;
  Data?: { Anyo?: number; Valor?: number | null; Secreto?: boolean }[];
}

/** recorre els punts de dada vàlids d'una sèrie (≥ any mínim, amb valor) */
function dataPoints(
  serie: IneSerie,
  skips: ParseSkips,
): { any: number; valor: number }[] {
  const out: { any: number; valor: number }[] = [];
  for (const p of serie.Data ?? []) {
    const any = typeof p.Anyo === "number" ? p.Anyo : NaN;
    if (!Number.isFinite(any) || any < MIN_ANY) continue;
    if (p.Secreto === true) {
      skips.secreto++;
      continue;
    }
    const v = typeof p.Valor === "number" && isFinite(p.Valor) ? p.Valor : NaN;
    if (!Number.isFinite(v)) {
      skips.sinDatos++;
      continue;
    }
    out.push({ any, valor: v });
  }
  return out;
}

function newResult(): ParseResult {
  return {
    observations: [],
    skips: { secreto: 0, sinMunicipio: 0, fueraAmbito: 0, desglose: 0, sinDatos: 0 },
    unmatched: [],
    warnings: [],
  };
}

function pushUnmatched(res: ParseResult, name: string) {
  if (res.unmatched.length < 30 && !res.unmatched.includes(name)) res.unmatched.push(name);
}

// ── IPVA ─────────────────────────────────────────────────────────────────────

/**
 * Taula 59056 — «Índices nacionales y por comunidades autónomas: general».
 * Sèries del tipus «Cataluña. Total. Índice.» / «Total Nacional. Total. Índice.»
 * Només es prenen el Total Nacional i Catalunya (àmbit Preureal); els
 * desglossos per tipus d'edificació es descarten.
 */
export function parseIpvaNacCcaa(json: unknown): ParseResult {
  const res = newResult();
  if (!Array.isArray(json)) {
    res.warnings.push("JSON inesperat (no és una llista de sèries)");
    return res;
  }
  for (const s of json as IneSerie[]) {
    const nombre = (s.Nombre ?? "").trim();
    const m = nombre.match(/^(.+?)\.\s*(.+?)\.\s*(Índice|Variación anual)\.?$/);
    if (!m) {
      res.skips.desglose++;
      continue;
    }
    const [, territorio, tipo, variable] = m;
    if (tipo.trim() !== "Total") {
      res.skips.desglose++;
      continue;
    }
    let geoLevel: GeoLevel | null = null;
    let geoCode = "";
    if (normName(territorio) === "total nacional") {
      geoLevel = "ESTATAL";
      geoCode = "ES";
    } else if (normName(territorio) === "cataluna") {
      geoLevel = "CCAA";
      geoCode = CCAA_CATALUNYA;
    } else {
      res.skips.fueraAmbito++;
      continue;
    }
    const isIndice = variable.trim() === "Índice";
    const obsVariable = isIndice ? IPVA_INDICE : IPVA_TASA_ANUAL;
    const unit = isIndice ? UNIT_INDICE : UNIT_TASA;
    for (const { any, valor } of dataPoints(s, res.skips)) {
      res.observations.push({
        variable: obsVariable,
        geoLevel,
        geoCode,
        geoName: territorio.trim(),
        municipalityCode: null,
        period: String(any),
        value: valor,
        unit,
        meta: s.COD ? JSON.stringify({ serie: s.COD }) : null,
      });
    }
  }
  return res;
}

/**
 * Taula 59058 — «Índices provinciales: general». Sèries «Barcelona. Total. Índice.»
 * Només les 4 províncies catalanes; el Total Nacional es deixa per la taula 59056.
 */
export function parseIpvaProv(json: unknown): ParseResult {
  const res = newResult();
  if (!Array.isArray(json)) {
    res.warnings.push("JSON inesperat (no és una llista de sèries)");
    return res;
  }
  for (const s of json as IneSerie[]) {
    const nombre = (s.Nombre ?? "").trim();
    const m = nombre.match(/^(.+?)\.\s*(.+?)\.\s*(Índice|Variación anual)\.?$/);
    if (!m) {
      res.skips.desglose++;
      continue;
    }
    const [, territorio, tipo, variable] = m;
    if (tipo.trim() !== "Total") {
      res.skips.desglose++;
      continue;
    }
    const prov = territorio.trim();
    const geoCode = PROV_CODES[prov];
    if (!geoCode) {
      res.skips.fueraAmbito++;
      continue;
    }
    const isIndice = variable.trim() === "Índice";
    const obsVariable = isIndice ? IPVA_INDICE : IPVA_TASA_ANUAL;
    const unit = isIndice ? UNIT_INDICE : UNIT_TASA;
    for (const { any, valor } of dataPoints(s, res.skips)) {
      res.observations.push({
        variable: obsVariable,
        geoLevel: "PROV",
        geoCode,
        geoName: prov,
        municipalityCode: null,
        period: String(any),
        value: valor,
        unit,
        meta: s.COD ? JSON.stringify({ serie: s.COD }) : null,
      });
    }
  }
  return res;
}

/**
 * Taula 59060 — «Índices por municipio (>10.000 hab)». Sèries «Abrera. Índice.»
 * Només municipis catalans del nostre catàleg (resol articles invertits).
 */
export function parseIpvaMuni(json: unknown, match: (name: string) => MuniLite | null): ParseResult {
  const res = newResult();
  if (!Array.isArray(json)) {
    res.warnings.push("JSON inesperat (no és una llista de sèries)");
    return res;
  }
  const TIPOS = new Set(["Total", "Vivienda colectiva", "Vivienda unifamiliar"]);
  for (const s of json as IneSerie[]) {
    const nombre = (s.Nombre ?? "").trim();
    // Format real (taula 59060): «Albacete. Índice. Total.» — la variable va
    // AL MIG. Resolem per segments, independentment de l'ordre:
    const parts = nombre.split(".").map((x) => x.trim()).filter(Boolean);
    const vi = parts.findIndex((p) => p === "Índice" || p === "Variación anual");
    if (vi < 0) {
      res.skips.desglose++;
      continue;
    }
    const variable = parts[vi];
    const rest = parts.filter((_, i) => i !== vi);
    const territorio = rest.find((p) => !TIPOS.has(p));
    const tipo = rest.find((p) => TIPOS.has(p));
    if (!territorio || rest.length > 2 || (tipo && tipo !== "Total")) {
      res.skips.desglose++;
      continue;
    }
    const mun = match(territorio);
    if (!mun) {
      // el municipi no és català (fora d'àmbit) o no està al catàleg
      res.skips.fueraAmbito++;
      pushUnmatched(res, territorio.trim());
      continue;
    }
    const isIndice = variable.trim() === "Índice";
    const obsVariable = isIndice ? IPVA_INDICE : IPVA_TASA_ANUAL;
    const unit = isIndice ? UNIT_INDICE : UNIT_TASA;
    for (const { any, valor } of dataPoints(s, res.skips)) {
      res.observations.push({
        variable: obsVariable,
        geoLevel: "MUNI",
        geoCode: mun.ineCode ?? mun.code,
        geoName: mun.name,
        municipalityCode: mun.code,
        period: String(any),
        value: valor,
        unit,
        meta: s.COD ? JSON.stringify({ serie: s.COD }) : null,
      });
    }
  }
  return res;
}

// ── Atlas de distribució de la renda dels llars (ADRH) ──────────────────────

const RENTA_VARS = new Set(["Renta neta media por persona", "Renta neta media por hogar"]);

/** variable canònica + unitat per a un nom de variable ADRH */
function rentaVar(nombre: string): { variable: string; unit: string } | null {
  if (nombre === "Renta neta media por persona")
    return { variable: RENTA_NETA_MEDIA_PERSONA, unit: UNIT_RENTA };
  if (nombre === "Renta neta media por hogar")
    return { variable: RENTA_NETA_MEDIA_HOGAR, unit: UNIT_RENTA };
  return null;
}

/**
 * Taules provincials ADRH (Barcelona 30896, Girona 31016, Lleida 31079,
 * Tarragona 31223) — sèries municipals «<Municipi>. Dato base. Renta neta
 * media por persona/por hogar.» S'ignoren districtes, seccions i la resta
 * d'indicadors (bruta, unitat de consum, mediana…).
 */
export function parseAtlasMuni(json: unknown, match: (name: string) => MuniLite | null): ParseResult {
  const res = newResult();
  if (!Array.isArray(json)) {
    res.warnings.push("JSON inesperat (no és una llista de sèries)");
    return res;
  }
  for (const s of json as IneSerie[]) {
    const nombre = (s.Nombre ?? "").trim();
    const m = nombre.match(/^(.+?)\.\s*Dato base\.\s*([^\.]+?)\.?$/);
    if (!m) {
      res.skips.desglose++;
      continue;
    }
    const [, territorioBruto, varNombre] = m;
    // districtes i seccions censals («Terrassa distrito 07. Dato base…»)
    if (/\s(distrito|sección)\s+\w+/i.test(territorioBruto)) {
      res.skips.desglose++;
      continue;
    }
    const rv = rentaVar(varNombre.trim());
    if (!rv) {
      res.skips.desglose++;
      continue;
    }
    const territorio = territorioBruto;
    const mun = match(territorio.trim());
    if (!mun) {
      res.skips.sinMunicipio++;
      pushUnmatched(res, territorio.trim());
      continue;
    }
    for (const { any, valor } of dataPoints(s, res.skips)) {
      res.observations.push({
        variable: rv.variable,
        geoLevel: "MUNI",
        geoCode: mun.ineCode ?? mun.code,
        geoName: mun.name,
        municipalityCode: mun.code,
        period: String(any),
        value: valor,
        unit: rv.unit,
        meta: s.COD ? JSON.stringify({ serie: s.COD }) : null,
      });
    }
  }
  return res;
}

/**
 * Taula nacional ADRH (53689) — «Resultados nacionales, por CCAA, provincias e
 * islas». Es prenen Total Nacional + Catalunya + les 4 províncies catalanes;
 * la resta (altres CCAA, províncies i illes) queda fora d'àmbit.
 */
export function parseAtlasNacional(json: unknown): ParseResult {
  const res = newResult();
  if (!Array.isArray(json)) {
    res.warnings.push("JSON inesperat (no és una llista de sèries)");
    return res;
  }
  for (const s of json as IneSerie[]) {
    const nombre = (s.Nombre ?? "").trim();
    // «Cataluña. Dato base. Renta neta media por persona.»
    const m = nombre.match(/^(.+?)\.\s*(?:Dato base\.\s*)?([^\.]+?)\.?$/);
    if (!m) {
      res.skips.desglose++;
      continue;
    }
    const [, territorio, varNombre] = m;
    const rv = rentaVar(varNombre.trim());
    if (!rv) {
      res.skips.desglose++;
      continue;
    }
    const t = territorio.trim();
    let geoLevel: GeoLevel | null = null;
    let geoCode = "";
    if (normName(t) === "total nacional") {
      geoLevel = "ESTATAL";
      geoCode = "ES";
    } else if (normName(t) === "cataluna") {
      geoLevel = "CCAA";
      geoCode = CCAA_CATALUNYA;
    } else if (PROV_CODES[t]) {
      geoLevel = "PROV";
      geoCode = PROV_CODES[t];
    } else {
      res.skips.fueraAmbito++;
      continue;
    }
    for (const { any, valor } of dataPoints(s, res.skips)) {
      res.observations.push({
        variable: rv.variable,
        geoLevel,
        geoCode,
        geoName: t,
        municipalityCode: null,
        period: String(any),
        value: valor,
        unit: rv.unit,
        meta: s.COD ? JSON.stringify({ serie: s.COD }) : null,
      });
    }
  }
  return res;
}
