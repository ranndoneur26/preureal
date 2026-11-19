/**
 * v69 — Auditoria ZMRT TER/2408/2024 (encàrrec del propietari, 19-11-2026).
 *
 * Fet legal: la 2a tanda de zones de mercat residencial tensat (Resolució
 * TER/2408/2024, d'1 de juliol, DOGC núm. 9196 de 3-7-2024; vigència efectiva
 * 10-10-2024) CONTINUA VIGENT sense canvis a la revisió 2026 — l'apunt previ
 * del repo que deia «van caducar» era un error d'anàlisi. Total vigent:
 * 302 municipis = 118 prorrogats (TER/3739/2026, llista A) + 131 (TER/2408/2024,
 * llista B) + 53 nous (TER/3740/2026, llista C).
 *
 *  D1-D5 — data/municipalities.json (+ còpia src/data): 302 = 118+131+53,
 *          codis únics, cap creuament entre llistes, mostres B per INE,
 *          els 171 originals intactes (Barcelona segueix A, Vila-seca C).
 *  M1    — migració Prisma del delta present i sense cap codi A/C dins.
 *  N1-N2 — NORM_FACTS amb les 3 resolucions + tensePublicacio per llista.
 *  T1    — texts CA/ES de la web amb el total 302 i la 2a tanda.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

type Muni = {
  code: string;
  ineCode: string | null;
  name: string;
  isTense: boolean;
  tenseList: string | null;
};

const readJson = (rel: string) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf-8")) as Muni[];

const data1 = readJson("../data/municipalities.json");
const data2 = readJson("../src/data/municipalities.json");
const tense1 = data1.filter((m) => m.isTense);
const byList = (l: string) => tense1.filter((m) => m.tenseList === l);

describe("v69 — ZMRT TER/2408/2024 (2a tanda vigent)", () => {
  test("D1 — 302 municipis tensats: 118 A + 131 B + 53 C, codis únics", () => {
    expect(tense1.length).toBe(302);
    expect(byList("A").length).toBe(118);
    expect(byList("B").length).toBe(131);
    expect(byList("C").length).toBe(53);
    const codes = tense1.map((m) => m.code);
    expect(new Set(codes).size).toBe(302);
  });

  test("D2 — les dues còpies de municipalities.json són idèntiques", () => {
    expect(JSON.stringify(data1)).toBe(JSON.stringify(data2));
  });

  test("D3 — cap municipi té llista doble ni creuament entre A/B/C", () => {
    for (const m of tense1) {
      expect(m.tenseList).toMatch(/^[ABC]$/);
    }
    const ines = tense1.map((m) => m.ineCode ?? m.code.slice(0, 5));
    expect(new Set(ines).size).toBe(302);
  });

  test("D4 — mostres B amb INE oficial correcte", () => {
    const sample: Record<string, string> = {
      "43136": "Ràpita, la",
      "08254": "Esquirol, l'",
      "25243": "Vielha e Mijaran",
      "17048": "Castell d'Aro, Platja d'Aro i s'Agaró",
      "08227": "Sant Martí Sarroca",
      "08902": "Vilanova del Vallès",
    };
    for (const [ine, nom] of Object.entries(sample)) {
      const m = data1.find((x) => (x.ineCode ?? x.code.slice(0, 5)) === ine);
      expect(m, `INE ${ine}`).toBeDefined();
      expect(m!.name).toBe(nom);
      expect(m!.isTense).toBe(true);
      expect(m!.tenseList).toBe("B");
    }
  });

  test("D5 — els 171 originals intactes: Barcelona 08019 segueix A i Vila-seca 43171 segueix C", () => {
    const bcn = data1.find((m) => m.code === "080193");
    expect(bcn!.tenseList).toBe("A");
    expect(bcn!.isTense).toBe(true);
    const vilaseca = data1.find((m) => m.code === "431711");
    expect(vilaseca!.tenseList).toBe("C");
    expect(vilaseca!.isTense).toBe(true);
    // cap municipi A/C no ha canviat de llista respecte dels recomptes v68
    expect(byList("A").length).toBe(118);
    expect(byList("C").length).toBe(53);
  });

  test("M1 — migració Prisma del delta: 131 codis, cap codi A/C dins", () => {
    const sql = readFileSync(
      new URL("../prisma/migrations/20261119100000_zmrt_ter2408_2024_131/migration.sql", import.meta.url),
      "utf-8",
    );
    const body = sql.split('WHERE "code" IN (')[1].split(")")[0];
    const codes = body.match(/'\d{6}'/g) ?? [];
    expect(codes.length).toBe(131);
    expect(new Set(codes).size).toBe(131);
    // PROTECCIÓ: cap dels 171 (A/C) pot aparèixer a la migració
    const acCodes = tense1
      .filter((m) => m.tenseList === "A" || m.tenseList === "C")
      .map((m) => `'${m.code}'`);
    for (const c of acCodes) expect(codes).not.toContain(c);
    // idempotència documentada
    expect(sql).toContain("IS DISTINCT FROM");
  });

  test("N1 — NORM_FACTS amb les 3 resolucions vigents", async () => {
    const { NORM_FACTS } = await import("../src/lib/analitza");
    const joined = NORM_FACTS.tenseResolutions.join(" ");
    expect(joined).toContain("TER/2408/2024");
    expect(joined).toContain("TER/3739/2026");
    expect(joined).toContain("TER/3740/2026");
  });

  test("N2 — tensePublicacio per llista: B → DOGC 3-7-2024; A/C/null → DOGC 19-10-2026", async () => {
    const { tensePublicacio } = await import("../src/lib/analitza");
    expect(tensePublicacio("B")).toBe("DOGC 3-7-2024");
    expect(tensePublicacio("A")).toBe("DOGC 19-10-2026");
    expect(tensePublicacio("C")).toBe("DOGC 19-10-2026");
    expect(tensePublicacio(null)).toBe("DOGC 19-10-2026");
    expect(tensePublicacio(undefined)).toBe("DOGC 19-10-2026");
  });

  test("T1 — texts CA/ES de la web amb el total 302 i la 2a tanda", () => {
    const i18n = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf-8");
    expect(i18n).toContain("N'hi ha 302 ara mateix");
    expect(i18n).toContain("Hay 302 ahora mismo");
    expect(i18n).toContain("Marca els 302 municipis");
    expect(i18n).toContain("Marcamos los 302 municipios");
    expect(i18n).toContain("TER/2408/2024");
    // cap resta del total antic
    expect(i18n).not.toContain("N'hi ha 171");
    expect(i18n).not.toContain("Hay 171");
  });
});
