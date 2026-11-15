/**
 * v41 — Indicador «% estimat d'alquiler sobre el parc residencial»
 * (encàrrec INDICADOR_ALQUILER, Fases 2-6).
 *
 * Fonts (VERIFICADES el 2026-11-15 amb HTTP real; vegeu
 * docs/INDICADOR_ALQUILER_PARQUE.md i CATALOGO_FUENTES_DATOS.md):
 *  - Cens 2021 (viviendas principales per règim de tinença): Idescat API
 *    Taules v2 censph/310/20419 — 615 municipis + Catalunya. MUN = codi
 *    censal 6 dígits == Municipality.code (comprovat 615/615 match).
 *  - Flux de fiances (REFERÈNCIA, mai numerador): Socrata qww9-bvhh
 *    «Preu mitjà del lloguer d'habitatges per municipi» — habitatges =
 *    contractes d'alta al Registre de fiances en el període (FLUJO).
 *  - Fiances VIGENTS (stock) per municipi: NO existeix publicació oberta
 *    municipal (verificat) — conector administratiu preparat.
 *  - Parc residencial catastral: DNP/INE no accessible des de l'entorn de
 *    treball — conector administratiu preparat.
 *
 * Components → StatObservation (taula general d'indicadors, encàrrec §4).
 * Càlcul compost traçat → RentalShareObservation (històric, mai sobrescrit).
 */

import { db } from "@/lib/db";
import {
  computeRentalShare,
  parseCensTenencia,
  parseFluxMunicipiRows,
  FLUX_DATASET,
  FLUX_PERIODE_ANUAL,
  CENS_TENENCIA_TAULA,
  type RentalShareCalcInput,
} from "@/lib/rental-share-parse";
import type { JsonStatDataset } from "@/lib/idescat-parse";

const UA = "Preureal/1.0 (dades oficials; +https://www.preureal.com)";
const TAULES = "https://api.idescat.cat/taules/v2";
const SODA = "https://analisi.transparenciacatalunya.cat/resource";

// ── Catàleg de fonts (DataSource) ────────────────────────────────────────────

export const RS_CENS_SOURCE = {
  code: "IDESCAT_CENS2021_TENENCIA",
  name: "Cens de població i habitatges 2021 — habitatges principals per règim de tinença (Idescat)",
  institution: "IDESCAT (Institut d'Estadística de Catalunya), a partir del Cens de l'INE",
  url: `https://api.idescat.cat/taules/v2/${CENS_TENENCIA_TAULA}/mun/data`,
  license: "Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT)",
  unit: "viviendas principales",
  periodicity: "CENSAL",
  methodology:
    "Taula censph/310/20419 de l'API Taules (JSON-stat): viviendas principals per règim de tinença (PROPERTY / RENTAL / OTH / _U). Cobertura municipal: 615 de 947 municipis + Catalunya; els municipis petits resten a agrupacions censals (/ac). El Cens 2021 publica resultats arrodonits aleatòriament a múltiples de 3 (secret estadístic). Funció a PreuReal: referència censal oficial de contrast (mai numerador del % estimat).",
};

export const RS_FLUX_SOURCE = {
  code: "INCASOL_FIANZES_FLUX",
  name: "Registre de fiances de lloguer — flux anual de contractes per municipi (Incasòl, via Dades Obertes)",
  institution: "Incasòl (explotació estadística de la Generalitat de Catalunya)",
  url: `https://analisi.transparenciacatalunya.cat/resource/${FLUX_DATASET}.json`,
  license: "Termes d'ús de la Generalitat de Catalunya (SODA «See Terms of Use»)",
  unit: "contractes amb fiança depositada (flux anual)",
  periodicity: "TRIMESTRAL",
  methodology:
    `Dataset ${FLUX_DATASET} «Preu mitjà del lloguer d'habitatges per municipi»: habitatges = contractes donats d'alta al Registre de fiances en el període considerat. PreuReal importa NOMÉS el període anual (gener-desembre), nivell municipi, com a referència de mercat. És un FLUX (operacions de l'any), mai un stock: no s'utilitza com a numerador del % estimat d'alquiler sobre el parc.`,
};

