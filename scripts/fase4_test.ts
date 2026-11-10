/**
 * Fase 4 — Tests d'integració web.
 *
 * PART A: gating d'indicadors (gateIndicators) — el pla gratuït NUNCA rep
 *         dades premium ni una sola vegada (valors exactes).
 * PART B: catàleg editorial d'ajudes (JSON = seed = fallback del API):
 *         estructura, enllaços oficials, estats vàlids, dates.
 * PART C: cableat de la integració web (rutes, guia, blocs, i18n ca/es).
 *
 * Ús: npx tsx scripts/fase4_test.ts
 */
import * as fs from "fs";
import { gateIndicators, type PlanIdLite } from "../src/lib/indicators-gating";
import type { MuniIndicators } from "../src/lib/indicators";

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

// ── fixture mínim d'un bloc complet d'indicadors (forma real del Fase 3) ────
const FULL: MuniIndicators = {
  muni: { code: "080734", ineCode: "08073", name: "Cornellà de Llobregat", comarca: "Baix Llobregat", province: "Barcelona", rentLatest: 792.7, rentPeriod: "2025" },
  generatedAt: "2026-11-10T00:00:00.000Z",
  price: null,
  band: { p25: 700, p50: 790, p75: 900, n: 12, totalWeight: 40, basis: "mercat registrat — fiances Incasòl a nivell d'edifici/illa" },
  posVsMedian: null,
  refBand: null,
  ipva: {
    catalunya: {
      geoLevel: "CCAA", geoCode: "09", geoName: "Cataluña", unit: "índex",
      indice: [{ period: "2015", value: 100 }, { period: "2024", value: 123.6 }],
      tasaAnual: [{ period: "2024", value: 3.1 }],
      latestAnual: { period: "2024", value: 3.1 },
      latestAnualComputed: { period: "2024", value: 3.1 },
      acum2015: { period: "2024", value: 23.6 },
    },
    provincia: null,
    municipi: null,
  },
  renta: {
    municipi: {
      hogar: { variable: "RENTA_NETA_MEDIA_HOGAR", geoLevel: "MUNI", geoCode: "08073", geoName: "Cornellà", unit: "€/any", series: [{ period: "2024", value: 41208 }], latest: { period: "2024", value: 41208 } },
      persona: null,
    },
  },
  effort: {
    hogar: { pct: 23.08, rentEurMonth: 792.7, rentPeriod: "2025", rentaAnual: 41208, rentaPeriod: "2024" },
    persona: { pct: 12.4, rentEurMonth: 792.7, rentPeriod: "2025", rentaAnual: 76700, rentaPeriod: "2024" },
  },
  terrDelta: { rentaVsProvincia: null, rentaVsCatalunya: { absDiff: -3492, pctDiff: -8.31, valueA: 41208, valueB: 44700, periodA: "2024", periodB: "2024", otherGeoName: "Cataluña" }, rentaVsEspanya: null },
  fontsUsed: ["INE_ATLAS_RENTA", "INE_IPVA"],
  avisos: ["EFFORT", "IPVA_ANUAL"],
};

const ALL_TRUE = { referenciaAmpliada: true, indicadorsTerritorials: true };

// ── PART A — gating ─────────────────────────────────────────────────────────
console.log("\n── PART A · gating d'indicadors per pla ──");

const free = gateIndicators(FULL, "FREE", ALL_TRUE);
ok(free.plan === "FREE" && free.teaser !== null, "FREE: té teaser");
ok(free.medianaMunicipal?.p50 === 790 && free.medianaMunicipal.n === 12, "FREE: mediana municipal visible (Taula 8)");
ok(free.teaser?.bandaDisponible === true && free.teaser.esforcDisponible === true, "FREE: teaser avisa només quan la dada existeix");
ok(free.bandaCompleta === null && free.posVsMedian === null && free.refBand === null, "FREE: banda i posició NULL");
ok(free.ipva === null && free.renta === null && free.effort === null && free.terrDelta === null, "FREE: IPVA/renda/esforç/deltas NULL");
const freeJson = JSON.stringify(free);
ok(!freeJson.includes("41208") && !freeJson.includes("23.08") && !freeJson.includes("123.6"), "FREE: cap xifra premium al payload (ni renta, ni esforç, ni índex IPVA)");
ok(free.fontsUsed.length === 2, "FREE: fonts citades");

