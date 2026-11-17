/**
 * E2E local de la FASE 2 (plans migració progressiva) — Premium.
 * Verifica sobre PG local:
 *  1) estat PRE-FASE-2 realista de PlanSetting (com el de producció abans d'avui)
 *  2) aplicació de la migració 20261118130000_plans_fase2_premium
 *  3) resultats: PREMIUM/PRO alineats, FREE intacte, valors esperats exactes
 *  4) IDEMPOTÈNCIA: re-aplicar la migració deixa el mateix estat
 *  5) usuaris de prova: admin PRO (seed), premium@ i free@ verificats
 * Ús: DATABASE_URL=... bun run scripts/e2e_plans_fase2.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Separador d'statements: la migració no usa ';' dins de literals. */
function statements(sqlFile: string): string[] {
  return readFileSync(sqlFile, "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applyMigration() {
  const file = path.join(process.cwd(), "prisma/migrations/20261118130000_plans_fase2_premium/migration.sql");
  for (const st of statements(file)) {
    await db.$executeRawUnsafe(st);
  }
}

async function showRows(label: string) {
  const rows = await db.planSetting.findMany({ orderBy: { plan: "asc" } });
  console.log(`\n== ${label} ==`);
  for (const r of rows) {
    console.log(`${r.plan}: quotaMonth=${r.quotaMonth} priceEur=${r.priceEur} features=${r.features}`);
  }
  return rows;
}

async function main() {
  // ── 1) estat PRE-FASE-2 (realista: el que la FASE 0 va documentar en viu) ──
  await db.planSetting.upsert({
    where: { plan: "FREE" },
    update: { quotaMonth: 3, priceEur: 0, features: JSON.stringify({ historialTtlDies: 7 }) },
    create: { plan: "FREE", quotaMonth: 3, priceEur: 0, features: JSON.stringify({ historialTtlDies: 7 }) },
  });
  await db.planSetting.upsert({
    where: { plan: "PREMIUM" },
    update: { quotaMonth: 7, priceEur: 8.99, features: JSON.stringify({ historial: false, pdfMonth: false, valoracionsMonth: 5, evolucioTemporal: false }) },
    create: { plan: "PREMIUM", quotaMonth: 7, priceEur: 8.99, features: JSON.stringify({ historial: false, pdfMonth: false, valoracionsMonth: 5, evolucioTemporal: false }) },
  });
  await db.planSetting.upsert({
    where: { plan: "PRO" },
    update: { quotaMonth: -1, priceEur: 24.99, features: JSON.stringify({ exportCsv: true, historial: true, pdfMonth: 30, valoracionsMonth: 30 }) },
    create: { plan: "PRO", quotaMonth: -1, priceEur: 24.99, features: JSON.stringify({ exportCsv: true, historial: true, pdfMonth: 30, valoracionsMonth: 30 }) },
  });
  const before = await showRows("ABANS (estat pre-FASE-2)");

  // ── 2) migració ──
  await applyMigration();
  const after = await showRows("DESPRÉS (1a passada)");

  const p = after.find((r) => r.plan === "PREMIUM")!;
  const pr = after.find((r) => r.plan === "PRO")!;
  const f = after.find((r) => r.plan === "FREE")!;
  const pf = JSON.parse(p.features || "{}");
  const prf = JSON.parse(pr.features || "{}");
  const ff = JSON.parse(f.features || "{}");
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`FALLA: ${msg}`);
    console.log(`  ✓ ${msg}`);
  };

  assert(p.quotaMonth === -1, "Premium quotaMonth 7 → -1 («Consultes il·limitades» publicat)");
  assert(p.priceEur === 8.99, "Premium priceEur INTACTE (8,99 € — red line 1)");
  assert(pf.historial === true && pf.historialTtlDies === -1, "Premium historial il·limitat");
  assert(pf.valoracionsMonth === -1, "Premium Valora v2 il·limitat");
  assert(pf.normativaCompleta === true && pf.alertes === true, "Premium flags nous (normativaCompleta, alertes)");
  assert(pf.pdfMonth === 5, "Premium pdfMonth 5 PRESERVAT (publicat — red line 4)");
  assert(pf.evolucioTemporal === true, "Premium evolucioTemporal alineat (publicat)");
  assert(prf.normativaCompleta === true && prf.alertes === true, "Pro hereda flags nous");
  assert(prf.valoracionsMonth === -1, "Pro Valora il·limitat (mai plan inferior per sobre)");
  assert(prf.pdfMonth === 30 && prf.exportCsv === true, "Pro límits publicats INTACTES (30 PDFs, CSV)");
  assert(f.quotaMonth === 3 && ff.historialTtlDies === 7 && ff.alertes === undefined, "FREE INTACTE (3 consultes, TTL 7, cap flag nou — red line 4)");
  console.log(`  ✓ fileres abans/després: ${before.length}/${after.length} (cap filera creada ni esborrada)`);

  // ── 3) IDEMPOTÈNCIA: 2a passada = mateix estat ──
  await applyMigration();
  const again = await showRows("DESPRÉS (2a passada — idempotència)");
  const p2 = again.find((r) => r.plan === "PREMIUM")!;
  assert(p2.quotaMonth === -1 && JSON.parse(p2.features || "{}").pdfMonth === 5, "2a passada = mateix estat (idempotent)");

  // ── 4) usuaris de prova (login e2e) ──
  const hash = await bcrypt.hash("PreuReal2026!", 10);
  for (const [email, plan, role] of [
    ["admin@preureal.cat", "PRO", "ADMIN"],
    ["premium@preureal.cat", "PREMIUM", "USER"],
    ["free@preureal.cat", "FREE", "USER"],
  ] as const) {
    await db.user.upsert({
      where: { email },
      update: { plan, passwordHash: hash, active: true, emailVerifiedAt: new Date() },
      create: { email, passwordHash: hash, name: "Prova", plan, role, locale: "ca", emailVerifiedAt: new Date() },
    });
  }
  console.log("\n✓ usuaris de prova: admin@preureal.cat (PRO) · premium@ (PREMIUM) · free@ (FREE), tots verificats");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
