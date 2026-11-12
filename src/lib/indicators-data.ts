/**
 * Preureal — Fase 3: capa de LECTURA per al servei d'indicadors.
 *
 * Només consultes Prisma (findMany / groupBy / count): cap escriptura, cap
 * migració, cap taula nova. Les dades venen de les taules de la Fase 2
 * (DataSource + StatObservation) i del mercat registrat ja existent
 * (Municipality, Building) — cap taula vigent canvia de significat.
 *
 * El càlcul viu a src/lib/indicators.ts (funcions pura testables); aquí
 * només: consulta → pas de dades → assemblador.
 */
import { db } from "@/lib/db";
import {
  assembleMuniIndicators,
  effortEconomic,
  type BandSample,
  type ComparativaBundle,
  type EvolucioBundle,
  type MuniIndicators,
  type StatObsLite,
} from "@/lib/indicators";
import {
  aggregateByYear,
  extremesOfYear,
  interannualPct,
  medianOf,
  muniSeries,
  valueForYear,
  yearOfPeriod,
  type MuniRentRow,
} from "@/lib/territorial";

const BASIS_FIANCES = "mercat registrat — fiances Incasòl a nivell d'edifici/illa";

/** Carrega totes les observacions rellevants per a un municipi (1 sola query). */
async function loadRelevantObservations(ineCode: string | null, provCode: string): Promise<StatObsLite[]> {
  const rows = await db.statObservation.findMany({
    where: {
      OR: [
        // àmbits superiors: Espanya, Catalunya i la província del municipi
        { geoLevel: "ESTATAL", geoCode: "ES" },
        { geoLevel: "CCAA", geoCode: "09" },
        { geoLevel: "PROV", geoCode: provCode },
        // sèries municipals pròpies (renda sempre; IPVA només >10.000 hab)
        ...(ineCode ? [{ geoLevel: "MUNI", geoCode: ineCode }] : []),
      ],
    },
    select: {
      source: { select: { code: true } },
      variable: true,
      geoLevel: true,
      geoCode: true,
      geoName: true,
      municipalityCode: true,
      period: true,
      value: true,
      unit: true,
    },
  });
  return rows.map((r) => ({
    sourceCode: r.source.code,
    variable: r.variable,
    geoLevel: r.geoLevel,
    geoCode: r.geoCode,
    geoName: r.geoName,
    municipalityCode: r.municipalityCode,
    period: r.period,
    value: r.value,
    unit: r.unit,
  }));
}

/**
 * Mostres del mercat registrat (edificis/illes amb mitjana de fiances
 * importada) del municipi, ponderades pel nº de contractes.
 */
async function loadBandSamples(muniCode: string): Promise<BandSample[]> {
  const rows = await db.building.findMany({
    where: { municipalityCode: muniCode, avgRentEurMonth: { not: null } },
    select: { avgRentEurMonth: true, sampleSize: true },
  });
  return rows
    .filter((r): r is { avgRentEurMonth: number; sampleSize: number | null } => r.avgRentEurMonth !== null)
    .filter((r) => r.avgRentEurMonth > 0)
    .map((r) => ({ value: r.avgRentEurMonth, weight: r.sampleSize && r.sampleSize >= 1 ? r.sampleSize : 1 }));
}

export interface MuniIndicatorsOptions {
  /** Preu concret consultat (€/mes) — activa POS_VS_MEDIAN i REF_BAND. */
  price?: number | null;
}

/**
 * Bloc complet d'indicadors oficials d'un municipi (per a la fitxa, el
 * comparador i el PDF). Retorna null si el municipi no existeix.
 */
export async function getMuniIndicators(
  muniCode: string,
  opts: MuniIndicatorsOptions = {},
): Promise<MuniIndicators | null> {
  const muni = await db.municipality.findUnique({
    where: { code: muniCode },
    select: {
      code: true,
      ineCode: true,
      name: true,
      comarca: true,
      province: true,
      rentLatest: true,
      rentPeriod: true,
      rentHistory: true, // noves funcionalitats F1-F4 (sèrie històrica)
    },
  });
  if (!muni) return null;

  const provCode = muni.code.slice(0, 2);
  const [observations, bandSamples] = await Promise.all([
    loadRelevantObservations(muni.ineCode, provCode),
    loadBandSamples(muniCode),
  ]);

  const full = assembleMuniIndicators({
    muni,
    observations,
    bandSamples,
    bandBasis: BASIS_FIANCES,
    price: opts.price ?? null,
  });

  // ── Noves funcionalitats (F1-F4): bundles territorials + esforç Catalunya ──
  // Els bundles NO depenen de cap autorització aquí (el gating els talla per
  // pla a la ruta); el càlcul és additiu i amb degradació elegant.
  try {
    const bundles = await buildTerritorialBundles(muni);
    full.evolucio = bundles.evolucio;
    full.comparativa = bundles.comparativa;
    full.catalunyaRentYear = bundles.catalunyaRentYear;
    const rentaCat = full.renta.catalunya ?? null;
    if (rentaCat?.latest && bundles.catalunyaRentYear?.median) {
      full.effortCatalunya = effortEconomic(bundles.catalunyaRentYear.median, rentaCat.latest.value, {
        rentPeriod: muni.rentPeriod,
        rentaPeriod: rentaCat.latest.period,
      });
    }
  } catch (e) {
    console.error("getMuniIndicators: bundles territorials no disponibles", e);
  }
  return full;
}

