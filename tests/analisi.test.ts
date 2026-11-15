/**
 * v42 — Tests de l'eina «Anàlisi del mercat residencial»: calculadora PURA
 * (creuament renda × contractes × població, creixements, lectures). Sense BD
 * ni xarxa. Regles que cobreix: cruïlla només en anys amb les DUES sèries,
 * població mai interpolada, volum aproximat etiquetat, creixements amb base
 * disponible anterior (mai futura), JSON defensiu.
 */
import { describe, expect, test } from "bun:test";
import {
  buildCrossover,
  buildInterpretacio,
  growthPct,
  parseRentHistory,
  type SeriePoint,
} from "../src/lib/analisi-calc";

const rent: SeriePoint[] = [
  { year: "2015", value: 600 },
  { year: "2020", value: 900 },
  { year: "2025", value: 1200 },
];
const contracts: SeriePoint[] = [
  { year: "2015", value: 2000 },
  { year: "2018", value: 2200 }, // any sense renda → no entra a la cruïlla
  { year: "2020", value: 1800 },
  { year: "2025", value: 1500 },
];
const pop: SeriePoint[] = [
  { year: "2015", value: 100000 },
  { year: "2020", value: 104000 },
  { year: "2023", value: 106000 },
  { year: "2025", value: 108000 },
];

describe("analisi — parseRentHistory (JSON defensiu de Municipality)", () => {
  test("parseja anys vàlids i ordena", () => {
    const s = parseRentHistory('{"2016": 700.5, "2005": 550.2, "2025": 1304.1}');
    expect(s).toEqual([
      { year: "2005", value: 550.2 },
      { year: "2016", value: 700.5 },
      { year: "2025", value: 1304.1 },
    ]);
  });
  test("descarta claus no anuals i valors no positius; JSON trencat → sèrie buida", () => {
    expect(parseRentHistory('{"2025x": 100, "2026": -5, "2027": 0, "2028": "n.d."}')).toEqual([]);
    expect(parseRentHistory("no soc json")).toEqual([]);
    expect(parseRentHistory(null)).toEqual([]);
    expect(parseRentHistory("[1,2,3]")).toEqual([]);
  });
});

describe("analisi — growthPct (creixement amb base disponible)", () => {
  test("base exacta fa N anys", () => {
    const g = growthPct(rent, 10); // 2025 vs 2015
    expect(g.fromYear).toBe("2015");
    expect(g.toYear).toBe("2025");
    expect(g.pct).toBe(100);
    expect(g.abs).toBe(600);
  });
  test("si falta l'any exacte, agafa l'anterior disponible (mai futur)", () => {
    const g = growthPct(rent, 7); // target 2018 → agafa 2015
    expect(g.fromYear).toBe("2015");
    expect(g.pct).toBe(100);
  });
  test("sèrie buida o base no positiva → null", () => {
    expect(growthPct([], 10).pct).toBeNull();
    const g = growthPct([{ year: "2020", value: 0 }, { year: "2025", value: 10 }], 5);
    expect(g.pct).toBeNull();
  });
});

describe("analisi — buildCrossover (creuament any a any)", () => {
  const c = buildCrossover(rent, contracts, pop);

  test("només anys amb renda I contractes (2018 queda fora, tot i tenir contractes)", () => {
    expect(c.map((p) => p.year)).toEqual(["2015", "2020", "2025"]);
  });

  test("volum aproximat = renda × 12 × contractes", () => {
    expect(c[0].volumeEur).toBe(600 * 12 * 2000);
    expect(c[2].volumeEur).toBe(1200 * 12 * 1500);
  });

  test("població només de l'any exacte (mai interpolada) i contractes/1.000 hab", () => {
    expect(c[0].population).toBe(100000);
    expect(c[0].contractsPer1k).toBe(20); // 2000/100000×1000
    expect(c[1].population).toBe(104000);
    expect(c[2].contractsPer1k).toBeCloseTo(13.89, 1); // 1500/108000×1000
  });

  test("sèries buides → creuament buit (mai inventat)", () => {
    expect(buildCrossover([], [], [])).toEqual([]);
    expect(buildCrossover(rent, [], pop)).toEqual([]);
  });
});

describe("analisi — buildInterpretacio (lectures descriptives, no causals)", () => {
  const input = {
    rentG10: { pct: 100, fromYear: "2015", toYear: "2025" },
    popG10: { pct: 8, fromYear: "2015", toYear: "2025" },
    contractsG5: { pct: -16.7, fromYear: "2020", toYear: "2025" },
    lastVolume: { year: "2025", volumeEur: 21_600_000 },
    lastPer1k: { year: "2025", value: 13.89 },
    censusPct: 28.34,
    censusYear: "2021",
  };

  test("genera lectures amb les xifres exactes i el avís de no-causalitat", () => {
    const ca = buildInterpretacio(input, "ca");
    expect(ca.length).toBe(5);
    expect(ca[0]).toContain("+100,0%");
    expect(ca[0]).toContain("+8,0%");
    expect(ca[0]).toContain("sense relació causal");
    expect(ca[1]).toContain("FLUX anual");
    expect(ca[2]).toContain("21.600.000");
    expect(ca[3]).toContain("13,89");
    expect(ca[4]).toContain("28,34%");
  });

  test("versió espanyola equivalent", () => {
    const es = buildInterpretacio(input, "es");
    expect(es[0]).toContain("sin relación causal");
    expect(es[1]).toContain("FLUJO anual");
  });

  test("amb tot buit no genera lectures falses", () => {
    const out = buildInterpretacio(
      {
        rentG10: { pct: null, fromYear: null, toYear: null },
        popG10: { pct: null, fromYear: null, toYear: null },
        contractsG5: { pct: null, fromYear: null, toYear: null },
        lastVolume: null,
        lastPer1k: null,
        censusPct: null,
        censusYear: null,
      },
      "ca"
    );
    expect(out.length).toBe(0);
  });
});
