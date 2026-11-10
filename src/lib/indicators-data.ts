/**
 * PreuReal.cat — Fase 3: capa de LECTURA per al servei d'indicadors.
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
  type BandSample,
  type MuniIndicators,
  type StatObsLite,
} from "@/lib/indicators";

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
    },
  });
  if (!muni) return null;

  const provCode = muni.code.slice(0, 2);
  const [observations, bandSamples] = await Promise.all([
    loadRelevantObservations(muni.ineCode, provCode),
    loadBandSamples(muniCode),
  ]);

  return assembleMuniIndicators({
    muni,
    observations,
    bandSamples,
    bandBasis: BASIS_FIANCES,
    price: opts.price ?? null,
  });
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
