/**
 * v38.8 — reunió de DADES per als informes PDF (una única font de veritat).
 * Extreta de /api/reports/pdf perquè l'informe de pagament únic
 * (/api/reports/shop/download) generi EXACTAMENT el mateix document que el del
 * pla Premium/Pro, sense duplicar la lògica (degradació elegant inclosa: una
 * peça que falta — indicadors, ajuts — no treu la resta).
 * La construcció del PDF continua sent pura (src/lib/pdf-report.ts); aquí només
 * hi ha BD + serveis externs.
 */
import type { Building, Municipality } from "@prisma/client";
import { db } from "@/lib/db";
import { getMuniIndicators } from "@/lib/indicators-data";
import { getMuniDemografia, interpretacioDemografica } from "@/lib/demografia";
import { getMuniAnalisi } from "@/lib/analisi";
import type { ReportInput, ReportMarket } from "@/lib/pdf-report";
import seedAids from "@/data/rental_aid_seed.json";

/** P1.3: màscara de correu per al peu de l'informe (ma***@exemple.cat). */
export function maskEmail(email: string): string {
  return email.replace(/(.{2}).+(@.*)/, "$1***$2");
}

/** Indicadors oficials (banda P25-P75, esforç, renda, IPVA) amb degradació elegant. */
export async function gatherMuniIndicators(munCode: string, price: number | null): Promise<ReportInput["ind"]> {
  const indRaw = await getMuniIndicators(munCode, { price }).catch(() => null);
  if (!indRaw) return null;
  return {
    band: indRaw.band
      ? { p25: indRaw.band.p25, p50: indRaw.band.p50, p75: indRaw.band.p75, n: indRaw.band.n, totalWeight: indRaw.band.totalWeight }
      : null,
    effortHogar: indRaw.effort?.hogar
      ? {
          pct: indRaw.effort.hogar.pct,
          rentEurMonth: indRaw.effort.hogar.rentEurMonth,
          rentPeriod: indRaw.effort.hogar.rentPeriod,
          rentaAnual: indRaw.effort.hogar.rentaAnual,
          rentaPeriod: indRaw.effort.hogar.rentaPeriod,
        }
      : null,
    rentaHogarLatest: indRaw.renta?.municipi?.hogar?.latest
      ? { value: indRaw.renta.municipi.hogar.latest.value, period: indRaw.renta.municipi.hogar.latest.period }
      : null,
    ipvaCat: indRaw.ipva?.catalunya
      ? {
          latestAnual: indRaw.ipva.catalunya.latestAnual
            ? { value: indRaw.ipva.catalunya.latestAnual.value, period: indRaw.ipva.catalunya.latestAnual.period }
            : null,
          acum2015: indRaw.ipva.catalunya.acum2015 ? { value: indRaw.ipva.catalunya.acum2015.value } : null,
        }
      : null,
  };
}

/** Ajuts vigents (BD amb fallback editorial al seed — mai inventat en calent). */
export async function gatherRentalAids(): Promise<ReportInput["aids"]> {
  try {
    const rows = await db.rentalAid.findMany({
      where: { active: true, status: { not: "FINALIZADA" }, OR: [{ scopeCode: null }, { scopeCode: "09" }] },
      orderBy: [{ scope: "asc" }, { code: "asc" }],
      take: 6,
    });
    if (rows.length > 0) {
      return rows.map((r) => ({
        title: r.title, amount: r.amount, audience: r.audience, source: r.source, url: r.url,
        reviewed: r.lastReviewedAt.toISOString().slice(0, 10),
      }));
    }
  } catch {}
  return (seedAids.aids as Array<Record<string, unknown>>)
    .filter((a) => (a.scopeCode === null || a.scopeCode === "09") && a.status !== "FINALIZADA")
    .slice(0, 6)
    .map((a) => ({
      title: String(a.title), amount: (a.amount as string) ?? null, audience: (a.audience as string) ?? null,
      source: String(a.source), url: String(a.url), reviewed: String(seedAids.revisado),
    }));
}

/**
 * v39 — Context demogràfic del municipi (IDESCAT) per al capítol del PDF.
 * Degradació elegant: sense dades importades → null (el capítol ho diu).
 */
