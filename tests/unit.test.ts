/**
 * Tests unitaris Preureal (bun test).
 * Execució: bun test tests/unit.test.ts
 */
import { describe, expect, test } from "bun:test";
import { normalizeEmail } from "../src/lib/email";
import { escapeHtml, htmlToText, sanitizeName, clientIp, hashIp } from "../src/lib/security";
import { PLANS } from "../src/lib/plans";

describe("normalizeEmail (anti-abús Gmail)", () => {
  test("elimina punts i +alias de Gmail", () => {
    expect(normalizeEmail("joan.perez+app@gmail.com")).toBe("joanperez@gmail.com");
    expect(normalizeEmail("J.O.A.N@GoogleMail.com")).toBe("joan@gmail.com");
  });
  test("no toca altres proveïdors", () => {
    expect(normalizeEmail("joan.perez@outlook.com")).toBe("joan.perez@outlook.com");
    expect(normalizeEmail("us+tag@proton.me")).toBe("us+tag@proton.me");
  });
  test("entrades degenerades", () => {
    expect(normalizeEmail("   ")).toBe("");
    expect(normalizeEmail("@gmail.com")).toBe("@gmail.com");
    expect(normalizeEmail("a@")).toBe("a@");
  });
});

describe("security: escapament i sanitització", () => {
  test("escapeHtml neutralitza XSS", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });
  test("htmlToText treu etiquetes i entitats", () => {
    expect(htmlToText("<p>Hola <b>mon</b> &amp; gent</p>")).toBe("Hola mon & gent");
    expect(htmlToText('<img src=x onerror=alert(1)>hola')).toBe("hola");
  });
  test("sanitizeName treu < > i control", () => {
    expect(sanitizeName('<script>alert("x")</script>Juan')).toBe("scriptalert(\"x\")/scriptJuan");
    expect(sanitizeName("  Ana María  ")).toBe("Ana María");
    expect(sanitizeName("")).toBeNull();
  });
  test("hashIp és SHA-256 estable i diferent per IPs diferents", () => {
    const a = hashIp("1.2.3.4");
    expect(a).toBe(hashIp("1.2.3.4"));
    expect(a).not.toBe(hashIp("1.2.3.5"));
    expect(a.length).toBe(32);
  });
  test("clientIp (P1.5): confia en l'ÚLTIM valor de x-forwarded-for, mai el primer", () => {
    // el client pot falsificar el primer valor; el darrer el posa el proxy de confiança
    const req = new Request("https://x.cat", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(clientIp(req)).toBe("10.0.0.1");
  });
  test("clientIp (P1.5): x-real-ip té prioritat (la posa l'edge, no spoofable)", () => {
    const req = new Request("https://x.cat", {
      headers: { "x-real-ip": "77.1.2.3", "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("77.1.2.3");
  });
  test("clientIp (P1.5): rebutja valors no-IP i cau en 'local' (fail-closed)", () => {
    const spoof = new Request("https://x.cat", { headers: { "x-forwarded-for": "hack; drop table" } });
    expect(clientIp(spoof)).toBe("local");
    const ipv6 = new Request("https://x.cat", { headers: { "x-forwarded-for": "2a01:c800::1" } });
    expect(clientIp(ipv6)).toBe("2a01:c800::1");
  });
});

describe("plans: valors per defecte", () => {
  test("FREE 3 consultes, il·limitats -1, features correctes", () => {
    expect(PLANS.FREE.quotaMonth).toBe(3);
    expect(PLANS.PREMIUM.quotaMonth).toBe(-1);
    expect(PLANS.PRO.features.exportCsv).toBe(true);
    expect(PLANS.FREE.features.exportCsv).toBe(false);
    expect(PLANS.PREMIUM.features.preferits).toBe(true);
    expect(PLANS.PREMIUM.features.pdfEdifici).toBe(false);
    expect(PLANS.PRO.features.pdfEdifici).toBe(true);
  });
  test("Fase 6: quota PDF/mes (pdfMonth) FREE 0, PREMIUM 5, PRO 30", () => {
    expect(PLANS.FREE.features.pdfMonth).toBe(0);
    expect(PLANS.PREMIUM.features.pdfMonth).toBe(5);
    expect(PLANS.PRO.features.pdfMonth).toBe(30);
  });
});

// ── v39 (Fase demografia) — parsers IDESCAT i agregacions ───────────────────
import { jsonStatCells, jsonStatSeries, parseEmexTables, emexTable, aggregateAgeGroups, type JsonStatDataset } from "../src/lib/idescat-parse";
import fs from "node:fs";

function fixture(name: string): JsonStatDataset {
  return JSON.parse(fs.readFileSync(`tests/fixtures/idescat/${name}`, "utf8")) as JsonStatDataset;
}

describe("v39 idescat-parse: JSON-stat (fixtures reals API 2026-11-14)", () => {
  test("pmh/446/477 sèrie de població: ordre C-order i valors plausibles", () => {
    const ds = fixture("pmh_sex.json");
    expect(ds.id).toEqual(["YEAR", "MUN", "SEX", "CONCEPT"]);
    const cells = jsonStatCells(ds);
    // 2 munis × 12 anys × 3 sexes = 72 cel·les
    expect(cells.length).toBe(72);
    const series = jsonStatSeries(ds, { geoDim: "MUN", timeDim: "YEAR", filters: { SEX: ["TOTAL"] } });
    const bcn = series.get("080193");
    expect(bcn).toBeDefined();
    expect(bcn!.length).toBe(12);
    // Barcelona padró 1 de gener 2025 ≈ 1,73M (valor real de l'API)
    const last = bcn![bcn!.length - 1];
    expect(last.year).toBe("2025");
    expect(last.value).toBeGreaterThan(1_500_000);
    // ordenat per any
    for (let i = 1; i < bcn!.length; i++) expect(bcn![i].year > bcn![i - 1].year).toBe(true);
  });

  test("Llagostera (muni petit) té sèrie i valors plausibles", () => {
    const ds = fixture("pmh_sex.json");
    const series = jsonStatSeries(ds, { geoDim: "MUN", timeDim: "YEAR", filters: { SEX: ["TOTAL"] } });
    const llag = series.get("170890");
    expect(llag).toBeDefined();
    expect(llag![llag!.length - 1].value).toBeGreaterThan(3000);
    expect(llag![llag!.length - 1].value).toBeLessThan(20000);
  });

  test("edats quinquennals amb filtre SEX=TOTAL → una fila per (any, grup)", () => {
    const ds = fixture("pmh_age.json");
    const series = jsonStatSeries(ds, { geoDim: "MUN", timeDim: "YEAR", filters: { SEX: ["TOTAL"] } });
    const bcn = series.get("080193");
    expect(bcn).toBeDefined();
    // 12 anys × (22 grups quinquennals + TOTAL): moltes files, anys únics 2011-2022
    expect(new Set(bcn!.map((p) => p.year)).size).toBe(12);
    expect(bcn![0].year).toBe("2011");
    // l'API arriba fins a 2022 (darrera publicació quinquennal)
    expect(bcn![bcn!.length - 1].year).toBe("2022");
  });

  test("nacionalitat: categories ESPA i TOTAL presents", () => {
    const ds = fixture("pmh_nac.json");
    const cells = jsonStatCells(ds);
    const nations = new Set(cells.map((c) => c.dims.NATION));
    expect(nations.has("ESPA")).toBe(true);
    expect(nations.has("TOTAL")).toBe(true);
    expect(nations.has("SEX")).toBe(false);
  });

  test("llars cens: 5 anys censals (1991-2021) i Barcelona 2021 = 671.177", () => {
    const ds = fixture("cens_llars_totals.json");
    const series = jsonStatSeries(ds, { geoDim: "MUN", timeDim: "YEAR" });
    const bcn = series.get("080193");
    expect(bcn).toBeDefined();
    const years = bcn!.map((p) => p.year);
    expect(years).toContain("1991");
    expect(years).toContain("2021");
    expect(bcn!.length).toBe(5);
    const v2021 = bcn!.find((p) => p.year === "2021")!.value;
    expect(v2021).toBe(671177); // valor real de l'API
    // Llagostera 1991 = 1.761 llars (valor real)
    const llag = series.get("170890")!;
    expect(llag.find((p) => p.year === "1991")!.value).toBe(1761);
  });

  test("indicadors de llars (cens 2021): mida mitjana i proporcions", () => {
    const ds = fixture("cens_llars.json");
    const cells = jsonStatCells(ds);
    const bcn = cells.filter((c) => c.dims.MUN === "080193");
    const avg = bcn.find((c) => c.dims.CONCEPT === "AVG_HOU_SIZE");
    expect(avg?.value).toBeCloseTo(2.37, 1);
    const g1 = bcn.find((c) => c.dims.CONCEPT === "ONE_PEOPLE_HOU_SH");
    expect(g1?.value).toBeCloseTo(31, 0);
  });

  test("divisió com: fitxa comarcal amb label llegible", () => {
    const ds = fixture("pmh_sex_com.json");
    const cells = jsonStatCells(ds);
    const coms = new Set(cells.map((c) => c.dims.COM));
    expect(coms.has("01")).toBe(true); // Alt Camp
    const one = cells.find((c) => c.dims.COM === "01");
    expect(one?.labels.COM).toBe("Alt Camp");
  });
});

describe("v39 idescat-parse: emex (El municipi en xifres)", () => {
  test("extreu superfície, densitat i llars amb tripletta [muni, comarca, CAT]", () => {
    const tables = parseEmexTables(JSON.parse(fs.readFileSync("tests/fixtures/idescat/emex_bcn.json", "utf8")));
    expect(tables.length).toBeGreaterThan(50);
    const dens = emexTable(tables, "Densitat de població");
    expect(dens).not.toBeNull();
    const f262 = dens!.indicators.find((i) => i.id === "f262");
    expect(f262).toBeDefined();
    expect(f262!.values[0]).toBeCloseTo(16904.3, 1); // Barcelona
    expect(f262!.values[2]).toBeCloseTo(253.0, 1);   // Catalunya
    expect(f262!.ref).toBe("2025");
    const llars = emexTable(tables, "Llars. Per grandària de la llar");
    expect(llars?.ref).toBe("2021"); // cens
    const f107 = llars!.indicators.find((i) => i.id === "f107");
    expect(f107!.values[0]).toBeGreaterThan(600_000);
    const font = (llars!.sourceText ?? "").toLowerCase();
    expect(font).toContain("cens");
  });

  test("variant B (ff directe) i variant A (tt.t.ff) es cobreixen ambdos fixtures", () => {
    for (const f of ["emex_bcn.json", "emex_llagostera.json"]) {
      const tables = parseEmexTables(JSON.parse(fs.readFileSync(`tests/fixtures/idescat/${f}`, "utf8")));
      expect(emexTable(tables, "Densitat de població")).not.toBeNull();
      expect(emexTable(tables, "Llars. Per grandària de la llar")).not.toBeNull();
    }
  });
});

describe("v39 agregacions demogràfiques oficials", () => {
  test("grans grups: suma de components quinquennals, tot-o-res per any", () => {
    const full = aggregateAgeGroups({
      Y000_004: 100, Y005_009: 110, Y010_014: 120,
      Y015_019: 130, Y020_024: 140, Y025_029: 150, Y030_034: 160, Y035_039: 170,
      Y040_044: 180, Y045_049: 190, Y050_054: 200, Y055_059: 210, Y060_064: 220,
      Y065_069: 230, Y070_074: 240, Y075_079: 250, Y080_084: 260,
      Y085_089: 120, Y090_094: 80, Y095_099: 40, Y_GE100: 30,
    });
    expect(full).not.toBeNull();
    expect(full!["0_14"]).toBe(330);
    expect(full!["15_64"]).toBe(1750);
    expect(full!["65_84"]).toBe(980);
    expect(full!["85_mes"]).toBe(270);
    // cap grup complet → null (mai s'estima)
    expect(aggregateAgeGroups({ Y000_004: 100, Y005_009: 110 })).toBeNull();
    // un grup complet i un incomplet: el complet es desa, l'incomplet no
    const mixed = aggregateAgeGroups({
      Y000_004: 100, Y005_009: 110, Y010_014: 120,
      Y015_019: 130, /* la resta de 15-64 falten */
    });
    expect(mixed).not.toBeNull();
    expect(mixed!["0_14"]).toBe(330);
    expect(mixed!["15_64"]).toBeUndefined();
    expect(full!["85_mes"]).toBe(270); // 120+80+40+30
  });
});
