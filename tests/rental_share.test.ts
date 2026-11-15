/**
 * v41 — Tests de l'indicador «% estimat d'alquiler sobre el parc residencial».
 * Parsers PURS + calculadora amb fixtures REALS descarregades de les fonts
 * oficials el 2026-11-15 (Idescat Taules v2 censph/310/20419 i SODA
 * analisi.transparenciacatalunya.cat qww9-bvhh). Sense BD ni xarxa.
 *
 * Regles d'encàrrec que queden cobertes:
 *  - mai es calcula el % si falta el numerador/denominador, denominador 0,
 *    valors negatius o municipis diferents;
 *  - el flux anual MAI substitueix el stock de fiances vigentes;
 *  - % > 100 → no es publica (revisió);
 *  - desfase temporal → TIMING_MISMATCH amb avís;
 *  - components absents mai es substitueixen per zeros.
 */
import { describe, expect, test } from "bun:test";
import {
  computeRentalShare,
  parseCensTenencia,
  parseFluxMunicipiRows,
  validateAdminRentalShareRows,
  CENS_TENENCIA_TAULA,
  FLUX_PERIODE_ANUAL,
} from "../src/lib/rental-share-parse";
import censFixture from "./fixtures/rental-share/idescat_cens2021_tenencia_mun.json";
import fluxFixture from "./fixtures/rental-share/soda_flujo_municipi_sample.json";

describe("rental-share — parser cens 2021 (Idescat censph/310/20419)", () => {
  test("la taula d'encàrrec és la fixture descarregada", () => {
    expect(CENS_TENENCIA_TAULA).toBe("censph/310/20419");
    const any = (censFixture as { dimension?: Record<string, { category?: { index: unknown } }> }).dimension?.YEAR?.category?.index;
    expect(JSON.stringify(any)).toContain("2021");
  });

  test("615 municipis + Catalunya (TOTAL), codis censals de 6 dígits", () => {
    const rows = parseCensTenencia(censFixture as never);
    expect(rows.length).toBe(616);
    const munis = rows.filter((r) => r.geoCode !== "TOTAL");
    expect(munis.length).toBe(615);
    for (const m of munis) expect(m.geoCode).toMatch(/^\d{6}$/);
    const cat = rows.find((r) => r.geoCode === "TOTAL");
    expect(cat).toBeDefined();
    expect(cat?.total).toBeGreaterThan(0);
  });

  test("Manresa (081136): 8.793 viviendas principales en alquiler de 31.029", () => {
    const rows = parseCensTenencia(censFixture as never);
    const man = rows.find((r) => r.geoCode === "081136");
    expect(man).toBeDefined();
    expect(man?.rental).toBe(8793);
    expect(man?.total).toBe(31029);
    expect(man?.property).toBe(19890);
    expect(man?.oth).toBe(2346);
  });

  test("Barcelona (080193): 208.467 en alquiler de 671.178 (contrastat amb la publicació oficial)", () => {
    const rows = parseCensTenencia(censFixture as never);
    const bcn = rows.find((r) => r.geoCode === "080193");
    expect(bcn?.rental).toBe(208467);
    expect(bcn?.total).toBe(671178);
  });

  test("Catalunya (TOTAL): 692.285 en alquiler — contrast publicació Idescat (23,2%)", () => {
    const rows = parseCensTenencia(censFixture as never);
    const cat = rows.find((r) => r.geoCode === "TOTAL");
    expect(cat?.rental).toBe(692285);
    const pct = ((cat?.rental ?? 0) / (cat?.total ?? 1)) * 100;
    expect(pct).toBeGreaterThan(23.0);
    expect(pct).toBeLessThan(23.4);
  });

  test("cap municipi té total = 0 (mai divisió per zero a la pràctica)", () => {
    const rows = parseCensTenencia(censFixture as never).filter((r) => r.geoCode !== "TOTAL");
    for (const r of rows) {
      if (r.total != null) expect(r.total).toBeGreaterThan(0);
    }
  });
});

