/**
 * Fase 3 — Tests del servei d'indicadors.
 *
 * PART A: fórmules pures amb valors esperats EXACTES (calculats a mà).
 * PART B: pipeline sencer sobre dades REALS — fixtures INE descarregats el
 *         10-11-2026 (data/fixtures/) + snapshot real de fiances Incasòl de
 *         data/municipalities.json. Sense BD ni xarxa: tot el càlcul que
 *         producció farà es valida aquí amb les mateixes dades.
 * PART C: invariants (mai llança, mai NaN, nulls honestos).
 *
 * Ús: npx tsx scripts/fase3_test_indicators.ts
 */
import * as fs from "fs";
import {
  assembleMuniIndicators,
  bandQuantiles,
  buildIpvaTerritory,
  buildRentaTerritory,
  effortEconomic,
  INDICATOR_META,
  ipvaAcum,
  ipvaAnualFromIndex,
  MIN_SAMPLES_BAND,
  posVsMedian,
  refBand,
  refBandLabel,
  round1,
  terrDelta,
  type StatObsLite,
} from "../src/lib/indicators";
import {
  buildMuniMatcher,
  parseAtlasMuni,
  parseAtlasNacional,
  parseIpvaMuni,
  parseIpvaNacCcaa,
  parseIpvaProv,
} from "../src/lib/ine-parse";

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : "");
  }
}
const approx = (a: number | null | undefined, b: number, tol = 0.01) =>
  a !== null && a !== undefined && Math.abs(a - b) <= tol;

const FIX = "data/fixtures";
const munis = JSON.parse(fs.readFileSync("data/municipalities.json", "utf-8"));
const match = buildMuniMatcher(munis);

// ── PART A — fórmules pures (valors exactes) ────────────────────────────────
console.log("\n── PART A · fórmules pures ──");

// POS_VS_MEDIAN
const p1 = posVsMedian(850, 792.7);
ok(!!p1 && p1.absDiff === 57.3 && p1.pctDiff === 7.23 && p1.direction === "ABOVE", "posVsMedian(850, 792.7) → +7,23 % ABOVE", p1);
const p2 = posVsMedian(700, 792.7);
ok(!!p2 && p2.absDiff === -92.7 && p2.pctDiff === -11.69 && p2.direction === "BELOW", "posVsMedian(700, 792.7) → −11,69 % BELOW", p2);
const p3 = posVsMedian(792.7, 792.7);
ok(!!p3 && p3.direction === "AT" && p3.pctDiff === 0, "posVsMedian(iguals) → AT 0 %", p3);
ok(posVsMedian(0, 100) === null && posVsMedian(-5, 100) === null, "posVsMedian rebutja preu ≤ 0");
ok(posVsMedian(100, 0) === null && posVsMedian(100, null) === null, "posVsMedian rebutja mediana invàlida");
ok(posVsMedian(NaN, 100) === null && posVsMedian(Infinity, 100) === null, "posVsMedian rebutja NaN/Infinity");

// REF_BAND
ok(refBand(50, 40, 60) === "WITHIN", "refBand(50,[40,60]) → WITHIN");
ok(refBand(40, 40, 60) === "WITHIN" && refBand(60, 40, 60) === "WITHIN", "refBand límits inclusius");
ok(refBand(39.99, 40, 60) === "BELOW" && refBand(60.01, 40, 60) === "ABOVE", "refBand fora de banda");
ok(refBand(50, 60, 40) === null, "refBand amb banda mal formada → null");
ok(refBand(50, null, 60) === null, "refBand amb P25 absent → null");
ok(refBandLabel("WITHIN", "ca") === "Dins del rang de referència" && refBandLabel("WITHIN", "es") === "Dentro del rango de referencia", "refBandLabel ca/es");

// TERR_DELTA
const d1 = terrDelta({ value: 792.7, period: "2025" }, { value: 950, period: "2024", geoName: "Referència" });
ok(!!d1 && d1.absDiff === -157.3 && d1.pctDiff === -16.56 && d1.otherGeoName === "Referència", "terrDelta(792.7 vs 950) → −16,56 %", d1);
ok(terrDelta({ value: 100, period: "2024" }, { value: 0, period: "2024" }) === null, "terrDelta amb B=0 → null");
ok(terrDelta({ value: NaN, period: "2024" }, { value: 100, period: "2024" }) === null, "terrDelta amb A=NaN → null");

