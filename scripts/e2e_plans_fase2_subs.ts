/**
 * E2E FASE 2 — subscripcions vigents per als usuaris de prova (el pla efectiu
 * deriva SEMPRE de Subscription, per disseny anti-abús P1.4).
 * Ús: DATABASE_URL=... bun run scripts/e2e_plans_fase2_subs.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const end = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  for (const email of ["admin@preureal.cat", "premium@preureal.cat"]) {
    const u = await db.user.findUnique({ where: { email } });
    if (!u) throw new Error(`falta l'usuari ${email} (executa e2e_plans_fase2.ts)`);
    const plan = email.startsWith("admin") ? "PRO" : "PREMIUM";
    const existing = await db.subscription.findFirst({ where: { userId: u.id, plan, status: "active" } });
    if (!existing) {
      await db.subscription.create({
        data: {
          userId: u.id,
          plan,
          status: "active",
          demo: true,
          currentPeriodStart: new Date(),
          currentPeriodEnd: end,
        },
      });
    }
    await db.user.update({ where: { id: u.id }, data: { plan } });
    console.log(`✓ ${email}: subscripció vigent ${plan} fins ${end.toISOString().slice(0, 10)}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
