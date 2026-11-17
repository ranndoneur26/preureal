/**
 * E2E FASE 2 — simula un avanç del període oficial (com faria Incasòl en
 * publicar 2026) i crea les alertes de TENSE/NORMATIVA + una fila FREE òrfena.
 * Ús: DATABASE_URL=... bun run scripts/e2e_plans_fase2_avanca.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // avanç del període oficial per a Girona (simula publicació Incasòl 2026)
  await db.municipality.update({ where: { code: "170792" }, data: { rentPeriod: "2026", rentLatest: 838 } });
  // alertes TENSE + NORMATIVA per al mateix premium@ + una fila FREE (ha de ser omesa pel cron)
  const u = await db.user.findUnique({ where: { email: "premium@preureal.cat" } });
  const f = await db.user.findUnique({ where: { email: "free@preureal.cat" } });
  if (!u || !f) throw new Error("falten usuaris de prova");
  await db.userAlert.upsert({
    where: { userId_entityKey_tipus: { userId: u.id, entityKey: "MUNI:170792", tipus: "TENSE" } },
    update: { activa: true },
    create: { userId: u.id, entityKey: "MUNI:170792", tipus: "TENSE", activa: true },
  });
  await db.userAlert.upsert({
    where: { userId_entityKey_tipus: { userId: u.id, entityKey: "MUNI:080193", tipus: "NORMATIVA" } },
    update: { activa: true },
    create: { userId: u.id, entityKey: "MUNI:080193", tipus: "NORMATIVA", activa: true },
  });
  await db.userAlert.upsert({
    where: { userId_entityKey_tipus: { userId: f.id, entityKey: "MUNI:081721", tipus: "PRICE" } },
    update: { activa: true },
    create: { userId: f.id, entityKey: "MUNI:081721", tipus: "PRICE", activa: true },
  });
  console.log("✓ dada avançada (Girona 816→838 €, 2025→2026) + alertes creades (premium: PRICE+TENSE+NORMATIVA · free: 1 fila que el cron ha d'ometre)");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