// IPVA
ok(ipvaAcum(121.4) === 21.4, "ipvaAcum(121.4) → +21,4 %", ipvaAcum(121.4));
ok(ipvaAcum(100) === 0, "ipvaAcum(100) → 0");
ok(ipvaAcum(96.2) === -3.8, "ipvaAcum(96.2) → −3,8 %");
ok(ipvaAcum(NaN) === null && ipvaAcum(null) === null, "ipvaAcum invàlids → null");
const anual = ipvaAnualFromIndex([
  { period: "2022", value: 115.2 },
  { period: "2023", value: 118.5 },
  { period: "2024", value: 121.4 },
]);
ok(!!anual && anual.period === "2024" && approx(anual.value, 2.4, 0.05), "ipvaAnualFromIndex → +2,4 % (2024)", anual);
ok(ipvaAnualFromIndex([{ period: "2024", value: 121.4 }]) === null, "ipvaAnualFromIndex amb 1 punt → null");

// EFFORT (exemple de la proposta: Cornellà 792,7 €/mes, renda llar 45.000 €/any)
const e1 = effortEconomic(792.7, 45000, { rentPeriod: "2025", rentaPeriod: "2024" });
ok(!!e1 && e1.pct === 21.14, "effort(792.7, 45000) → 21,14 %", e1);
ok(round1(e1?.pct ?? -1) === 21.1, "effort arrodonit a 1 decimal → 21,1 % (proposta)");
ok(effortEconomic(0, 45000) === null && effortEconomic(-100, 45000) === null, "effort rebutja lloguer ≤ 0");
ok(effortEconomic(792.7, 0) === null && effortEconomic(792.7, null) === null, "effort rebutja renda invàlida");
ok(effortEconomic(NaN, 45000) === null, "effort rebutja NaN");

// Banda P25/P50/P75 (quartils tipus 7 amb pesos enters)
const b1 = bandQuantiles([{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }]);
ok(!!b1 && b1.p25 === 1.75 && b1.p50 === 2.5 && b1.p75 === 3.25 && b1.n === 4, "bandQuantiles([1..4]) → 1,75/2,5/3,25", b1);
const b2 = bandQuantiles([{ value: 10, weight: 3 }, { value: 20, weight: 1 }]);
ok(!!b2 && b2.p25 === 10 && b2.p50 === 10 && b2.p75 === 12.5 && b2.totalWeight === 4, "bandQuantiles ponderat [10×3, 20×1] → 10/10/12,5", b2);
const b3 = bandQuantiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => ({ value: v })));
ok(!!b3 && b3.p25 === 32.5 && b3.p50 === 55 && b3.p75 === 77.5, "bandQuantiles([10..100]) → 32,5/55/77,5", b3);
const b4 = bandQuantiles([{ value: 5 }]);
ok(!!b4 && b4.p25 === 5 && b4.p50 === 5 && b4.p75 === 5, "bandQuantiles d'1 mostra → 5/5/5");
ok(bandQuantiles([]) === null && bandQuantiles(null) === null, "bandQuantiles buit → null");
ok(bandQuantiles([{ value: NaN }]) === null && bandQuantiles([{ value: -3 }]) === null, "bandQuantiles filtra valors invàlids");
ok(MIN_SAMPLES_BAND === 5, "MIN_SAMPLES_BAND = 5");

// Metadades
const metaCodes = Object.keys(INDICATOR_META);
ok(metaCodes.length === 7, "INDICATOR_META amb 7 indicadors (6 calculats + EFFORT_PCAP)", metaCodes);
ok(
  metaCodes.every((c) => {
    const m = INDICATOR_META[c];
    return m.label.ca.length > 3 && m.label.es.length > 3 && m.formula.length > 3 && m.avis.ca.length > 10 && m.avis.es.length > 10;
  }),
  "tots els indicadors tenen etiqueta, fórmula i avís ca/es",
);

