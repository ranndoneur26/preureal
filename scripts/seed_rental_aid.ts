/**
 * Fase 4 — Seed editorial d'ajudes al lloguer (taula RentalAid).
 *
 * Font de veritat editorial: src/data/rental_aid_seed.json (el mateix fitxer
 * que /api/aid fa servir com a fallback si la taula encara és buida). NOMÉS
 * ajuts reals i verificables, amb enllaç oficial i data de revisió.
 * Idempotent (upsert per code): reexecutar actualitza el text i conserva la
 * fila; les convocatories caduquen i es reobren cada any.
 *
 * Ús: npx tsx scripts/seed_rental_aid.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const db = new PrismaClient();

const seedPath = path.join(__dirname, "..", "src", "data", "rental_aid_seed.json");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as {
  revisado: string;
  aids: Array<Record<string, unknown>>;
};

async function main() {
  const REVIEWED_AT = new Date(`${seed.revisado}T00:00:00.000Z`);
  let created = 0;
  let updated = 0;
  for (const aid of seed.aids) {
    const code = String(aid.code);
    const data = { ...aid, lastReviewedAt: REVIEWED_AT, reviewedBy: "system", active: true };
    const existing = await db.rentalAid.findUnique({ where: { code } });
    if (existing) {
      await db.rentalAid.update({ where: { code }, data });
      updated++;
    } else {
      await db.rentalAid.create({ data: data as never });
      created++;
    }
  }
  console.log(`RentalAid seed OK: ${created} creades, ${updated} actualitzades (revisades ${seed.revisado})`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("Seed rental aid FALLÓ:", e);
  process.exit(1);
});
