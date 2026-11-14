/**
 * v39 (Fase demografia) — Capa de LECTURA del context demogràfic i territorial.
 *
 * Reuneix StatObservation de les fonts IDESCAT_* (padró continu, censos de
 * llars, emex) i compon la resposta per a:
 *  - la fitxa municipal (GET /api/demografia/muni/:code),
 *  - els informes PDF (capítol «Contexte demogràfic i territorial»),
 *  - el comparador (bloc demogràfic per municipi).
 *
 * REGLES:
 *  - Mai s'inventa: un indicador sense fila a la BD surt com a null i la UI
 *    mostra «Dato no disponible».
 *  - Les derivacions són transparents i documentades (percentatges, variacions
 *    i població estrangera = total − espanyola, categories oficials).
 *  - La demografia CONTEXTUALITZA el mercat: mai es barreja amb el càlcul de
 *    preus ni s'atribueix causalitat.
 */
import { db } from "@/lib/db";

export const DEMO_SOURCES = ["IDESCAT_POB", "IDESCAT_EDAT", "IDESCAT_NAC", "IDESCAT_CENS_LLARS", "IDESCAT_EMEX"] as const;

const VAR_LIST = [
  "POB_TOTAL", "POB_HOMES", "POB_DONES",
  "POB_EDAT_0_14", "POB_EDAT_15_64", "POB_EDAT_65_84", "POB_EDAT_85_MES",
  "POB_NAC_ESPANYOLA", "POB_NAC_TOTAL",
  "LLARS_TOTAL", "LLARS_MIDA_MITJANA", "LLARS_G1_PCT", "LLARS_G2_PCT", "LLARS_G3_PCT", "LLARS_G4_PCT", "LLARS_G5_PCT", "LLARS_1P_65_PCT", "POB_75_ALONE_PCT",
  "TERRITORI_SUPERFICIE_KM2", "TERRITORI_DENSITAT_HAB_KM2",
] as const;

export type DemoPoint = { year: string; value: number };
export type DemoSeries = DemoPoint[];

export interface DemoFont {
  font: string;        // citació oficial
  any: string | null;  // any de referència de l'últim punt
  updated: string | null; // darrera importació
}

export interface DemoBlock<T> {
  data: T | null;
  font: DemoFont | null;
}

export interface DemografiaMuni {
  poblacio: {
    actual: number | null;
    anyActual: string | null;
    serie: DemoSeries;
    var5Pct: number | null;
    var10Pct: number | null;
    abs5: number | null;
    abs10: number | null;
    tendencia: "CREIXEMENT" | "ESTABLE" | "PERDUA" | null;
    homes: number | null;
    dones: number | null;
  };
  edats: {
    actual: Record<string, number> | null; // {g0_14, g15_64, g65_84, g85_mes}
    anyActual: string | null;
    serie: Record<string, DemoSeries>;     // per grup
    pct65: number | null;
    pct0_14: number | null;
  };
  llars: {
    total: number | null;
    totalAny: string | null;
    serie: DemoSeries;                     // censos 1991-2021
    midaMitjana: number | null;
    midaAny: string | null;
    distribucioPct: Record<string, number> | null; // {g1..g5}
  };
  estrangera: {
    valor: number | null;
    pct: number | null;
    any: string | null;
    serie: DemoSeries;
    pctCatalunya: number | null;
  };
  territori: {
    superficieKm2: number | null;
    densitat: number | null;
    densitatCatalunya: number | null;
    any: string | null;
  };
  comarca: {
    poblacioActual: number | null;
    pct65: number | null;
    llarsTotal: number | null;
    densitat: number | null;
    estrangeraPct: number | null;
    comarca: string | null;
  };
  catalunya: {
    poblacioActual: number | null;
    pct65: number | null;
    llarsTotal: number | null;
    estrangeraPct: number | null;
  };
  cobertura: {
    poblacio: boolean;
    edats: boolean;
    llars: boolean;
    estrangera: boolean;
    territori: boolean;
  };
}

interface ObsRow {
  sourceId: string;
  variable: string;
  geoLevel: string;
  geoCode: string;
  geoName: string | null;
  period: string;
  value: number;
  importedAt: Date;
}

