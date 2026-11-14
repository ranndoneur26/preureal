/**
 * Fase 6 (v34) — tests de l'informe PDF de 8 pàgines (src/lib/pdf-report.ts).
 * Execució: bun test tests/pdf_report.test.ts
 * El constructor és PURA: cap BD ni auth; dades d'exemple completes i degradades.
 */
import { describe, expect, test } from "bun:test";
import { inflateSync } from "zlib";
import { PDFDocument } from "pdf-lib";
import { buildReportPdf, REPORT_PAGES, winAnsi, type ReportInput } from "../src/lib/pdf-report";

const base: ReportInput = {
  mun: {
    name: "Barcelona",
    comarca: "Barcelonès",
    province: "Barcelona",
    code: "080193",
    rentLatest: 1134.2,
    rentPeriod: "2026-T1",
    rentPrevYear: 1080,
    rentPrevPeriod: "2025-T4",
    contractsLatest: 25340,
    isTense: true,
    tenseList: "C",
    rentHistory: JSON.stringify({
      "2005": 600, "2007": 680, "2010": 720, "2014": 680,
      "2019": 850, "2021": 920, "2023": 1050, "2024": 1100, "2025": 1134,
    }),
  },
  building: null,
  ind: {
    band: { p25: 900, p50: 1050, p75: 1300, n: 42, totalWeight: 1800 },
    effortHogar: { pct: 21.14, rentEurMonth: 1134, rentPeriod: "2026-T1", rentaAnual: 45000, rentaPeriod: "2024" },
    rentaHogarLatest: { value: 45000, period: "2024" },
    ipvaCat: { latestAnual: { value: 2.9, period: "2026-08" }, acum2015: { value: 28.4 } },
  },
  // v39 — context demogràfic IDESCAT (dades reals de Barcelona, fixture API)
  demo: {
    poblacio: {
      actual: 1731649,
      any: "2025",
      serie: [
        { year: "2014", value: 1602386 }, { year: "2015", value: 1604555 },
        { year: "2016", value: 1608746 }, { year: "2017", value: 1620809 },
        { year: "2018", value: 1620343 }, { year: "2019", value: 1636762 },
        { year: "2020", value: 1664182 }, { year: "2021", value: 1636732 },
        { year: "2022", value: 1659987 }, { year: "2023", value: 1701763 },
        { year: "2024", value: 1708014 }, { year: "2025", value: 1731649 },
      ],
      var5Pct: 5.6,
      var10Pct: 8.1,
      homes: 819966,
      dones: 893281,
    },
    edats: {
      g0_14: 240155, g15_64: 1099571, g65_84: 302511, g85_mes: 68933,
      any: "2025", pct65: 21.5, pct0_14: 14.0,
    },
    llars: {
      total: 671177, totalAny: "2021", midaMitjana: 2.5, midaAny: "2021",
      distribucioPct: { g1: 31.0, g2: 30.6, g3: 18.9, g4: 13.3, g5: 6.2 },
    },
    estrangera: { valor: 437663, pct: 25.5, any: "2022", pctCat: 18.7 },
    territori: { superficieKm2: 101.35, densitat: 16904.3, densitatCat: 253.0 },
    comarca: { poblacioActual: 2398280, densitat: 16454.8, pct65: 20.2, comarca: "Barcelonès" },
    cat: { poblacioActual: 8124126, pct65: 19.7 },
    interpretacio: [
      "Creixement demogràfic positiu durant l'última dècada (+8.1% d'habitants, períodes 2015-2025).",
      "El 21.5% de la població té 65 anys o més, per sobre de la mitjana catalana (indicador: grans grups d'edat del padró).",
    ],
  },
  aids: [
    {
      title: "Bono alquiler joven (programa estatal)",
      amount: "250 €/mes, màx. 24 mesos",
      audience: "Joves de 18 a 35 anys amb ingressos < 3× IPREM",
      source: "Ministerio de Vivienda y Agenda Urbana (RD 42/2022)",
      url: "https://www.vivienda.gob.es/",
      reviewed: "2026-11-10",
    },
  ],
  subscriberMasked: "ma***@exemple.cat",
  planLabel: "Premium",
  genDate: "11 de novembre de 2026",
};

async function pageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/** Extreu i descomprimeix els content streams (pdf-lib usa FlateDecode) i
 *  descodifica els operadors de text hex (<5370...> Tj) per poder afirmar
 *  sobre el text real del document. */
function extractText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let raw = "";
  let i = 0;
  for (;;) {
    const s = buf.indexOf(Buffer.from("stream\n"), i);
    if (s === -1) break;
    const e = buf.indexOf(Buffer.from("endstream"), s);
    if (e === -1) break;
    const chunk = buf.subarray(s + 7, e);
    try {
      raw += inflateSync(chunk).toString("latin1") + "\n";
    } catch {
      raw += chunk.toString("latin1") + "\n"; // stream sense comprimir
    }
    i = e + 9;
  }
  // <hex> Tj → text WinAnsi (les paraules de cerca són ASCII, sense accents)
  return raw.replace(/<([0-9A-Fa-f]+)>\s*Tj/g, (_m, hex: string) => {
    let s = "";
    for (let j = 0; j + 1 < hex.length; j += 2) {
      s += String.fromCharCode(parseInt(hex.slice(j, j + 2), 16));
    }
    return s;
  });
}