const prem = gateIndicators(FULL, "PREMIUM", ALL_TRUE);
ok(prem.teaser === null, "PREMIUM: sense teaser");
ok(prem.bandaCompleta?.p25 === 700 && prem.bandaCompleta?.p75 === 900, "PREMIUM: banda completa");
ok(prem.effort?.hogar?.pct === 23.08 && prem.renta?.municipi.hogar?.latest?.value === 41208, "PREMIUM: esforç i renda presents");
ok(prem.ipva?.catalunya?.acum2015?.value === 23.6, "PREMIUM: IPVA acumulat");
ok(prem.terrDelta?.rentaVsCatalunya?.pctDiff === -8.31, "PREMIUM: delta territorial");

const pro = gateIndicators(FULL, "PRO", ALL_TRUE);
ok(pro.bandaCompleta !== null && pro.effort !== null, "PRO: accés complet com Premium");

const flagOff = gateIndicators(FULL, "PREMIUM", { referenciaAmpliada: false, indicadorsTerritorials: true });
ok(flagOff.bandaCompleta === null && flagOff.posVsMedian === null, "flag OFF (referenciaAmpliada): banda NULL");
ok(flagOff.effort?.hogar?.pct === 23.08, "flag OFF: esforç segueix present (indicadorsTerritorials ON)");

const flagTerrOff = gateIndicators(FULL, "PREMIUM", { referenciaAmpliada: true, indicadorsTerritorials: false });
ok(flagTerrOff.bandaCompleta !== null && flagTerrOff.effort === null, "flag OFF (indicadorsTerritorials): banda sí, esforç no");

const nullSafe = gateIndicators(null, "FREE", ALL_TRUE);
ok(nullSafe.medianaMunicipal === null && nullSafe.teaser === null, "full=null: res a anunciar (sense teaser fals), payload segur");
const nullPrem = gateIndicators(null, "PREMIUM", ALL_TRUE);
ok(nullPrem.bandaCompleta === null && nullPrem.teaser === null, "full=null i PREMIUM: sense teaser, tot null");

// ── PART B — catàleg editorial d'ajudes ─────────────────────────────────────
console.log("\n── PART B · catàleg editorial d'ajudes (seed/fallback) ──");
const seed = JSON.parse(fs.readFileSync("src/data/rental_aid_seed.json", "utf-8")) as {
  revisado: string;
  aids: Array<{ code: string; title: string; description: string; scope: string; scopeCode: string | null; status: string; url: string; source: string }>;
};
ok(/^\d{4}-\d{2}-\d{2}$/.test(seed.revisado), `data de revisió editorial: ${seed.revisado}`);
ok(seed.aids.length >= 4, `${seed.aids.length} ajudes al catàleg`);
const codes = new Set(seed.aids.map((a) => a.code));
ok(codes.size === seed.aids.length, "codis únics");
ok(seed.aids.every((a) => a.url.startsWith("https://")), "tots els enllaços són HTTPS oficials");
ok(seed.aids.every((a) => a.url.includes("gob.es") || a.url.includes("gencat.cat") || a.url.includes("boe.es")), "enllaços només a dominis oficials (gob.es/gencat.cat/boe.es)", seed.aids.map((a) => a.url));
ok(seed.aids.every((a) => ["VIGENTE", "CONVOCATORIA_OBERTA", "FINALIZADA"].includes(a.status)), "estats vàlids");
ok(seed.aids.every((a) => a.scope === "ESTATAL" ? a.scopeCode === null : typeof a.scopeCode === "string"), "coherència àmbit/codi");
ok(seed.aids.every((a) => a.description.length > 80 && a.source.length > 5), "descripcions i fonts substantives");
ok(seed.aids.some((a) => a.scope === "CCAA" && a.scopeCode === "09"), "inclou àmbit Catalunya (09)");