// ── Noves funcionalitats (F1-F4): files de fiances amb cau en memòria ───────

/**
 * Files de fiances de TOTS els municipis amb cau en memòria de 10 min (947
 * files, càrrega trivial; el parseig del JSON d'història és el cost real i
 * només es paga un cop per instància calenta). Mai llança cap error cap al
 * caller: els errors es registren i els bundles queden nulls.
 */
let rentRowsCache: { at: number; rows: MuniRentRow[] } | null = null;
const RENT_ROWS_TTL = 10 * 60_000;

async function loadMuniRentRows(): Promise<MuniRentRow[]> {
  if (rentRowsCache && Date.now() - rentRowsCache.at < RENT_ROWS_TTL) return rentRowsCache.rows;
  const rows = await db.municipality.findMany({
    select: {
      name: true,
      comarca: true,
      province: true,
      rentHistory: true,
      rentLatest: true,
      rentPeriod: true,
      contractsLatest: true,
    },
  });
  const parsed: MuniRentRow[] = rows.map((r) => {
    let history: Record<string, number> | null = null;
    if (r.rentHistory) {
      try {
        const h = JSON.parse(r.rentHistory);
        if (h && typeof h === "object" && !Array.isArray(h)) history = h as Record<string, number>;
      } catch {
        history = null; // JSON corrupt: es tracta com a sense història
      }
    }
    return {
      name: r.name,
      comarca: r.comarca,
      province: r.province,
      history,
      latest: r.rentLatest,
      period: r.rentPeriod,
      contracts: r.contractsLatest,
    };
  });
  rentRowsCache = { at: Date.now(), rows: parsed };
  return parsed;
}

/**
 * Construeix els bundles F1 (evolució) i F2 (comparativa) + la mediana de
 * Catalunya de l'any del municipi (F3). Metodologia validada §5 de l'informe:
 * mediana/any, sense interpolació, període homogeni per comparar.
 */
async function buildTerritorialBundles(
  muni: { comarca: string | null; province: string | null; rentLatest: number | null; rentPeriod: string | null; rentHistory: string | null },
): Promise<{ evolucio: EvolucioBundle | null; comparativa: ComparativaBundle | null; catalunyaRentYear: MuniIndicators["catalunyaRentYear"] }> {
  const all = await loadMuniRentRows();
  const rowsProv = all.filter((r) => r.province && r.province === muni.province);
  const rowsCom = muni.comarca ? all.filter((r) => r.comarca === muni.comarca) : [];

  // ── F1: evolució temporal ──
  let history: Record<string, number> | null = null;
  if (muni.rentHistory) {
    try {
      const h = JSON.parse(muni.rentHistory);
      if (h && typeof h === "object" && !Array.isArray(h)) history = h as Record<string, number>;
    } catch {
      history = null;
    }
  }
  const serie = muniSeries(history);
  const interanual = interannualPct(serie);
  const evolucio: EvolucioBundle | null = serie.length >= 2
    ? {
        muni: serie,
        interanual,
        comarca: muni.comarca ? aggregateByYear(rowsCom) : null,
        provincia: muni.province ? aggregateByYear(rowsProv) : null,
        muniPeriod: muni.rentPeriod,
        volatileJump: interanual.some((p) => Math.abs(p.pct) > 35),
      }
    : null;

  // ── F2: comparativa territorial (any comú = període vigent del municipi) ──
  const year = yearOfPeriod(muni.rentPeriod);
  let comparativa: ComparativaBundle | null = null;
  if (year && muni.rentLatest && muni.rentLatest > 0) {
    const comVals = rowsCom.map((r) => valueForYear(r, year)).filter((v): v is number => v !== null);
    const provVals = rowsProv.map((r) => valueForYear(r, year)).filter((v): v is number => v !== null);
    const comMed = medianOf(comVals);
    const provMed = medianOf(provVals);
    comparativa = {
      year,
      muni: { value: muni.rentLatest, period: muni.rentPeriod },
      comarca: comMed !== null && comVals.length >= 3 ? { median: Math.round(comMed * 10) / 10, n: comVals.length, name: muni.comarca } : null,
      provincia: provMed !== null && provVals.length >= 5 ? { median: Math.round(provMed * 10) / 10, n: provVals.length, name: muni.province } : null,
      deltaComarcaPct: comMed ? Math.round(((muni.rentLatest - comMed) / comMed) * 1000) / 10 : null,
      deltaProvinciaPct: provMed ? Math.round(((muni.rentLatest - provMed) / provMed) * 1000) / 10 : null,
      extremes: muni.comarca ? extremesOfYear(rowsCom, year) : null,
      seccioCensalDisponible: false,
    };
  }

  // ── F3: mediana de fiances de Catalunya l'any del municipi ──
  let catalunyaRentYear: MuniIndicators["catalunyaRentYear"] = null;
  if (year) {
    const catVals = all.map((r) => valueForYear(r, year)).filter((v): v is number => v !== null);
    const catMed = medianOf(catVals);
    catalunyaRentYear = { year, median: catMed !== null ? Math.round(catMed * 10) / 10 : null, n: catVals.length };
  }

  return { evolucio, comparativa, catalunyaRentYear };
}

