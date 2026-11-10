/**
 * Fase 5 — Gating Premium: diferenciació visual i teasers en gratuït.
 *
 * PART A: cablejat de la UI (PanelView, MapView, ComparadorView):
 *         403 PLAN_REQUIRED → estat blocat amb teaser (mai llista buida),
 *         botó CSV (Pro) visible a la fitxa, CTA als plans en els avisos.
 * PART B: tarjetes de preus (i18n ca/es) coherents amb el gating real.
 * PART C: auditoria del gating server-side (cada ruta amb el seu planAllows).
 * PART D: matriu de plans (defaults) coherent amb els avisos del canvi de pla.
 *
 * Ús: npx tsx scripts/fase5_test_gating.ts
 */
import * as fs from "fs";
import * as path from "path";

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
function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

console.log("\n── PART A · Cablejat UI ─────────────────────────────────────");

const panel = read("src/components/views/PanelView.tsx");

// A1 — historial: 403 detectat com a estat blocat (mai llista buida)
ok(panel.includes('"/api/history"') && /status === 403[\s\S]{0,80}setHistoryLocked\(true\)/.test(panel),
  "A1 PanelView: /api/history amb 403 → estat blocat");

// A2 — preferits: idem
ok(panel.includes('"/api/favorites"') && /status === 403[\s\S]{0,80}setFavoritesLocked\(true\)/.test(panel),
  "A2 PanelView: /api/favorites amb 403 → estat blocat");

// A3 — el teaser blocat explica què es guanya i que les dades NO s'esborren
ok(panel.includes("Les teves dades no s'esborren mai") && panel.includes("Tus datos no se borran nunca"),
  "A3 PanelView: teaser blocat promet que les dades es conserven (ca+es)");

// A4 — CTA als plans des dels dos teasers blocats
ok((panel.match(/historyLocked \?/g) || []).length === 1 && (panel.match(/favoritesLocked \?/g) || []).length === 1,
  "A4 PanelView: els dos tabs tenen branca blocada pròpia");
// A5 — CTA als plans des dels dos teasers blocats (cada bloc, el seu CTA)
const sliceFrom = (marker: string, len = 1600) => {
  const i = panel.indexOf(marker);
  return i === -1 ? "" : panel.slice(i, i + len);
};
ok(sliceFrom("historyLocked ?").includes('navigate("/preus")'),
  "A5a PanelView: CTA «Veure Premium» al teaser d'historial");
ok(sliceFrom("favoritesLocked ?").includes('navigate("/preus")'),
  "A5b PanelView: CTA «Veure Premium» al teaser de preferits");

// A6 — candado a les pestanyes per a plan gratuït
ok(panel.includes('u.plan === "FREE"') && panel.includes("<Lock"), 
  "A6 PanelView: candat visible a les pestanyes blocades del pla gratuït");

const mapa = read("src/components/views/MapView.tsx");

// A7 — botó CSV visible a la fitxa (feature Pro fins ara invisible a la UI)
ok(mapa.includes("downloadCsv") && mapa.includes("/api/export/") && mapa.includes("FileSpreadsheet"),
  "A7 MapView: botó Exporta CSV (Pro · agents) a la fitxa");

// A8 — el missatge CSV bloquejat menciona el pla i el preu
ok(mapa.includes("L'exportació CSV és del pla Pro · agents (19,99 €/mes).") &&
   mapa.includes("La exportación CSV es del plan Pro · agentes (19,99 €/mes)."),
  "A8 MapView: avís CSV blocat amb pla i preu (ca+es)");

// A9 — PDF bloquejat: preu + CTA als plans
ok(mapa.includes("setPdfLocked(true)") && mapa.includes("(7,99 €/mes)") && mapa.includes("(19,99 €/mes)") &&
   mapa.includes("Veure plans") && mapa.includes("Ver planes"),
  "A9 MapView: avís PDF 403 amb preu + CTA «Veure plans»");

const comp = read("src/components/views/ComparadorView.tsx");

// A10 — afegir entitat al màxim dona avís (mai clic ignorat en silenci)
ok(/entities\.length >= maxEntities\)\s*\{[\s\S]{0,40}setPlanLimitMsg/.test(comp),
  "A10 Comparador: intenció d'excedir el màxim → avís visible");

// A11 — treure una entitat neteja l'avís de límit
ok(comp.includes("setEntities(entities.filter((x) => x.code !== e.code)); setPlanLimitMsg(null);"),
  "A11 Comparador: esborrar entitat neteja l'avís de límit");

console.log("\n── PART B · Tarjetes de preus (i18n ca/es) ──────────────────");

const i18n = read("src/lib/i18n.ts");
const caBlock = i18n.slice(i18n.indexOf("plans: {"), i18n.indexOf("map: {"));
const esBlock = i18n.slice(i18n.lastIndexOf("plans: {"), i18n.lastIndexOf("map: {"));

ok(caBlock.includes("Banda de referència P25–P75 i posició del teu preu"),
  "B1 ca Premium: banda P25–P75 + posició");
ok(esBlock.includes("Banda de referencia P25–P75 y posición de tu precio"),
  "B2 es Premium: banda P25–P75 + posición");
ok(caBlock.includes("Indicadors oficials INE: IPVA, renda i esforç econòmic") &&
   esBlock.includes("Indicadores oficiales INE: IPVA, renta y esfuerzo económico"),
  "B3 Premium: indicadors INE (ca+es)");
ok(caBlock.includes("Comparador fins a 6 municipis amb columnes avançades") &&
   esBlock.includes("Comparador hasta 6 municipios con columnas avanzadas"),
  "B4 Premium: comparador 6 + columnes avançades (ca+es)");