describe("rental-share — parser flux SODA qww9-bvhh (referència, mai numerador)", () => {
  test("filtra nivell municipi + període anual i normalitza codis INE", () => {
    const rows = parseFluxMunicipiRows(fluxFixture, { periode: FLUX_PERIODE_ANUAL });
    expect(rows.length).toBeGreaterThan(0);
    const abr = rows.find((r) => r.ineCode === "08001");
    expect(abr?.name).toBe("Abrera");
    expect(abr?.year).toBe("2025");
    expect(abr?.habitatges).toBe(117);
  });

  test("descarta files sense codi INE de 5 dígits o sense any vàlid", () => {
    const rows = parseFluxMunicipiRows([
      { ambit_territorial: "Municipi", codi_territorial: "ABC", nom_territori: "X", any: "2025", periode: "gener-desembre", habitatges: "5" },
      { ambit_territorial: "Municipi", codi_territorial: "08001", nom_territori: "Y", any: "2.025", periode: "gener-desembre", habitatges: "5" },
      { ambit_territorial: "Municipi", codi_territorial: "08001", nom_territori: "Z", any: "2025", periode: "gener-juny", habitatges: "5" },
      { ambit_territorial: "Comarca", codi_territorial: "08001", nom_territori: "C", any: "2025", periode: "gener-desembre", habitatges: "5" },
      null,
    ]);
    expect(rows.length).toBe(0);
  });

  test("valors no numèrics → null (mai inventats)", () => {
    const rows = parseFluxMunicipiRows([
      { ambit_territorial: "Municipi", codi_territorial: "08001", nom_territori: "A", any: "2025", periode: "gener-desembre", habitatges: "n.d." },
      { ambit_territorial: "Municipi", codi_territorial: "08002", nom_territori: "B", any: "2025", periode: "gener-desembre", habitatges: null },
    ]);
    expect(rows[0].habitatges).toBeNull();
    expect(rows[1].habitatges).toBeNull();
  });
});

describe("rental-share — calculadora computeRentalShare (validacions obligatòries)", () => {
  const base = {
    muniCode: "081136",
    incasolActiveDeposits: 8000,
    incasolPeriod: "2025",
    incasolIneCode: "08113",
    residentialProperties: 40000,
    cadastreYear: "2025",
    cadastreIneCode: "08113",
  };

  test("càlcul normal: 8.000 / 40.000 = 20% (exemple de l'encàrrec)", () => {
    const r = computeRentalShare(base);
    expect(r.dataStatus).toBe("OK");
    expect(r.rentalPercentage).toBe(20);
    expect(r.numeratorKind).toBe("VIGENTES");
    expect(r.referenceKey).toBe("N:2025|D:2025");
  });

  test("sense numerador → NO_NUMERATOR, sense càlcul (flux no substitueix el stock)", () => {
    const r = computeRentalShare({
      ...base,
      incasolActiveDeposits: null,
      incasolDepositsPeriod: 117, // flux anual present — MAI és el numerador
      incasolFluxPeriod: "2025",
    });
    expect(r.dataStatus).toBe("NO_NUMERATOR");
    expect(r.rentalPercentage).toBeNull();
    expect(r.warnings.join(" ")).toContain("flux");
  });

  test("sense denominador → NO_DENOMINATOR, sense càlcul", () => {
    const r = computeRentalShare({ ...base, residentialProperties: null, cadastreYear: null });
    expect(r.dataStatus).toBe("NO_DENOMINATOR");
    expect(r.rentalPercentage).toBeNull();
  });

  test("denominador zero → NO_DENOMINATOR + avís (mai divisió per zero)", () => {
    const r = computeRentalShare({ ...base, residentialProperties: 0 });
    expect(r.dataStatus).toBe("NO_DENOMINATOR");
    expect(r.rentalPercentage).toBeNull();
    expect(r.warnings.join(" ")).toContain("0");
  });

  test("valors negatius → NEGATIVE_INPUT, sense càlcul", () => {
    const r = computeRentalShare({ ...base, incasolActiveDeposits: -5 });
    expect(r.dataStatus).toBe("NEGATIVE_INPUT");
    expect(r.rentalPercentage).toBeNull();
    const r2 = computeRentalShare({ ...base, residentialProperties: -10 });
    expect(r2.dataStatus).toBe("NEGATIVE_INPUT");
    expect(r2.rentalPercentage).toBeNull();
  });

  test("numerador i denominador de municipis diferents → MISMATCH_MUNI", () => {
    const r = computeRentalShare({ ...base, cadastreIneCode: "08019" });
    expect(r.dataStatus).toBe("MISMATCH_MUNI");
    expect(r.rentalPercentage).toBeNull();
    expect(r.referenceKey).toBeNull();
  });

  test("% > 100 → REVIEW_OVER_100, no es publica", () => {
    const r = computeRentalShare({ ...base, residentialProperties: 4000 });
    expect(r.dataStatus).toBe("REVIEW_OVER_100");
    expect(r.rentalPercentage).toBeNull();
    expect(r.warnings.join(" ")).toContain("revisió");
  });

  test("períodes incompatibles → TIMING_MISMATCH amb avís (valor indicatiu, mai definitiu)", () => {
    const r = computeRentalShare({ ...base, incasolPeriod: "2024", cadastreYear: "2026" });
    expect(r.dataStatus).toBe("TIMING_MISMATCH");
    expect(r.rentalPercentage).toBe(20);
    expect(r.warnings.join(" ")).toContain("Desfase temporal");
  });

  test("períodes compatibles en any → OK (T1 del mateix any que el catastral)", () => {
    const r = computeRentalShare({ ...base, incasolPeriod: "2025-T1", cadastreYear: "2025" });
    expect(r.dataStatus).toBe("OK");
  });

  test("cens: % censal calculat independentment del compost", () => {
    const r = computeRentalShare({ ...base, censusMainRental: 8793, censusMainTotal: 31029, censusYear: "2021" });
    expect(r.censusRentalPercentage).toBeCloseTo(28.338, 1);
    expect(r.rentalPercentage).toBe(20);
    expect(r.referenceKey).toBe("N:2025|D:2025");
  });

  test("cens: total 0 o alquiler > total → sense % censal + avís (mai zeros automàtics)", () => {
    const r0 = computeRentalShare({ ...base, censusMainRental: 5, censusMainTotal: 0 });
    expect(r0.censusRentalPercentage).toBeNull();
    const r1 = computeRentalShare({ ...base, censusMainRental: 500, censusMainTotal: 100 });
    expect(r1.censusRentalPercentage).toBeNull();
    expect(r1.warnings.join(" ")).toContain("anòmal");
  });

  test("cens incomplet (només un component) → null + avís, mai 0", () => {
    const r = computeRentalShare({ ...base, censusMainRental: 8793 });
    expect(r.censusRentalPercentage).toBeNull();
    expect(r.warnings.join(" ")).toContain("incomplet");
  });

  test("només cens disponible → fila C:2021 amb estat CENS_REF_ONLY (estat actual de les fonts)", () => {
    const r = computeRentalShare({
      muniCode: "081136",
      incasolActiveDeposits: null,
      residentialProperties: null,
      censusMainRental: 8793,
      censusMainTotal: 31029,
      censusYear: "2021",
    });
    expect(r.referenceKey).toBe("C:2021");
    expect(r.dataStatus).toBe("CENS_REF_ONLY");
    expect(r.rentalPercentage).toBeNull();
    expect(r.censusRentalPercentage).toBeCloseTo(28.338, 1);
  });

  test("sense cap component → NO_DATA (sense fila)", () => {
    const r = computeRentalShare({ muniCode: "081136" });
    expect(r.referenceKey).toBeNull();
    expect(r.dataStatus).toBe("NO_DATA");
  });
});

