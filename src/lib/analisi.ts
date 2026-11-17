/**
 * v42 — Eina «Anàlisi del mercat residencial»: creua les tres sèries
 * oficials existents a PreuReal per a cada municipi:
 *  1. preu mitjà real del lloguer (fiances Incasòl — Municipality.rentHistory)
 *  2. evolució de contractes amb fiança (flux anual — StatObservation v41)
 *  3. creixement demogràfic (Padró continu IDESCAT — StatObservation v39)
 * més el contrast censal del v41 (viviendas principals en alquiler).
 *
 * Tot el càlcul creuat és APROXIMAT i etiquetat; mai s'inventen anys ni es
 * substitueixen absències. Lectures descriptives, no causals.
 */

import { db } from "@/lib/db";
import { cached } from "@/lib/cache";
import { buildLinearForecast, type ForecastResult } from "@/lib/forecast";
import { DEMO_SOURCES } from "@/lib/demografia";
import { getRentalShareDetail } from "@/lib/rental-share";
import {
  buildCrossover,
  buildInterpretacio,
  growthPct,
  parseRentHistory,
  type SeriePoint,
} from "@/lib/analisi-calc";

export interface AnalisiPayload {
  ok: boolean;
  code: string;
  locale: "ca" | "es";
  muni: { code: string; name: string; comarca: string | null; province: string | null } | null;
  rent: {
    serie: SeriePoint[];
    latest: number | null;
    period: string | null;
    prevYear: number | null;
    prevPeriod: string | null;
    g5: { pct: number | null; fromYear: string | null; toYear: string | null };
    g10: { pct: number | null; fromYear: string | null; toYear: string | null };
    comarcaRefSerie: SeriePoint[];
    comarcaRefLatest: number | null;
    comarcaRefPeriod: string | null;
    rentSource: string | null;
    /** v60 — tendència orientativa 12–24 mesos (regressió lineal OLS sobre la sèrie oficial). Null si la sèrie és massa curta (<4 anys). */
    forecast: ForecastResult | null;
  } | null;
  contracts: {
    serie: SeriePoint[];
    latest: number | null;
    latestYear: string | null;
    g5: { pct: number | null; fromYear: string | null; toYear: string | null };
    /** true si la sèrie ve de la ingesta v41; false si és el punt únic del seed */
    seriesFromImport: boolean;
    fallbackPeriod: string | null;
  } | null;
  poblacio: {
    serie: SeriePoint[];
    latest: number | null;
    latestYear: string | null;
    g5: { pct: number | null; fromYear: string | null; toYear: string | null };
    g10: { pct: number | null; fromYear: string | null; toYear: string | null };
    catalunyaLatest: number | null;
    catalunyaYear: string | null;
  } | null;
  crossover: Array<{ year: string; rent: number; contracts: number; population: number | null; volumeEur: number; contractsPer1k: number | null }>;
  census: { pct: number | null; rental: number | null; total: number | null; year: string | null; catalunyaPct: number | null } | null;
  interpretacio: string[];
  sources: string[];
  generatedAt: string;
}

async function getPopulationSerie(code: string): Promise<{ muni: SeriePoint[]; catLatest: number | null; catYear: string | null }> {
  const ids = await db.dataSource.findMany({
    where: { code: { in: [...DEMO_SOURCES] } },
    select: { id: true },
  });
  if (ids.length === 0) return { muni: [], catLatest: null, catYear: null };
  const idList = ids.map((i) => i.id);
  const rows = await db.statObservation.findMany({
    where: { sourceId: { in: idList }, variable: "POB_TOTAL", geoLevel: "MUNI", geoCode: code },
    select: { period: true, value: true },
    orderBy: { period: "asc" },
  });
  // un solo registro por año (si una fuente revisada duplicara períodos, gana el más reciente por orden estable)
  const byYear = new Map<string, number>();
  for (const r of rows) {
    if (/^\d{4}$/.test(r.period)) byYear.set(r.period, r.value);
  }
  const muni = [...byYear.entries()].map(([year, value]) => ({ year, value })).sort((a, b) => a.year.localeCompare(b.year));
  const cat = await db.statObservation.findFirst({
    where: { sourceId: { in: idList }, variable: "POB_TOTAL", geoLevel: "CAT", geoCode: "CAT" },
    select: { period: true, value: true },
    orderBy: { period: "desc" },
  });
  return { muni, catLatest: cat?.value ?? null, catYear: cat?.period ?? null };
}