/**
 * Files d'un àmbit (comarca/província/Catalunya) per a la valoració F4 i
 * agregacions. Usa el mateix cau de 10 min que els bundles.
 */
export async function getMuniRentRows(scope: { comarca?: string | null; province?: string | null }): Promise<MuniRentRow[]> {
  const rows = await loadMuniRentRows();
  return rows.filter(
    (r) =>
      (scope.comarca ? r.comarca === scope.comarca : true) &&
      (scope.province ? r.province === scope.province : true),
  );
}

// ── Cobertura (probe públic /api/indicators/status) ──────────────────────────

export interface IndicatorsCoverage {
  fonts: Array<{
    code: string;
    name: string;
    institution: string;
    unit: string | null;
    periodicity: string | null;
    url: string | null;
    updatedAt: Date;
  }>;
  perVariable: Array<{ fuente: string; variable: string; geoLevel: string; count: number }>;
  rendaMunicipis: number; // municipis amb sèrie de renda per llar
  ipvaMunicipis: number; // municipis amb sèrie IPVA (cobertura INE >10.000 hab)
  municipisTotal: number;
  ultimesImportacions: Array<{
    source: string;
    status: string;
    rowsTotal: number;
    createdAt: Date;
  }>;
}

/** Metadades de cobertura per al probe públic (mai dades d'usuari). */
export async function getIndicatorsCoverage(): Promise<IndicatorsCoverage> {
  const [fonts, perVariable, rendaMunis, ipvaMunis, municipisTotal, runs] = await Promise.all([
    db.dataSource.findMany({
      where: { code: { in: ["INE_IPVA", "INE_ATLAS_RENTA"] } },
      select: {
        code: true,
        name: true,
        institution: true,
        unit: true,
        periodicity: true,
        url: true,
        updatedAt: true,
      },
      orderBy: { code: "asc" },
    }),
    db.statObservation.groupBy({
      by: ["sourceId", "variable", "geoLevel"],
      _count: { _all: true },
    }),
    db.statObservation.findMany({
      where: { variable: "RENTA_NETA_MEDIA_HOGAR", geoLevel: "MUNI" },
      distinct: ["geoCode"],
      select: { geoCode: true },
    }),
    db.statObservation.findMany({
      where: { variable: "IPVA_INDICE", geoLevel: "MUNI" },
      distinct: ["geoCode"],
      select: { geoCode: true },
    }),
    db.municipality.count(),
    db.importRun.findMany({
      where: { source: { startsWith: "INE_" } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { source: true, status: true, rowsTotal: true, createdAt: true },
    }),
  ]);

  const codesById = new Map(
    (await db.dataSource.findMany({ where: { code: { in: ["INE_IPVA", "INE_ATLAS_RENTA"] } }, select: { id: true, code: true } })).map(
      (f) => [f.id, f.code],
    ),
  );

  return {
    fonts,
    perVariable: perVariable.map((g) => ({
      fuente: codesById.get(g.sourceId) ?? g.sourceId,
      variable: g.variable,
      geoLevel: g.geoLevel,
      count: g._count._all,
    })),
    rendaMunicipis: rendaMunis.length,
    ipvaMunicipis: ipvaMunis.length,
    municipisTotal,
    ultimesImportacions: runs,
  };
}
