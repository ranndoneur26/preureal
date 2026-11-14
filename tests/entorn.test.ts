/**
 * v40 — Tests del bloc «Serveis i qualitat de l'entorn» (Fase A).
 * Parsers PURS amb fixtures REALS descarregades de les fonts oficials
 * (analisi.transparenciacatalunya.cat). Sense BD ni xarxa.
 */
import { describe, expect, test } from "bun:test";
import {
  bboxAround,
  countsByRadius,
  haversineMeters,
  mapCertificat,
  mapDocent,
  mapEquipament,
  mapRecarrega,
  mapSanitari,
  normalizeKind,
  normalizeRefcat,
  parseLat,
  parseLng,
  radiusBuckets,
  toNum,
} from "../src/lib/entorn-parse";
import icaenFixture from "./fixtures/entorn/icaen.json";
import recarregaFixture from "./fixtures/entorn/recarrega.json";
import sanitariFixture from "./fixtures/entorn/sanitari.json";
import docentFixture from "./fixtures/entorn/docent.json";
import equipamentFixture from "./fixtures/entorn/equipament.json";

describe("entorn — normalització", () => {
  test("normalizeRefcat treu espais/guions i posa majúscules", () => {
    expect(normalizeRefcat(" 8761106dg6086s0001mg ")).toBe("8761106DG6086S0001MG");
    expect(normalizeRefcat("98372-CJ4119B-1W")).toBe("98372CJ4119B1W");
  });

  test("normalizeKind: sense accents ni símbols", () => {
    expect(normalizeKind("Farmàcia")).toBe("FARMACIA");
    expect(normalizeKind("Àrea Bàsica de Salut")).toBe("AREA_BASICA_DE_SALUT");
    expect(normalizeKind("  ")).toBe("");
  });

  test("toNum: coma decimal i buits", () => {
    expect(toNum("10.02")).toBe(10.02);
    expect(toNum("17,94")).toBe(17.94);
    expect(toNum("")).toBeNull();
    expect(toNum("abc")).toBeNull();
  });

  test("coordenades fora de rang → null (mai s'inventa)", () => {
    expect(parseLat("95")).toBeNull();
    expect(parseLng("200")).toBeNull();
    expect(parseLat("41.39")).toBe(41.39);
  });
});

describe("entorn — mappers SODA amb fixtures reals", () => {
  test("ICAEN: certificat amb refcat + qualificacions + números", () => {
    const cert = mapCertificat(icaenFixture[0]);
    expect(cert).not.toBeNull();
    expect(cert!.refcat).toBe("8761106DG6086S0001MG");
    expect(cert!.numCas).toBe("983KYQ8SW");
    expect(cert!.qualificacioConsum).toBe("A");
    expect(cert!.qualificacioEmissions).toBe("A");
    expect(cert!.consumKwhM2).toBeCloseTo(10.02);
    expect(cert!.emissionsCo2KgM2).toBeCloseTo(3.15);
    expect(cert!.us).toContain("plurifamiliar");
    expect(cert!.dataEntrada).toBe("2026-03-12");
  });

  test("ICAEN: fila sense referència catastral → null (skipped)", () => {
    expect(mapCertificat({ num_cas: "X" })).toBeNull();
  });

  test("Recàrrega: punt amb kw/acDc i ine5 crít (5 dígits)", () => {
    const p = mapRecarrega(recarregaFixture[0]);
    expect(p).not.toBeNull();
    expect(p!.category).toBe("CHARGING_STATION");
    expect(p!.externalId).toBe("46522884");
    expect(p!.lat).toBeCloseTo(41.401768);
    expect(p!.lng).toBeCloseTo(2.160826);
    expect(p!.ine5).toBe("80193");
    const props = JSON.parse(p!.props) as Record<string, unknown>;
    expect(props.kw).toBe(21);
    expect(props.acDc).toBe("AC");
    expect(p!.kind).toBe("SEMIRAPID"); // el valor de la font es «semiRAPID»
  });

  test("Recàrrega: sense coordenades → null (skipped)", () => {
    expect(mapRecarrega({ id: "1", latitud: "", longitud: "" })).toBeNull();
  });

  test("Sanitari: farmàcia amb kind normalitzat i ine5", () => {
    const p = mapSanitari(sanitariFixture[0]);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("FARMACIA");
    expect(p!.ine5).toBe("17079");
    expect(p!.name).toBe("ARPA CAMOS NURIA");
    const props = JSON.parse(p!.props) as Record<string, unknown>;
    expect(props.tipus).toBe("Farmàcia");
    expect(props.abs).toBe("Girona - 2");
  });

  test("Docent: EDUCACIO amb codi censal de 6 dígits i nivells", () => {
    const p = mapDocent(docentFixture[0]);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("EDUCACIO");
    expect(p!.municipalityCode).toBe("080193");
    expect(p!.ine5).toBe("08019");
    const props = JSON.parse(p!.props) as Record<string, unknown>;
    expect(props.nivells).toEqual(["EINF", "EPRI", "ESO", "BATX"]);
  });

  test("Docent: sense coordenades → null", () => {
    expect(mapDocent({ codi_centre: "1" })).toBeNull();
  });

  test("Equipament: Cultura → CULTURA amb categoria jeràrquica", () => {
    const p = mapEquipament(equipamentFixture[0]);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("CULTURA");
    expect(p!.ine5).toBe("08137");
    const props = JSON.parse(p!.props) as Record<string, unknown>;
    expect(String(props.categoria)).toContain("Biblioteques");
  });
});

describe("entorn — geo (haversine, bbox, radios del encàrrec)", () => {
  test("haversine: Barcelona (Pl. Catalunya) → Girona ≈ 85 km", () => {
    const d = haversineMeters(41.3874, 2.1686, 41.9794, 2.8214);
    expect(d).toBeGreaterThan(82_000);
    expect(d).toBeLessThan(90_000);
  });

  test("bboxAround 500 m: lat ≈ ±0.0045° i lng més WIDE a lat 41 (cos<1)", () => {
    const b = bboxAround(41.39, 2.16, 500);
    expect(b.maxLat - b.minLat).toBeGreaterThan(0.008);
    expect(b.maxLat - b.minLat).toBeLessThan(0.01);
    // a lat 41 calen MÉS graus de longitud per cobrir 500 m (graus més curts)
    expect(b.maxLng - b.minLng).toBeGreaterThan(b.maxLat - b.minLat);
    // però en METRES la fondària en longitud continua ≈ 2×500 m
    const lngSpanM = (b.maxLng - b.minLng) * 111_320 * Math.cos((41.39 * Math.PI) / 180);
    expect(lngSpanM).toBeGreaterThan(980);
    expect(lngSpanM).toBeLessThan(1020);
  });

  test("radiusBuckets: radios 300/500/1000/2000 m", () => {
    expect(radiusBuckets(120)).toEqual([300, 500, 1000, 2000]);
    expect(radiusBuckets(400)).toEqual([500, 1000, 2000]);
    expect(radiusBuckets(1400)).toEqual([2000]);
    expect(radiusBuckets(2500)).toEqual([]);
  });

  test("countsByRadius és monòton creixent per radius", () => {
    const c = countsByRadius([120, 400, 1400]);
    expect(c["300"]).toBe(1);
    expect(c["500"]).toBe(2);
    expect(c["1000"]).toBe(2);
    expect(c["2000"]).toBe(3);
  });
});
