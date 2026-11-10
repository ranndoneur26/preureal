/**
 * Fase 2 — Baseline de tablas existentes (ANTES de la migración aditiva).
 * Guarda el nº de filas de cada tabla para verificar después que nada cambió.
 * Uso: npx tsx scripts/fase2_baseline.ts save|check
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const db = new PrismaClient();
const FILE = "/home/z/my-project/data/fase2_baseline.json";

const TABLES = [
  "User", "Subscription", "SubscriptionUsage", "Municipality", "Building",
  "SearchLog", "Event", "PriceReport", "EmailLog", "RateLimit", "StripeEvent",
  "AuditLog", "ImportRun", "PlanSetting", "Favorite", "SavedComparison",
  "PasswordToken", "EmailToken",
] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    out[t] = await (db as unknown as Record<string, { count(): Promise<number> }>)[t].count();
  }
  return out;
}

async function main() {
  const mode = process.argv[2] ?? "save";
  const c = await counts();
  console.log("Conteos:", JSON.stringify(c, null, 1));
  if (mode === "save") {
    fs.writeFileSync(FILE, JSON.stringify(c, null, 1));
    console.log("Baseline guardado en", FILE);
  } else {
    const prev = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    const diffs = Object.keys(c).filter((k) => c[k] !== prev[k]);
    if (diffs.length === 0) {
      console.log("✓ SIN CAMBIOS en ninguna tabla existente");
    } else {
      console.log("✗ DIFERENCIAS:", diffs.map((d) => `${d}: ${prev[d]} -> ${c[d]}`));
      process.exitCode = 1;
    }
  }
  await db.$disconnect();
}
main();