/** Sèrie anual amb valors finals a l'any de referència demanat. */
function latestYear(series: DemoSeries): DemoPoint | null {
  if (series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.year.localeCompare(b.year));
  return sorted[sorted.length - 1];
}

function pctOf(part: number | null, total: number | null): number | null {
  if (part == null || total == null || total <= 0 || part < 0) return null;
  return (part / total) * 100;
}

/** Variació % entre l'últim punt i el punt de fa N anys EXACTES (si existeix). */
function variation(series: DemoSeries, years: number): { pct: number | null; abs: number | null } {
  const sorted = [...series].sort((a, b) => a.year.localeCompare(b.year));
  const last = sorted[sorted.length - 1];
  if (!last) return { pct: null, abs: null };
  const target = String(Number(last.year) - years);
  const past = sorted.find((p) => p.year === target);
  if (!past || past.value <= 0) return { pct: null, abs: null };
  return { pct: ((last.value - past.value) / past.value) * 100, abs: last.value - past.value };
}

/** Tendència demogràfica documentada: ±2% acumulat en 10 anys. */
function tendencia(var10Pct: number | null): "CREIXEMENT" | "ESTABLE" | "PERDUA" | null {
  if (var10Pct == null) return null;
  if (var10Pct > 2) return "CREIXEMENT";
  if (var10Pct < -2) return "PERDUA";
  return "ESTABLE";
}

