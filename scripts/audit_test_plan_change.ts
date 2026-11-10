/**
 * v31 — Tests del cambio de plan self-service (diff de avisos).
 * Ejecutar: npx tsx scripts/audit_test_plan_change.ts
 */
import { diffPlanKeys, labelForDiffKey, dataNote, DIFF_LABELS, type PlanShapeLite } from "../src/lib/plan-change";

const PLANS: Record<string, PlanShapeLite> = {
  FREE: {
    quotaMonth: 3,
    comparatorMax: 2,
    features: { comparador: true, exportCsv: false, historial: false, preferits: false, pdfMunicipi: false, pdfEdifici: false, referenciaAmpliada: false, indicadorsTerritorials: false, comparadorAvancat: false },
  },
  PREMIUM: {
    quotaMonth: -1,
    comparatorMax: 6,
    features: { comparador: true, exportCsv: false, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: false, referenciaAmpliada: true, indicadorsTerritorials: true, comparadorAvancat: true },
  },
  PRO: {
    quotaMonth: -1,
    comparatorMax: 6,
    features: { comparador: true, exportCsv: true, historial: true, preferits: true, pdfMunicipi: true, pdfEdifici: true, referenciaAmpliada: true, indicadorsTerritorials: true, comparadorAvancat: true },
  },
};

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}
const same = <T,>(a: T[], b: T[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

console.log("── A. Diffs exactos entre planes ──");
let d = diffPlanKeys("PREMIUM", "PRO", PLANS);
ok(same(d.gained, ["exportCsv", "pdfEdifici"]), "PREMIUM→PRO gana exportCsv + pdfEdifici");
ok(d.lost.length === 0, "PREMIUM→PRO no pierde nada");

d = diffPlanKeys("PRO", "PREMIUM", PLANS);
ok(same(d.lost, ["exportCsv", "pdfEdifici"]), "PRO→PREMIUM pierde exportCsv + pdfEdifici");
ok(d.gained.length === 0, "PRO→PREMIUM no gana nada");

d = diffPlanKeys("PREMIUM", "FREE", PLANS);
ok(d.lost.includes("unlimitedQueries"), "PREMIUM→FREE pierde consultas ilimitadas");
ok(d.lost.includes("comparator6"), "PREMIUM→FREE pierde comparador 6");
ok(d.lost.includes("preferits") && d.lost.includes("historial"), "PREMIUM→FREE pierde preferits + historial");
ok(d.lost.includes("pdfMunicipi") && d.lost.includes("referenciaAmpliada") && d.lost.includes("indicadorsTerritorials") && d.lost.includes("comparadorAvancat"), "PREMIUM→FREE pierde PDF municipio + banda + indicadores + avanzado");
ok(d.gained.length === 0, "PREMIUM→FREE no gana nada");

d = diffPlanKeys("FREE", "PRO", PLANS);
ok(same(d.gained, ["unlimitedQueries", "comparator6", "exportCsv", "historial", "preferits", "pdfMunicipi", "pdfEdifici", "referenciaAmpliada", "indicadorsTerritorials", "comparadorAvancat"]), "FREE→PRO gana las 10 capacidades");

d = diffPlanKeys("FREE", "PREMIUM", PLANS);
ok(d.gained.includes("unlimitedQueries") && d.gained.includes("comparator6"), "FREE→PREMIUM gana ilimitadas + 6 municipios");
ok(!d.gained.includes("exportCsv") && !d.gained.includes("pdfEdifici"), "FREE→PREMIUM NO gana CSV ni PDF edificio (es de Pro)");

console.log("── B. Invariantes ──");
d = diffPlanKeys("PREMIUM", "PREMIUM", PLANS);
ok(d.gained.length === 0 && d.lost.length === 0, "mismo plan → diff vacío");
ok(differentLabelsAllKeys(), "todas las claves del diff tienen etiqueta ca y es no vacías");
ok(typeof dataNote("ca") === "string" && dataNote("ca").length > 40, "dataNote ca presente (¿pierdo información? → NO, se conservan)");
ok(typeof dataNote("es") === "string" && dataNote("es").length > 40, "dataNote es presente");
const robust = diffPlanKeys("PREMIUM", "PRO", { PREMIUM: PLANS.PREMIUM, PRO: { quotaMonth: -1, comparatorMax: 6, features: { exportCsv: true } } });
ok(robust.gained.includes("exportCsv"), "features parciales: no lanza y detecta la diferencia que sí tiene etiqueta");
ok(labelForDiffKey("pdfEdifici", "es") === "Informe PDF de edificio", "etiqueta es correcta para pdfEdifici");

function differentLabelsAllKeys(): boolean {
  for (const k of Object.keys(DIFF_LABELS) as Array<keyof typeof DIFF_LABELS>) {
    const [ca, es] = DIFF_LABELS[k];
    if (!ca || !es || ca.length < 5 || es.length < 5) return false;
  }
  return true;
}

console.log(`\n═══ PLAN-CHANGE TESTS: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