describe("Fase 6: informe PDF de 9 pàgines", () => {
  test("municipi amb totes les dades → 9 pàgines i magic bytes %PDF", async () => {
    const bytes = await buildReportPdf(base);
    const head = String.fromCharCode(...bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(await pageCount(bytes)).toBe(REPORT_PAGES);
  });

  test("degradació: sense indicadors, sense ajudes, sense històric, sense demografia → igualment 9 pàgines", async () => {
    const deg: ReportInput = {
      ...base,
      ind: null,
      demo: null,
      aids: [],
      mun: { ...base.mun, rentHistory: null, rentLatest: null, rentPrevYear: null, contractsLatest: null, isTense: false, tenseList: null },
    };
    const bytes = await buildReportPdf(deg);
    expect(await pageCount(bytes)).toBe(REPORT_PAGES);
    const text = extractText(bytes);
    expect(text.includes("Encara no hi ha indicadors demogràfics")).toBe(true);
  });

  test("edifici nau industrial (tipus ind) → 9 pàgines i nota industrial", async () => {
    const nau: ReportInput = {
      ...base,
      building: {
        nom: null,
        refcat: "9872023 VH5797S 0001 WX",
        tipus: "ind",
        altura: 9.9,
        yearBuilt: 1988,
        avgRentEurMonth: null,
        sampleSize: null,
        source: "ICGC_RTT",
      },
    };
    const bytes = await buildReportPdf(nau);
    expect(await pageCount(bytes)).toBe(REPORT_PAGES);
    const text = extractText(bytes);
    expect(text.includes("Nau industrial")).toBe(true);
  });

  test("municipi NO tensat → text de no-tensat present", async () => {
    const calm: ReportInput = { ...base, mun: { ...base.mun, isTense: false, tenseList: null } };
    const bytes = await buildReportPdf(calm);
    const text = extractText(bytes);
    expect(text.includes("NO consta a les resolucions")).toBe(true);
  });

  test("v39 demografia: capítol amb població, edats, llars i interpretació", async () => {
    const bytes = await buildReportPdf(base);
    const text = extractText(bytes);
    expect(text.includes("Contexte demogràfic i territorial del municipi")).toBe(true);
    expect(text.includes("Evolució de la població")).toBe(true);
    expect(text.includes("Estructura per grans grups d'edat")).toBe(true);
    expect(text.includes("1.731.649")).toBe(true); // població 2025 formatada
    expect(text.includes("671.177 llars al cens 2021")).toBe(true);
    expect(text.includes("nacionalitat estrangera")).toBe(true);
    expect(text.includes("Lectura dels indicadors")).toBe(true);
    expect(text.includes("Padró continu")).toBe(true); // cita de font
  });
});

describe("Fase 6 — regressió WinAnsi (fix 2026-11-11)", () => {
  test("ajuts reals del catàleg amb ≥ i ≤ NO trenquen l'informe (bug 500 en producció)", async () => {
    // Textos LITERALS del seed (rental_aid_seed.json) que van trencar l'informe:
    // «Persones amb discapacitat ≥ 33 %», «ingressos ≤ 25.200 €/any»…
    const realAids = [
      {
        title: "Bono alquiler personas con discapacidad",
        amount: "250 €/mes",
        audience: "Persones amb discapacitat ≥ 33 % (sense límit d'edat)",
        source: "Ministerio de Vivienda y Agenda Urbana",
        url: "https://www.vivienda.gob.es/",
        reviewed: "2026-11-11",
      },
      {
        title: "Bónic lloguer jove (Generalitat)",
        amount: "185 €/mes",
        audience: "Joves de fins a 35 anys, ingressos ≤ 25.200 €/any, renda dins dels límits per delimitats",
        source: "Generalitat de Catalunya",
        url: "https://habitatge.gencat.cat/",
        reviewed: "2026-11-11",
      },
      {
        title: "Simbolz variats: ≥ ≤ ≈ ≠ → ← ∞ − \u2009espai fi",
        amount: null,
        audience: null,
        source: "test",
        url: "https://example.cat/",
        reviewed: "2026-11-11",
      },
    ];
    const bytes = await buildReportPdf({ ...base, aids: realAids });
    expect(await pageCount(bytes)).toBe(REPORT_PAGES);
    const text = extractText(bytes);
    expect(text.includes(">= 33")).toBe(true);
    expect(text.includes("<= 25.200")).toBe(true);
  });

  test("rentHistory corrupte → degradació elegant, no throw", async () => {
    const corrupt: ReportInput = { ...base, mun: { ...base.mun, rentHistory: "{no-json-valid:" } };
    const bytes = await buildReportPdf(corrupt);
    expect(await pageCount(bytes)).toBe(REPORT_PAGES);
    const text = extractText(bytes);
    expect(text.includes("sèrie històrica suficient")).toBe(true);
  });

  test("winAnsi: mapa de símbols i filtre final", () => {
    expect(winAnsi("a ≥ b ≤ c")).toBe("a >= b <= c");
    expect(winAnsi("∞")).toBe("infinit");
    expect(winAnsi("hola")).toBe("hola");
    expect(winAnsi("a\u2009b")).toBe("a b");
    expect(winAnsi("\u2260")).toBe("!=");
  });
});
