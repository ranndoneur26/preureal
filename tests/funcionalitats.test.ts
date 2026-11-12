/**
 * Preureal — Noves funcionalitats (F1-F4): tests de les funcions pura de
 * src/lib/territorial.ts (agregacions territorials + motor de valoració) i
 * del gating ampliat (src/lib/indicators-gating.ts).
 *
 * Metodologia validada pel propietari (INFORME_AUDITORIA_FUNCIONALIDADES.md §5):
 * unitat €/mes per habitatge; comarca/província = mediana dels municipis amb
 * dada EL MATEIX ANY; valoració v1 amb dispersió mesurada (cap coeficient
 * inventat); secció censal/districte sempre no disponibles.
 */
import { describe, expect, test } from "bun:test";
import {
  aggregateByYear,
  computeValuation,
  extremesOfYear,
  interannualPct,
  medianOf,
  muniSeries,
  quartilesOf,
  relativeIqr,
  valueForYear,
  yearOfPeriod,
  type MuniRentRow,
} from "../src/lib/territorial";
import { gateIndicators, type IndicatorAllowFlags } from "../src/lib/indicators-gating";
import type { MuniIndicators } from "../src/lib/indicators";

const row = (name: string, history: Record<string, number> | null, opts: Partial<MuniRentRow> = {}): MuniRentRow => ({
  name,
  comarca: "Segrià",
  province: "Lleida",
  history,
  latest: null,
  period: null,
  contracts: 50,
  ...opts,
});

const flags = (over: Partial<IndicatorAllowFlags> = {}): IndicatorAllowFlags => ({
  referenciaAmpliada: true,
  indicadorsTerritorials: true,
  evolucioTemporal: true,
  comparativaTerritorial: true,
  ...over,
});

describe("medianOf i quartils", () => {
  test("mediana senar i parell; buit → null", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    expect(medianOf([])).toBeNull();
    expect(medianOf([null, undefined, 0])).toBeNull(); // 0 no és valor vàlid
  });

  test("quartils tipus 7 i RIQ relatiu", () => {
    const q = quartilesOf([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])!;
    expect(q.p50).toBe(550);
    expect(relativeIqr([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])).toBeCloseTo((q.p75 - q.p25) / q.p50, 6);
    expect(relativeIqr([])).toBeNull();
  });
});

describe("yearOfPeriod i valueForYear", () => {
  test("extreu l'any del període", () => {
    expect(yearOfPeriod("2025")).toBe("2025");
    expect(yearOfPeriod("2026 I trim.")).toBe("2026");
    expect(yearOfPeriod(null)).toBeNull();
    expect(yearOfPeriod("sense any")).toBeNull();
  });

  test("history primer, latest com a fallback del període vigent", () => {
    const r = row("A", { 2024: 800 }, { latest: 900, period: "2025" });
    expect(valueForYear(r, "2024")).toBe(800);
    expect(valueForYear(r, "2025")).toBe(900); // fallback del període vigent
    expect(valueForYear(r, "2020")).toBeNull();
  });
});

describe("aggregateByYear (mediana/any validada)", () => {
  test("només anys amb ≥minN municipis; sense barrejar anys", () => {
    const rows: MuniRentRow[] = [
      row("A", { 2024: 700, 2025: 800 }),
      row("B", { 2024: 900, 2025: 1000 }),
      row("C", { 2024: 1100 }), // 2025 no en té
      row("D", null, { latest: 1200, period: "2025" }), // fallback
    ];
    const agg = aggregateByYear(rows);
    const y2024 = agg.find((a) => a.year === "2024")!;
    const y2025 = agg.find((a) => a.year === "2025")!;
    expect(y2024.median).toBe(900);
    expect(y2024.n).toBe(3);
    expect(y2025.median).toBe(1000); // mediana de 800, 1000, 1200
    expect(y2025.n).toBe(3);
  });

  test("anys amb pocs municipis queden fora (minN)", () => {
    const rows: MuniRentRow[] = [row("A", { 2024: 700 }), row("B", { 2024: 900 })];
    expect(aggregateByYear(rows).find((a) => a.year === "2024")).toBeUndefined();
    expect(aggregateByYear(rows, 2).find((a) => a.year === "2024")!.median).toBe(800);
  });
});

