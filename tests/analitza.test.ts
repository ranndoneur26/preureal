/**
 * Tests de «Consulta el preu real registrat» (F1 del redisseny de la Home):
 * lògica PURA dels mòduls src/lib/analitza.ts (preu, normativa, POIs,
 * distàncies) i src/lib/analitza-html.ts (informe descargable). Sense BD ni
 * xarxa. Regles que cobreix:
 *  - €/m² derivat només amb superfície vàlida (mai de la font)
 *  - veredicte per llindars explícits (−25/−5/+5/+15)
 *  - normativa: estats (mai legalitat), tipus de contracte, zona tensada,
 *    renta anterior superior → ALERT, sense dada → PENDING
 *  - parser Overpass defensiu: nodes i ways amb center, dedup, distàncies
 *  - informe HTML: sense placeholders, amb fonts i limitacions, bilingüe
 *  - F1: transparència (text fix «no taxació»), SERPAVI oficial, retiquetat
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
  ORIENTATION_DISCLAIMER,
  SERPAVI_URL,
} from "../src/lib/analitza";
import { buildReportHtml, verdictNote, type AnalitzaReportData } from "../src/lib/analitza-html";
import {
  buildEstimation,
  sanitizeEstimaSurface,
  sanitizeEstimaMunicipalityCode,
  sanitizeEstimaRooms,
  sanitizeEstimaEstat,
  ESTIMA_DISCLAIMER,
  ESTIMA_SERPAVI_URL,
  ESTIMA_SOURCES,
  ESTIMA_LIMITATIONS,
  ESTIMA_SURFACE_MIN,
  ESTIMA_SURFACE_MAX,
  ESTIMA_ROOMS_MAX,
  type EstimaOutcome,
  type EstimationResult,
  type EstimaFailureReason,
} from "../src/lib/estima";
import {
  round1,
  relativeIqr,
  VAL_REF_M2,
  VAL_BETA_SUPERFICIE,
  VAL_ESTAT_MULT,
  VAL_ROOMS_EXPONENT,
  VAL_ROOMS_CLAMP,
  VAL_REF_M2_PER_HAB,
  type EstatConservacio,
} from "../src/lib/territorial";

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
      { id: "ZONA_TENSADA", state: "INFO", detail: "MUNI_TENSAT" },
      { id: "LIMIT_RENTA_ART172", state: "OK", detail: "NO_SUPERIOR_ANTERIOR" },
      { id: "GRAN_TENEDOR_SERPAVI", state: "PENDING", detail: "CONSULTA_SERPAVI" },
      { id: "ACTUALITZACIO_IRAV", state: "INFO", detail: "IRAV_VIGENT" },
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
    expect(html).toContain("Consulta del preu real registrat");
    expect(html).toContain("Manresa");
    expect(html).toContain("Fiança mitjana municipal registrada");
    expect(html).toContain("Informació aplicable"); // estat INFO de zona tensada
    expect(html).toContain("Resolució TER/3739/2026");
    expect(html).toContain("incasol.gencat.cat");
    expect(html).toContain("SÍ"); // checklist col·lumn
  });

  test("bilingüe: versió castellà coherent", () => {
    const html = buildReportHtml(reportFixture, null, "es");
    expect(html).toContain("Consulta del precio real registrado");
    expect(html).toContain("Información aplicable"); // estat INFO de zona tensada
    expect(html).toContain("Requiere comprobaciones adicionales"); // estat PENDING SERPAVI
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

// ── F1 (redisseny de la Home): transparència i separació de funcionalitats ──

describe("F1 — separació UX i transparència", () => {
  test("SERPAVI_URL és el portal oficial de consulta individualitzada (MIVAU)", () => {
    expect(SERPAVI_URL).toBe("https://serpavi.mivau.gob.es/");
    expect(SERPAVI_URL.startsWith("https://")).toBe(true);
  });

  test("el text fix de transparència nega taxació i valoració individualitzada (ca i es)", () => {
    expect(ORIENTATION_DISCLAIMER.ca).toContain("Estimació estadística orientativa");
    expect(ORIENTATION_DISCLAIMER.ca).toContain("No és una taxació");
    expect(ORIENTATION_DISCLAIMER.ca).toContain("valoració individualitzada");
    expect(ORIENTATION_DISCLAIMER.es).toContain("Estimación estadística orientativa");
    expect(ORIENTATION_DISCLAIMER.es).toContain("No es una tasación");
    expect(ORIENTATION_DISCLAIMER.es).toContain("valoración individualizada");
  });

  test("l'informe HTML/PDF inclou el text fix a la capçalera i retiqueta la comparativa", () => {
    const html = buildReportHtml(reportFixture, null, "ca");
    // text fix present (compacta i completa comparteixen el generador del PDF)
    expect(html).toContain(ORIENTATION_DISCLAIMER.ca);
    // la comparativa per característiques ja no es presenta com a «valoració»
    expect(html).toContain("Central orientativa (comparativa estadística)");
    expect(html).toContain("No és una taxació ni una valoració individualitzada");
    expect(html).not.toContain("Central ajustada per a AQUESTA vivenda");
    expect(html).not.toContain("diferència amb la valoració per característiques");
  });

  test("zona tensada a l'informe: avís legal (Llei 12/2023, art. 17.2) + enllaç SERPAVI oficial", () => {
    const html = buildReportHtml(reportFixture, null, "ca"); // fixture: tense=true
    expect(html).toContain("Zona tensada (Llei 12/2023, LAU art. 17.2)");
    expect(html).toContain(SERPAVI_URL);
    const htmlEs = buildReportHtml(reportFixture, null, "es");
    expect(htmlEs).toContain("Zona tensionada (Ley 12/2023, LAU art. 17.2)");
  });

  test("zona NO tensada: sense avís legal de límits (no es mostra el bloc SERPAVI legal)", () => {
    const senseTensio = JSON.parse(JSON.stringify(reportFixture)) as AnalitzaReportData;
    senseTensio.normative.tense = false;
    const html = buildReportHtml(senseTensio, null, "ca");
    expect(html).not.toContain("Zona tensada (Llei 12/2023, LAU art. 17.2)");
  });
});

// ── F2 (redisseny de la Home): «Estima el lloguer del teu habitatge» (N1) ────

const comarcaPool = [600, 650, 700, 750, 800, 850, 900];

const estimaData = {
  rentLatest: 750,
  rentPeriod: "2025",
  contracts: 1468,
  history: null,
  comarcaValues: comarcaPool,
  provinciaValues: [],
  comarcaRefLatest: null,
  comarcaRefPeriod: null,
  tense: false,
};

const estimaInput = { municipalityCode: "081136", municipalityName: "Manresa", surfaceM2: 85 };

function mustOk(out: EstimaOutcome): EstimationResult {
  if (!out.ok) throw new Error(`esperava ok, va fallar: ${out.reason}`);
  return out.result;
}

function mustFail(out: EstimaOutcome): EstimaFailureReason {
  if (out.ok) throw new Error("esperava fallida, ha retornat resultat");
  return out.reason;
}

describe("F2 estima — sanitització d'entrada (N1 només demana el que usa)", () => {
  test("superfície: rang 5–500, res de franges lliures", () => {
    expect(sanitizeEstimaSurface(85)).toBe(85);
    expect(sanitizeEstimaSurface(ESTIMA_SURFACE_MIN)).toBe(5);
    expect(sanitizeEstimaSurface(ESTIMA_SURFACE_MAX)).toBe(500);
    expect(sanitizeEstimaSurface("120")).toBe(120);
    expect(sanitizeEstimaSurface(0)).toBeNull();
    expect(sanitizeEstimaSurface(501)).toBeNull();
    expect(sanitizeEstimaSurface(-10)).toBeNull();
    expect(sanitizeEstimaSurface(null)).toBeNull();
    expect(sanitizeEstimaSurface(undefined)).toBeNull();
    expect(sanitizeEstimaSurface(NaN)).toBeNull();
    expect(sanitizeEstimaSurface(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("municipi: exactament 6 dígits", () => {
    expect(sanitizeEstimaMunicipalityCode("081136")).toBe("081136");
    expect(sanitizeEstimaMunicipalityCode("08113")).toBeNull();
    expect(sanitizeEstimaMunicipalityCode("08113a")).toBeNull();
    expect(sanitizeEstimaMunicipalityCode(undefined)).toBeNull();
    expect(sanitizeEstimaMunicipalityCode("")).toBeNull();
  });
});

describe("F2 estima — càlcul N1 (base oficial + elasticitat documentada)", () => {
  test("85 m² = vivenda típica: central exactament la base oficial, horquilla mesurada", () => {
    const r = mustOk(buildEstimation(estimaData, estimaInput));
    expect(r.level).toBe("N1");
    expect(r.central).toBe(750); // (85/85)^0,8 = 1
    expect(r.baseCentral).toBe(750);
    expect(r.baseSource).toBe("MUNICIPI");
    expect(r.basePeriod).toBe("2025");
    expect(r.contracts).toBe(1468);
    expect(r.eurM2Typical).toBe(round1(750 / VAL_REF_M2)); // DERIVAT: base / 85 m² típics
    expect(r.eurM2).toBe(round1(750 / 85)); // DERIVAT: central / 85 m² introduïts
    expect(r.bandBasis).toBe("COMARCA");
    expect(r.bandN).toBe(7);
    expect(r.bandYear).toBe("2025");
    // l'amplada surt de la dispersió MESURADA del pool, mai d'un percentil inventat
    const disp = relativeIqr(comarcaPool) as number;
    expect(r.relativeDispersion).toBe(round1(disp));
    expect(r.min).toBe(round1(Math.max(750 * 0.5, 750 - (750 * disp) / 2)));
    expect(r.max).toBe(round1(750 + (750 * disp) / 2));
    expect(r.min).toBeLessThan(r.central);
    expect(r.max).toBeGreaterThan(r.central);
    expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE"]); // N1: només superfície
    expect(r.confidence).toBe("ALTA"); // any 2025 + 1468 contractes + pool comarca
    expect(r.tense).toBe(false);
  });

  test("50 m²: escalat amb l'elasticitat documentada (0,8) sobre la típica de 85 m²", () => {
    const r = mustOk(buildEstimation(estimaData, { ...estimaInput, surfaceM2: 50 }));
    const expected = round1(750 * Math.pow(50 / VAL_REF_M2, VAL_BETA_SUPERFICIE));
    expect(r.central).toBe(expected);
    expect(r.min).toBeLessThan(r.central);
    expect(r.max).toBeGreaterThan(r.central);
    expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE"]);
  });

  test("superfície sota el rang calibrat: satura a 20 m² i avisa d'habitabilitat (informatiu)", () => {
    const r = mustOk(buildEstimation(estimaData, { ...estimaInput, surfaceM2: 10 }));
    const expected = round1(750 * Math.pow(20 / VAL_REF_M2, VAL_BETA_SUPERFICIE));
    expect(r.central).toBe(expected);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.level === "ILLEGAL")).toBe(true); // 10 m² < 15 m² (Decret 141/2012)
  });

  test("el rang manté la proporció: mai horquilles per sobre de ±30 %", () => {
    const r = mustOk(buildEstimation(estimaData, estimaInput));
    const halfPct = ((r.max - r.central) / r.central) * 100;
    expect(halfPct).toBeLessThanOrEqual(30);
  });
});

describe("F2 estima — degradació honesta (mai inventar res)", () => {
  test("municipi sense fiança publicada: base de COMARCA marcada ESTIMACIÓ + confiança BAIXA", () => {
    const r = mustOk(
      buildEstimation(
        { ...estimaData, rentLatest: null, rentPeriod: null, comarcaRefLatest: 700, comarcaRefPeriod: "2025" },
        estimaInput,
      ),
    );
    expect(r.baseSource).toBe("COMARCA_REF");
    expect(r.confidence).toBe("BAIXA");
    expect(r.confidenceKeys).toContain("CONF_BASE_COMARCA_REF");
    expect(r.basePeriod).toBe("2025");
    expect(r.baseCentral).toBe(700);
  });

  test("sense fiança municipal ni referència de comarca → NO_RENT («dades insuficients»)", () => {
    const reason = mustFail(
      buildEstimation({ ...estimaData, rentLatest: null, comarcaRefLatest: null }, estimaInput),
    );
    expect(reason).toBe("NO_RENT");
  });

  test("entrada no vàlida → BAD_INPUT (mai estimar amb dades buides)", () => {
    expect(mustFail(buildEstimation(estimaData, { ...estimaInput, surfaceM2: 0 }))).toBe("BAD_INPUT");
    expect(mustFail(buildEstimation(estimaData, { ...estimaInput, surfaceM2: 600 }))).toBe("BAD_INPUT");
    expect(mustFail(buildEstimation(estimaData, { ...estimaInput, surfaceM2: Number.NaN }))).toBe("BAD_INPUT");
  });
});

describe("F2 estima — horquilla territorial traçada", () => {
  test("pool de comarca insuficient → província (pool més ampli, sempre traçat)", () => {
    const prov = Array.from({ length: 12 }, (_, i) => 500 + i * 60);
    const r = mustOk(buildEstimation({ ...estimaData, comarcaValues: [], provinciaValues: prov }, estimaInput));
    expect(r.bandBasis).toBe("PROVINCIA");
    expect(r.bandN).toBe(12);
    expect(r.min).toBeLessThan(r.central);
    expect(r.max).toBeGreaterThan(r.central);
  });

  test("sense pool territorial → sèrie històrica municipal com a última xarxa", () => {
    const r = mustOk(
      buildEstimation(
        { ...estimaData, comarcaValues: [], provinciaValues: [], history: { "2022": 600, "2023": 700, "2024": 750, "2025": 750 } },
        estimaInput,
      ),
    );
    expect(r.bandBasis).toBe("HISTORICA");
    expect(r.min).toBeLessThan(r.central);
    expect(r.max).toBeGreaterThan(r.central);
  });

  test("zona tensada: la bandera travessa el motor per a l'avís legal SERPAVI", () => {
    const r = mustOk(buildEstimation({ ...estimaData, tense: true }, estimaInput));
    expect(r.tense).toBe(true);
  });
});

describe("F2 estima — transparència i fonts (mateix criteri que F1)", () => {
  test("el text fix de transparència és el compartit amb F1 (mai taxació)", () => {
    expect(ESTIMA_DISCLAIMER).toBe(ORIENTATION_DISCLAIMER);
    expect(ESTIMA_DISCLAIMER.ca).toContain("No és una taxació");
    expect(ESTIMA_DISCLAIMER.es).toContain("No es una tasación");
  });

  test("SERPAVI és el portal oficial MIVAU (mai simulació de consulta oficial)", () => {
    expect(ESTIMA_SERPAVI_URL).toBe("https://serpavi.mivau.gob.es/");
    expect(ESTIMA_SERPAVI_URL.startsWith("https://")).toBe(true);
  });

  test("fonts: Incasòl com a base N1 + SERPAVI oficial, totes amb URL", () => {
    expect(ESTIMA_SOURCES.some((s) => s.u.includes("incasol.gencat.cat"))).toBe(true);
    expect(ESTIMA_SOURCES.some((s) => s.u.includes("serpavi.mivau.gob.es"))).toBe(true);
    expect(ESTIMA_SOURCES.every((s) => s.u.startsWith("https://") && s.d.length > 0)).toBe(true);
  });

  test("limitacions: comarca estimació, horquilla mesurada, SERPAVI legal i privacitat", () => {
    expect(ESTIMA_LIMITATIONS.length).toBeGreaterThanOrEqual(5);
    const all = ESTIMA_LIMITATIONS.join(" ");
    expect(all).toContain("LIMIT_COMARCA_REF");
    expect(all).toContain("LIMIT_HORQUILLA_MESURADA");
    expect(all).toContain("LIMIT_SERPAVI_LEGAL");
    expect(all).toContain("LIMIT_PRIVACITAT");
  });
});

// ── F3 (redisseny de la Home): N2 — ajustos per característiques documentades ─

describe("F3 estima N2 — sanitització de característiques (mai inventar res)", () => {
  test("habitacions: enter 0–12; buit/null/undefined → null; fora de rang o decimal → null", () => {
    expect(sanitizeEstimaRooms(3)).toBe(3);
    expect(sanitizeEstimaRooms("4")).toBe(4);
    expect(sanitizeEstimaRooms(0)).toBe(0); // estudi
    expect(sanitizeEstimaRooms(ESTIMA_ROOMS_MAX)).toBe(12);
    expect(sanitizeEstimaRooms("")).toBeNull();
    expect(sanitizeEstimaRooms(null)).toBeNull();
    expect(sanitizeEstimaRooms(undefined)).toBeNull();
    expect(sanitizeEstimaRooms(-1)).toBeNull();
    expect(sanitizeEstimaRooms(13)).toBeNull();
    expect(sanitizeEstimaRooms(2.5)).toBeNull(); // no-enter → null
    expect(sanitizeEstimaRooms(Number.NaN)).toBeNull();
  });

  test("estat de conservació: només les 4 categories del motor validat", () => {
    const estats: EstatConservacio[] = ["A_REFORMAR", "BON_ESTAT", "REFORMADA", "OBRA_NOVA"];
    for (const e of estats) expect(sanitizeEstimaEstat(e)).toBe(e);
    expect(sanitizeEstimaEstat("")).toBeNull();
    expect(sanitizeEstimaEstat("REMODELADO")).toBeNull();
    expect(sanitizeEstimaEstat("a_reformar")).toBeNull(); // exactes, sense normalitzar
    expect(sanitizeEstimaEstat(null)).toBeNull();
    expect(sanitizeEstimaEstat(undefined)).toBeNull();
    expect(sanitizeEstimaEstat(123)).toBeNull();
  });
});

describe("F3 estima N2 — multiplicadors d'estat documentats (ancoratge Fotocasa 2021)", () => {
  test("85 m² + estat: central = base oficial × multiplicador documentat, nivell N2", () => {
    for (const estat of ["A_REFORMAR", "BON_ESTAT", "REFORMADA", "OBRA_NOVA"] as EstatConservacio[]) {
      const r = mustOk(buildEstimation(estimaData, { ...estimaInput, estat }));
      expect(r.level).toBe("N2");
      expect(r.estat).toBe(estat);
      expect(r.rooms).toBeNull();
      expect(r.central).toBe(round1(750 * VAL_ESTAT_MULT[estat]));
      expect(r.baseCentral).toBe(750); // la base queda intacta (traçabilitat)
      expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE", "AJUST_ESTAT"]);
      expect(r.min).toBeLessThanOrEqual(r.central);
      expect(r.max).toBeGreaterThanOrEqual(r.central);
    }
  });

  test("valors dels multiplicadors exactes i ancorats (mai coeficients inventats)", () => {
    expect(VAL_ESTAT_MULT.A_REFORMAR).toBe(0.8);
    expect(VAL_ESTAT_MULT.BON_ESTAT).toBe(1);
    expect(VAL_ESTAT_MULT.REFORMADA).toBe(1.06);
    expect(VAL_ESTAT_MULT.OBRA_NOVA).toBe(1.12);
  });

  test("85 m² reformada: rang orientatiu ±dispersió mesurada sobre el central ajustat", () => {
    const r = mustOk(buildEstimation(estimaData, { ...estimaInput, estat: "REFORMADA" }));
    const disp = relativeIqr(comarcaPool) as number;
    const central = round1(750 * 1.06); // 795
    expect(r.central).toBe(central);
    expect(r.min).toBe(round1(Math.max(central * 0.5, central - (central * disp) / 2)));
    expect(r.max).toBe(round1(central + (central * disp) / 2));
  });
});

describe("F3 estima N2 — densitat d'habitacions documentada (limitada ±5 %)", () => {
  test("3 habitacions a 85 m²: factor de densitat dins del rang, nivell N2", () => {
    const r = mustOk(buildEstimation(estimaData, { ...estimaInput, rooms: 3, surfaceM2: 85 }));
    const dens = 85 / 3;
    const raw = Math.pow(dens / VAL_REF_M2_PER_HAB, VAL_ROOMS_EXPONENT);
    const f = Math.min(Math.max(raw, 1 - VAL_ROOMS_CLAMP), 1 + VAL_ROOMS_CLAMP);
    expect(r.level).toBe("N2");
    expect(r.rooms).toBe(3);
    expect(r.estat).toBeNull();
    expect(r.central).toBe(round1(750 * f));
    expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE", "AJUST_HABITACIONS"]);
    expect(f).toBeGreaterThanOrEqual(1 - VAL_ROOMS_CLAMP);
    expect(f).toBeLessThanOrEqual(1 + VAL_ROOMS_CLAMP);
  });

  test("el clamp ±5 % aguanta formats extremats (estudi 1 hab a 85 m²)", () => {
    const r = mustOk(buildEstimation(estimaData, { ...estimaInput, rooms: 1, surfaceM2: 85 }));
    expect(r.central).toBe(round1(750 * (1 + VAL_ROOMS_CLAMP))); // 1,1098 → satura a 1,05
    expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE", "AJUST_HABITACIONS"]);
  });

  test("estudi (0 habitacions): sense efecte al càlcul → el nivell segueix sent N1", () => {
    const r = mustOk(buildEstimation(estimaData, { ...estimaInput, rooms: 0, surfaceM2: 85 }));
    expect(r.level).toBe("N1"); // cap ajust de característica aplicat de debò
    expect(r.rooms).toBe(0);
    expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE"]);
    expect(r.central).toBe(750);
  });

  test("ordre d'aplicació dels ajustos: superfície → estat → habitacions", () => {
    const r = mustOk(
      buildEstimation(estimaData, { ...estimaInput, rooms: 3, surfaceM2: 85, estat: "REFORMADA" }),
    );
    expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE", "AJUST_ESTAT", "AJUST_HABITACIONS"]);
    expect(r.level).toBe("N2");
    const expected = round1(750 * VAL_ESTAT_MULT.REFORMADA * Math.pow((85 / 3) / VAL_REF_M2_PER_HAB, VAL_ROOMS_EXPONENT));
    expect(r.central).toBe(expected);
  });
});

describe("F3 estima N2 — N1 es manté intacte quan no es demanen característiques", () => {
  test("sense rooms/estat: mateix resultat que F2 (N1, cap característica exposada)", () => {
    const r = mustOk(buildEstimation(estimaData, estimaInput));
    expect(r.level).toBe("N1");
    expect(r.rooms).toBeNull();
    expect(r.estat).toBeNull();
    expect(r.adjustmentKeys).toEqual(["AJUST_SUPERFICIE"]);
    expect(r.adjustments.every((a) => a.key === "AJUST_SUPERFICIE")).toBe(true);
  });

  test("característiques no vàlides → null (mai estimar amb dades inventades)", () => {
    const r = mustOk(
      buildEstimation(estimaData, {
        ...estimaInput,
        rooms: 99,
        estat: "PISELO" as unknown as EstatConservacio, // valor il·legal (p. ex. via API)
      }),
    );
    expect(r.rooms).toBeNull();
    expect(r.estat).toBeNull();
    expect(r.level).toBe("N1");
  });
});

describe("F3 estima N2 — transparència: limitacions noves documentades", () => {
  test("limitacions: N2 només coeficients documentats + N3 secció censal mai simulada", () => {
    const all = ESTIMA_LIMITATIONS.join(" ");
    expect(all).toContain("LIMIT_N2_CARACTERISTIQUES");
    expect(all).toContain("LIMIT_N3_SECCIO_CENSAL");
    expect(all).toContain("secció censal");
    expect(all).toContain("NO simula consultes oficials");
    // les variables sense coeficient documentat NO es demanen
    expect(all).toContain("ascensor");
    expect(all).toContain("qualificació energètica");
  });

  test("fonts: el motor documentat inclou els multiplicadors d'estat i densitat", () => {
    const motor = ESTIMA_SOURCES.find((s) => s.u.includes("territorial.ts"));
    expect(motor).toBeDefined();
    expect(motor?.d).toContain("estat de conservació");
    expect(motor?.d).toContain("densitat m²/habitació");
  });
});