describe("rental-share — validació de files del connector administratiu", () => {
  test("accepta files vàlides i resol per municipi (per code o ineCode)", () => {
    const { rows, errors } = validateAdminRentalShareRows([
      { municipalityCode: "081136", incasolActiveDeposits: 8811, incasolPeriod: "2025", incasolSource: "Incasòl (publicació oficial)", residentialProperties: 41250, cadastreYear: "2026" },
      { ineCode: "08019", residentialProperties: 671999, cadastreYear: "2026", cadastreSource: "Catastro (estadística oficial)" },
    ]);
    expect(errors.length).toBe(0);
    expect(rows.length).toBe(2);
    expect(rows[0].incasolActiveDeposits).toBe(8811);
    expect(rows[0].residentialProperties).toBe(41250);
    // fila només amb ineCode: el validador la conserva (la resolució ine→censal
    // la fa la ruta administrativa contra Municipality, mai per nom)
    expect(rows[1].municipalityCode).toBe("");
    expect(rows[1].ineCode).toBe("08019");
  });

  test("rebuja codis malformats, files buides i valors negatius", () => {
    const { rows, errors } = validateAdminRentalShareRows([
      { municipalityCode: "08113", incasolActiveDeposits: 10 }, // 5 dígits, no 6
      { municipalityCode: "081136" }, // cap component
      { municipalityCode: "081136", incasolActiveDeposits: -3 },
      { municipalityCode: "zzzzzz", residentialProperties: 5 },
      "no sóc una fila",
    ]);
    expect(rows.length).toBe(0);
    expect(errors.length).toBe(5);
  });

  test("strings numèrics amb milers es normalitzen", () => {
    const { rows, errors } = validateAdminRentalShareRows([
      { municipalityCode: "081136", incasolActiveDeposits: "8.811", residentialProperties: "41250" },
    ]);
    expect(errors.length).toBe(0);
    expect(rows[0].incasolActiveDeposits).toBe(8811);
    expect(rows[0].residentialProperties).toBe(41250);
  });
});