ok(caBlock.includes("Informes PDF de municipi") && esBlock.includes("Informes PDF de municipio"),
  "B5 Premium: informe PDF de municipi (ca+es)");
ok(caBlock.includes("Informes PDF d'edifici (illa)") && esBlock.includes("Informes PDF de edificio (manzana)"),
  "B6 Pro: informe PDF d'edifici (ca+es)");
ok(caBlock.includes("Exportació CSV de dades per municipi") && esBlock.includes("Exportación CSV de datos por municipio"),
  "B7 Pro: exportació CSV (ca+es)");
ok(caBlock.includes("Comparador fins a 2 municipis") && esBlock.includes("Comparador hasta 2 municipios"),
  "B8 Gratuït: tope honest de 2 municipis (ca+es)");

// paritat de longitud de llistes ca/es (cap feature traduïda a mitges)
function featsOf(block: string, plan: "free" | "premium" | "pro"): string[] | null {
  const m = block.match(new RegExp(`${plan}: \\{[^\\n]+`));
  if (!m) return null;
  const inner = m[0].match(/feats: \[([^\]]*)\]/);
  return inner ? inner[1].split("\",").map((s) => s.replace(/["\[\]]/g, "").trim()).filter(Boolean) : null;
}
for (const plan of ["free", "premium", "pro"] as const) {
  const a = featsOf(caBlock, plan);
  const b = featsOf(esBlock, plan);
  ok(!!a && !!b && a.length === b.length && a.length > 0,
    `B9 ${plan}: mateixa longitud de feats ca/es (${a?.length} vs ${b?.length})`);
}

console.log("\n── PART C · Gating server-side (font de veritat) ────────────");

const hist = read("src/app/api/_impl/history/route.ts");
ok(hist.includes('planAllows(plan, "historial")') && hist.includes('"PLAN_REQUIRED"') && hist.includes('plan: "PREMIUM"'),
  "C1 /api/history: planAllows(historial) → 403 PLAN_REQUIRED PREMIUM");

const fav = read("src/app/api/_impl/favorites/route.ts");
ok(fav.includes('planAllows(plan, "preferits")') && fav.includes('"PLAN_REQUIRED"') && fav.includes('plan: "PREMIUM"'),
  "C2 /api/favorites: planAllows(preferits) → 403 PLAN_REQUIRED PREMIUM");

const exp = read("src/app/api/_impl/export/[code]/route.ts");
ok(exp.includes('planAllows(plan, "exportCsv")') && exp.includes('"PLAN_REQUIRED"') && exp.includes('plan: "PRO"'),
  "C3 /api/export/[code]: planAllows(exportCsv) → 403 PLAN_REQUIRED PRO");

const pdf = read("src/app/api/_impl/reports/pdf/route.ts");
ok(pdf.includes('planAllows(plan, "pdfMunicipi")') && pdf.includes('plan: "PREMIUM"') &&
   pdf.includes('planAllows(plan, "pdfEdifici")') && pdf.includes('plan: "PRO"'),
  "C4 /api/reports/pdf: municipi→PREMIUM, edifici→PRO");

const cmp = read("src/app/api/_impl/comparator/route.ts");
ok(cmp.includes("comparatorMax") && cmp.includes('"PLAN_LIMIT"') && cmp.includes("comparadorAvancat"),
  "C5 /api/comparator: límit d'entitats per pla + columnes avançades al servidor");

const ind = read("src/app/api/_impl/indicators/muni/[code]/route.ts");
ok(ind.includes("gateIndicators") && ind.includes('"referenciaAmpliada"') && ind.includes('"indicadorsTerritorials"'),
  "C6 /api/indicators/muni: gateIndicators amb flags del pla");

const lookup = read("src/app/api/_impl/lookup/route.ts");
ok(lookup.includes("consumeDetailQuery") && lookup.includes("402"),
  "C7 /api/lookup: quota atòmica (consumeDetailQuery) + 402 paywall");

console.log("\n── PART D · Matriu de plans coherent amb els avisos ─────────");

const plans = read("src/lib/plans.ts");
ok(/FREE:\s*\{[\s\S]*?quotaMonth: 3,/.test(plans) && /FREE:\s*\{[\s\S]*?comparatorMax: 2,/.test(plans),
  "D1 FREE: 3 consultes/mes, comparador 2");
ok(/PREMIUM:\s*\{[\s\S]*?quotaMonth: -1,/.test(plans) && /PREMIUM:\s*\{[\s\S]*?comparatorMax: 6,/.test(plans),
  "D2 PREMIUM: il·limitades, comparador 6");
ok(/PRO:\s*\{[\s\S]*?quotaMonth: -1,/.test(plans) && /PRO:\s*\{[\s\S]*?comparatorMax: 6,/.test(plans),
  "D3 PRO: il·limitades, comparador 6");
// el difus del canvi de pla coneix totes les features que la UI bloqueja
const pc = read("src/lib/plan-change.ts");
for (const k of ["historial", "preferits", "pdfMunicipi", "pdfEdifici", "exportCsv", "referenciaAmpliada", "indicadorsTerritorials", "comparadorAvancat", "unlimitedQueries", "comparator6"]) {
  ok(pc.includes(`"${k}"`), `D4 diffPlanKeys coneix "${k}"`);
}

console.log(`\n══════════════════════════════════════════════════════`);
console.log(`Fase 5 — gating: ${pass} OK, ${fail} FAIL`);
console.log(`══════════════════════════════════════════════════════`);
process.exit(fail > 0 ? 1 : 0);