/** Anàlisi complet d'un municipi (creuament de sèries reals). */
export async function getMuniAnalisi(code: string, locale: "ca" | "es" = "ca"): Promise<AnalisiPayload | null> {
  const codeSafe = String(code || "").slice(0, 10);
  // v60 — cau en memòria (10 min, clau municipi+idioma): les sèries oficials no
  // canvien entre ingestes; amb concurrència una sola execució serveix totes
  // les peticions (PostgreSQL protegit). generatedAt reflecteix la construcció.
  return cached(`analisi:${codeSafe}:${locale}`, 10 * 60_000, async (): Promise<AnalisiPayload | null> => {
  const m = await db.municipality.findUnique({
    where: { code: codeSafe },
    select: {
      code: true, name: true, comarca: true, province: true,
      rentHistory: true, rentLatest: true, rentPeriod: true, rentPrevYear: true, rentPrevPeriod: true,
      comarcaRefHistory: true, comarcaRefLatest: true, comarcaRefPeriod: true,
      contractsLatest: true, rentSource: true,
    },
  });
  if (!m) return null;

  // sèries individuals
  const rentSerie = parseRentHistory(m.rentHistory);
  const comarcaRefSerie = parseRentHistory(m.comarcaRefHistory);
  const rs = await getRentalShareDetail(codeSafe);
  let contractsSerie: SeriePoint[] = rs.flujoSerie.map((f) => ({ year: f.year, value: f.contractes }));
  let seriesFromImport = contractsSerie.length > 0;
  let fallbackPeriod: string | null = null;
  if (!seriesFromImport && m.contractsLatest != null && m.contractsLatest > 0) {
    // producció sense ingesta v41 encara: punt únic del seed (mateixa publicació
    // oficial que rentPeriod) — sempre etiquetat com a punt únic
    fallbackPeriod = m.rentPeriod ?? null;
    contractsSerie = [{ year: /^\d{4}$/.test(m.rentPeriod ?? "") ? (m.rentPeriod as string) : "n.d.", value: m.contractsLatest }];
  }
  const pob = await getPopulationSerie(codeSafe);

  // creuament + mètriques
  const crossover = buildCrossover(rentSerie, contractsSerie, pob.muni);
  const rentG5 = growthPct(rentSerie, 5);
  const rentG10 = growthPct(rentSerie, 10);
  // v60 — tendència orientativa 12–24 mesos (OLS): null amb sèries curtes o sense variància
  const forecast = buildLinearForecast(rentSerie, 2);
  const popG5 = growthPct(pob.muni, 5);
  const popG10 = growthPct(pob.muni, 10);
  const contractsG5 = growthPct(contractsSerie, 5);
  const lastVolume = crossover.length ? { year: crossover[crossover.length - 1].year, volumeEur: crossover[crossover.length - 1].volumeEur } : null;
  const per1kPoint = [...crossover].reverse().find((c) => c.contractsPer1k != null);
  const lastPer1k = per1kPoint ? { year: per1kPoint.year, value: per1kPoint.contractsPer1k as number } : null;
  const contractsLatestPoint = contractsSerie.length ? contractsSerie[contractsSerie.length - 1] : null;

  const interpretacio = buildInterpretacio(
    {
      rentG10,
      popG10,
      contractsG5,
      lastVolume,
      lastPer1k,
      censusPct: rs.current?.censusRentalPercentage ?? null,
      censusYear: rs.current?.censusYear ?? null,
    },
    locale
  );

  const sources = [
    "Incasòl — explotació estadística del Registre de fiances (preu mitjà mensual i flux anual de contractes, via Dades Obertes)",
    "IDESCAT — Padró continu d'habitants (població a 1 de gener)",
    rs.current?.censusRentalPercentage != null ? "IDESCAT/INE — Cens de població i habitatges 2021 (viviendas principals per règim de tinença)" : null,
    // v60 — la projecció és una aproximació estadística pròpia (OLS sobre la sèrie oficial): sempre etiquetada
    forecast != null
      ? "PreuReal — projecció de tendència orientativa (regressió lineal sobre la sèrie Incasòl; NO és una previsió ni una valoració oficial)"
      : null,
  ].filter(Boolean) as string[];

  return {
    ok: true,
    code: codeSafe,
    locale,
    muni: { code: m.code, name: m.name, comarca: m.comarca, province: m.province },
    rent: {
      serie: rentSerie,
      latest: m.rentLatest,
      period: m.rentPeriod,
      prevYear: m.rentPrevYear,
      prevPeriod: m.rentPrevPeriod,
      g5: rentG5,
      g10: rentG10,
      comarcaRefSerie,
      comarcaRefLatest: m.comarcaRefLatest,
      comarcaRefPeriod: m.comarcaRefPeriod,
      rentSource: m.rentSource,
      forecast,
    },
    contracts: {
      serie: contractsSerie,
      latest: contractsLatestPoint?.value ?? null,
      latestYear: contractsLatestPoint?.year ?? null,
      g5: contractsG5,
      seriesFromImport,
      fallbackPeriod,
    },
    poblacio: {
      serie: pob.muni,
      latest: pob.muni.length ? pob.muni[pob.muni.length - 1].value : null,
      latestYear: pob.muni.length ? pob.muni[pob.muni.length - 1].year : null,
      g5: popG5,
      g10: popG10,
      catalunyaLatest: pob.catLatest,
      catalunyaYear: pob.catYear,
    },
    crossover,
    census: rs.current
      ? {
          pct: rs.current.censusRentalPercentage,
          rental: rs.current.censusMainRental,
          total: rs.current.censusMainTotal,
          year: rs.current.censusYear,
          catalunyaPct: rs.catalunyaCensus?.pct ?? null,
        }
      : null,
    interpretacio,
    sources,
    generatedAt: new Date().toISOString(),
    };
  });
}