// ── PART C — cableat de la integració web ───────────────────────────────────
console.log("\n── PART C · cableat (vistes, rutes i guia) ──");
const appshell = fs.readFileSync("src/components/AppShell.tsx", "utf-8");
ok(appshell.includes('view === "/guia" && <GuiaView />'), "AppShell: ruta #/guia");
ok(appshell.includes('link("/guia"'), "AppShell: enllaç al menú (desktop i mòbil)");
ok(appshell.includes('GuiaView from "@/components/views/GuiaView"'), "AppShell: import de la vista");

const mapview = fs.readFileSync("src/components/views/MapView.tsx", "utf-8");
ok(mapview.includes("<IndicadorsOficials muniCode={mun.code}"), "MapView: bloc d'indicadors a la fitxa");
ok(mapview.includes("/api/indicators/muni/"), "MapView: consumeix l'API gated");
ok(mapview.includes("bandaCompleta") && mapview.includes("medianaMunicipal"), "MapView: pinta mediana (gratuït) i banda (premium)");
ok(mapview.includes("no és un preu en euros") || mapview.includes("no es un precio en euros"), "MapView: avís metodològic IPVA");
ok(mapview.includes("no mesura") || mapview.includes("no mide"), "MapView: avís esforç territorial");

const compView = fs.readFileSync("src/components/views/ComparadorView.tsx", "utf-8");
ok(compView.includes("result.advanced") && compView.includes("r.indicators"), "ComparadorView: xips avançats gated");
ok(compView.includes("advanced === false"), "ComparadorView: teaser per al pla gratuït");

const compApi = fs.readFileSync("src/app/api/_impl/comparator/route.ts", "utf-8");
ok(compApi.includes('planAllows(planId, "comparadorAvancat")'), "comparator API: gating server-side");
ok(compApi.includes("advanced: comparadorAvancat"), "comparator API: flag advanced a la resposta");

const indRoute = fs.readFileSync("src/app/api/_impl/indicators/muni/[code]/route.ts", "utf-8");
ok(indRoute.includes('planAllows(plan, "referenciaAmpliada")') && indRoute.includes('planAllows(plan, "indicadorsTerritorials")'), "indicators/muni API: flags de pla");
ok(indRoute.includes("EMAIL_NOT_VERIFIED"), "indicators/muni API: correu verificat obligatori");
ok(indRoute.includes("rateLimit"), "indicators/muni API: rate limit");

const aidRoute = fs.readFileSync("src/app/api/_impl/aid/route.ts", "utf-8");
ok(aidRoute.includes("rental_aid_seed.json"), "aid API: fallback editorial si la taula és buida");
ok(aidRoute.includes("rentalAid.findMany"), "aid API: BD com a font de veritat");

const guia = fs.readFileSync("src/components/views/GuiaView.tsx", "utf-8");
ok(guia.includes('"/api/aid"'), "Guia: carrega les ajudes del API");
ok(guia.includes("verifica sempre") || guia.includes("verifícalo"), "Guia: avís de verificar la font");
ok(guia.includes("BOE-A-1994-14703"), "Guia: enllaç LAU consolidat (BOE)");
ok(guia.includes("Calculadora de fianza") && guia.includes("Garantías adicionales"), "Guia: calculadora de fiança i garanties");
ok(!guia.includes("3/5 años") && !guia.includes("3/5 anys"), "Guia: sense dades obsoletes de pròrroga (reforma 2023)");
ok(guia.includes("5 años (7") && guia.includes("5 anys (7"), "Guia: pròrroga actualitzada 5/7 anys (ca i es)");

const plans = fs.readFileSync("src/lib/plans.ts", "utf-8");
ok(plans.includes("referenciaAmpliada: true") && plans.includes("referenciaAmpliada: false"), "plans.ts: nous flags (FREE off, pagament on)");
const gating = fs.readFileSync("src/lib/indicators-gating.ts", "utf-8");
ok(!freeJson.includes('"p25"') && !freeJson.includes('"p75"') && !freeJson.includes('"pct"'), "FREE: l'estructura de la banda i l'esforç no surten ni buides");

// ── Resum ───────────────────────────────────────────────────────────────────
console.log(`\n═══ FASE 4 TESTS: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exitCode = 1;
