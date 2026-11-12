/**
 * v38.8 — tests dels informes individuals de pagament únic:
 *  - validació PURA dels paràmetres (src/lib/reports-shop.ts)
 *  - preus del catàleg i noms de fitxer
 *  - tokens de descàrrega (hash SHA-256 a BD, mai cru)
 *  - builders PDF (src/lib/pdf-valuation.ts + pdf-comparison.ts): bytes %PDF
 * Execució: bun test tests/reports_shop.test.ts
 */
import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import {
  REPORT_KINDS,
  SHOP_LIMITS,
  SHOP_ESTATS,
  reportProduct,
  validateReportParams,
  pdfFilename,
  newDownloadToken,
  downloadTokenMatches,
} from "../src/lib/reports-shop";
import { buildValuationPdf } from "../src/lib/pdf-valuation";
import { buildComparisonPdf, comparisonStats, COMPARISON_REF_M2, type ComparisonMuniRow } from "../src/lib/pdf-comparison";
import { computeValuation, type ValuationData } from "../src/lib/territorial";

// ---------- validació de paràmetres ----------

describe("reports-shop · validateReportParams", () => {
  test("kinds desconeguts → BAD_KIND", () => {
    expect(validateReportParams("PIRATA", {})).toEqual({ ok: false, error: "BAD_KIND" });
    expect(validateReportParams(undefined, {})).toEqual({ ok: false, error: "BAD_KIND" });
    for (const k of REPORT_KINDS) {
      // cada kind vàlid deixa de ser BAD_KIND amb params mínims
      if (k === "INFORME_MUNICIPI") expect(validateReportParams(k, { mun: "080193" }).ok).toBe(true);
      if (k === "VALORACIO") expect(validateReportParams(k, { mun: "080193" }).ok).toBe(true);
      if (k === "COMPARATIVA") expect(validateReportParams(k, { muns: ["080193", "081016"] }).ok).toBe(true);
    }
  });

  test("INFORME_MUNICIPI: codi de 6 dígits obligatori", () => {
    expect(validateReportParams("INFORME_MUNICIPI", {}).ok).toBe(false);
    expect(validateReportParams("INFORME_MUNICIPI", { mun: "08019" }).ok).toBe(false);
    expect(validateReportParams("INFORME_MUNICIPI", { mun: "abc" }).ok).toBe(false);
    const ok = validateReportParams("INFORME_MUNICIPI", { mun: "080193" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.params).toEqual({ kind: "INFORME_MUNICIPI", mun: "080193" });
  });

  test("VALORACIO: superfície 5–500, habitacions 0–10, estat de catàleg", () => {
    expect(validateReportParams("VALORACIO", { mun: "080193", surfaceM2: 4 }).ok).toBe(false);
    expect(validateReportParams("VALORACIO", { mun: "080193", surfaceM2: 501 }).ok).toBe(false);
    expect(validateReportParams("VALORACIO", { mun: "080193", rooms: 11 }).ok).toBe(false);
    expect(validateReportParams("VALORACIO", { mun: "080193", estat: "PIRATA" }).ok).toBe(false);
    const ok = validateReportParams("VALORACIO", { mun: "080193", surfaceM2: 85, rooms: 3, estat: "REFORMADA" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.params).toEqual({ kind: "VALORACIO", mun: "080193", surfaceM2: 85, rooms: 3, estat: "REFORMADA" });
    // camps absents → null (no error)
    const min = validateReportParams("VALORACIO", { mun: "080193" });
    expect(min.ok).toBe(true);
    if (min.ok) {
      expect(min.params.surfaceM2).toBeNull();
      expect(min.params.rooms).toBeNull();
      expect(min.params.estat).toBeNull();
    }
  });

  test("COMPARATIVA: 2-6 municipis, sense repetits, filtre de codis vàlids", () => {
    expect(validateReportParams("COMPARATIVA", { muns: ["080193"] }).ok).toBe(false);
    expect(validateReportParams("COMPARATIVA", { muns: [] }).ok).toBe(false);
    expect(validateReportParams("COMPARATIVA", { muns: ["1", "2", "3", "4", "5", "6", "7"] }).ok).toBe(false);
    const ok = validateReportParams("COMPARATIVA", { muns: ["080193", "080193", "081016", "bogus"] });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.params.muns).toEqual(["080193", "081016"]); // dedup + filtre
  });

  test("límits compartits UI ⇄ API", () => {
    expect(SHOP_LIMITS.MUNI_MIN).toBe(2);
    expect(SHOP_LIMITS.MUNI_MAX).toBe(6);
    expect(SHOP_ESTATS).toContain("BON_ESTAT");
  });
});

// ---------- preus i fitxers ----------

describe("reports-shop · catàleg", () => {
  test("preus proposats per defecte (cents): 4,99 / 6,99 / 7,99 €", () => {
    expect(reportProduct("INFORME_MUNICIPI").priceCents).toBe(499);
    expect(reportProduct("VALORACIO").priceCents).toBe(699);
    expect(reportProduct("COMPARATIVA").priceCents).toBe(799);
  });

  test("noms bilingües presents", () => {
    expect(reportProduct("VALORACIO").nameCa).toBe("Valoració d'habitatge");
    expect(reportProduct("VALORACIO").nameEs).toBe("Valoración de vivienda");
  });

  test("noms de fitxer segurs per Content-Disposition", () => {
    expect(pdfFilename("INFORME_MUNICIPI", ["Barcelona"])).toBe("preureal_informe_municipal_Barcelona.pdf");
    expect(pdfFilename("COMPARATIVA", ["A", "B", "C"])).toBe("preureal_comparativa_3municipis.pdf");
    expect(pdfFilename("VALORACIO", ["Viladecans"])).toContain("preureal_valoracio_");
  });
});

// ---------- tokens de descàrrega ----------

describe("reports-shop · tokens", () => {
  test("el hash coincideix i no es pot reconstruir el cru", () => {
    const { raw, hash } = newDownloadToken();
    expect(raw.length).toBeGreaterThan(30); // 256 bits base64url
    expect(hash).not.toContain(raw);
    expect(downloadTokenMatches(raw, hash)).toBe(true);
    expect(downloadTokenMatches(raw + "x", hash)).toBe(false);
    expect(downloadTokenMatches(raw, null)).toBe(false);
  });
});

// ---------- builders PDF ----------

function syntheticValuation() {
  const data: ValuationData = {
    rentLatest: 1134.2,
    rentPeriod: "2026-T1",
    contracts: 25340,
    history: { "2024": 1100, "2025": 1134 },
    comarcaValues: [900, 1000, 1100, 1200, 1300, 1400],
    provinciaValues: [800, 950, 1100, 1250, 1500],
    comarcaRefLatest: null,
    comarcaRefPeriod: null,
  };
  const outcome = computeValuation(data, { surfaceM2: 75, rooms: 3, estat: "REFORMADA" });
  expect(outcome.ok).toBe(true);
  return (outcome as Extract<typeof outcome, { ok: true }>).result;
}

describe("pdf-valuation", () => {
  test("genera un PDF vàlid (ca) amb avisos i ajustos", async () => {
    const result = syntheticValuation();
    const bytes = await buildValuationPdf({
      muni: {
        name: "Barcelona", comarca: "Barcelonès", province: "Barcelona", code: "080193",
        rentLatest: 1134.2, rentPeriod: "2026-T1", contractsLatest: 25340, isTense: true, tenseList: "C",
      },
      params: { surfaceM2: 75, rooms: 3, estat: "REFORMADA" },
      valuation: result,
      locale: "ca",
      genDate: "12 de novembre de 2026",
      purchaseRef: "ABC123",
    });
    const header = Buffer.from(bytes.slice(0, 5)).toString();
    expect(header).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
  });

  test("genera un PDF vàlid (es) sense característiques (vivienda típica)", async () => {
    const data: ValuationData = {
      rentLatest: 792.5, rentPeriod: "2025", contracts: 117,
      history: null, comarcaValues: [], provinciaValues: [],
      comarcaRefLatest: null, comarcaRefPeriod: null,
    };
    const outcome = computeValuation(data, {});
    expect(outcome.ok).toBe(true);
    const bytes = await buildValuationPdf({
      muni: {
        name: "Abrera", comarca: "Baix Llobregat", province: "Barcelona", code: "080018",
        rentLatest: 792.5, rentPeriod: "2025", contractsLatest: 117, isTense: false, tenseList: null,
      },
      params: { surfaceM2: null, rooms: null, estat: null },
      valuation: (outcome as Extract<typeof outcome, { ok: true }>).result,
      locale: "es",
      genDate: "12 de noviembre de 2026",
      purchaseRef: "XYZ789",
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

const compRows: ComparisonMuniRow[] = [
  { name: "Barcelona", comarca: "Barcelonès", province: "Barcelona", code: "080193", rentLatest: 1134.2, rentPeriod: "2026-T1", rentPrevYear: 1080, rentPrevPeriod: "2025-T4", contractsLatest: 25340, isTense: true, tenseList: "C", rentHistory: JSON.stringify({ "2024": 1100, "2025": 1134 }) },
  { name: "Abrera", comarca: "Baix Llobregat", province: "Barcelona", code: "080018", rentLatest: 792.5, rentPeriod: "2025", rentPrevYear: 756.2, rentPrevPeriod: "2024", contractsLatest: 117, isTense: false, tenseList: null, rentHistory: null },
  { name: "Viladecans", comarca: "Baix Llobregat", province: "Barcelona", code: "082792", rentLatest: null, rentPeriod: null, rentPrevYear: null, rentPrevPeriod: null, contractsLatest: null, isTense: false, tenseList: null, rentHistory: null },
];

describe("pdf-comparison", () => {
  test("comparisonStats: màxim, mínim, spread i tensades (degradació sense dada)", () => {
    const s = comparisonStats(compRows);
    expect(s.max?.name).toBe("Barcelona");
    expect(s.max?.rent).toBeCloseTo(1134.2);
    expect(s.min?.name).toBe("Abrera");
    expect(s.spreadPct).not.toBeNull();
    expect(s.tenseCount).toBe(1);
    // sense cap dada: nulls, mai invenció
    const empty = comparisonStats([{ ...compRows[2] }]);
    expect(empty.max).toBeNull();
    expect(empty.min).toBeNull();
    expect(empty.avgRent).toBeNull();
  });

  test("genera un PDF vàlid (ca) amb taula + gràfic + fitxes", async () => {
    const bytes = await buildComparisonPdf({
      munis: compRows,
      locale: "ca",
      genDate: "12 de novembre de 2026",
      purchaseRef: "CMP001",
    });
    const header = Buffer.from(bytes.slice(0, 5)).toString();
    expect(header).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
  });

  test("genera un PDF vàlid (es)", async () => {
    const bytes = await buildComparisonPdf({
      munis: compRows.slice(0, 2),
      locale: "es",
      genDate: "12 de noviembre de 2026",
      purchaseRef: "CMP002",
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  test("el €/m² derivat usa la superfície de referència de 85 m²", () => {
    expect(COMPARISON_REF_M2).toBe(85);
  });
});