export const RS_VIGENTS_SOURCE = {
  code: "INCASOL_FIANZES_VIGENTS",
  name: "Registre de fiances de lloguer — fiances VIGENTS per municipi (stock) [conector preparat]",
  institution: "Incasòl (Generalitat de Catalunya)",
  url: "https://incasol.gencat.cat",
  license: "PENDIENTE DE CONFIRMAR (publicació oficial o conveni)",
  unit: "fiances vigents (stock)",
  periodicity: "PENDIENTE",
  methodology:
    "Numerador oficial del % estimat. VERIFICAT 2026-11-15: no existeix publicació municipal oberta de fiances vigentes (el catàleg de Dades Obertes només publica flux qww9-bvhh, i el saldo net d'alta/baixa és XLSX agregat només per a Catalunya). Conector: POST /api/admin/import-rental-share — s'activarà quan hi hagi dades oficials. El flux anual MAI el substitueix.",
};

export const RS_PARC_SOURCE = {
  code: "DNP_CATASTRE_PARC",
  name: "Catastro — inmuebles de uso residencial per municipi (parc residencial) [conector preparat]",
  institution: "Dirección General del Catastro (Ministerio de Hacienda)",
  url: "https://www.catastro.minhap.es",
  license: "PENDIENTE DE VERIFICAR (condicions de reutilització del DNP)",
  unit: "inmuebles de uso residencial (stock)",
  periodicity: "PENDIENTE",
  methodology:
    "Denominador oficial del % estimat: inmuebles amb ús principal residencial (exclou locals, oficines, garatges i trasters). VERIFICAT 2026-11-15: el portal del DNP i la disseminació INE no són accessibles des de l'entorn de treball (DNS bloquejat); descàrrega pendent de verificació. Conector: POST /api/admin/import-rental-share — s'activarà quan la font estigui verificada.",
};

export const RS_CALC_SOURCE = {
  code: "PREUREAL_CALC_RENTAL_SHARE",
  name: "PreuReal — indicador compost «% estimat d'alquiler sobre el parc residencial»",
  institution: "PreuReal (elaboració pròpia a partir de components oficials)",
  url: "https://www.preureal.com/metodologia",
  license: "—",
  unit: "%",
  periodicity: "DERIVAT",
  methodology:
    "Fórmula: (fiances vigentes INCASÒL / inmuebles de uso residencial del Catastro) × 100. Es calcula NOMÉS amb numerador stock + denominador catastral complets, validats i del mateix municipi; el % censal (Cens 2021, sobre viviendas principales) es mostra sempre separat com a referència oficial. No equival al % censal de viviendas principales en alquiler: el parc catastral no distingeix principals/secundàries/buies. Cada càlcul queda traçat a RentalShareObservation amb estat i avisos.",
};

// ── Fetchers (mateixes convencions que idescat-import / entorn-import) ───────

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

