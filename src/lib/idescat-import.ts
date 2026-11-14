/**
 * v39 (Fase demografia) — Importadors IDESCAT → StatObservation.
 *
 * Fonts (totes oficials, citades per la pròpia API):
 *  - IDESCAT_POB        Taules v2 pmh/446/477 — «Població a 1 de gener. Per sexe»
 *                       (sèries anuals 1998–2025; munis + comarques + Catalunya).
 *  - IDESCAT_EDAT       Taules v2 pmh/9548/10494 — edats quinquennals (2000–2022),
 *                       agregades a grans grups OFICIALS (0-14, 15-64, 65-84, 85+).
 *  - IDESCAT_NAC        Taules v2 pmh/680/690 — nacionalitat (continents):
 *                       espanyola + estrangera (= total − espanyola, derivació
 *                       documentada de categories oficials de la mateixa taula).
 *  - IDESCAT_CENS_LLARS Taules v2 censph/7952/8018 (llars totals, censos
 *                       1991–2021) + censph/17317/20806 (indicadors de llars 2021).
 *  - IDESCAT_EMEX       «El municipi en xifres» (emex/v1/dades.json per municipi):
 *                       superfície, densitat i grans grups d'edat vigents amb
 *                       tripletta [muni, comarca, Catalunya]. Primer arranc:
 *                       seed local (src/data/idescat_superficie_seed.json) amb
 *                       dades reals descarregades de l'API — sense xarxa.
 *
 * Garanties (mateixes que ine-import.ts): IDEMPOTENT (finestra de substitució
 * per font/àmbit), ADITIU (mai toca cap altra taula), TRAÇABLE (DataSource +
 * ImportRun + meta amb taula i font citada). Codis: els codis MUN de l'API
 * Taules són els mateixos codis censals de 6 dígits que Municipality.code.
 */
import { db } from "@/lib/db";
import { audit } from "@/lib/security";
import {
  aggregateAgeGroups,
  jsonStatCells,
  parseEmexTables,
  type JsonStatDataset,
} from "@/lib/idescat-parse";
import seedSuperficie from "@/data/idescat_superficie_seed.json";

const UA = "Preureal/1.0 (dades oficials IDESCAT; +https://www.preureal.com)";
const TAULES = "https://api.idescat.cat/taules/v2";
const EMEX = "https://api.idescat.cat/emex/v1/dades.json";

/** Últims N anys de sèrie que es desen (10 anys d'evolució = 11 punts). */
const SERIE_ANY = 12;
/** Sèrie d'edats: finestra més curta (és un context secundari). */
const EDAT_ANY = 6;

export const IDESCAT_SOURCES = [
  "IDESCAT_POB",
  "IDESCAT_EDAT",
  "IDESCAT_NAC",
  "IDESCAT_CENS_LLARS",
  "IDESCAT_EMEX",
] as const;
export type IdescatScope =
  | "POB"
  | "EDAT"
  | "NAC"
  | "CENS_LLARS"
  | "EMEX_SEED"
  | "EMEX_BATCH";

const POB_SOURCE = {
  code: "IDESCAT_POB",
  name: "Població a 1 de gener per sexe (Padró continu)",
  institution: "IDESCAT (Institut d'Estadística de Catalunya)",
  url: "https://www.idescat.cat/pub/?id=aec&n=245",
  license: "Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT)",
  unit: "habitants",
  periodicity: "ANUAL",
  methodology:
    "Població a 1 de gener per municipi (Padró continu d'habitants, via API Taules pmh/446/477). Sèries anuals; inclou comarques i Catalunya. Els codis MUN de l'API són els codis censals de 6 dígits.",
};

const EDAT_SOURCE = {
  code: "IDESCAT_EDAT",
  name: "Població per grans grups d'edat (Padró continu)",
  institution: "IDESCAT (Institut d'Estadística de Catalunya)",
  url: "https://www.idescat.cat/pub/?id=aec&n=254",
  license: "Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT)",
  unit: "habitants",
  periodicity: "ANUAL",
  methodology:
    "Sèries d'edats quinquennals (API Taules pmh/9548/10494) agregades en grans grups oficials: 0-14, 15-64, 65-84 i 85 o més. Un grup només es desa si TOTS els components quinquennals de l'any existeixen (mai s'estima la part que falta). Distribució vigent: grans grups directes d'emex (IDESCAT_EMEX).",
};

const NAC_SOURCE = {
  code: "IDESCAT_NAC",
  name: "Població per nacionalitat (Padró continu)",
  institution: "IDESCAT (Institut d'Estadística de Catalunya)",
  url: "https://www.idescat.cat/pub/?id=aec&n=250",
  license: "Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT)",
  unit: "habitants",
  periodicity: "ANUAL",
  methodology:
    "Nacionalitat per continents (API Taules pmh/680/690). POB_NAC_ESPANYOLA = categoria oficial ESPA; POB_NAC_ESTRANGERA = total − espanyola (derivació documentada de categories oficials de la mateixa taula).",
};

const CENS_LLARS_SOURCE = {
  code: "IDESCAT_CENS_LLARS",
  name: "Llars (Censos de població i habitatges)",
  institution: "IDESCAT (Institut d'Estadística de Catalunya), a partir del cens de l'INE",
  url: "https://www.idescat.cat/pub/?id=censph",
  license: "Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT)",
  unit: "llars i % (segons variable)",
  periodicity: "CENSAL",
  methodology:
    "Llars totals per cens (1991, 1996, 2001, 2011, 2021; API Taules censph/7952/8018) i indicadors de llars del cens 2021 (censph/17317/20806): grandària mitjana i proporcions per grandària.",
};

