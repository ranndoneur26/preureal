/**
 * v71 — Tests del semàforo del panell «Dades i fonts» (Fase P1 del pla de
 * manteniment): criteris de la taula 11 del pla (Vigente/Aviso/Crítico/
 * Pausada amb llindars SLA i SLA+25 %), bloqueig d'importació sense F0 GO
 * (taula 12), firma humana C9/C10 i traçabilitat ImportRun ↔ font.
 * Mòdul pur: sense BD ni xarxa.
 */
import { describe, expect, test } from "bun:test";
import {
  calcEstatFont,
  importacioDesbloquejada,
  runEsDeFont,
  diesDesde,
  FONTS_PANEL,
} from "../src/lib/datos-fuentes";

const base = {
  active: true,
  diesDesdeUltimaOk: 38 as number | null,
  slaDies: 100,
  ultimaRunStatus: "OK" as string | null,
  lastF0Veredicte: null as string | null,
  firmaValida: false,
};

describe("semàforo per font (taula 11 del pla)", () => {
  test("VIGENT: frescura ≤ SLA sense incidents", () => {
    const r = calcEstatFont(base);
    expect(r.estat).toBe("VIGENTE");
    expect(r.pct).toBe(38);
    expect(r.motius).toEqual([]);
  });

  test("AVISO: frescura > SLA però ≤ SLA+25 %", () => {
    const r = calcEstatFont({ ...base, diesDesdeUltimaOk: 104 });
    expect(r.estat).toBe("AVISO");
    expect(r.motius).toContain("FRESQUERA_SLA");
    // 125 = SLA+25 % exacte: encara AVISO (el crític és estrictament >)
    const r2 = calcEstatFont({ ...base, diesDesdeUltimaOk: 125 });
    expect(r2.estat).toBe("AVISO");
  });

  test("CRÍTICO: frescura > SLA+25 %", () => {
    const r = calcEstatFont({ ...base, diesDesdeUltimaOk: 126 });
    expect(r.estat).toBe("CRITICO");
    expect(r.motius).toContain("FRESQUERA_SLA_MES_25");
  });

  test("CRÍTICO: última import ERROR (encara amb frescura verda)", () => {
    const r = calcEstatFont({ ...base, ultimaRunStatus: "ERROR" });
    expect(r.estat).toBe("CRITICO");
    expect(r.motius).toContain("IMPORT_ERROR");
  });

  test("AVISO: GO-CONDICIONAL sense firma humana (C9/C10 pendents)", () => {
    const r = calcEstatFont({ ...base, lastF0Veredicte: "GO_CONDICIONAL" });
    expect(r.estat).toBe("AVISO");
    expect(r.motius).toContain("F0_FIRMA_PENDENT");
  });

  test("GO-CONDICIONAL amb firma posterior → VIGENT", () => {
    const r = calcEstatFont({ ...base, lastF0Veredicte: "GO_CONDICIONAL", firmaValida: true });
    expect(r.estat).toBe("VIGENTE");
    expect(r.motius).toEqual([]);
  });

  test("AVISO: F0 NO-GO", () => {
    const r = calcEstatFont({ ...base, lastF0Veredicte: "NO_GO" });
    expect(r.estat).toBe("AVISO");
    expect(r.motius).toContain("F0_NO_GO");
  });

  test("PAUSADA sempre guanya (el gris evita semblar averiada)", () => {
    const r = calcEstatFont({
      ...base,
      active: false,
      diesDesdeUltimaOk: 500,
      ultimaRunStatus: "ERROR",
    });
    expect(r.estat).toBe("PAUSADA");
    expect(r.pct).toBeNull();
  });

  test("sense imports registrades → VIGENT honest, sense frescura", () => {
    const r = calcEstatFont({ ...base, diesDesdeUltimaOk: null, ultimaRunStatus: null });
    expect(r.estat).toBe("VIGENTE");
    expect(r.pct).toBeNull();
  });
});

describe("bloqueig d'importació (taula 12 del pla)", () => {
  const t0 = new Date("2026-11-01T00:00:00Z");
  const t1 = new Date("2026-11-10T00:00:00Z");

  test("sense auditoria F0 → bloquejat", () => {
    expect(importacioDesbloquejada(null, null)).toBe(false);
  });

  test("GO 11/12 → bloquejat; GO 12/12 → desbloquejat", () => {
    expect(importacioDesbloquejada({ veredicte: "GO", controles: 11, at: t0 }, null)).toBe(false);
    expect(importacioDesbloquejada({ veredicte: "GO", controles: 12, at: t0 }, null)).toBe(true);
  });

  test("GO-CONDICIONAL sense firma → bloquejat; amb firma posterior → desbloquejat", () => {
    expect(importacioDesbloquejada({ veredicte: "GO_CONDICIONAL", controles: 10, at: t0 }, null)).toBe(false);
    expect(importacioDesbloquejada({ veredicte: "GO_CONDICIONAL", controles: 10, at: t0 }, { at: t1 })).toBe(true);
  });

  test("NO-GO → bloquejat sempre (la firma no arregla un NO-GO)", () => {
    expect(importacioDesbloquejada({ veredicte: "NO_GO", controles: 6, at: t0 }, { at: t1 })).toBe(false);
  });
});

describe("traçabilitat ImportRun ↔ font", () => {
  test("catàleg complet: 8 fonts del pla, amb SLA, prefixes i slug d'auditoria", () => {
    expect(FONTS_PANEL.length).toBe(8);
    for (const f of FONTS_PANEL) {
      expect(f.runPrefixes.length).toBeGreaterThan(0);
      expect(f.slaDies).toBeGreaterThan(0);
      expect(f.auditSlug).toBeTruthy();
      expect(f.cadenciaCa).toBeTruthy();
      expect(f.cadenciaEs).toBeTruthy();
    }
  });

  test("prefixos sense creuaments: ZMRT no atrapa INE i viceversa", () => {
    const zmrt = FONTS_PANEL.find((f) => f.code === "ZMRT_DOGC")!;
    const ine = FONTS_PANEL.find((f) => f.code === "INE_TEMPUS3")!;
    expect(runEsDeFont("ZMRT_TER_2408", zmrt)).toBe(true);
    expect(runEsDeFont("INE_IPVA:FULL", zmrt)).toBe(false);
    expect(runEsDeFont("INE_IPVA:FULL", ine)).toBe(true);
    expect(runEsDeFont("ZMRT_TER_2408", ine)).toBe(false);
  });
});

describe("diesDesde", () => {
  test("null → null; passat → dies sencers ≥ 0", () => {
    expect(diesDesde(null)).toBeNull();
    expect(diesDesde(new Date(Date.now() - 3.5 * 86_400_000))).toBe(3);
    expect(diesDesde(new Date())).toBe(0);
  });
});