async function fetchSoda(datasetId: string, params: URLSearchParams, timeoutMs = 45_000): Promise<unknown[]> {
  const url = `${SODA}/${datasetId}.json?${params.toString()}`;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${datasetId}: ${body.slice(0, 220)}`);
      }
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? json : [];
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function chunk<T>(arr: T[], size: number): Promise<T[][]> {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type ObsRow = {
  variable: string;
  geoLevel: string;
  geoCode: string;
  geoName?: string | null;
  municipalityCode?: string | null;
  period: string;
  value: number;
  unit?: string | null;
  meta?: string | null;
};

async function insertObs(sourceId: string, runId: string, rows: ObsRow[]): Promise<number> {
  let created = 0;
  for (const part of await chunk(rows, 800)) {
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

export async function ensureDataSource(
  source: typeof RS_CENS_SOURCE | typeof RS_FLUX_SOURCE | typeof RS_VIGENTS_SOURCE | typeof RS_PARC_SOURCE | typeof RS_CALC_SOURCE
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

export interface ImportSummary {
  ok: boolean;
  created: number;
  skipped: number;
  error?: string;
}

// ── Importadors ──────────────────────────────────────────────────────────────

/**
 * Cens 2021 (viviendas principals per règim de tinença) → StatObservation.
 * Idempotent: finestra de substitució per a les variables CENS_MAIN_*.
 */
export async function importIdescatCensTenencia(createdBy = "system:manual"): Promise<ImportSummary> {
  const sourceId = await ensureDataSource(RS_CENS_SOURCE);
  const run = await openRun("RENTAL_SHARE_CENS", createdBy);
  try {
    const ds = await fetchTaules(`/${CENS_TENENCIA_TAULA}/mun/data?lang=es`);
    const parsed = parseCensTenencia(ds);

    const munis = await db.municipality.findMany({ select: { code: true } });
    const muniCodes = new Set(munis.map((m) => m.code));

    const rows: ObsRow[] = [];
    let skipped = 0;
    const varsByRegime: Record<string, string> = {
      PROPERTY: "CENS_MAIN_PROP",
      RENTAL: "CENS_MAIN_RENTAL",
      OTH: "CENS_MAIN_OTH",
      _U: "CENS_MAIN_NC",
      TOTAL: "CENS_MAIN_TOTAL",
    };
    const meta = JSON.stringify({
      taula: CENS_TENENCIA_TAULA,
      nota: "Cens 2021 arrodonit aleatòriament a múltiples de 3 (secret estadístic, nota oficial Idescat)",
    });
    for (const r of parsed) {
      const isCat = r.geoCode === "TOTAL";
      if (!isCat && !muniCodes.has(r.geoCode)) {
        skipped++;
        continue;
      }
      for (const [regime, variable] of Object.entries(varsByRegime)) {
        const v = (r as unknown as Record<string, number | null>)[
          regime === "PROPERTY" ? "property" : regime === "RENTAL" ? "rental" : regime === "OTH" ? "oth" : regime === "_U" ? "notStated" : "total"
        ];
        if (v == null) continue;
        rows.push({
          variable,
          geoLevel: isCat ? "CAT" : "MUNI",
          geoCode: isCat ? "CAT" : r.geoCode,
          geoName: isCat ? "Catalunya" : r.geoName ?? null,
          municipalityCode: isCat ? null : r.geoCode,
          period: "2021",
          value: v,
          unit: "viviendas principales",
          meta,
        });
      }
    }

    // finestra de substitució: les variables CENS_* d'aquesta font es refan senceres
    await db.statObservation.deleteMany({ where: { sourceId, variable: { startsWith: "CENS_MAIN_" } } });
    const created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    return { ok: true, created, skipped };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created: 0, skipped: 0, error: msg });
    return { ok: false, created: 0, skipped: 0, error: msg };
  }
}

/**
 * Flux anual de contractes amb fiança (SODA qww9-bvhh, nivell municipi) →
 * StatObservation com a REFERÈNCIA de mercat (mai numerador). Idempotent
 * (finestra de substitució de la variable INCASOL_CONTRACTES_PERIODE).
 */
export async function importIncasolFlux(createdBy = "system:manual"): Promise<ImportSummary> {
  const sourceId = await ensureDataSource(RS_FLUX_SOURCE);
  const run = await openRun("RENTAL_SHARE_FLUX", createdBy);
  try {
    // descàrrega paginada (nivell municipi + període anual), ≤5000 files/pàgina
    const all: unknown[] = [];
    const pageSize = 5000;
    for (let offset = 0; ; offset += pageSize) {
      const params = new URLSearchParams({
        $where: `ambit_territorial='Municipi' AND periode='${FLUX_PERIODE_ANUAL}'`,
        $select: "ambit_territorial,codi_territorial,nom_territori,any,periode,habitatges",
        $order: "codi_territorial,any",
        $limit: String(pageSize),
        $offset: String(offset),
      });
      const page = await fetchSoda(FLUX_DATASET, params);
      all.push(...page);
      if (page.length < pageSize) break;
      if (offset > 100_000) break; // guàrdia anti-bucle
    }

    const parsed = parseFluxMunicipiRows(all, { periode: FLUX_PERIODE_ANUAL });

    const munis = await db.municipality.findMany({ select: { code: true, ineCode: true } });
    const ineToCode = new Map<string, string>();
    for (const m of munis) {
      // 255 municipis del seed actual no tenen ineCode emplenat: el codi censal
      // de 6 dígits sempre comença pel codi INE de 5 (081136→08113), perquè
      // no es perdi cap municipi es deriva com a fallback (unió per codi, mai per nom).
      const ine = m.ineCode ?? (m.code.length === 6 ? m.code.slice(0, 5) : null);
      if (ine) ineToCode.set(ine, m.code);
    }

    const rows: ObsRow[] = [];
    let skipped = 0;
    for (const r of parsed) {
      const code = ineToCode.get(r.ineCode);
      if (!code) {
        skipped++;
        continue;
      }
      if (r.habitatges == null) {
        skipped++;
        continue;
      }
      rows.push({
        variable: "INCASOL_CONTRACTES_PERIODE",
        geoLevel: "MUNI",
        geoCode: code,
        geoName: r.name,
        municipalityCode: code,
        period: r.year,
        value: r.habitatges,
        unit: "contractes amb fiança depositada (flux anual)",
        meta: JSON.stringify({ dataset: FLUX_DATASET, periode: FLUX_PERIODE_ANUAL, kind: "FLUX", ineCode: r.ineCode }),
      });
    }

    await db.statObservation.deleteMany({
      where: { sourceId, variable: "INCASOL_CONTRACTES_PERIODE", geoLevel: "MUNI" },
    });
    const created = await insertObs(sourceId, run.id, rows);
    await closeRun(run.id, { status: "OK", rowsTotal: rows.length, created, skipped });
    return { ok: true, created, skipped };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created: 0, skipped: 0, error: msg });
    return { ok: false, created: 0, skipped: 0, error: msg };
  }
}

// ── Recàlcul de l'indicador compost ──────────────────────────────────────────

/**
 * Recalcula RentalShareObservation per als municipis indicats (o tots).
 * Lectura set-based (4 consultes) + upsert per (municipalityCode, referenceKey).
 * Una publicació nova crea una fila nova (historial intacte).
 */
export async function recalcRentalShare(
  createdBy = "system:manual",
  codes?: string[]
): Promise<{ ok: boolean; computed: number; skipped: number; error?: string }> {
  const calcSourceId = await ensureDataSource(RS_CALC_SOURCE);
  const run = await openRun("RENTAL_SHARE_CALC", createdBy);
  try {
    const munis = await db.municipality.findMany({
      where: codes && codes.length ? { code: { in: codes } } : undefined,
      select: { code: true, name: true, ineCode: true },
    });
    const vigSource = await db.dataSource.findUnique({ where: { code: RS_VIGENTS_SOURCE.code }, select: { id: true } });
    const parcSource = await db.dataSource.findUnique({ where: { code: RS_PARC_SOURCE.code }, select: { id: true } });
    const fluxSource = await db.dataSource.findUnique({ where: { code: RS_FLUX_SOURCE.code }, select: { id: true } });
    const censSource = await db.dataSource.findUnique({ where: { code: RS_CENS_SOURCE.code }, select: { id: true } });

    // components (llegits SET-based, agrupats en memòria — 947 municipis)
    const readObs = async (sourceId: string | null, variables: string[]) => {
      if (!sourceId) return new Map<string, Map<string, { value: number; period: string }>>();
      const rows = await db.statObservation.findMany({
        where: { sourceId, variable: { in: variables }, geoLevel: "MUNI" },
        select: { variable: true, geoCode: true, period: true, value: true },
      });
      const out = new Map<string, Map<string, { value: number; period: string }>>();
      for (const r of rows) {
        let byVar = out.get(r.geoCode);
        if (!byVar) {
          byVar = new Map();
          out.set(r.geoCode, byVar);
        }
        const prev = byVar.get(r.variable);
        if (!prev || String(r.period) > String(prev.period)) {
          byVar.set(r.variable, { value: r.value, period: r.period });
        }
      }
      return out;
    };

    const [vig, parc, flux, cens] = await Promise.all([
      readObs(vigSource?.id ?? null, ["INCASOL_FIANZES_VIGENTS"]),
      readObs(parcSource?.id ?? null, ["CAT_PARC_RESIDENCIAL"]),
      readObs(fluxSource?.id ?? null, ["INCASOL_CONTRACTES_PERIODE"]),
      readObs(censSource?.id ?? null, ["CENS_MAIN_RENTAL", "CENS_MAIN_TOTAL"]),
    ]);

    let computed = 0;
    let skipped = 0;
    const incasolSourceLabel = `${RS_VIGENTS_SOURCE.institution}${RS_VIGENTS_SOURCE.code ? " (conector administratiu)" : ""}`;

    for (const m of munis) {
      const v = vig.get(m.code)?.get("INCASOL_FIANZES_VIGENTS") ?? null;
      const p = parc.get(m.code)?.get("CAT_PARC_RESIDENCIAL") ?? null;
      const f = flux.get(m.code)?.get("INCASOL_CONTRACTES_PERIODE") ?? null;
      const cr = cens.get(m.code)?.get("CENS_MAIN_RENTAL") ?? null;
      const ct = cens.get(m.code)?.get("CENS_MAIN_TOTAL") ?? null;

      const input: RentalShareCalcInput = {
        muniCode: m.code,
        incasolActiveDeposits: v?.value ?? null,
        incasolPeriod: v?.period ?? null,
        incasolIneCode: m.ineCode,
        incasolSource: v ? incasolSourceLabel : null,
        residentialProperties: p?.value ?? null,
        cadastreYear: p?.period ?? null,
        cadastreIneCode: m.ineCode,
        cadastreSource: p ? RS_PARC_SOURCE.institution : null,
        incasolDepositsPeriod: f?.value ?? null,
        incasolFluxPeriod: f?.period ?? null,
        censusMainRental: cr?.value ?? null,
        censusMainTotal: ct?.value ?? null,
        censusYear: cr || ct ? (cr?.period ?? ct?.period ?? null) : null,
        censusSource: cr || ct ? `${RS_CENS_SOURCE.institution} — ${RS_CENS_SOURCE.name}` : null,
      };
      const res = computeRentalShare(input);
      if (res.referenceKey == null) {
        skipped++;
        continue;
      }

      const data = {
        municipalityName: m.name,
        referenceKey: res.referenceKey,
        numeratorKind: res.numeratorKind,
        incasolActiveDeposits: res.incasolActiveDeposits,
        incasolDepositsPeriod: f?.value ?? null,
        incasolPeriod: res.incasolPeriod,
        residentialProperties: res.residentialProperties,
        cadastreYear: res.cadastreYear,
        rentalPercentage: res.rentalPercentage,
        censusMainRental: cr?.value != null ? Math.round(cr.value) : null,
        censusMainTotal: ct?.value != null ? Math.round(ct.value) : null,
        censusRentalPercentage: res.censusRentalPercentage,
        censusYear: cr?.period ?? ct?.period ?? null,
        incasolSource: res.incasolActiveDeposits != null ? input.incasolSource : null,
        cadastreSource: res.residentialProperties != null ? input.cadastreSource : null,
        censusSource: cr || ct ? input.censusSource : null,
        methodologyVersion: "1.0",
        dataStatus: res.dataStatus,
        warnings: res.warnings.length ? JSON.stringify(res.warnings) : null,
        runId: run.id,
        updatedAt: new Date(),
      };

      await db.rentalShareObservation.upsert({
        where: {
          municipalityCode_referenceKey: {
            municipalityCode: m.code,
            referenceKey: res.referenceKey,
          },
        },
        create: { municipalityCode: m.code, ...data },
        update: data,
      });
      computed++;
    }

    await closeRun(run.id, {
      status: "OK",
      rowsTotal: munis.length,
      created: computed,
      skipped,
    });
    return { ok: true, computed, skipped };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created: 0, skipped: 0, error: msg });
    return { ok: false, computed: 0, skipped: 0, error: msg };
  }
}

// ── Metodologia (encàrrec §9 — transparència i traçabilitat) ─────────────────

export const RENTAL_SHARE_METODOLOGIA = {
  formula: "(fiances vigentes INCASÒL / inmuebles de uso residencial del Catastro) × 100",
  ca: "El percentatge estimat de vivendes en alquiler es calcula dividint el nombre de fiances vigents registrades a l'INCASÒL entre el nombre d'inmuebles d'ús residencial del Catastro, multiplicat per 100. Aquest indicador permet aproximar el pes de l'alquiler sobre el parc residencial de cada municipi. No equival exactament al percentatge censal de viviendas principals en alquiler, perquè el Catastro no distingeix entre vivendes principals, secundàries i buides. Els resultats són una elaboració estadística pròpia a partir de fonts oficials. El contrast censal oficial (Cens de població i habitatges 2021, sobre viviendas principals) es mostra sempre per separat, amb el seu any de referència.",
  es: "El porcentaje estimado de viviendas en alquiler se calcula dividiendo el número de fianzas vigentes registradas en INCASÒL entre el número de inmuebles de uso residencial del Catastro, multiplicado por 100. Este indicador permite aproximar el peso del alquiler sobre el parque residencial de cada municipio. No equivale exactamente al porcentaje censal de viviendas principales en alquiler, ya que el Catastro no distingue entre viviendas principales, secundarias y vacías. Los resultados son una elaboración estadística propia a partir de fuentes oficiales. El contraste censal oficial (Censo de población y viviendas 2021, sobre viviendas principales) se muestra siempre por separado, con su año de referencia.",
  limitations: [
    "INCASÒL: pot haver-hi contractes sense fiança depositada, retards en altes/baixes, fiances que no equivalen a vivendes úniques i modalitats amb tractament estadístic diferent.",
    "Catastro: pot incloure inmuebles que no siguin vivendes habitables i no distingeix principals/secundàries/buies; pot haver-hi diferències entre inmuebles catastrals i vivendes físiques.",
    "Cens: referència estructural i comparable, sense la periodicitat d'INCASÒL; sempre es mostra el seu any (2021) i els valors censals estan arrodonits a múltiples de 3 (secret estadístic).",
    "El flux anual de contractes amb fiança (operacions de l'any) no és un substitut del stock de fiances vigents i mai s'utilitza com a numerador.",
  ],
  pendingSources:
    "Numerador (fiances vigentes per municipi) i denominador (parc residencial catastral) pendents de publicació oficial municipal: verificat el 2026-11-15 que no existeixen fonts obertes municipals per a aquestes dades (vegeu docs/INDICADOR_ALQUILER_PARQUE.md). El conector administratiu queda preparat per alimentar-les quan estiguin disponibles.",
};

// ── Consultes per a UI/API ───────────────────────────────────────────────────

export interface RentalShareSummary {
  censusPct: number | null;
  censusYear: string | null;
  estimatPct: number | null;
  dataStatus: string | null;
  flujoLatest: number | null;
  flujoYear: string | null;
}

/** Resum per al comparador i els PDFs (clau: codi municipal). */
export async function getRentalShareSummary(codes: string[]): Promise<Map<string, RentalShareSummary>> {
  const out = new Map<string, RentalShareSummary>();
  if (codes.length === 0) return out;

  const rows = await db.rentalShareObservation.findMany({
    where: { municipalityCode: { in: codes } },
    orderBy: { updatedAt: "desc" },
    select: {
      municipalityCode: true,
      rentalPercentage: true,
      censusRentalPercentage: true,
      censusYear: true,
      dataStatus: true,
    },
  });
  for (const r of rows) {
    const cur = out.get(r.municipalityCode);
    if (!cur) {
      out.set(r.municipalityCode, {
        censusPct: r.censusRentalPercentage,
        censusYear: r.censusYear,
        estimatPct: r.rentalPercentage,
        dataStatus: r.dataStatus,
        flujoLatest: null,
        flujoYear: null,
      });
    }
  }

  const fluxSource = await db.dataSource.findUnique({ where: { code: RS_FLUX_SOURCE.code }, select: { id: true } });
  if (fluxSource) {
    const fluxRows = await db.statObservation.findMany({
      where: {
        sourceId: fluxSource.id,
        variable: "INCASOL_CONTRACTES_PERIODE",
        geoLevel: "MUNI",
        geoCode: { in: codes },
      },
      select: { geoCode: true, period: true, value: true },
      orderBy: { period: "asc" },
    });
    for (const r of fluxRows) {
      const cur = out.get(r.geoCode);
      if (cur) {
        cur.flujoLatest = r.value;
        cur.flujoYear = r.period;
      }
    }
  }
  return out;
}

export interface RentalShareDetail {
  muni: { code: string; name: string } | null;
  current: {
    referenceKey: string;
    rentalPercentage: number | null;
    dataStatus: string;
    warnings: string[];
    methodologyVersion: string;
    incasolActiveDeposits: number | null;
    incasolPeriod: string | null;
    incasolDepositsPeriod: number | null;
    incasolFluxPeriod: string | null;
    residentialProperties: number | null;
    cadastreYear: string | null;
    censusMainRental: number | null;
    censusMainTotal: number | null;
    censusRentalPercentage: number | null;
    censusYear: string | null;
    sources: { incasol: string | null; cadastre: string | null; census: string | null };
  } | null;
  history: Array<{
    referenceKey: string;
    rentalPercentage: number | null;
    censusRentalPercentage: number | null;
    dataStatus: string;
    incasolPeriod: string | null;
    cadastreYear: string | null;
    updatedAt: Date;
  }>;
  flujoSerie: Array<{ year: string; contractes: number }>;
  catalunyaCensus: { rental: number | null; total: number | null; pct: number | null } | null;
}

/** Detall complet per a la fitxa municipal i GET /api/rental-share?muni=... */
export async function getRentalShareDetail(code: string): Promise<RentalShareDetail> {
  const codeSafe = String(code || "").slice(0, 10);
  const muni = await db.municipality.findUnique({
    where: { code: codeSafe },
    select: { code: true, name: true },
  });

  const rows = await db.rentalShareObservation.findMany({
    where: { municipalityCode: codeSafe },
    orderBy: { updatedAt: "desc" },
  });
  const current = rows[0] ?? null;

  const fluxSource = await db.dataSource.findUnique({ where: { code: RS_FLUX_SOURCE.code }, select: { id: true } });
  const flujoSerie: Array<{ year: string; contractes: number }> = fluxSource
    ? (
        await db.statObservation.findMany({
          where: {
            sourceId: fluxSource.id,
            variable: "INCASOL_CONTRACTES_PERIODE",
            geoLevel: "MUNI",
            geoCode: codeSafe,
          },
          select: { period: true, value: true },
          orderBy: { period: "asc" },
        })
      ).map((r) => ({ year: r.period, contractes: r.value }))
    : [];
  const flujoLatestYear = flujoSerie.length ? flujoSerie[flujoSerie.length - 1].year : null;

  const censSource = await db.dataSource.findUnique({ where: { code: RS_CENS_SOURCE.code }, select: { id: true } });
  let catalunyaCensus: RentalShareDetail["catalunyaCensus"] = null;
  if (censSource) {
    const catRows = await db.statObservation.findMany({
      where: { sourceId: censSource.id, geoLevel: "CAT", variable: { in: ["CENS_MAIN_RENTAL", "CENS_MAIN_TOTAL"] } },
      select: { variable: true, value: true },
    });
    const rental = catRows.find((r) => r.variable === "CENS_MAIN_RENTAL")?.value ?? null;
    const total = catRows.find((r) => r.variable === "CENS_MAIN_TOTAL")?.value ?? null;
    catalunyaCensus = {
      rental,
      total,
      pct: rental != null && total != null && total > 0 ? Math.round((rental / total) * 10000) / 100 : null,
    };
  }

  return {
    muni: muni ? { code: muni.code, name: muni.name } : null,
    current: current
      ? {
          referenceKey: current.referenceKey,
          rentalPercentage: current.rentalPercentage,
          dataStatus: current.dataStatus,
          warnings: (() => {
            try {
              const w = current.warnings ? JSON.parse(current.warnings) : [];
              return Array.isArray(w) ? w.map(String) : [];
            } catch {
              return [];
            }
          })(),
          methodologyVersion: current.methodologyVersion,
          incasolActiveDeposits: current.incasolActiveDeposits,
          incasolPeriod: current.incasolPeriod,
          incasolDepositsPeriod: current.incasolDepositsPeriod,
          incasolFluxPeriod: flujoLatestYear,
          residentialProperties: current.residentialProperties,
          cadastreYear: current.cadastreYear,
          censusMainRental: current.censusMainRental,
          censusMainTotal: current.censusMainTotal,
          censusRentalPercentage: current.censusRentalPercentage,
          censusYear: current.censusYear,
          sources: {
            incasol: current.incasolSource,
            cadastre: current.cadastreSource,
            census: current.censusSource,
          },
        }
      : null,
    history: rows.map((r) => ({
      referenceKey: r.referenceKey,
      rentalPercentage: r.rentalPercentage,
      censusRentalPercentage: r.censusRentalPercentage,
      dataStatus: r.dataStatus,
      incasolPeriod: r.incasolPeriod,
      cadastreYear: r.cadastreYear,
      updatedAt: r.updatedAt,
    })),
    flujoSerie,
    catalunyaCensus,
  };
}