function groupSeries(rows: ObsRow[], variable: string): DemoSeries {
  return rows
    .filter((r) => r.variable === variable)
    .map((r) => ({ year: r.period, value: r.value }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

function lastValue(rows: ObsRow[], variable: string): { value: number; period: string } | null {
  const s = groupSeries(rows, variable);
  return latestYear(s) ? { value: s[s.length - 1].value, period: s[s.length - 1].year } : null;
}

/**
 * Ids (cuid) dels DataSource demogràfics. StatObservation.sourceId apunta al
 * PK del DataSource (no al seu code): cal resoldre-ho abans de cada consulta.
 */
async function demoSourceIds(): Promise<string[]> {
  const rows = await db.dataSource.findMany({
    where: { code: { in: [...DEMO_SOURCES] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Carrega les observacions de les fonts demogràfiques per a UN territori. */
async function loadObs(geoLevel: string, geoCode: string): Promise<ObsRow[]> {
  const ids = await demoSourceIds();
  if (ids.length === 0) return [];
  return db.statObservation.findMany({
    where: {
      sourceId: { in: ids },
      geoLevel,
      geoCode,
      variable: { in: [...VAR_LIST] },
    },
    select: {
      sourceId: true, variable: true, geoLevel: true, geoCode: true,
      geoName: true, period: true, value: true, importedAt: true,
    },
  });
}

function fontOf(rows: ObsRow[], variable: string, fontLabel: string): DemoFont | null {
  const rel = rows.filter((r) => r.variable === variable);
  if (rel.length === 0) return null;
  const last = latestYear(groupSeries(rel, variable));
  const updated = rel.map((r) => r.importedAt).sort((a, b) => b.getTime() - a.getTime())[0];
  return { font: fontLabel, any: last?.year ?? null, updated: updated?.toISOString().slice(0, 10) ?? null };
}

/** Comarca IDESCAT ↔ Municipality.comarca (normalitzat; «Vall d'Aran» ≡ «Aran»). */
function comarcaKey(name: string | null | undefined): string | null {
  if (!name) return null;
  let s = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’`]/g, "").replace(/[^a-z0-9]/g, "");
  if (s === "valldaran") s = "aran";
  return s;
}

/** Context demogràfic COMPLET d'un municipi (null-safe). */
export async function getMuniDemografia(munCode: string): Promise<DemografiaMuni | null> {
  const mun = await db.municipality.findUnique({
    where: { code: munCode },
    select: { code: true, name: true, comarca: true },
  });
  if (!mun) return null;

  const [muniRows, allComRows, catRows] = await Promise.all([
    loadObs("MUNI", mun.code),
    // les files COM usen codis IDESCAT (01..42) o nom normalitzat (emex):
    // la cerca fiable és per geoName (match normalitzat amb Municipality.comarca)
    db.statObservation.findMany({
      where: {
        sourceId: { in: await demoSourceIds() },
        geoLevel: "COM",
        variable: { in: [...VAR_LIST] },
        geoName: { not: null },
      },
      select: {
        sourceId: true, variable: true, geoLevel: true, geoCode: true,
        geoName: true, period: true, value: true, importedAt: true,
      },
    }),
    loadObs("CAT", "CAT"),
  ]);
  const comRows = allComRows.filter((r) => comarcaKey(r.geoName) === comarcaKey(mun.comarca));

  // ── municipi ──
  const pobSerie = groupSeries(muniRows, "POB_TOTAL");
  const pobLast = latestYear(pobSerie);
  const v5 = variation(pobSerie, 5);
  const v10 = variation(pobSerie, 10);

  // edats: vigent (emex, ref p. ex. 2025) + sèrie (padró agregat fins 2022)
  const edatActual = {
    g0_14: lastValue(muniRows, "POB_EDAT_0_14")?.value ?? null,
    g15_64: lastValue(muniRows, "POB_EDAT_15_64")?.value ?? null,
    g65_84: lastValue(muniRows, "POB_EDAT_65_84")?.value ?? null,
    g85_mes: lastValue(muniRows, "POB_EDAT_85_MES")?.value ?? null,
  };
  const edatTotalForPct = pobLast?.value ?? null;
  const g65 = (edatActual.g65_84 ?? 0) + (edatActual.g85_mes ?? 0);
  const pct65 = edatActual.g65_84 != null || edatActual.g85_mes != null ? pctOf(g65 || null, edatTotalForPct) : null;
  const pct0_14 = pctOf(edatActual.g0_14, edatTotalForPct);

  const edatSerie: Record<string, DemoSeries> = {
    g0_14: groupSeries(muniRows, "POB_EDAT_0_14"),
    g15_64: groupSeries(muniRows, "POB_EDAT_15_64"),
    g65_84: groupSeries(muniRows, "POB_EDAT_65_84"),
    g85_mes: groupSeries(muniRows, "POB_EDAT_85_MES"),
  };

  // llars
  const llarsSerie = groupSeries(muniRows, "LLARS_TOTAL");
  const llarsLast = latestYear(llarsSerie);
  const llarsDistrib = {
    g1: lastValue(muniRows, "LLARS_G1_PCT"),
    g2: lastValue(muniRows, "LLARS_G2_PCT"),
    g3: lastValue(muniRows, "LLARS_G3_PCT"),
    g4: lastValue(muniRows, "LLARS_G4_PCT"),
    g5: lastValue(muniRows, "LLARS_G5_PCT"),
  };
  const hasDistrib = Object.values(llarsDistrib).some((v) => v != null);

  // estrangera (total − espanyola, derivació documentada)
  const nacTotalSerie = groupSeries(muniRows, "POB_NAC_TOTAL");
  const nacEspSerie = groupSeries(muniRows, "POB_NAC_ESPANYOLA");
  const estrangeraSerie: DemoSeries = nacTotalSerie
    .map((t) => {
      const esp = nacEspSerie.find((e) => e.year === t.year);
      return esp ? { year: t.year, value: t.value - esp.value } : null;
    })
    .filter((x): x is DemoPoint => x !== null);
  const estrLast = latestYear(estrangeraSerie);
  const estrPctMuni = pctOf(estrLast?.value ?? null, pobSerie.find((p) => p.year === estrLast?.year)?.value ?? null);

  // territori (emex)
  const superficie = lastValue(muniRows, "TERRITORI_SUPERFICIE_KM2");
  const densitat = lastValue(muniRows, "TERRITORI_DENSITAT_HAB_KM2");

  // ── comarca i Catalunya ──
  const comPobLast = lastValue(comRows, "POB_TOTAL");
  const comEdat65 = (lastValue(comRows, "POB_EDAT_65_84")?.value ?? 0) + (lastValue(comRows, "POB_EDAT_85_MES")?.value ?? 0);
  const comPct65 =
    lastValue(comRows, "POB_EDAT_65_84") != null || lastValue(comRows, "POB_EDAT_85_MES") != null
      ? pctOf(comEdat65 || null, comPobLast?.value ?? null)
      : null;
  const comLlars = lastValue(comRows, "LLARS_TOTAL");
  const comDens = lastValue(comRows, "TERRITORI_DENSITAT_HAB_KM2");
  const comEstrTotal = lastValue(comRows, "POB_NAC_TOTAL");
  const comEstrEsp = lastValue(comRows, "POB_NAC_ESPANYOLA");
  const comEstrPct =
    comEstrTotal && comEstrEsp && comPobLast
      ? pctOf(comEstrTotal.value - comEstrEsp.value, comPobLast.value)
      : null;

  const catPobLast = lastValue(catRows, "POB_TOTAL");
  const catEdat65 = (lastValue(catRows, "POB_EDAT_65_84")?.value ?? 0) + (lastValue(catRows, "POB_EDAT_85_MES")?.value ?? 0);
  const catPct65 =
    lastValue(catRows, "POB_EDAT_65_84") != null || lastValue(catRows, "POB_EDAT_85_MES") != null
      ? pctOf(catEdat65 || null, catPobLast?.value ?? null)
      : null;
  const catLlars = lastValue(catRows, "LLARS_TOTAL");
  const catEstrTotal = lastValue(catRows, "POB_NAC_TOTAL");
  const catEstrEsp = lastValue(catRows, "POB_NAC_ESPANYOLA");
  const catEstrPct =
    catEstrTotal && catEstrEsp && catPobLast
      ? pctOf(catEstrTotal.value - catEstrEsp.value, catPobLast.value)
      : null;
  const catDens = lastValue(catRows, "TERRITORI_DENSITAT_HAB_KM2");

  const FONT_POB = "IDESCAT, Padró continu d'habitants (INE)";
  const FONT_EDAT = "IDESCAT, Padró continu (grans grups d'edat)";
  const FONT_LLARS = "IDESCAT, Censos de població i habitatges (INE)";
  const FONT_EMEX = "IDESCAT, El municipi en xifres";

  return {
    poblacio: {
      actual: pobLast?.value ?? null,
      anyActual: pobLast?.year ?? null,
      serie: pobSerie,
      var5Pct: v5.pct,
      var10Pct: v10.pct,
      abs5: v5.abs,
      abs10: v10.abs,
      tendencia: tendencia(v10.pct),
      homes: lastValue(muniRows, "POB_HOMES")?.value ?? null,
      dones: lastValue(muniRows, "POB_DONES")?.value ?? null,
    },
    edats: {
      actual: hasAny(edatActual) ? (edatActual as Record<string, number>) : null,
      anyActual:
        lastValue(muniRows, "POB_EDAT_0_14")?.period ??
        lastValue(muniRows, "POB_EDAT_65_84")?.period ??
        null,
      serie: edatSerie,
      pct65,
      pct0_14,
    },
    llars: {
      total: llarsLast?.value ?? null,
      totalAny: llarsLast?.year ?? null,
      serie: llarsSerie,
      midaMitjana: lastValue(muniRows, "LLARS_MIDA_MITJANA")?.value ?? null,
      midaAny: lastValue(muniRows, "LLARS_MIDA_MITJANA")?.period ?? null,
      distribucioPct: hasDistrib
        ? {
            g1: llarsDistrib.g1?.value ?? 0,
            g2: llarsDistrib.g2?.value ?? 0,
            g3: llarsDistrib.g3?.value ?? 0,
            g4: llarsDistrib.g4?.value ?? 0,
            g5: llarsDistrib.g5?.value ?? 0,
          }
        : null,
    },
    estrangera: {
      valor: estrLast?.value ?? null,
      pct: estrPctMuni,
      any: estrLast?.year ?? null,
      serie: estrangeraSerie,
      pctCatalunya: catEstrPct,
    },
    territori: {
      superficieKm2: superficie?.value ?? null,
      densitat: densitat?.value ?? null,
      densitatCatalunya: catDens?.value ?? null,
      any: superficie?.period ?? densitat?.period ?? null,
    },
    comarca: {
      poblacioActual: comPobLast?.value ?? null,
      pct65: comPct65,
      llarsTotal: comLlars?.value ?? null,
      densitat: comDens?.value ?? null,
      estrangeraPct: comEstrPct,
      comarca: mun.comarca,
    },
    catalunya: {
      poblacioActual: catPobLast?.value ?? null,
      pct65: catPct65,
      llarsTotal: catLlars?.value ?? null,
      estrangeraPct: catEstrPct,
    },
    cobertura: {
      poblacio: pobSerie.length > 0,
      edats: hasAny(edatActual),
      llars: llarsSerie.length > 0,
      estrangera: estrangeraSerie.length > 0,
      territori: superficie != null || densitat != null,
    },
  };
}

function hasAny(o: Record<string, number | null>): boolean {
  return Object.values(o).some((v) => v != null);
}

/** Versió COMPACTA per al comparador i els PDF de comparativa. */
export interface DemoSummary {
  poblacio: number | null;
  anyPoblacio: string | null;
  pct65: number | null;
  pct0_14: number | null;
  llarsTotal: number | null;
  llarsAny: string | null;
  midaMitjana: number | null;
  estrangeraPct: number | null;
  densitat: number | null;
}

type ObsRowLite = { variable: string; period: string; value: number };

export async function getDemografiaSummary(codes: string[]): Promise<Map<string, DemoSummary>> {
  const out = new Map<string, DemoSummary>();
  if (codes.length === 0) return out;
  const ids = await demoSourceIds();
  if (ids.length === 0) return out;
  const rows = await db.statObservation.findMany({
    where: {
      sourceId: { in: ids },
      geoLevel: "MUNI",
      geoCode: { in: codes },
      variable: {
        in: [
          "POB_TOTAL", "POB_EDAT_65_84", "POB_EDAT_85_MES", "POB_EDAT_0_14",
          "LLARS_TOTAL", "LLARS_MIDA_MITJANA", "POB_NAC_TOTAL", "POB_NAC_ESPANYOLA",
          "TERRITORI_DENSITAT_HAB_KM2",
        ],
      },
    },
    select: {
      variable: true, geoCode: true, period: true, value: true,
    },
  });
  const byCode = new Map<string, ObsRowLite[]>();
  for (const r of rows) {
    const arr = byCode.get(r.geoCode) ?? [];
    arr.push({ variable: r.variable, period: r.period, value: r.value });
    byCode.set(r.geoCode, arr);
  }
  for (const code of codes) {
    const arr = byCode.get(code) ?? [];
    const last = (variable: string): { value: number; period: string } | null => {
      const s = arr
        .filter((r) => r.variable === variable)
        .sort((a, b) => a.period.localeCompare(b.period));
      return s.length > 0 ? { value: s[s.length - 1].value, period: s[s.length - 1].period } : null;
    };
    const pob = last("POB_TOTAL");
    const e65 = last("POB_EDAT_65_84");
    const e85 = last("POB_EDAT_85_MES");
    const e014 = last("POB_EDAT_0_14");
    const llars = last("LLARS_TOTAL");
    const nacT = last("POB_NAC_TOTAL");
    const nacE = last("POB_NAC_ESPANYOLA");
    const dens = last("TERRITORI_DENSITAT_HAB_KM2");
    const g65Sum = (e65?.value ?? null) != null || (e85?.value ?? null) != null
      ? (e65?.value ?? 0) + (e85?.value ?? 0)
      : null;
    out.set(code, {
      poblacio: pob?.value ?? null,
      anyPoblacio: pob?.period ?? null,
      pct65: g65Sum != null && pob ? pctOf(g65Sum, pob.value) : null,
      pct0_14: e014 && pob ? pctOf(e014.value, pob.value) : null,
      llarsTotal: llars?.value ?? null,
      llarsAny: llars?.period ?? null,
      midaMitjana: last("LLARS_MIDA_MITJANA")?.value ?? null,
      estrangeraPct:
        nacT && nacE && pob ? pctOf(nacT.value - nacE.value, pob.value) : null,
      densitat: dens?.value ?? null,
    });
  }
  return out;
}

/**
 * Interpretació automàtica DES DE LES DADES (regles documentades):
 * descriu tendències, mai atribueix causalitat amb els preus del lloguer.
 */
export function interpretacioDemografica(d: DemografiaMuni, locale: "ca" | "es"): string[] {
  const ca = locale === "ca";
  const out: string[] = [];
  const p = d.poblacio;
  if (p.tendencia && p.var10Pct != null) {
    const v = `${p.var10Pct > 0 ? "+" : ""}${p.var10Pct.toFixed(1)}%`;
    if (p.tendencia === "CREIXEMENT") {
      out.push(
        ca
          ? `Creixement demogràfic positiu durant l'última dècada (${v} d'habitants, períodes ${p.serie[0]?.year}–${p.anyActual}).`
          : `Crecimiento demográfico positivo durante la última década (${v} de habitantes, períodos ${p.serie[0]?.year}–${p.anyActual}).`
      );
    } else if (p.tendencia === "PERDUA") {
      out.push(
        ca
          ? `Pèrdua de població durant l'última dècada (${v}, períodes ${p.serie[0]?.year}–${p.anyActual}).`
          : `Pérdida de población durante la última década (${v}, períodos ${p.serie[0]?.year}–${p.anyActual}).`
      );
    } else {
      out.push(
        ca
          ? `Població estable durant l'última dècada (variació acumulada ${v}).`
          : `Población estable durante la última década (variación acumulada ${v}).`
      );
    }
  }
  if (d.edats.pct65 != null) {
    const ref = d.catalunya.pct65;
    const comparison =
      ref != null
        ? d.edats.pct65 > ref + 1
          ? ca ? " per sobre de la mitjana catalana" : " por encima de la media catalana"
          : d.edats.pct65 < ref - 1
            ? ca ? " per sota de la mitjana catalana" : " por debajo de la media catalana"
            : ca ? " en línia amb la mitjana catalana" : " en línea con la media catalana"
        : "";
    out.push(
      ca
        ? `El ${d.edats.pct65.toFixed(1)}% de la població té 65 anys o més${comparison} (indicador: grans grups d'edat del padró).`
        : `El ${d.edats.pct65.toFixed(1)}% de la población tiene 65 años o más${comparison} (indicador: grandes grupos de edad del padrón).`
    );
  }
  if (d.llars.total != null && p.actual != null && d.llars.serie.length >= 2) {
    const first = d.llars.serie[0];
    const llarsVar = ((d.llars.total - first.value) / first.value) * 100;
    const pobVar = p.var10Pct;
    if (pobVar != null && Math.abs(llarsVar - pobVar) > 3) {
      out.push(
        ca
          ? `El nombre de llars ha evolucionat a un ritme diferent del de la població (${llarsVar > 0 ? "+" : ""}${llarsVar.toFixed(1)}% des de ${first.year} enfront de ${pobVar > 0 ? "+" : ""}${pobVar.toFixed(1)}% poblacional): els dos indicadors, per si sols, no expliquen la demanda residencial.`
          : `El número de hogares ha evolucionado a un ritmo distinto al de la población (${llarsVar > 0 ? "+" : ""}${llarsVar.toFixed(1)}% desde ${first.year} frente a ${pobVar > 0 ? "+" : ""}${pobVar.toFixed(1)}% poblacional): ambos indicadores, por sí solos, no explican la demanda residencial.`
      );
    }
  }
  if (d.estrangera.pct != null && d.catalunya.estrangeraPct != null) {
    out.push(
      ca
        ? `La població de nacionalitat estrangera representa el ${d.estrangera.pct.toFixed(1)}% del total municipal (Catalunya: ${d.catalunya.estrangeraPct.toFixed(1)}%, ${d.estrangera.any}). Indicador descriptiu: no s'atribueix cap relació causal amb els preus.`
        : `La población de nacionalidad extranjera representa el ${d.estrangera.pct.toFixed(1)}% del total municipal (Cataluña: ${d.catalunya.estrangeraPct.toFixed(1)}%, ${d.estrangera.any}). Indicador descriptivo: no se atribuye ninguna relación causal con los precios.`
    );
  }
  if (d.territori.densitat != null && d.territori.densitatCatalunya != null) {
    out.push(
      ca
        ? `Densitat de ${Math.round(d.territori.densitat).toLocaleString("ca-ES")} hab./km² (Catalunya: ${Math.round(d.territori.densitatCatalunya).toLocaleString("ca-ES")}).`
        : `Densidad de ${Math.round(d.territori.densitat).toLocaleString("es-ES")} hab./km² (Cataluña: ${Math.round(d.territori.densitatCatalunya).toLocaleString("es-ES")}).`
    );
  }
  if (out.length === 0) {
    out.push(
      ca
        ? "Encara no hi ha indicadors demogràfics oficials suficients per a aquest municipi: no es generen conclusions."
        : "Todavía no hay indicadores demográficos oficiales suficientes para este municipio: no se generan conclusiones."
    );
  }
  return out;
}