// ── PART B — pipeline sobre dades REALS ─────────────────────────────────────
console.log("\n── PART B · dades reals (fixtures INE + fiances Incasòl) ──");

// fiances reals del snapshot
const bcnFiances = munis.find((m: { code: string }) => m.code === "080193");
const cornella = munis.find((m: { code: string }) => m.code === "080734"); // Cornellà de Llobregat
ok(!!bcnFiances && bcnFiances.rentLatest > 500 && bcnFiances.rentLatest < 2500, `fiances reals Barcelona ${bcnFiances?.rentLatest} €/mes (${bcnFiances?.rentPeriod})`);
ok(!!cornella && approx(cornella.rentLatest, 792.7, 0.5), `fiances reals Cornellà ${cornella?.rentLatest} €/mes (proposta: 792,7)`, cornella?.rentLatest);
ok(Array.isArray(bcnFiances?.rentHistory) === false && Object.keys(bcnFiances?.rentHistory ?? {}).length >= 15, "historial de fiances Barcelona complet");

// IPVA real (NAC + CCAA + províncies + municipis)
const rNac = parseIpvaNacCcaa(JSON.parse(fs.readFileSync(`${FIX}/ipva_nac_ccaa.json`, "utf-8")));
const rProv = parseIpvaProv(JSON.parse(fs.readFileSync(`${FIX}/ipva_prov.json`, "utf-8")));
const rMuni = parseIpvaMuni(JSON.parse(fs.readFileSync(`${FIX}/ipva_muni.json`, "utf-8")), match);
const ipvaObs: StatObsLite[] = [...rNac.observations, ...rProv.observations, ...rMuni.observations].map((o) => ({
  ...o,
  sourceCode: "INE_IPVA",
}));
console.log(`  · IPVA observacions: NAC/CCAA=${rNac.observations.length} PROV=${rProv.observations.length} MUNI=${rMuni.observations.length}`);

const ipvaCat = buildIpvaTerritory(ipvaObs, { geoLevel: "CCAA", geoCode: "09" });
ok(!!ipvaCat && ipvaCat.indice.length >= 9, `IPVA Catalunya: ${ipvaCat?.indice.length} punts d'índex`);
ok(approx(ipvaCat?.indice[0].value, 100, 0.05) && ipvaCat?.indice[0].period === "2015", `base 2015 = 100 (real: ${ipvaCat?.indice[0].value})`);
ok(ipvaCat?.indice.every((p) => p.value > 90 && p.value < 160) === true, "índex Catalunya en rang plausible (90–160)");
ok(ipvaCat?.tasaAnual.every((p) => Math.abs(p.value) < 15) === true, `taxes anuals Catalunya <15 % (última: ${ipvaCat?.latestAnual?.value} % el ${ipvaCat?.latestAnual?.period})`);
ok(!!ipvaCat?.acum2015 && approx(ipvaCat.acum2015.value, ipvaCat.indice[ipvaCat.indice.length - 1].value - 100, 0.11), `acumulada des de 2015 = índex − 100 (real: ${ipvaCat?.acum2015?.value} % el ${ipvaCat?.acum2015?.period})`);
const ipvaEs = buildIpvaTerritory(ipvaObs, { geoLevel: "ESTATAL", geoCode: "ES" });
ok(!!ipvaEs && ipvaEs.indice.length >= 9, "IPVA Espanya present");
const ipvaProv08 = buildIpvaTerritory(ipvaObs, { geoLevel: "PROV", geoCode: "08" });
ok(!!ipvaProv08 && approx(ipvaProv08.indice[0].value, 100, 0.05), "IPVA Barcelona (08) amb base 2015 = 100");

// renda real (Atlas: nacional + província de Barcelona)
const rAtlasNac = parseAtlasNacional(JSON.parse(fs.readFileSync(`${FIX}/atlas_nacional.json`, "utf-8")));
const rAtlas08 = parseAtlasMuni(JSON.parse(fs.readFileSync(`${FIX}/atlas_prov_08_barcelona.json`, "utf-8")), match);
const atlasObs: StatObsLite[] = [...rAtlasNac.observations, ...rAtlas08.observations].map((o) => ({
  ...o,
  sourceCode: "INE_ATLAS_RENTA",
}));
console.log(`  · Atlas observacions: nacional=${rAtlasNac.observations.length} prov08=${rAtlas08.observations.length}`);

