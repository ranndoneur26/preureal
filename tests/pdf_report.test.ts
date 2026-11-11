/**
 * Fase 6 (v34) — tests de l'informe PDF de 8 pàgines (src/lib/pdf-report.ts).
 * Execució: bun test tests/pdf_report.test.ts
 * El constructor és PURA: cap BD ni auth; dades d'exemple completes i degradades.
 */
import { describe, expect, test } from "bun:test";
import { inflateSync } from "zlib";
import { PDFDocument } from "pdf-lib";
import { buildReportPdf, REPORT_PAGES, type ReportInput } from "../src/lib/pdf-report";

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

describe("Fase 6: informe PDF de 8 pàgines", () => {
  test("municipi amb totes les dades → 8 pàgines i magic bytes %PDF", async () => {
    const bytes = await buildReportPdf(base);
    const head = String.fromCharCode(...bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
    expect(await pageCount(bytes)).toBe(REPORT_PAGES);
  });

  test("degradació: sense indicadors, sense ajudes, sense històric → igualment 8 pàgines", async () => {
    const deg: ReportInput = {
      ...base,
      ind: null,
      aids: [],
      mun: { ...base.mun, rentHistory: null, rentLatest: null, rentPrevYear: null, contractsLatest: null, isTense: false, tenseList: null },
    };
    const bytes = await buildReportPdf(deg);
    expect(await pageCount(bytes)).toBe(REPORT_PAGES);
  });

  test("edifici nau industrial (tipus ind) → 8 pàgines i nota industrial", async () => {
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
});
