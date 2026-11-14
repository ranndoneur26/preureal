/**
 * v39 — Validació END-TO-END LOCAL de la capa demogràfica amb DADES REALS.
 *  1. Sembrà els 947 municipis (src/data/municipalities.json)
 *  2. Executa els importadors IDESCAT (seed emex + sèries Taules, API real)
 *  3. Llegeix getMuniDemografia per Barcelona (gran) i Llagostera (petit)
 * Executar: DATABASE_URL=postgresql://preureal@localhost:5433/preureal npx tsx scripts/test_demografia_local.ts
 */
import { PrismaClient } from "@prisma/client";
import { importIdescatEmexSeed, importIdescatPob, importIdescatEdat, importIdescatNac, importIdescatCensLlars } from "../src/lib/idescat-import";
import { getMuniDemografia, getDemografiaSummary, interpretacioDemografica } from "../src/lib/demografia";
import munisSeed from "../src/data/municipalities.json";

const db = new PrismaClient();

async function main() {
  // 1) municipis
  const seed = munisSeed as Array<Record<string, unknown>>;
  let n = 0;
  for (const m of seed) {
    await db.municipality.upsert({
      where: { code: String(m.code) },
      create: {
        code: String(m.code),
        ineCode: (m.ineCode as string) ?? null,
        name: String(m.name),
        comarca: (m.comarca as string) ?? null,
        province: (m.province as string) ?? null,
        lat: Number(m.lat),
        lng: Number(m.lng),
        rentLatest: (m.rentLatest as number) ?? null,
        rentPeriod: (m.rentPeriod as string) ?? null,
        rentHistory: m.rentHistory ? JSON.stringify(m.rentHistory) : null,
        contractsLatest: (m.contractsLatest as number) ?? null,
        comarcaRefLatest: (m.comarcaRefLatest as number) ?? null,
        comarcaRefPeriod: (m.comarcaRefPeriod as string) ?? null,
        isTense: Boolean(m.isTense),
        tenseList: (m.tenseList as string) ?? null,
        rentSource: (m.rentSource as string) ?? "SENSE_DADA",
      },
      update: {},
    });
    n++;
    if (n % 200 === 0) console.log(`  municipis: ${n}/${seed.length}`);
  }
  console.log(`municipis sembrats: ${n}`);

  // 2) importadors IDESCAT amb dades reals
  console.log("── EMEX SEED (local) ──");
  console.log(JSON.stringify(await importIdescatEmexSeed("test:local")));
  // mateix flux que el cron: lots individuals + COMCAT al final de cada font
  console.log("── POB lots (API real) ──");
  for (const s of [0, 1, "COMCAT"] as Array<number | "COMCAT">) {
    const r = await importIdescatPob(s, "test:local");
    console.log(`POB ${s}: ok=${r.ok} created=${r.created} ${r.error ?? ""} (${r.durationMs}ms)`);
  }
  console.log("── EDAT lots ──");
  for (let i = 0; i < 14; i++) {
    const r = await importIdescatEdat(i, "test:local");
    console.log(`EDAT ${i}: ok=${r.ok} created=${r.created} ${r.error ?? ""} (${r.durationMs}ms)`);
    if (!r.ok) break;
  }
  const edatComcat = await importIdescatEdat("COMCAT", "test:local");
  console.log(`EDAT COMCAT: ok=${edatComcat.ok} created=${edatComcat.created} (${edatComcat.durationMs}ms)`);
  console.log("── NAC lots ──");
  for (const s of [0, 1, "COMCAT"] as Array<number | "COMCAT">) {
    const r = await importIdescatNac(s, "test:local");
    console.log(`NAC ${s}: ok=${r.ok} created=${r.created} ${r.error ?? ""} (${r.durationMs}ms)`);
  }
  console.log("── CENS lots ──");
  for (const s of [0, 1, "COMCAT"] as Array<number | "COMCAT">) {
    const r = await importIdescatCensLlars(s, "test:local");
    console.log(`CENS ${s}: ok=${r.ok} created=${r.created} ${r.error ?? ""} (${r.durationMs}ms)`);
  }

  // 3) lectura agregada
  for (const code of ["080193", "170890"]) {
    const d = await getMuniDemografia(code);
    if (!d) throw new Error(`sense demografia per ${code}`);
    console.log(`── ${code} ──`);
    console.log(JSON.stringify({
      poblacio: { actual: d.poblacio.actual, any: d.poblacio.anyActual, var5: d.poblacio.var5Pct?.toFixed(1), var10: d.poblacio.var10Pct?.toFixed(1), tendencia: d.poblacio.tendencia, punts: d.poblacio.serie.length },
      edats: { actual: d.edats.actual, any: d.edats.anyActual, pct65: d.edats.pct65?.toFixed(1) },
      llars: { total: d.llars.total, any: d.llars.totalAny, mida: d.llars.midaMitjana, censos: d.llars.serie.map((p) => p.year).join(",") },
      estrangera: { valor: d.estrangera.valor, pct: d.estrangera.pct?.toFixed(1), any: d.estrangera.any },
      territori: d.territori,
      comarca: { nom: d.comarca.comarca, pob: d.comarca.poblacioActual, densitat: d.comarca.densitat },
      cat: { pob: d.catalunya.poblacioActual, pct65: d.catalunya.pct65?.toFixed(1) },
      cobertura: d.cobertura,
    }, null, 1));
    console.log("interpretacio(ca):", interpretacioDemografica(d, "ca").join(" | "));
  }
  const summ = await getDemografiaSummary(["080193", "170890"]);
  console.log("summary comparador:", JSON.stringify([...summ.entries()].map(([k, v]) => ({ k, pob: v.poblacio, pct65: v.pct65, llars: v.llarsTotal, dens: v.densitat }))));
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
