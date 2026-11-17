/**
 * v60 — Pas 1 «Motor de dades»: filtre d'atípics, projecció de tendència i
 * cau en memòria.
 *
 *  S1 — IQR (Tukey k=1.5) + z-score robust (MAD): dades netes mai es toquen;
 *       atípics exclosos; no-op amb mostres insuficients i MAD=0.
 *  S2 — Filtre ponderat per mostres d'edifici (contractes com a pes).
 *  S3 — Projecció OLS 12–24 mesos: pendents, R², bandes, mai negatius,
 *       null amb sèries curtes, etiquetatge orientatiu a la font.
 *  S4 — Cau en memòria: coalescing, TTL, clear i estadístiques.
 *  S5 — Integració: la banda d'indicadors filtra atípics amb traçabilitat i
 *       /api/analisi exposa la projecció + cau (guardes de codi font).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  filterOutliersIqr,
  filterOutliersRobustZ,
  filterWeightedOutliersIqr,
  iqrBounds,
  quartilesSorted,
  robustZScores,
} from "../src/lib/stats";
import { buildLinearForecast } from "../src/lib/forecast";
import { cacheClear, cacheGet, cached, cacheStats } from "../src/lib/cache";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("S1 — filtre d'atípics IQR i z-score robust", () => {
  test("quartils tipus 7 sobre dades trivials", () => {
    const q = quartilesSorted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])!;
    expect(q.q1).toBeCloseTo(3.25, 6);
    expect(q.median).toBeCloseTo(5.5, 6);
    expect(q.q3).toBeCloseTo(7.75, 6);
    expect(quartilesSorted([])).toBeNull();
  });

  test("fronteres de Tukey amb un atípic clar", () => {
    const b = iqrBounds([450, 480, 500, 520, 540, 560, 580, 600, 620, 50000], 1.5)!;
    expect(b.hi).toBeLessThan(50000);
    expect(b.lo).toBeGreaterThan(0);
  });

  test("dades netes: el filtre NO altera res (zero regressió)", () => {
    const clean = [520, 540, 560, 580, 600, 620, 640, 660, 680, 700];
    const r = filterOutliersIqr(clean, 1.5, 8);
    expect(r.applied).toBe(false);
    expect(r.removed).toHaveLength(0);
    expect(r.kept).toEqual(clean);
  });

  test("un error tipogràfic (50000) queda fora; la resta intacta", () => {
    const data = [450, 480, 500, 520, 540, 560, 580, 600, 620, 50000];
    const r = filterOutliersIqr(data, 1.5, 8);
    expect(r.applied).toBe(true);
    expect(r.removed).toEqual([50000]);
    expect(r.kept).toHaveLength(9);
    expect(r.kept).toContain(450);
    expect(r.kept).toContain(620);
  });

  test("n < minN: no-op (protecció de municipis petits)", () => {
    const small = [100, 100000, 200, 300];
    const r = filterOutliersIqr(small, 1.5, 8);
    expect(r.applied).toBe(false);
    expect(r.kept).toEqual(small);
  });

  test("z-score robust: MAD=0 → null i el filtre queda en no-op (mai divideix per zero)", () => {
    expect(robustZScores([700, 700, 700, 700])).toBeNull();
    // 8 valors idèntics + un extrem: MAD=0 → el filtre NO decideix (no-op)
    const r = filterOutliersRobustZ([700, 700, 700, 700, 700, 700, 700, 700, 50000]);
    expect(r).not.toBeNull();
    expect(r!.applied).toBe(false);
    expect(r!.kept).toHaveLength(9);
  });

  test("z-score robust detecta l'atípic amb dispersió real", () => {
    const data = [450, 480, 500, 520, 540, 560, 580, 600, 620, 50000];
    const r = filterOutliersRobustZ(data, 3.5, 8);
    expect(r.applied).toBe(true);
    expect(r.removed).toEqual([50000]);
    expect(r.kept).toHaveLength(9);
  });

  test("valors no finits es descarten abans de calcular", () => {
    const r = filterOutliersIqr([1, NaN, Infinity, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1.5, 8);
    expect(r.kept.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("S2 — filtre ponderat (mostres d'edifici amb contractes)", () => {
  test("el pes afecta els quartils però cada edifici es decideix un cop", () => {
    const samples = Array.from({ length: 9 }, (_, i) => ({ value: 500 + i * 20, weight: 50 }));
    samples.push({ value: 45000, weight: 1 });
    const f = filterWeightedOutliersIqr(samples, 1.5, 8);
    expect(f.applied).toBe(true);
    expect(f.removedCount).toBe(1);
    expect(f.kept).toHaveLength(9);
  });

  test("menys de 8 edificis: no-op", () => {
    const f = filterWeightedOutliersIqr(
      [{ value: 500 }, { value: 90000 }, { value: 600 }],
      1.5,
      8,
    );
    expect(f.applied).toBe(false);
    expect(f.removedCount).toBe(0);
    expect(f.kept).toHaveLength(3);
  });

  test("entrada buida o invàlida → buit, mai crash", () => {
    expect(filterWeightedOutliersIqr(null).kept).toEqual([]);
    expect(filterWeightedOutliersIqr([]).kept).toEqual([]);
    expect(filterWeightedOutliersIqr([{ value: NaN }, { value: 0 }, { value: -5 }]).kept).toEqual([]);
  });
});

describe("S3 — projecció de tendència OLS 12–24 mesos", () => {
  const uptrend = [
    { year: "2019", value: 500 },
    { year: "2020", value: 520 },
    { year: "2021", value: 545 },
    { year: "2022", value: 570 },
    { year: "2023", value: 600 },
  ];

  test("tendència lineal perfecta: pendent ≈ 25 €/any, R² alt, bandes que contenen el punt", () => {
    const f = buildLinearForecast(uptrend, 2)!;
    expect(f).not.toBeNull();
    expect(f.method).toBe("linear");
    expect(Math.abs(f.slopeEurYear - 25)).toBeLessThan(1.5);
    expect(f.r2).toBeGreaterThan(0.95);
    expect(f.baseYear).toBe("2023");
    expect(f.points).toHaveLength(2);
    expect(f.points[0].year).toBe("2024");
    expect(f.points[1].year).toBe("2025");
    expect(f.points[0].lo).toBeLessThanOrEqual(f.points[0].value);
    expect(f.points[0].value).toBeLessThanOrEqual(f.points[0].hi);
    expect(f.points[0].value).toBeGreaterThan(600);
    expect(f.volatile).toBe(false);
  });

  test("sèries curtes (<4 anys) → null (mai una recta fràgil)", () => {
    expect(buildLinearForecast(uptrend.slice(0, 3), 2)).toBeNull();
    expect(buildLinearForecast([], 2)).toBeNull();
    expect(buildLinearForecast([{ year: "2020", value: 500 }], 1)).toBeNull();
  });

  test("horitzó vàlid: 1 o 2 anys (12–24 mesos), mai més", () => {
    const f1 = buildLinearForecast(uptrend, 1)!;
    expect(f1).not.toBeNull();
    expect(f1.points).toHaveLength(1);
    expect(f1.horizonYears).toBe(1);
    // el paràmetre és tipat: a runtime, qualsevol altre valor → null
    expect(buildLinearForecast(uptrend, 3 as 1 | 2)).toBeNull();
  });

  test("mai projeccions negatives (sèrie en caiguda forta es trunca amb integritat)", () => {
    const crash = [
      { year: "2018", value: 900 },
      { year: "2019", value: 400 },
      { year: "2020", value: 100 },
      { year: "2021", value: 30 },
    ];
    const f = buildLinearForecast(crash, 2);
    if (f) {
      for (const p of f.points) {
        expect(p.value).toBeGreaterThan(0);
        expect(p.lo).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("sèries amb anys no anuals o valors no finits es descarten", () => {
    const messy = [
      { year: "2020-T1", value: 500 },
      { year: "2020", value: NaN },
      { year: "2021", value: 520 },
      { year: "2022", value: 530 },
      { year: "2023", value: 545 },
      { year: "2024", value: 570 },
    ];
    const f = buildLinearForecast(messy, 2)!;
    expect(f).not.toBeNull();
    expect(f.baseYear).toBe("2024");
    // només entren anys anuals amb valor positiu: 2021, 2022 i 2024 → 3+base
    expect(f.points.every((p) => /^\d{4}$/.test(p.year))).toBe(true);
    expect(f.points.map((p) => p.year)).toEqual(["2025", "2026"]);
  });
});

describe("S4 — cau en memòria amb TTL, coalescing i estadístiques", () => {
  test("miss → hit: una sola execució serveix totes les crides", async () => {
    cacheClear("test1");
    let calls = 0;
    const fn = async () => {
      calls++;
      return { n: 42 };
    };
    const [a, b, c] = await Promise.all([
      cached("test1:k", 60_000, fn),
      cached("test1:k", 60_000, fn),
      cached("test1:k", 60_000, fn),
    ]);
    expect(a).toEqual({ n: 42 });
    expect(b).toEqual({ n: 42 });
    expect(c).toEqual({ n: 42 });
    expect(calls).toBe(1); // coalescing: 3 crides concurrents → 1 consulta
    const again = await cached("test1:k", 60_000, fn);
    expect(again).toEqual({ n: 42 });
    expect(calls).toBe(1); // TTL vigent → encara sense recalcul
  });

  test("TTL vencut: es recalcula (mai dades congelades per sempre)", async () => {
    cacheClear("test2");
    let calls = 0;
    const fn = async () => ++calls;
    const first = await cached("test2:k", 5, fn);
    expect(first).toBe(1);
    await new Promise((r) => setTimeout(r, 25));
    const second = await cached("test2:k", 5, fn);
    expect(second).toBe(2);
    expect(cacheGet("test2:k")).toBe(2);
  });

  test("els errors NO es cauen: la següent crida reexecuta", async () => {
    cacheClear("test3");
    let attempts = 0;
    const failing = async () => {
      attempts++;
      if (attempts === 1) throw new Error("bd momentània");
      return "ok";
    };
    await expect(cached("test3:k", 60_000, failing)).rejects.toThrow("bd momentània");
    const v = await cached("test3:k", 60_000, failing);
    expect(v).toBe("ok");
  });

  test("cacheClear(prefix) i cacheStats són operatius", async () => {
    cacheClear();
    await cached("test4:a", 60_000, async () => 1);
    await cached("test4:b", 60_000, async () => 2);
    expect(cacheStats().size).toBeGreaterThanOrEqual(2);
    cacheClear("test4:a");
    expect(cacheGet("test4:a")).toBeNull();
    expect(cacheGet("test4:b")).toBe(2);
    cacheClear();
    expect(cacheStats().size).toBe(0);
  });
});

describe("S5 — integració al producte (guardes de codi font)", () => {
  const indData = readSrc("../src/lib/indicators-data.ts");

  test("la banda d'indicadors filtra atípics IQR ponderats", () => {
    expect(indData).toContain("filterWeightedOutliersIqr");
    expect(indData).toContain("filtre IQR");
  });

  test("la traçabilitat de la banda declara les exclusions quan n'hi ha", () => {
    expect(indData).toContain("filtre IQR)`");
    expect(indData).toContain("bandBasis:");
  });

  test("getMuniIndicators i loadRelevantObservations usen el cau", () => {
    expect(indData).toContain("cached(`indicators:${muniCode}:p${opts.price ?? \"none\"}`");
    expect(indData).toContain("cached(`obs:");
  });

  test("l'anàlisi pública incorpora la projecció i el cau", () => {
    const analisi = readSrc("../src/lib/analisi.ts");
    expect(analisi).toContain("buildLinearForecast(rentSerie, 2)");
    expect(analisi).toContain("cached(`analisi:${codeSafe}:${locale}`");
    expect(analisi).toContain("forecast,");
    // la font de la projecció queda etiquetada com a orientativa i NO oficial
    expect(analisi).toContain("NO és una previsió ni una valoració oficial");
  });

  test("el motor de valoració (coeficients N1/N2) resta intacte", () => {
    const territorial = readSrc("../src/lib/territorial.ts");
    expect(territorial).toContain("VAL_REF_M2 = 85");
    expect(territorial).toContain("VAL_BETA_SUPERFICIE = 0.8");
  });
});