export async function gatherMuniDemo(munCode: string, locale: "ca" | "es" = "ca"): Promise<ReportInput["demo"]> {
  const d = await getMuniDemografia(munCode).catch(() => null);
  if (!d || !d.cobertura.poblacio) return null;
  return {
    poblacio: {
      actual: d.poblacio.actual,
      any: d.poblacio.anyActual,
      serie: d.poblacio.serie,
      var5Pct: d.poblacio.var5Pct,
      var10Pct: d.poblacio.var10Pct,
      homes: d.poblacio.homes,
      dones: d.poblacio.dones,
    },
    edats: {
      g0_14: d.edats.actual?.g0_14 ?? null,
      g15_64: d.edats.actual?.g15_64 ?? null,
      g65_84: d.edats.actual?.g65_84 ?? null,
      g85_mes: d.edats.actual?.g85_mes ?? null,
      any: d.edats.anyActual,
      pct65: d.edats.pct65,
      pct0_14: d.edats.pct0_14,
    },
    llars: {
      total: d.llars.total,
      totalAny: d.llars.totalAny,
      midaMitjana: d.llars.midaMitjana,
      midaAny: d.llars.midaAny,
      distribucioPct: d.llars.distribucioPct,
    },
    estrangera: {
      valor: d.estrangera.valor,
      pct: d.estrangera.pct,
      any: d.estrangera.any,
      pctCat: d.estrangera.pctCatalunya,
    },
    territori: {
      superficieKm2: d.territori.superficieKm2,
      densitat: d.territori.densitat,
      densitatCat: d.territori.densitatCatalunya,
    },
    comarca: {
      poblacioActual: d.comarca.poblacioActual,
      densitat: d.comarca.densitat,
      pct65: d.comarca.pct65,
      comarca: d.comarca.comarca,
    },
    cat: { poblacioActual: d.catalunya.poblacioActual, pct65: d.catalunya.pct65 },
    interpretacio: interpretacioDemografica(d, locale),
  };
}

/**
 * v45 — Anàlisi del mercat (sèries creuades) per al capítol nou del PDF.
 * Reutilitza EXACTAMENT la mateixa font que la vista #/analisi
 * (/api/analisi/muni/[code] → getMuniAnalisi): un sol principi, mai dues
 * versions dels números. Degradació elegant: sense sèries → null.
 */
export async function gatherMuniMarket(munCode: string, locale: "ca" | "es" = "ca"): Promise<ReportMarket | null> {
  const a = await getMuniAnalisi(munCode, locale).catch(() => null);
  if (!a || !a.muni) return null;
  const lastCp1k = [...a.crossover].reverse().find((c) => c.contractsPer1k != null);
  return {
    contracts: a.contracts
      ? {
          serie: a.contracts.serie,
          latest: a.contracts.latest,
          latestYear: a.contracts.latestYear,
          g5Pct: a.contracts.g5.pct,
          seriesFromImport: a.contracts.seriesFromImport,
        }
      : null,
    volume: { serie: a.crossover.map((c) => ({ year: c.year, value: c.volumeEur })) },
    census: a.census
      ? { pct: a.census.pct, year: a.census.year, catalunyaPct: a.census.catalunyaPct }
      : null,
    contractsPer1k: lastCp1k && lastCp1k.contractsPer1k != null
      ? { value: lastCp1k.contractsPer1k, year: lastCp1k.year }
      : null,
    interpretacio: a.interpretacio,
  };
}

/** Mun el ReportInput COMPLET del municipi (i opcionalment l'edifici PRO). */
export async function gatherMuniReportInput(
  mun: Municipality,
  opts: { building?: Building | null; subscriberMasked: string; planLabel: string; genDate?: string; locale?: "ca" | "es" }
): Promise<ReportInput> {
  const building = opts.building ?? null;
  const ind = await gatherMuniIndicators(mun.code, building?.avgRentEurMonth ?? null);
  const [aids, demo, market] = await Promise.all([
    gatherRentalAids(),
    gatherMuniDemo(mun.code, opts.locale ?? "ca"),
    gatherMuniMarket(mun.code, opts.locale ?? "ca"),
  ]);
  return {
    mun: {
      name: mun.name,
      comarca: mun.comarca,
      province: mun.province,
      code: mun.code,
      rentLatest: mun.rentLatest,
      rentPeriod: mun.rentPeriod,
      rentPrevYear: mun.rentPrevYear,
      rentPrevPeriod: mun.rentPrevPeriod,
      contractsLatest: mun.contractsLatest,
      isTense: mun.isTense,
      tenseList: mun.tenseList,
      rentHistory: mun.rentHistory,
    },
    building: building
      ? {
          nom: building.nom,
          refcat: building.refcat,
          tipus: building.tipus,
          altura: building.altura,
          yearBuilt: building.yearBuilt,
          avgRentEurMonth: building.avgRentEurMonth,
          sampleSize: building.sampleSize,
          source: building.source,
        }
      : null,
    ind,
    demo,
    market,
    aids,
    subscriberMasked: opts.subscriberMasked,
    planLabel: opts.planLabel,
    genDate:
      opts.genDate ?? new Date().toLocaleDateString("ca-ES", { day: "numeric", month: "long", year: "numeric" }),
  };
}