const EMEX_SOURCE = {
  code: "IDESCAT_EMEX",
  name: "El municipi en xifres (superfície, densitat, edats vigents)",
  institution: "IDESCAT (Institut d'Estadística de Catalunya)",
  url: "https://www.idescat.cat/emex/",
  license: "Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT)",
  unit: "km², hab./km², habitants",
  periodicity: "ANUAL",
  methodology:
    "API emex (dades.json per municipi): superfície (km²), densitat oficial (hab./km²) i grans grups d'edat vigents, amb tripletta oficial [municipi, comarca, Catalunya]. Primer arranc es carrega el seed local descargat de la mateixa API (idescat_superficie_seed.json).",
};

// ── Utilitats (patró ine-import) ─────────────────────────────────────────────

type ObsRow = Parameters<typeof insertObs>[2][number];

async function fetchTaules(path: string): Promise<JsonStatDataset> {
  const url = `${TAULES}${path}`;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(attempt === 1 ? 45_000 : 75_000),
      });
      if (!res.ok) throw new Error(`IDESCAT HTTP ${res.status} (${path})`);
      const json = (await res.json()) as JsonStatDataset & { class?: string; status?: string };
      if (json.class === "error") throw new Error(`IDESCAT API error ${json.status} (${path})`);
      return json;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1_500 * attempt));
    }
  }
  throw new Error(`IDESCAT inabastable: ${String(lastErr)}`);
}

async function fetchEmex(code: string): Promise<unknown> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${EMEX}?id=${code}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`emex HTTP ${res.status} (${code})`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw new Error(`emex inabastable (${code}): ${String(lastErr)}`);
}

