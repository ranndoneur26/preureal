/**
 * Preureal — seed NOMÉS de municipis (947, dades reals Incasòl/DOGC) al
 * Postgres LOCAL del sandbox (scripts/pg_local.sh). Útil després de
 * `prisma migrate deploy` en una BD local buida, abans d'executar el loader
 * del buscador invers (pipeline/f4_zones_buscador.py) que llegeix
 * public."Municipality".
 *
 * Idempotent (upsert per code). No toca edificis ICGC ni usuaris (per això
 * existeix: scripts/seed.ts ho fa tot però demana xarxa ICGC).
 *
 * Executar: DATABASE_URL=postgresql://preureal@127.0.0.1:5432/preureal \
 *           bun scripts/seed_municipis_pglocal.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const db = new PrismaClient();

interface Mun {
  code: string;
  ineCode: string | null;
  name: string;
  comarca: string | null;
  province: string | null;
  lat: number;
  lng: number;
  rentLatest: number | null;
  rentPeriod: string | null;
  rentPrevYear: number | null;
  rentPrevPeriod: string | null;
  rentHistory: Record<string, number> | null;
  contractsLatest: number | null;
  contractsPeriod: string | null;
  comarcaRefLatest: number | null;
  comarcaRefPeriod: string | null;
  comarcaRefHistory: Record<string, number> | null;
  rentSource: string | null;
  isTense: boolean;
  tenseList: string | null;
}

async function main() {
  const file = path.join(process.cwd(), "data", "municipalities.json");
  const munis: Mun[] = JSON.parse(fs.readFileSync(file, "utf-8"));
  let n = 0;
  for (const m of munis) {
    await db.municipality.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        ineCode: m.ineCode,
        name: m.name,
        comarca: m.comarca,
        province: m.province,
        lat: m.lat,
        lng: m.lng,
        rentLatest: m.rentLatest,
        rentPeriod: m.rentPeriod,
        rentPrevYear: m.rentPrevYear,
        rentPrevPeriod: m.rentPrevPeriod,
        rentHistory: m.rentHistory ? JSON.stringify(m.rentHistory) : null,
        contractsLatest: m.contractsLatest,
        comarcaRefLatest: m.comarcaRefLatest,
        comarcaRefPeriod: m.comarcaRefPeriod,
        comarcaRefHistory: m.comarcaRefHistory ? JSON.stringify(m.comarcaRefHistory) : null,
        rentSource: m.rentSource,
        isTense: m.isTense,
        tenseList: m.tenseList,
      },
      update: {
        rentLatest: m.rentLatest,
        rentPeriod: m.rentPeriod,
        rentPrevYear: m.rentPrevYear,
        rentPrevPeriod: m.rentPrevPeriod,
        rentHistory: m.rentHistory ? JSON.stringify(m.rentHistory) : null,
        contractsLatest: m.contractsLatest,
        comarcaRefLatest: m.comarcaRefLatest,
        comarcaRefPeriod: m.comarcaRefPeriod,
        comarcaRefHistory: m.comarcaRefHistory ? JSON.stringify(m.comarcaRefHistory) : null,
        rentSource: m.rentSource,
        isTense: m.isTense,
        tenseList: m.tenseList,
      },
    });
    n += 1;
  }
  console.log(`✓ municipis sembrats (upsert): ${n}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
