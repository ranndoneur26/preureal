/**
 * v44 — Tests de «Analitza el teu futur lloguer»: lògica PURA dels mòduls
 * src/lib/analitza.ts (preu, normativa, POIs, distàncies) i src/lib/analitza-html.ts
 * (informe descargable). Sense BD ni xarxa. Regles que cobreix:
 *  - €/m² derivat només amb superfície vàlida (mai de la font)
 *  - veredicte per llindars explícits (−25/−5/+5/+15)
 *  - normativa: estats (mai legalitat), tipus de contracte, zona tensada,
 *    renta anterior superior → ALERT, sense dada → PENDING
 *  - parser Overpass defensiu: nodes i ways amb center, dedup, distàncies
 *  - informe HTML: sense placeholders, amb fonts i limitacions, bilingüe
 */
import { describe, expect, test } from "bun:test";
import {
  announcedEurM2,
  buildNormative,
  buildOverpassQuery,
  buildPriceCheck,
  classifyPoi,
  deltaPct,
  haversineMeters,
  parseOverpassElements,
  priceVerdict,
  NORM_FACTS,
  CHECKLIST,
} from "../src/lib/analitza";
import { buildReportHtml, verdictNote, type AnalitzaReportData } from "../src/lib/analitza-html";

const baseInput = {
  municipalityCode: "081136",
  municipalityName: "Manresa",
  priceEurMonth: 800,
  surfaceM2: 80,
  rooms: 3,
  contractType: "HABITATGE" as const,
  builtYear: 1990,
  previousRent: null,
  notes: null,
};

describe("analitza — càlculs de preu", () => {
  test("€/m² derivat només amb superfície vàlida", () => {
    expect(announcedEurM2(800, 80)).toBe(10);
    expect(announcedEurM2(800, null)).toBeNull();
    expect(announcedEurM2(800, 0)).toBeNull(); // superfície no vàlida → mai dividir
  });

  test("desviació percentual rodona a 1 decimal", () => {
    expect(deltaPct(1000, 800)).toBe(25);
    expect(deltaPct(600, 800)).toBe(-25);
    expect(deltaPct(800, null)).toBeNull();
  });

  test("veredicte per llindars explícits", () => {
    expect(priceVerdict(-30)).toBe("VERY_BELOW");
    expect(priceVerdict(-10)).toBe("BELOW");
    expect(priceVerdict(0)).toBe("IN_RANGE");
    expect(priceVerdict(10)).toBe("ABOVE");
    expect(priceVerdict(20)).toBe("VERY_ABOVE");
    expect(priceVerdict(null)).toBeNull();
  });

  test("buildPriceCheck: referència oficial vs estimació de comarca", () => {
    const oficial = buildPriceCheck({
      priceEurMonth: 900,
      surfaceM2: 90,
      muniRent: 1000,
      isMuniOfficial: true,
      expectedCentral: null,
    });
    expect(oficial.referenceIsEstimate).toBe(false);
    expect(oficial.deltaVsReferencePct).toBe(-10);
    expect(oficial.verdict).toBe("BELOW");

    const estimacio = buildPriceCheck({
      priceEurMonth: 900,
      surfaceM2: 90,
      muniRent: 1000,
      isMuniOfficial: false,
      expectedCentral: null,
    });
    expect(estimacio.referenceIsEstimate).toBe(true);
  });

  test("buildPriceCheck: el veredicte usa el central ajustat si hi és", () => {
    const r = buildPriceCheck({
      priceEurMonth: 1050,
      surfaceM2: 90,
      muniRent: 1000,
      isMuniOfficial: true,
      expectedCentral: 1000, // +5% exacte → límit del rang
    });
    expect(r.deltaVsExpectedPct).toBe(5);
    expect(r.verdict).toBe("IN_RANGE"); // ≤ +5 % és encara dins del rang
  });
});