describe("extremesOfYear", () => {
  test("més car i més barat amb nom; <minN → null", () => {
    const rows: MuniRentRow[] = [
      row("Alcoletge", { 2025: 700 }),
      row("Lleida", { 2025: 850 }),
      row("Alpicat", { 2025: 1000 }),
    ];
    const ex = extremesOfYear(rows, "2025")!;
    expect(ex.car).toEqual({ name: "Alpicat", value: 1000 });
    expect(ex.barat).toEqual({ name: "Alcoletge", value: 700 });
    expect(extremesOfYear(rows.slice(0, 2), "2025")).toBeNull();
  });
});

describe("interannualPct (només anys consecutius)", () => {
  test("salt amb forat NO es publica com a interanual", () => {
    const s = muniSeries({ 2018: 800, 2019: 880, 2021: 1000, 2022: 1050 });
    const out = interannualPct(s);
    expect(out.map((p) => p.year)).toEqual(["2019", "2022"]); // 2018→2020 (forat) fora
    expect(out[0].pct).toBe(10);
    expect(out[1].pct).toBeCloseTo(5, 6);
  });
});

describe("computeValuation (motor F4 validat)", () => {
  const base: Parameters<typeof computeValuation>[0] = {
    rentLatest: 1000,
    rentPeriod: "2025",
    contracts: 150,
    history: { 2020: 850, 2021: 900, 2022: 950, 2023: 980, 2024: 1000, 2025: 1000 },
    comarcaValues: [800, 850, 900, 950, 1000, 1100, 1150, 1200],
    provinciaValues: [],
  };

  test("central = fiança municipal ajustada per superfície (v2); banda = dispersió de comarca", () => {
    const out = computeValuation(base, { surfaceM2: 75 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // v2 (metodologia validada §5): ajust hedònic per superfície sobre la
    // vivenda típica de 85 m², β = 0,8 — constants VAL_REF_M2/VAL_BETA_SUPERFICIE
    const central = 1000 * Math.pow(75 / 85, 0.8);
    expect(out.result.baseCentral).toBe(1000);
    expect(out.result.central).toBeCloseTo(central, 1);
    expect(out.result.bandBasis).toBe("COMARCA");
    expect(out.result.bandN).toBe(8);
    expect(out.result.bandYear).toBe("2025");
    const disp = relativeIqr(base.comarcaValues)!;
    expect(out.result.min).toBeCloseTo(central * (1 - disp / 2), 0);
    expect(out.result.max).toBeCloseTo(central * (1 + disp / 2), 0);
    expect(out.result.eurM2).toBeCloseTo(central / 75, 1);
  });

  test("confiança ALTA amb període recent, molts contractes i base comarca", () => {
    const out = computeValuation(base, {});
    expect(out.ok && out.result.confidence).toBe("ALTA");
  });

  test("fallback província si la comarca té poc pool", () => {
    const prov = [400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100];
    const out = computeValuation({ ...base, comarcaValues: [900, 1000, 1100], provinciaValues: prov }, {});
    expect(out.ok && out.result.bandBasis).toBe("PROVINCIA");
  });

  test("fallback històric si no hi ha cap pool suficient", () => {
    const out = computeValuation({ ...base, comarcaValues: [], provinciaValues: [] }, {});
    expect(out.ok && out.result.bandBasis).toBe("HISTORICA");
  });

  test("confiança BAIXA amb període vell i pocs contractes", () => {
    const out = computeValuation({ ...base, rentPeriod: "2017", contracts: 8 }, {});
    expect(out.ok && out.result.confidence).toBe("BAIXA");
    expect(out.ok && out.result.confidenceKeys).toContain("CONF_PERIODE_VELL");
  });

  test("sense fiança municipal → NO_RENT (mai s'inventa)", () => {
    const out = computeValuation({ ...base, rentLatest: null }, {});
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("NO_RENT");
  });

  test("ajustos hedònics v2: superfície, estat i habitacions SÍ canvien els números", () => {
    const out = computeValuation(base, { rooms: 1, estat: "OBRA_NOVA", surfaceM2: 50 });
    expect(out.ok && out.result.notes.rooms).toBe("ROOMS_LOW");
    expect(out.ok && out.result.notes.estat).toBe("OBRA_NOVA");
    expect(out.ok && out.result.notes.surface).toBe("SURFACE_DERIVED");
    // v2 (constants documentades a territorial.ts): superfície (β=0,8) →
    // estat OBRA_NOVA ×1,12 → densitat d'habitacions clampada a ±5%.
    const central = 1000 * Math.pow(50 / 85, 0.8) * 1.12 * Math.min(Math.pow(50 / 30, 0.1), 1.05);
    expect(out.ok && out.result.central).toBeCloseTo(central, 1);
    // i sense característiques, central = base (vivenda típica)
    const sense = computeValuation(base, {});
    expect(out.ok && sense.ok && out.result.central !== sense.result.central).toBe(true);
    expect(out.ok && sense.ok && sense.result.central === sense.result.baseCentral).toBe(true);
  });

  test("superfície fora de rang → eurM2 null (sense divisòries impossibles)", () => {
    const out = computeValuation(base, { surfaceM2: 0 });
    expect(out.ok && out.result.eurM2).toBeNull();
  });

  test("dispersió saturada: mai horquilles > ±30 %", () => {
    const out = computeValuation({ ...base, comarcaValues: [100, 100, 200, 200, 300, 300, 400, 5000] }, {});
    expect(out.ok && out.result.relativeDispersion).toBeLessThanOrEqual(0.6);
  });
});

describe("gateIndicators amb els flags nous (F1/F2/F3)", () => {
  const full = {
    muni: { code: "080193", ineCode: "08019", name: "Barcelona", comarca: "Barcelonès", province: "Barcelona", rentLatest: 1134.6, rentPeriod: "2025" },
    generatedAt: "2026-11-11T00:00:00Z",
    price: null,
    band: null,
    posVsMedian: null,
    refBand: null,
    ipva: { catalunya: null, provincia: null, municipi: null },
    renta: { municipi: { hogar: null, persona: null } },
    effort: { hogar: null, persona: null },
    terrDelta: { rentaVsProvincia: null, rentaVsCatalunya: null, rentaVsEspanya: null },
    fontsUsed: [],
    avisos: [],
    evolucio: { muni: [{ year: "2020", value: 1071 }, { year: "2021", value: 984 }], interanual: [], comarca: null, provincia: null, muniPeriod: "2025", volatileJump: false },
    comparativa: { year: "2025", muni: { value: 1134.6, period: "2025" }, comarca: null, provincia: null, deltaComarcaPct: null, deltaProvinciaPct: null, extremes: null, seccioCensalDisponible: false as const },
    effortCatalunya: null,
    catalunyaRentYear: null,
  } as unknown as MuniIndicators;

  test("PREMIUM amb flags: els bundles surten", () => {
    const g = gateIndicators(full, "PREMIUM", flags());
    expect(g.evolucio?.muni.length).toBe(2);
    expect(g.comparativa?.year).toBe("2025");
  });

  test("FREE: cap bundle premium surt de l'API", () => {
    const g = gateIndicators(full, "FREE", flags());
    expect(g.evolucio).toBeNull();
    expect(g.comparativa).toBeNull();
    expect(g.effortCatalunya).toBeNull();
    expect(g.teaser?.evolucioDisponible).toBe(true);
    expect(g.teaser?.comparativaDisponible).toBe(true);
  });

  test("PREMIUM amb flag desactivat des de l'admin: tallat", () => {
    const g = gateIndicators(full, "PREMIUM", flags({ evolucioTemporal: false, comparativaTerritorial: false }));
    expect(g.evolucio).toBeNull();
    expect(g.comparativa).toBeNull();
  });
});
