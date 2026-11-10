/**
 * Fase 3 — Sonda de dades reals per fonamentar els tests d'indicadors.
 * NOMÉS LECTURA. Uso: npx tsx scripts/fase3_probe.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // 1) Cobertura per variable/geoLevel
  const groups = await db.statObservation.groupBy({
    by: ["variable", "geoLevel"],
    _count: { _all: true },
    _min: { period: true },
    _max: { period: true },
  });
  console.log("== StatObservation per variable/geoLevel ==");
  for (const g of groups.sort((a, b) => a.variable.localeCompare(b.variable))) {
    console.log(
      `  ${g.variable.padEnd(30)} ${g.geoLevel.padEnd(8)} n=${String(g._count._all).padEnd(5)} períodes ${g._min.period}..${g._max.period}`
    );
  }

  // 2) Municipis amb renda (cobertura)
  const munisRenda = await db.statObservation.groupBy({
    by: ["variable"],
    _count: { _all: true },
    where: { geoLevel: "MUNI", variable: { in: ["RENTA_NETA_MEDIA_HOGAR", "RENTA_NETA_MEDIA_PERSONA"] } },
  });
  console.log("\n== Municipis amb sèries de renda ==");
  for (const m of munisRenda) console.log(`  ${m.variable}: ${m._count._all} punts`);

  // 3) IPVA Catalunya: sèrie índex completa
  const cat = await db.statObservation.findMany({
    where: { sourceId: { not: undefined }, variable: "IPVA_INDICE", geoLevel: "CCAA", geoCode: "09" },
    orderBy: { period: "asc" },
    select: { period: true, value: true },
  });
  console.log("\n== IPVA índex Catalunya (09) ==", JSON.stringify(cat));

  const catTasa = await db.statObservation.findMany({
    where: { variable: "IPVA_TASA_ANUAL", geoLevel: "CCAA", geoCode: "09" },
    orderBy: { period: "asc" },
    select: { period: true, value: true },
  });
  console.log("== IPVA taxa anual Catalunya ==", JSON.stringify(catTasa));

  // 4) IPVA municipal: quants municipis?
  const ipvaMuni = await db.statObservation.findMany({
    where: { variable: "IPVA_INDICE", geoLevel: "MUNI" },
    distinct: ["geoCode"],
    select: { geoCode: true, geoName: true },
  });
  console.log(`\n== IPVA municipal: ${ipvaMuni.length} municipis ==`, ipvaMuni.slice(0, 12));

  // 5) Renda Barcelona (080193) últim any
  const bcn = await db.statObservation.findMany({
    where: { geoLevel: "MUNI", municipalityCode: "080193" },
    orderBy: [{ variable: "asc" }, { period: "asc" }],
    select: { variable: true, period: true, value: true, municipalityCode: true },
  });
  console.log("\n== Renda Barcelona 080193 ==", JSON.stringify(bcn.slice(-6)));

  // 6) IPVA províncies índex últims punts
  const prov = await db.statObservation.findMany({
    where: { variable: "IPVA_INDICE", geoLevel: "PROV" },
    orderBy: { period: "asc" },
    select: { geoCode: true, period: true, value: true },
  });
  console.log("\n== IPVA províncies (tots els punts) ==", JSON.stringify(prov));

  // 7) Edificis amb mostra suficient per banda (P25/mediana/P75) — top 8 municipis
  const bld = await db.building.groupBy({
    by: ["municipalityCode"],
    _count: { _all: true },
    where: { avgRentEurMonth: { not: null } },
    orderBy: { _count: { municipalityCode: "desc" } },
    take: 8,
  });
  console.log("\n== Edificis amb avgRentEurMonth per municipi (top 8) ==");
  for (const b of bld) console.log(`  ${b.municipalityCode}: ${b._count._all}`);

  // 8) Municipality: Barcelona + Cornellà (exemple de la proposta)
  const munis = await db.municipality.findMany({
    where: { code: { in: ["080193", "080077", "080101", "081017", "25120", "17079", "43148"] } },
    select: { code: true, name: true, comarca: true, province: true, rentLatest: true, rentPeriod: true, isTense: true },
  });
  console.log("\n== Municipality clau ==", JSON.stringify(munis, null, 1));

  // 9) Renda ESTATAL + CCAA 09 últims
  const upper = await db.statObservation.findMany({
    where: {
      variable: { in: ["RENTA_NETA_MEDIA_HOGAR", "RENTA_NETA_MEDIA_PERSONA"] },
      geoLevel: { in: ["ESTATAL", "CCAA", "PROV"] },
    },
    orderBy: { period: "asc" },
    select: { variable: true, geoLevel: true, geoCode: true, geoName: true, period: true, value: true },
  });
  console.log("\n== Renta àmbits superiors ==", JSON.stringify(upper, null, 0));

  await db.$disconnect();
}
main();