describe("analitza — normativa per estats (mai legalitat absoluta)", () => {
  test("zona tensada + sense renta anterior → PENDING (mai OK ni ALERT)", () => {
    const r = buildNormative({ ...baseInput, previousRent: null }, true);
    const chk = r.checks.find((c) => c.id === "LIMIT_RENTA_ART172");
    expect(chk?.state).toBe("PENDING");
    expect(r.tense).toBe(true);
    expect(r.appliesRentLimits).toBe(true);
    expect(r.consultedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("zona tensada + anunci superior a la renta anterior → ALERT «possible incompliment»", () => {
    const r = buildNormative({ ...baseInput, previousRent: 700 }, true);
    const chk = r.checks.find((c) => c.id === "LIMIT_RENTA_ART172");
    expect(chk?.state).toBe("ALERT");
  });

  test("zona tensada + anunci ≤ renta anterior → OK «compatible amb les dades consultades»", () => {
    const r = buildNormative({ ...baseInput, previousRent: 900 }, true);
    const chk = r.checks.find((c) => c.id === "LIMIT_RENTA_ART172");
    expect(chk?.state).toBe("OK");
  });

  test("temporada i habitació: fora dels límits de l'art. 17.2 (NA, no error)", () => {
    const temporada = buildNormative({ ...baseInput, contractType: "TEMPORADA", previousRent: 700 }, true);
    expect(temporada.checks.find((c) => c.id === "LIMIT_RENTA_ART172")?.state).toBe("NA");
    expect(temporada.appliesRentLimits).toBe(false);
    const habitacio = buildNormative({ ...baseInput, contractType: "HABITACIO" }, true);
    expect(habitacio.checks.find((c) => c.id === "LIMIT_RENTA_ART172")?.state).toBe("NA");
  });

  test("municipi no tensat: llibertat de renta nova + gran tenedor SERPAVI no aplica", () => {
    const r = buildNormative({ ...baseInput, previousRent: 900 }, false);
    expect(r.checks.find((c) => c.id === "ZONA_TENSADA")?.detail).toBe("MUNI_NO_TENSAT");
    expect(r.checks.find((c) => c.id === "LIMIT_RENTA_ART172")?.state).toBe("NA");
    expect(r.checks.find((c) => c.id === "GRAN_TENEDOR_SERPAVI")?.state).toBe("NA");
  });

  test("fets normatius amb font (resolucions vigents DOGC 19-10-2026 i SERPAVI)", () => {
    expect(NORM_FACTS.tenseResolutions.join(" ")).toContain("TER/3739/2026");
    expect(NORM_FACTS.tenseResolutions.join(" ")).toContain("TER/3740/2026");
    expect(NORM_FACTS.serpaviSource).toContain("mivau.gob.es");
    expect(NORM_FACTS.iravLatestPct).toBe(2.54);
    expect(CHECKLIST.length).toBeGreaterThanOrEqual(9);
    expect(CHECKLIST.every((c) => c.source && c.source.length > 0)).toBe(true);
  });
});

describe("analitza — distàncies i POIs (Overpass/OpenStreetMap)", () => {
  test("haversine: Manresa→Barcelona ≈ 47 km (ordre de magnitud correcte)", () => {
    const d = haversineMeters(41.7269, 1.8246, 41.3874, 2.1686);
    expect(d).toBeGreaterThan(46000);
    expect(d).toBeLessThan(49000);
  });

  test("classifyPoi: categories per tags, null per estranys", () => {
    expect(classifyPoi({ highway: "bus_stop" })).toBe("TRANSPORT");
    expect(classifyPoi({ railway: "station" })).toBe("TRANSPORT");
    expect(classifyPoi({ amenity: "pharmacy" })).toBe("SALUT");
    expect(classifyPoi({ amenity: "school" })).toBe("EDUCACIO");
    expect(classifyPoi({ shop: "supermarket" })).toBe("COMPRA");
    expect(classifyPoi({ leisure: "park" })).toBe("VERD");
    expect(classifyPoi({ amenity: "bench" })).toBeNull();
    expect(classifyPoi(undefined)).toBeNull();
  });

  test("parseOverpassElements: nodes + ways amb center, dedup i ordenació", () => {
    const els = [
      { type: "node", lat: 41.727, lon: 1.824, tags: { highway: "bus_stop", name: "Puda" } },
      { type: "way", center: { lat: 41.726, lon: 1.823 }, tags: { leisure: "park", name: "Parc de l'Agulla" } },
      { type: "node", lat: 41.727, lon: 1.824, tags: { highway: "bus_stop", name: "Puda" } }, // duplicat
      { type: "node", lat: 41.728, lon: 1.825, tags: { amenity: "school", name: "Escola Joviat" } },
      { type: "node", lat: 41.729, lon: 1.826, tags: { amenity: "bench" } }, // fora
      { type: "node", tags: { amenity: "pharmacy" } }, // sense coordenades → fora
    ];
    const pois = parseOverpassElements(els as never, 41.7269, 1.8246);
    expect(pois.length).toBe(3); // dedup + descartats
    expect(pois[0].distanceM).toBeLessThanOrEqual(pois[pois.length - 1].distanceM);
    expect(pois.map((p) => p.category)).toEqual(["TRANSPORT", "EDUCACIO", "VERD"]); // ordenats per proximitat
    expect(pois.every((p) => Number.isFinite(p.distanceM))).toBe(true);
  });

  test("consulta Overpass: coordenades sanejades i límit d'elements", () => {
    const q = buildOverpassQuery(41.7269, 1.8246, 800);
    expect(q).toContain("[out:json][timeout:20]");
    expect(q).toContain("around:800,41.72690,1.82460");
    expect(q).toContain("out center 150");
  });
});

// ── informe descargable ──────────────────────────────────────────────────────

const reportFixture: AnalitzaReportData = {
  ok: true,
  generatedAt: "2026-11-15T10:00:00.000Z",
  input: {
    municipalityCode: "081136",
    municipalityName: "Manresa",
    comarca: "Bages",
    province: "Barcelona",
    address: "Passeig Pere III, 1",
    lat: 41.7269,
    lng: 1.8246,
    priceEurMonth: 800,
    surfaceM2: 80,
    rooms: 3,
    contractType: "HABITATGE",
    builtYear: 1990,
    previousRent: 700,
    notes: null,
  },
  price: {
    eurM2: 10,
    reference: 750,
    referenceIsEstimate: false,
    referenceSource: "INCASOL_MUNICIPI",
    referencePeriod: "2025",
    referenceContracts: 1468,
    referenceScope: "MUNICIPI",
    deltaVsReferencePct: 6.7,
    deltaVsExpectedPct: 3.2,
    verdict: "ABOVE",
    expected: {
      central: 775,
      baseCentral: 750,
      baseSource: "MUNICIPI",
      typical: false,
      adjustments: [{ key: "AJUST_SUPERFICIE", factor: 1.033, detail: "80 m²" }],
      warnings: [],
      min: 660,
      max: 890,
      bandBasis: "COMARCA",
      bandN: 7,
      bandYear: "2025",
      relativeDispersion: 0.3,
      confidence: "ALTA",
      confidenceKeys: [],
      eurM2: 9.69,
      notes: { rooms: "ROOMS_MID", estat: null, surface: "SURFACE_DERIVED" },
    },
    evolution: [
      { year: "2023", value: 700 },
      { year: "2024", value: 720 },
      { year: "2025", value: 750 },
    ],
    interannual: [{ year: "2024", pct: 2.9 }, { year: "2025", pct: 4.2 }],
    currentPeriod: "2025",
    neighbours: [
      { code: "080193", name: "Barcelona", distanceKm: 51, rentLatest: 1134, rentPeriod: "2025", rentSource: "INCASOL", contractsLatest: 30789 },
    ],
  },
  normative: {
    tense: true,
    appliesRentLimits: true,
    checks: [
      { id: "ZONA_TENSADA", state: "ALERT", detail: "MUNI_TENSAT" },
      { id: "LIMIT_RENTA_ART172", state: "OK", detail: "NO_SUPERIOR_ANTERIOR" },
      { id: "GRAN_TENEDOR_SERPAVI", state: "PENDING", detail: "CONSULTA_SERPAVI" },
      { id: "ACTUALITZACIO_IRAV", state: "OK", detail: "IRAV_VIGENT" },
    ],
    consultedAt: "2026-11-15",
    tenseList: "A",
    resolutions: ["Resolució TER/3739/2026 (pròrroga, 118 municipis)", "Resolució TER/3740/2026 (nous, 53 municipis)"],
    serpaviUrl: "https://www.mivau.gob.es/vivienda/calculadora-precio-alquiler",
    irav: { pct: 2.54, period: "setembre 2026", source: "https://www.ine.es/" },
    sources: [{ t: "LAU art. 17.2", u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-30303" }],
  },
  serveisPoint: { lat: 41.7269, lng: 1.8246, scope: "VIVENDA" },
  checklist: CHECKLIST,
  sources: [
    { t: "Fiances de lloguer (Incasòl)", u: "https://incasol.gencat.cat/", d: "preu mitjà mensual i contractes per municipi" },
  ],
  limitations: ["LIMIT_REF_MUNICIPAL: la referència és la fiança mitjana municipal, mai el preu real de la vivenda."],
};

describe("analitza — informe HTML descargable", () => {
  test("conté les seccions A-D, fonts i limitacions (ca)", () => {
    const html = buildReportHtml(reportFixture, { ok: true, items: [], distancesNote: "Distàncies aproximades" }, "ca");
    expect(html).toContain("Anàlisi del teu futur lloguer");
    expect(html).toContain("Manresa");
    expect(html).toContain("Fiança mitjana municipal registrada");
    expect(html).toContain("Possible incompliment"); // estat ALERT de zona tensada
    expect(html).toContain("Compatible amb les dades consultades");
    expect(html).toContain("Resolució TER/3739/2026");
    expect(html).toContain("incasol.gencat.cat");
    expect(html).toContain("SÍ"); // checklist col·lumn
  });

  test("bilingüe: versió castellà coherent", () => {
    const html = buildReportHtml(reportFixture, null, "es");
    expect(html).toContain("Análisis de tu futuro alquiler");
    expect(html).toContain("Posible incumplimiento");
    expect(html).toContain("Servicios de entorno no consultados");
  });

  test("serveis no disponibles → nota, mai dades inventades; escape HTML", () => {
    const html = buildReportHtml(reportFixture, { ok: false, message: "El servei no ha respòs" }, "ca");
    expect(html).toContain("El servei no ha respòs");
    const evil = JSON.parse(JSON.stringify(reportFixture)) as AnalitzaReportData;
    evil.input.address = "<script>alert(1)</script>";
    const escaped = buildReportHtml(evil, null, "ca");
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  test("notes dels veredictes extrems (mai puntuació opaca)", () => {
    expect(verdictNote("VERY_ABOVE", "ca")).toContain("justificat només parcialment");
    expect(verdictNote("VERY_BELOW", "ca")).toContain("habitabilitat");
    expect(verdictNote("IN_RANGE", "ca")).toBeNull();
    expect(verdictNote(null, "es")).toBeNull();
  });
});