const rentaEsPersona = buildRentaTerritory(atlasObs, { variable: "RENTA_NETA_MEDIA_PERSONA", geoLevel: "ESTATAL", geoCode: "ES" });
console.log(`  · Renda neta mitjana per persona Espanya ${rentaEsPersona?.latest?.period}: ${rentaEsPersona?.latest?.value} €/any (nota INE: 15.948 €)`);
ok(!!rentaEsPersona?.latest && approx(rentaEsPersona.latest.value, 15948, 350), "renda per persona Espanya 2024 ≈ 15.948 € (nota de premsa INE)");
ok(!!rentaEsPersona?.latest && rentaEsPersona.latest.period === "2024", "últim any Atlas = 2024");

const rentaBcn = buildRentaTerritory(atlasObs, { variable: "RENTA_NETA_MEDIA_HOGAR", geoLevel: "MUNI", geoCode: "08019" });
console.log(`  · Renda per llar Barcelona ${rentaBcn?.latest?.period}: ${rentaBcn?.latest?.value} €/any`);
ok(!!rentaBcn?.latest && rentaBcn.latest.value > 30000 && rentaBcn.latest.value < 90000, "renda per llar Barcelona en rang plausible");

const rentaCornella = buildRentaTerritory(atlasObs, { variable: "RENTA_NETA_MEDIA_HOGAR", geoLevel: "MUNI", geoCode: "08073" });
console.log(`  · Renda per llar Cornellà ${rentaCornella?.latest?.period}: ${rentaCornella?.latest?.value} €/any`);
ok(!!rentaCornella?.latest && rentaCornella.latest.value > 20000 && rentaCornella.latest.value < 70000, "renda per llar Cornellà en rang plausible");

// EFFORT REAL: fiances reals Cornellà + renda real Atlas
const effortRealCornella = effortEconomic(cornella.rentLatest, rentaCornella?.latest?.value ?? null, {
  rentPeriod: cornella.rentPeriod,
  rentaPeriod: rentaCornella?.latest?.period ?? "",
});
console.log(`  · EFFORT REAL Cornellà: ${effortRealCornella?.pct} % (${cornella.rentLatest} €/mes × 12 / ${rentaCornella?.latest?.value} €/any)`);
ok(!!effortRealCornella && effortRealCornella.pct > 10 && effortRealCornella.pct < 40, "esforç real Cornellà entre 10 i 40 %");

// assemblador complet Cornellà (sense mostres d'edificis: sense BD offline)
const fullCornella = assembleMuniIndicators({
  muni: {
    code: cornella.code,
    ineCode: cornella.ineCode,
    name: cornella.name,
    comarca: cornella.comarca,
    province: cornella.province,
    rentLatest: cornella.rentLatest,
    rentPeriod: cornella.rentPeriod,
  },
  observations: [...ipvaObs, ...atlasObs],
  bandSamples: null,
  price: 792.7,
}); // Cornellà de Llobregat (080734)
ok(fullCornella.effort.hogar !== null && approx(fullCornella.effort.hogar?.pct, effortRealCornella?.pct ?? -1, 0.02), "assemblador: effort Cornellà coherent amb el càlcul directe");
ok(fullCornella.effort.persona !== null, "assemblador: effort per persona present");
ok(fullCornella.ipva.catalunya !== null && fullCornella.ipva.provincia !== null, "assemblador: IPVA Catalunya + província");
ok(fullCornella.ipva.municipi !== null, "assemblador: IPVA municipal Cornellà (cobertura INE)", fullCornella.ipva.municipi?.indice.slice(-2));
ok(fullCornella.terrDelta.rentaVsProvincia !== null && fullCornella.terrDelta.rentaVsCatalunya !== null && fullCornella.terrDelta.rentaVsEspanya !== null, "assemblador: deltas territorials de renda (prov/CAT/ES)");
ok(fullCornella.band === null && fullCornella.posVsMedian === null && fullCornella.refBand === null, "sense mostres d'edificis → banda i posició «no disponibles» (mai inventades)");
ok(fullCornella.fontsUsed.includes("INE_IPVA") && fullCornella.fontsUsed.includes("INE_ATLAS_RENTA"), "fontsUsed cita les dues fonts");
ok(fullCornella.avisos.includes("EFFORT") && fullCornella.avisos.includes("IPVA_ANUAL"), "avisos metodològics aplicats");
console.log(`  · TERR_DELTA Cornellà vs Catalunya: ${fullCornella.terrDelta.rentaVsCatalunya?.pctDiff} % | vs Espanya: ${fullCornella.terrDelta.rentaVsEspanya?.pctDiff} %`);