async function getMuniCodes(): Promise<Map<string, { name: string; comarca: string | null }>> {
  const munis = await db.municipality.findMany({
    select: { code: true, name: true, comarca: true },
  });
  return new Map(munis.map((m) => [m.code, { name: m.name, comarca: m.comarca }]));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertObs(
  sourceId: string,
  runId: string,
  rows: Array<{
    variable: string;
    geoLevel: string;
    geoCode: string;
    geoName?: string | null;
    municipalityCode?: string | null;
    period: string;
    value: number;
    unit?: string | null;
    meta?: string | null;
  }>
): Promise<number> {
  let created = 0;
  for (const part of chunk(rows, 800)) {
    const r = await db.statObservation.createMany({
      data: part.map((o) => ({
        sourceId,
        variable: o.variable,
        geoLevel: o.geoLevel,
        geoCode: o.geoCode,
        geoName: o.geoName ?? null,
        municipalityCode: o.municipalityCode ?? null,
        period: o.period,
        value: o.value,
        unit: o.unit ?? null,
        meta: o.meta ?? null,
        runId,
      })),
      skipDuplicates: true,
    });
    created += r.count;
  }
  return created;
}

async function deleteWindow(
  sourceId: string,
  levels: string[],
  geoCodes?: string[]
): Promise<void> {
  if (geoCodes && geoCodes.length > 0) {
    for (const part of chunk(geoCodes, 400)) {
      await db.statObservation.deleteMany({
        where: { sourceId, geoLevel: { in: levels }, geoCode: { in: part } },
      });
    }
  } else {
    await db.statObservation.deleteMany({
      where: { sourceId, geoLevel: { in: levels } },
    });
  }
}

async function ensureDataSource(
  source: typeof POB_SOURCE | typeof EDAT_SOURCE | typeof NAC_SOURCE | typeof CENS_LLARS_SOURCE | typeof EMEX_SOURCE
): Promise<string> {
  const row = await db.dataSource.upsert({
    where: { code: source.code },
    create: source,
    update: {
      name: source.name,
      institution: source.institution,
      url: source.url,
      license: source.license,
      unit: source.unit,
      periodicity: source.periodicity,
      methodology: source.methodology,
      active: true,
    },
  });
  return row.id;
}

async function openRun(source: string, createdBy: string) {
  return db.importRun.create({ data: { source, status: "OK", createdBy } });
}

async function closeRun(
  runId: string,
  data: { status: string; rowsTotal: number; created: number; skipped: number; error?: string }
) {
  await db.importRun.update({ where: { id: runId }, data });
}

async function auditSystem(action: string, target: string, meta: Record<string, unknown>) {
  try {
    await audit(null, action, target, meta);
  } catch {
    /* l'auditoria no pot fer fallar la importació */
  }
}

export interface IdescatImportSummary {
  ok: boolean;
  source: string;
  scope: string;
  created: number;
  skipped: number;
  unmatched: number;
  runId: string;
  durationMs: number;
  error?: string;
}

/** Nom normalitzat de comarca per fer coincidir les labels IDESCAT amb Municipality.comarca. */
function normComarca(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// ── POB (pmh/446/477) ────────────────────────────────────────────────────────

const POB_CHUNK = 500;

/** Importa l'IPVA-like sèrie de població. scope: undefined = tot (admin);
 *  number = lot de municipis (cron, anti-timeout); "COMCAT" = nivells comarca+Catalunya. */
export async function importIdescatPob(
  scope?: number | "COMCAT",
  createdBy = "system"
): Promise<IdescatImportSummary> {
  const t0 = Date.now();
  const isComcat = scope === "COMCAT";
  const runSource = scope == null ? "IDESCAT_POB:FULL" : isComcat ? "IDESCAT_POB:SCOPE-COMCAT" : `IDESCAT_POB:CHUNK-${scope}`;
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  try {
    const sourceId = await ensureDataSource(POB_SOURCE);
    const munis = await getMuniCodes();
    const rows: ObsRow[] = [];
    const touched: string[] = [];
    const variableBySex: Record<string, string> = {
      TOTAL: "POB_TOTAL",
      M: "POB_HOMES",
      F: "POB_DONES",
    };
    const allCodes = [...munis.keys()];
    const chunkCodes = scope == null || isComcat ? allCodes : chunk(allCodes, POB_CHUNK)[scope as number] ?? [];

    if (!isComcat) {
      // municipis (lots anti-límit de 20.000 cel·les)
      for (const part of chunk(chunkCodes, 500)) {
        const ds = await fetchTaules(
          `/pmh/446/477/mun/data?MUN=${part.join(",")}&_LAST_=${SERIE_ANY}`
        );
        for (const cell of jsonStatCells(ds)) {
          if (cell.value == null) continue;
          const geo = cell.dims.MUN;
          if (geo === "TOTAL") continue;
          if (!munis.has(geo)) {
            unmatched++;
            continue;
          }
          const variable = variableBySex[cell.dims.SEX];
          if (!variable) continue;
          touched.push(geo);
          rows.push({
            variable,
            geoLevel: "MUNI",
            geoCode: geo,
            geoName: munis.get(geo)?.name ?? null,
            municipalityCode: geo,
            period: cell.dims.YEAR,
            value: cell.value,
            unit: "habitants",
            meta: JSON.stringify({ taula: "pmh/446/477" }),
          });
        }
      }
    } else {
      // Catalunya (categoria TOTAL de la mateixa divisió mun) — tots els sexes
      const dsCat = await fetchTaules(`/pmh/446/477/mun/data?MUN=TOTAL&_LAST_=${SERIE_ANY}`);
      for (const cell of jsonStatCells(dsCat)) {
        if (cell.value == null) continue;
        const variable = variableBySex[cell.dims.SEX];
        if (!variable) continue;
        rows.push({
          variable,
          geoLevel: "CAT",
          geoCode: "CAT",
          geoName: "Catalunya",
          period: cell.dims.YEAR,
          value: cell.value,
          unit: "habitants",
          meta: JSON.stringify({ taula: "pmh/446/477" }),
        });
      }
      // comarques (nivell COM, petit) — tots els sexes
      const dsCom = await fetchTaules(`/pmh/446/477/com/data?_LAST_=${SERIE_ANY}`);
      for (const cell of jsonStatCells(dsCom)) {
        if (cell.value == null) continue;
        const com = cell.dims.COM;
        if (com === "TOTAL") continue;
        const variable = variableBySex[cell.dims.SEX];
        if (!variable) continue;
        rows.push({
          variable,
          geoLevel: "COM",
          geoCode: com,
          geoName: cell.labels.COM ?? com,
          period: cell.dims.YEAR,
          value: cell.value,
          unit: "habitants",
          meta: JSON.stringify({ taula: "pmh/446/477/com" }),
        });
      }
    }

    if (scope == null) {
      // FULL (admin): substitueix tots els nivells de la font
      await deleteWindow(sourceId, ["MUNI", "COM", "CAT"]);
    } else if (isComcat) {
      // COMCAT: només nivells comarca + Catalunya (mai MUNI!)
      await deleteWindow(sourceId, ["COM", "CAT"]);
    } else if (touched.length > 0) {
      // lot de municipis: només els codis tocats
      await deleteWindow(sourceId, ["MUNI"], touched);
    }
    created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created, skipped, unmatched });
    return {
      ok: true,
      source: "IDESCAT_POB",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return {
      ok: false,
      source: "IDESCAT_POB",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

// ── EDAT (pmh/9548/10494 → grans grups) ─────────────────────────────────────

const EDAT_GROUP_VARS: Record<string, string> = {
  "0_14": "POB_EDAT_0_14",
  "15_64": "POB_EDAT_15_64",
  "65_84": "POB_EDAT_65_84",
  "85_mes": "POB_EDAT_85_MES",
};

const EDAT_CHUNK = 70;

/** Sèries d'edats. scope: undefined = tot; number = lot munis; "COMCAT" = comarca+Catalunya. */
export async function importIdescatEdat(
  scope?: number | "COMCAT",
  createdBy = "system"
): Promise<IdescatImportSummary> {
  const t0 = Date.now();
  const isComcat = scope === "COMCAT";
  const runSource = scope == null ? "IDESCAT_EDAT:FULL" : isComcat ? "IDESCAT_EDAT:SCOPE-COMCAT" : `IDESCAT_EDAT:CHUNK-${scope}`;
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  try {
    const sourceId = await ensureDataSource(EDAT_SOURCE);
    const munis = await getMuniCodes();
    const rows: ObsRow[] = [];
    const touched: string[] = [];
    const allCodes = [...munis.keys()];
    const chunkCodes = scope == null || isComcat ? allCodes : chunk(allCodes, EDAT_CHUNK)[scope as number] ?? [];

    for (const part of chunk(chunkCodes, EDAT_CHUNK)) {
      const ds = await fetchTaules(
        `/pmh/9548/10494/mun/data?MUN=${part.join(",")}&SEX=TOTAL&_LAST_=${EDAT_ANY}`
      );
      // agrupar celdes (geo, year) → {AGE: valor}
      const byGeoYear = new Map<string, Map<string, number>>();
      for (const cell of jsonStatCells(ds)) {
        if (cell.value == null) continue;
        const geo = cell.dims.MUN;
        if (!munis.has(geo)) {
          unmatched++;
          continue;
        }
        const key = `${geo}|${cell.dims.YEAR}`;
        const inner = byGeoYear.get(key) ?? new Map<string, number>();
        inner.set(cell.dims.AGE, cell.value);
        byGeoYear.set(key, inner);
      }
      for (const [key, ages] of byGeoYear) {
        const [geo, year] = key.split("|");
        const agg = aggregateAgeGroups(Object.fromEntries(ages));
        if (!agg) {
          skipped++;
          continue;
        }
        touched.push(geo);
        for (const [g, v] of Object.entries(agg)) {
          if (v == null) continue;
          rows.push({
            variable: EDAT_GROUP_VARS[g],
            geoLevel: "MUNI",
            geoCode: geo,
            geoName: munis.get(geo)?.name ?? null,
            municipalityCode: geo,
            period: year,
            value: v,
            unit: "habitants",
            meta: JSON.stringify({
              taula: "pmh/9548/10494",
              derivacio: "suma de grups quinquennals oficials",
            }),
          });
        }
      }
    }

    if (isComcat || scope == null) {
    // Catalunya + comarques (nivells petits, mateix agregat)
    const dsCat = await fetchTaules(`/pmh/9548/10494/cat/data?SEX=TOTAL&_LAST_=${EDAT_ANY}`);
    const byYearCat = new Map<string, Map<string, number>>();
    for (const cell of jsonStatCells(dsCat)) {
      if (cell.value == null) continue;
      const inner = byYearCat.get(cell.dims.YEAR) ?? new Map<string, number>();
      inner.set(cell.dims.AGE, cell.value);
      byYearCat.set(cell.dims.YEAR, inner);
    }
    for (const [year, ages] of byYearCat) {
      const agg = aggregateAgeGroups(Object.fromEntries(ages));
      if (!agg) continue;
      for (const [g, v] of Object.entries(agg)) {
        if (v == null) continue;
        rows.push({
          variable: EDAT_GROUP_VARS[g],
          geoLevel: "CAT",
          geoCode: "CAT",
          geoName: "Catalunya",
          period: year,
          value: v,
          unit: "habitants",
          meta: JSON.stringify({ taula: "pmh/9548/10494/cat" }),
        });
      }
    }

    const dsCom = await fetchTaules(`/pmh/9548/10494/com/data?SEX=TOTAL&_LAST_=${EDAT_ANY}`);
    const byComYear = new Map<string, Map<string, number>>();
    for (const cell of jsonStatCells(dsCom)) {
      if (cell.value == null) continue;
      const com = cell.dims.COM;
      if (com === "TOTAL") continue;
      const key = `${com}|${cell.dims.YEAR}`;
      const inner = byComYear.get(key) ?? new Map<string, number>();
      inner.set(cell.dims.AGE, cell.value);
      byComYear.set(key, inner);
    }
    for (const [key, ages] of byComYear) {
      const [com, year] = key.split("|");
      const agg = aggregateAgeGroups(Object.fromEntries(ages));
      if (!agg) continue;
      for (const [g, v] of Object.entries(agg)) {
        if (v == null) continue;
        rows.push({
          variable: EDAT_GROUP_VARS[g],
          geoLevel: "COM",
          geoCode: com,
          geoName: null,
          period: year,
          value: v,
          unit: "habitants",
          meta: JSON.stringify({ taula: "pmh/9548/10494/com" }),
        });
      }
    }

    }
    if (scope == null) {
      // FULL (admin): substitueix tots els nivells de la font
      await deleteWindow(sourceId, ["MUNI", "COM", "CAT"]);
    } else if (isComcat) {
      // COMCAT: només nivells comarca + Catalunya (mai MUNI!)
      await deleteWindow(sourceId, ["COM", "CAT"]);
    } else if (touched.length > 0) {
      // lot de municipis: només els codis tocats
      await deleteWindow(sourceId, ["MUNI"], touched);
    }
    created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created, skipped, unmatched });
    return {
      ok: true,
      source: "IDESCAT_EDAT",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return {
      ok: false,
      source: "IDESCAT_EDAT",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

// ── NAC (pmh/680/690) ────────────────────────────────────────────────────────

const NAC_CHUNK = 800;

/** Nacionalitat. scope: undefined = tot; number = lot munis; "COMCAT" = comarca+Catalunya. */
export async function importIdescatNac(
  scope?: number | "COMCAT",
  createdBy = "system"
): Promise<IdescatImportSummary> {
  const t0 = Date.now();
  const isComcat = scope === "COMCAT";
  const runSource = scope == null ? "IDESCAT_NAC:FULL" : isComcat ? "IDESCAT_NAC:SCOPE-COMCAT" : `IDESCAT_NAC:CHUNK-${scope}`;
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  try {
    const sourceId = await ensureDataSource(NAC_SOURCE);
    const munis = await getMuniCodes();
    const rows: ObsRow[] = [];
    const touched: string[] = [];
    const allCodes = [...munis.keys()];
    const chunkCodes = scope == null || isComcat ? allCodes : chunk(allCodes, NAC_CHUNK)[scope as number] ?? [];

    for (const part of chunk(chunkCodes, NAC_CHUNK)) {
      const ds = await fetchTaules(
        `/pmh/680/690/mun/data?MUN=${part.join(",")}&SEX=TOTAL&NATION=ESPA,TOTAL&_LAST_=${SERIE_ANY}`
      );
      for (const cell of jsonStatCells(ds)) {
        if (cell.value == null) continue;
        const geo = cell.dims.MUN;
        if (geo === "TOTAL" || !munis.has(geo)) {
          if (geo !== "TOTAL") unmatched++;
          continue;
        }
        const meta = JSON.stringify({ taula: "pmh/680/690", nation: cell.dims.NATION });
        if (cell.dims.NATION === "ESPA") {
          rows.push({
            variable: "POB_NAC_ESPANYOLA",
            geoLevel: "MUNI",
            geoCode: geo,
            geoName: munis.get(geo)?.name ?? null,
            municipalityCode: geo,
            period: cell.dims.YEAR,
            value: cell.value,
            unit: "habitants",
            meta,
          });
        } else if (cell.dims.NATION === "TOTAL") {
          rows.push({
            variable: "POB_NAC_TOTAL",
            geoLevel: "MUNI",
            geoCode: geo,
            geoName: munis.get(geo)?.name ?? null,
            municipalityCode: geo,
            period: cell.dims.YEAR,
            value: cell.value,
            unit: "habitants",
            meta,
          });
        }
      }
    }

    if (isComcat || scope == null) {
    // Catalunya + comarques (mateixa taula, nivells petits)
    for (const geoDiv of ["cat", "com"] as const) {
      const ds = await fetchTaules(
        `/pmh/680/690/${geoDiv}/data?SEX=TOTAL&NATION=ESPA,TOTAL&_LAST_=${SERIE_ANY}`
      );
      for (const cell of jsonStatCells(ds)) {
        if (cell.value == null) continue;
        const geo = geoDiv === "cat" ? "CAT" : cell.dims.COM;
        if (geo === "TOTAL") continue;
        const variable =
          cell.dims.NATION === "ESPA" ? "POB_NAC_ESPANYOLA" : "POB_NAC_TOTAL";
        rows.push({
          variable,
          geoLevel: geoDiv === "cat" ? "CAT" : "COM",
          geoCode: geo,
          geoName: geoDiv === "cat" ? "Catalunya" : (cell.labels.COM ?? geo),
          period: cell.dims.YEAR,
          value: cell.value,
          unit: "habitants",
          meta: JSON.stringify({ taula: `pmh/680/690/${geoDiv}` }),
        });
      }
    }

    }
    if (scope == null) {
      // FULL (admin): substitueix tots els nivells de la font
      await deleteWindow(sourceId, ["MUNI", "COM", "CAT"]);
    } else if (isComcat) {
      // COMCAT: només nivells comarca + Catalunya (mai MUNI!)
      await deleteWindow(sourceId, ["COM", "CAT"]);
    } else if (touched.length > 0) {
      // lot de municipis: només els codis tocats
      await deleteWindow(sourceId, ["MUNI"], touched);
    }
    created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created, skipped });
    return {
      ok: true,
      source: "IDESCAT_NAC",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return {
      ok: false,
      source: "IDESCAT_NAC",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

// ── CENS_LLARS (censph) ──────────────────────────────────────────────────────

const LLARS_IND_VARS: Record<string, string> = {
  AVG_HOU_SIZE: "LLARS_MIDA_MITJANA",
  ONE_PEOPLE_HOU_SH: "LLARS_G1_PCT",
  TWO_PEOPLE_HOU_SH: "LLARS_G2_PCT",
  THR_PEOPLE_HOU_SH: "LLARS_G3_PCT",
  FOU_PEOPLE_HOU_SH: "LLARS_G4_PCT",
  FIO_PEOPLE_HOU_SH: "LLARS_G5_PCT",
  O65Y_PEOPLE_HOU_SH: "LLARS_1P_65_PCT",
  O75Y_ALO_PEOPLE_SH: "POB_75_ALONE_PCT",
};

const CENS_CHUNK = 700;

/** Llars (censos). scope: undefined = tot; number = lot munis (les 2 taules);
 *  "COMCAT" = nivells comarca+Catalunya. */
export async function importIdescatCensLlars(
  scope?: number | "COMCAT",
  createdBy = "system"
): Promise<IdescatImportSummary> {
  const t0 = Date.now();
  const isComcat = scope === "COMCAT";
  const runSource = scope == null ? "IDESCAT_CENS_LLARS:FULL" : isComcat ? "IDESCAT_CENS_LLARS:SCOPE-COMCAT" : `IDESCAT_CENS_LLARS:CHUNK-${scope}`;
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  try {
    const sourceId = await ensureDataSource(CENS_LLARS_SOURCE);
    const munis = await getMuniCodes();
    const rows: ObsRow[] = [];
    const touched: string[] = [];
    const allCodes = [...munis.keys()];
    const chunkCodes = scope == null || isComcat ? allCodes : chunk(allCodes, CENS_CHUNK)[scope as number] ?? [];

    // 1) llars totals per cens (1991–2021)
    for (const part of chunk(chunkCodes, CENS_CHUNK)) {
      const ds = await fetchTaules(`/censph/7952/8018/mun/data?MUN=${part.join(",")}`);
      for (const cell of jsonStatCells(ds)) {
        if (cell.value == null) continue;
        const geo = cell.dims.MUN;
        if (geo === "TOTAL" || !munis.has(geo)) {
          if (geo !== "TOTAL") unmatched++;
          continue;
        }
        if (!touched.includes(geo)) touched.push(geo);
        rows.push({
          variable: "LLARS_TOTAL",
          geoLevel: "MUNI",
          geoCode: geo,
          geoName: munis.get(geo)?.name ?? null,
          municipalityCode: geo,
          period: cell.dims.YEAR,
          value: cell.value,
          unit: "llars",
          meta: JSON.stringify({ taula: "censph/7952/8018" }),
        });
      }
    }
    if (isComcat || scope == null) {
    // Catalunya (TOTAL) + comarques
    const dsCat = await fetchTaules("/censph/7952/8018/mun/data?MUN=TOTAL");
    for (const cell of jsonStatCells(dsCat)) {
      if (cell.value == null) continue;
      rows.push({
        variable: "LLARS_TOTAL",
        geoLevel: "CAT",
        geoCode: "CAT",
        geoName: "Catalunya",
        period: cell.dims.YEAR,
        value: cell.value,
        unit: "llars",
        meta: JSON.stringify({ taula: "censph/7952/8018" }),
      });
    }
    const dsCom = await fetchTaules("/censph/7952/8018/com");
    for (const cell of jsonStatCells(dsCom)) {
      if (cell.value == null) continue;
      const com = cell.dims.COM;
      if (com === "TOTAL") continue;
      rows.push({
        variable: "LLARS_TOTAL",
        geoLevel: "COM",
        geoCode: com,
        geoName: cell.labels.COM ?? com,
        period: cell.dims.YEAR,
        value: cell.value,
        unit: "llars",
        meta: JSON.stringify({ taula: "censph/7952/8018/com" }),
      });
    }

    }
    // 2) indicadors de llars (cens 2021): mida mitjana + proporcions per grandària
    for (const part of chunk(chunkCodes, CENS_CHUNK)) {
      const ds = await fetchTaules(`/censph/17317/20806/mun/data?MUN=${part.join(",")}`);
      for (const cell of jsonStatCells(ds)) {
        if (cell.value == null) continue;
        const geo = cell.dims.MUN;
        if (geo === "TOTAL" || !munis.has(geo)) {
          if (geo !== "TOTAL") unmatched++;
          continue;
        }
        if (!touched.includes(geo)) touched.push(geo);
        const variable = LLARS_IND_VARS[cell.dims.CONCEPT];
        if (!variable) continue;
        rows.push({
          variable,
          geoLevel: "MUNI",
          geoCode: geo,
          geoName: munis.get(geo)?.name ?? null,
          municipalityCode: geo,
          period: cell.dims.YEAR,
          value: cell.value,
          unit: variable.endsWith("_PCT") ? "%" : "persones/llar",
          meta: JSON.stringify({ taula: "censph/17317/20806", concept: cell.dims.CONCEPT }),
        });
      }
    }

    if (scope == null) {
      // FULL (admin): substitueix tots els nivells de la font
      await deleteWindow(sourceId, ["MUNI", "COM", "CAT"]);
    } else if (isComcat) {
      // COMCAT: només nivells comarca + Catalunya (mai MUNI!)
      await deleteWindow(sourceId, ["COM", "CAT"]);
    } else if (touched.length > 0) {
      // lot de municipis: només els codis tocats
      await deleteWindow(sourceId, ["MUNI"], touched);
    }
    created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created, skipped });
    return {
      ok: true,
      source: "IDESCAT_CENS_LLARS",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return {
      ok: false,
      source: "IDESCAT_CENS_LLARS",
      scope: String(scope ?? "FULL"),
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

// ── EMEX (superfície, densitat, edats vigents — per municipi) ───────────────

interface EmexSeedRow {
  code: string;
  /** desviació de la resolució d'any d'edats (documentada al meta) */
  ageDev?: number;
  f271?: { v: Array<number | null>; r: string | null; u: string | null };
  f262?: { v: Array<number | null>; r: string | null; u: string | null };
  f167?: { v: Array<number | null>; r: string | null; u: string | null };
  f27?: { v: Array<number | null>; r: string | null; u: string | null };
  f28?: { v: Array<number | null>; r: string | null; u: string | null };
  f29?: { v: Array<number | null>; r: string | null; u: string | null };
}

/** Lotes de municipis per al refresc emex via cron (buit anti-timeout). */
export const EMEX_BATCH_SIZE = 30;

export async function importIdescatEmexSeed(createdBy = "system"): Promise<IdescatImportSummary> {
  const t0 = Date.now();
  const runSource = "IDESCAT_EMEX:SEED";
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  try {
    const sourceId = await ensureDataSource(EMEX_SOURCE);
    const munis = await getMuniCodes();
    const seed = seedSuperficie as unknown as { municipis: EmexSeedRow[] };
    const rows: ObsRow[] = [];
    const pobTotals = await loadPobTotals();
    for (const row of seed.municipis) {
      const mun = munis.get(row.code);
      if (!mun) {
        skipped++;
        continue;
      }
      resolveEmexAgeYear(pobTotals, row.code, row);
      pushEmexRows(rows, row, mun);
    }
    await deleteWindow(sourceId, ["MUNI", "COM", "CAT"]);
    created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created, skipped });
    return {
      ok: true,
      source: "IDESCAT_EMEX",
      scope: "SEED",
      created,
      skipped,
      unmatched: 0,
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return {
      ok: false,
      source: "IDESCAT_EMEX",
      scope: "SEED",
      created,
      skipped,
      unmatched: 0,
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

/**
 * Resolveix l'any de referència dels grans grups d'edat d'emex (l'API no el
 * publica a les fulles): la suma dels 4 grups ha de coincidir amb el
 * POB_TOTAL del padró d'algun any concret (<1% de desviació). Derivació
 * VERIFICABLE, mai inventada; si cap any no quadra queda «n.d.».
 */
type PobTotals = Map<string, Array<{ period: string; value: number }>>;

/** Precàrrega en memòria dels totals de padró per municipi (1 sola query). */
async function loadPobTotals(): Promise<PobTotals> {
  const map: PobTotals = new Map();
  const pobId = await db.dataSource.findFirst({ where: { code: "IDESCAT_POB" }, select: { id: true } });
  if (!pobId) return map;
  const rows = await db.statObservation.findMany({
    where: { sourceId: pobId.id, variable: "POB_TOTAL", geoLevel: "MUNI" },
    select: { geoCode: true, period: true, value: true },
  });
  for (const r of rows) {
    const arr = map.get(r.geoCode) ?? [];
    arr.push({ period: r.period, value: r.value });
    map.set(r.geoCode, arr);
  }
  return map;
}

function resolveEmexAgeYear(
  totals: PobTotals,
  code: string,
  row: EmexSeedRow
): void {
  const ages = [row.f167, row.f27, row.f28, row.f29];
  if (ages.some((a) => !a || a.v?.[0] == null)) return;
  const sum = ages.reduce((acc, a) => acc + (a!.v?.[0] ?? 0), 0);
  if (sum <= 0) return;
  const candidates = totals.get(code);
  if (!candidates || candidates.length === 0) {
    for (const a of ages) if (a && a.r == null) a.r = "n.d.";
    return;
  }
  const match = candidates.find((t) => t.value > 0 && Math.abs(t.value - sum) / t.value < 0.01);
  if (match) row.ageDev = Math.abs(match.value - sum) / match.value;
  for (const a of ages) {
    if (a && a.r == null) a.r = match ? match.period : "n.d.";
  }
}

/** Construeix les files StatObservation d'una resposta emex (seed o API). */
function pushEmexRows(
  rows: ObsRow[],
  row: EmexSeedRow,
  mun: { name: string; comarca: string | null }
): void {
  const muni = (variable: string, value: number | null | undefined, r: string | null, unit: string, meta: Record<string, unknown>) => {
    if (value == null || !Number.isFinite(value)) return;
    rows.push({
      variable,
      geoLevel: "MUNI",
      geoCode: row.code,
      geoName: mun.name,
      municipalityCode: row.code,
      period: r ?? "n.d.",
      value,
      unit,
      meta: JSON.stringify(meta),
    });
  };
  const com = (variable: string, value: number | null | undefined, r: string | null, unit: string) => {
    if (value == null || !Number.isFinite(value)) return;
    rows.push({
      variable,
      geoLevel: "COM",
      geoCode: normComarca(mun.comarca ?? "") || `com-${row.code}`,
      geoName: mun.comarca,
      period: r ?? "n.d.",
      value,
      unit,
      meta: JSON.stringify({ font: "emex", via: row.code }),
    });
  };
  const cat = (variable: string, value: number | null | undefined, r: string | null, unit: string) => {
    if (value == null || !Number.isFinite(value)) return;
    rows.push({
      variable,
      geoLevel: "CAT",
      geoCode: "CAT",
      geoName: "Catalunya",
      period: r ?? "n.d.",
      value,
      unit,
      meta: JSON.stringify({ font: "emex", via: row.code }),
    });
  };
  const pushTriple = (
    field: "f271" | "f262" | "f167" | "f27" | "f28" | "f29",
    variable: string,
    unit: string,
    extraMeta?: Record<string, unknown>
  ) => {
    const d = row[field];
    if (!d) return;
    muni(variable, d.v?.[0], d.r, unit, { font: "emex", id: field, ...(extraMeta ?? {}) });
    com(variable, d.v?.[1], d.r, unit);
    cat(variable, d.v?.[2], d.r, unit);
  };
  pushTriple("f271", "TERRITORI_SUPERFICIE_KM2", "km2");
  pushTriple("f262", "TERRITORI_DENSITAT_HAB_KM2", "hab./km2");
  const ageMeta = row.ageDev != null ? { font: "emex", derivacio: `any resolt per coherència amb el padró (desviació ${(row.ageDev * 100).toFixed(1)}%)` } : { font: "emex" };
  pushTriple("f167", "POB_EDAT_0_14", "habitants", ageMeta);
  pushTriple("f27", "POB_EDAT_15_64", "habitants", ageMeta);
  pushTriple("f28", "POB_EDAT_65_84", "habitants", ageMeta);
  pushTriple("f29", "POB_EDAT_85_MES", "habitants", ageMeta);
}

/** Refresca un lot de municipis via API emex (cron: anti-timeout). */
export async function importIdescatEmexBatch(
  codes: string[],
  createdBy = "system"
): Promise<IdescatImportSummary> {
  const t0 = Date.now();
  const runSource = `IDESCAT_EMEX:CODES-${codes.length}`;
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  let unmatched = 0;
  try {
    const sourceId = await ensureDataSource(EMEX_SOURCE);
    const munis = await getMuniCodes();
    const rows: ObsRow[] = [];
    const touched: string[] = [];
    const pobTotals = await loadPobTotals();
    for (const code of codes) {
      const mun = munis.get(code);
      if (!mun) {
        unmatched++;
        continue;
      }
      const row: EmexSeedRow = { code };
      try {
        const json = await fetchEmex(code);
        const tables = parseEmexTables(json);
        for (const t of tables) {
          for (const ind of t.indicators) {
            if (ind.id === "f271") row.f271 = { v: ind.values, r: ind.ref, u: ind.unit };
            else if (ind.id === "f262") row.f262 = { v: ind.values, r: ind.ref, u: ind.unit };
            else if (ind.id === "f167") row.f167 = { v: ind.values, r: ind.ref, u: ind.unit };
            else if (ind.id === "f27") row.f27 = { v: ind.values, r: ind.ref, u: ind.unit };
            else if (ind.id === "f28") row.f28 = { v: ind.values, r: ind.ref, u: ind.unit };
            else if (ind.id === "f29") row.f29 = { v: ind.values, r: ind.ref, u: ind.unit };
          }
        }
        resolveEmexAgeYear(pobTotals, code, row);
        pushEmexRows(rows, row, mun);
        touched.push(code);
      } catch {
        skipped++;
      }
    }
    if (touched.length > 0) {
      // MUNI per codis + COM de les comarques tocades + CAT (poques files)
      await deleteWindow(sourceId, ["MUNI"], touched);
      const coms = [...new Set(touched.map((c) => normComarca(munis.get(c)?.comarca ?? "") || `com-${c}`))];
      await deleteWindow(sourceId, ["COM"], coms);
      await deleteWindow(sourceId, ["CAT"]);
    }
    created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created, skipped, unmatched });
    return {
      ok: true,
      source: "IDESCAT_EMEX",
      scope: `BATCH(${codes.length})`,
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return {
      ok: false,
      source: "IDESCAT_EMEX",
      scope: `BATCH(${codes.length})`,
      created,
      skipped,
      unmatched,
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

/** Decideix el proper pas del cron demografia segons l'estat de la BD.
 * Cada pas és UN lot (anti-timeout de Vercel): el cron diari avança lot a lot. */
export async function nextDemografiaStep(): Promise<
  | { step: "EMEX_SEED" }
  | { step: "POB" | "EDAT" | "NAC" | "CENS_LLARS"; scope: number | "COMCAT" }
  | { step: "EMEX_BATCH"; codes: string[] }
  | { step: "DONE" }
> {
  const WINDOW_MS = 180 * 24 * 3600 * 1000; // fonts anuals: 6 mesos de frescor
  const recent = await db.importRun.findMany({
    where: { source: { startsWith: "IDESCAT_" }, status: "OK", createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
    select: { source: true },
  });
  const done = new Set(recent.map((r) => r.source));
  if (!done.has("IDESCAT_EMEX:SEED") && !done.has("IDESCAT_EMEX:FULL")) {
    // primer arranc: seed local instantani (dades reals descarregades de l'API)
    return { step: "EMEX_SEED" };
  }
  const totalMunis = await db.municipality.count();
  const nChunks = (per: number) => Math.max(1, Math.ceil(totalMunis / per));
  // primer lot sense fer (els lots van en ordre; COMCAT al final de cada font)
  const firstPending = (prefix: string, n: number): number | null => {
    for (let i = 0; i < n; i++) {
      if (!done.has(`${prefix}:CHUNK-${i}`)) return i;
    }
    return null;
  };
  const pobPending = firstPending("IDESCAT_POB", nChunks(POB_CHUNK));
  if (pobPending != null) return { step: "POB", scope: pobPending };
  if (!done.has("IDESCAT_POB:SCOPE-COMCAT")) return { step: "POB", scope: "COMCAT" };
  const edatPending = firstPending("IDESCAT_EDAT", nChunks(EDAT_CHUNK));
  if (edatPending != null) return { step: "EDAT", scope: edatPending };
  if (!done.has("IDESCAT_EDAT:SCOPE-COMCAT")) return { step: "EDAT", scope: "COMCAT" };
  const nacPending = firstPending("IDESCAT_NAC", nChunks(NAC_CHUNK));
  if (nacPending != null) return { step: "NAC", scope: nacPending };
  if (!done.has("IDESCAT_NAC:SCOPE-COMCAT")) return { step: "NAC", scope: "COMCAT" };
  const censPending = firstPending("IDESCAT_CENS_LLARS", nChunks(CENS_CHUNK));
  if (censPending != null) return { step: "CENS_LLARS", scope: censPending };
  if (!done.has("IDESCAT_CENS_LLARS:SCOPE-COMCAT")) return { step: "CENS_LLARS", scope: "COMCAT" };
  // refresc emex per lots: codis sense fila recent de la font
  const munis = await db.municipality.findMany({ select: { code: true }, orderBy: { code: "asc" } });
  const codes = munis.map((m) => m.code);
  const emexId = await db.dataSource.findFirst({ where: { code: "IDESCAT_EMEX" }, select: { id: true } });
  const withRows = emexId
    ? await db.statObservation.findMany({
        where: { sourceId: emexId.id, geoLevel: "MUNI", variable: "TERRITORI_SUPERFICIE_KM2" },
        select: { geoCode: true, importedAt: true },
      })
    : [];
  const fresh = new Set(
    withRows
      .filter((r) => Date.now() - r.importedAt.getTime() < 180 * 24 * 3600 * 1000)
      .map((r) => r.geoCode)
  );
  const pending = codes.filter((c) => !fresh.has(c));
  if (pending.length === 0) {
    // auto-reparació: si l'EMEX_SEED va córrer ABANS d'existir la font POB,
    // les edats vigents quedaren amb any «n.d.» → re-sembrar (idempotent)
    const emexId2 = await db.dataSource.findFirst({ where: { code: "IDESCAT_EMEX" }, select: { id: true } });
    if (emexId2) {
      const nNd = await db.statObservation.count({
        where: {
          sourceId: emexId2.id,
          geoLevel: "MUNI",
          variable: { in: ["POB_EDAT_0_14", "POB_EDAT_15_64", "POB_EDAT_65_84", "POB_EDAT_85_MES"] },
          period: "n.d.",
        },
      });
      if (nNd > 0) return { step: "EMEX_SEED" };
    }
    return { step: "DONE" };
  }
  return { step: "EMEX_BATCH", codes: pending.slice(0, EMEX_BATCH_SIZE) };
}