// assemblador amb mostres d'edifici (sintètiques només per validar la banda)
const withBand = assembleMuniIndicators({
  muni: {
    code: cornella.code,
    ineCode: cornella.ineCode,
    name: cornella.name,
    comarca: cornella.comarca,
    province: cornella.province,
    rentLatest: cornella.rentLatest,
    rentPeriod: cornella.rentPeriod,
  },
  observations: [...ipvaObs, ...atlasObs],
  bandSamples: [800, 850, 900, 950, 1000, 1200].map((v) => ({ value: v, weight: 1 })),
  price: 900,
}); // mostres sintètiques només per validar la fórmula de la banda
ok(!!withBand.band && withBand.band.p25 === 862.5 && withBand.band.p50 === 925 && withBand.band.p75 === 987.5, "banda amb mostres → P25 862,5 / mediana 925 / P75 987,5", withBand.band);
ok(withBand.posVsMedian?.direction === "BELOW" && approx(withBand.posVsMedian?.pctDiff ?? 0, -2.7, 0.01), "preu 900 vs mediana 925 → −2,7 % BELOW", withBand.posVsMedian);
ok(withBand.refBand?.position === "WITHIN" && withBand.refBand.labelEs === "Dentro del rango de referencia", "preu 900 dins de [862,5, 987,5] → WITHIN", withBand.refBand);

// banda amb mostres insuficients → no disponible (mai banda fràgil)
const fewBand = assembleMuniIndicators({
  muni: { code: "080734", ineCode: "08073", name: "Cornellà", comarca: null, province: null, rentLatest: null, rentPeriod: null },
  observations: [],
  bandSamples: [{ value: 800 }, { value: 900 }, { value: 1000 }],
  price: 900,
});
ok(fewBand.band === null && fewBand.posVsMedian === null, `menys de ${MIN_SAMPLES_BAND} mostres → banda no disponible`);

// municipi sense ineCode → degradació elegant
const noIne = assembleMuniIndicators({
  muni: { code: "999999", ineCode: null, name: "Municipi de prova", comarca: null, province: null, rentLatest: null, rentPeriod: null },
  observations: [...ipvaObs, ...atlasObs],
});
ok(noIne.renta.municipi.hogar === null && noIne.effort.hogar === null && noIne.ipva.municipi === null, "sense ineCode → sèries municipals absents, sense error");
ok(noIne.ipva.catalunya !== null && noIne.terrDelta.rentaVsCatalunya === null, "sense ineCode: IPVA CAT sí, deltas municipals no");

// ── PART C — invariants ─────────────────────────────────────────────────────
console.log("\n── PART C · invariants ──");
const vacio = assembleMuniIndicators({
  muni: { code: "080193", ineCode: "08019", name: "Barcelona", comarca: "Barcelonès", province: "Barcelona", rentLatest: 1184.2, rentPeriod: "2025" },
  observations: [],
});
ok(vacio.ipva.catalunya === null && vacio.renta.municipi.hogar === null && vacio.effort.hogar === null, "observacions buides → tot null, sense error");
ok(vacio.fontsUsed.length === 0, "sense fonts → fontsUsed buit");
const payload = JSON.stringify(fullCornella);
ok(!payload.includes("NaN") && !payload.includes("Infinity") && !payload.includes("undefined"), "payload sense NaN/Infinity/undefined");
ok(Number.isFinite(fullCornella.effort.hogar?.pct) === true, "totes les xifres de l'effort són finites");

// ── Resum ───────────────────────────────────────────────────────────────────
console.log(`\n═══ FASE 3 TESTS: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exitCode = 1;
