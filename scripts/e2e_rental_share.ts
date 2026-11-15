/**
 * E2E LOCAL — v41 indicador «% estimat d'alquiler sobre el parc residencial».
 * Executa contra el PostgreSQL local del sandbox (sense tocar producció):
 *  1. importIdescatCensTenencia()   — cens 2021 en viu (615 munis + Catalunya)
 *  2. importIncasolFlux()           — flux anual en viu (SODA qww9-bvhh)
 *  3. recalcRentalShare()           — 947 municipis
 *  4. getRentalShareDetail('081136')— fitxa Manresa
 *  5. rànquing censal (mateixa consulta que /api/rental-share/ranking)
 *  6. resum del comparador (getRentalShareSummary)
 *  7. estat de les fonts a DataSource + ImportRun
 * Les claus de l'API pública es provoquen amb la mateixa lògica del llibre
 * (sense servidor Next): les rutes ja estan tipades i el build les cobreix.
 */
import {
  importIdescatCensTenencia,
  importIncasolFlux,
  recalcRentalShare,
  getRentalShareDetail,
  getRentalShareSummary,
} from "../src/lib/rental-share";
import { db } from "../src/lib/db";

async function main() {
  const t0 = Date.now();

  console.log("── [1] Cens 2021 (Idescat en viu) ─────────────────────────────");
  const cens = await importIdescatCensTenencia("e2e-local");
  console.log("  ", JSON.stringify(cens));

  console.log("── [2] Flux anual de fiances (SODA en viu) ────────────────────");
  const flux = await importIncasolFlux("e2e-local");
  console.log("  ", JSON.stringify(flux));

  console.log("── [3] Recàlcul de l'indicador (947 municipis) ────────────────");
  const recalc = await recalcRentalShare("e2e-local");
  console.log("  ", JSON.stringify(recalc));

  console.log("── [4] Fitxa Manresa (081136) ─────────────────────────────────");
  const det = await getRentalShareDetail("081136");
  console.log("   muni:", JSON.stringify(det.muni));
  console.log("   current:", JSON.stringify(det.current, null, 1).slice(0, 900));
  console.log("   flujoSerie (últims 5):", JSON.stringify(det.flujoSerie.slice(-5)));
  console.log("   catalunyaCensus:", JSON.stringify(det.catalunyaCensus));

  console.log("── [5] Rànquing censal (top 5) ────────────────────────────────");
  const top = await db.rentalShareObservation.findMany({
    where: { censusRentalPercentage: { not: null } },
    orderBy: { censusRentalPercentage: "desc" },
    take: 5,
    select: { municipalityName: true, municipalityCode: true, censusMainRental: true, censusMainTotal: true, censusRentalPercentage: true },
  });
  for (const r of top) {
    console.log(
      `    ${r.municipalityName} (${r.municipalityCode}): ${r.censusRentalPercentage}% (${r.censusMainRental}/${r.censusMainTotal})`
    );
  }

  console.log("── [6] Resum del comparador (Manresa + Barcelona) ─────────────");
  const sum = await getRentalShareSummary(["081136", "080193"]);
  for (const [k, v] of sum) console.log(`   ${k}:`, JSON.stringify(v));

  console.log("── [7] Estat de fonts i runs ──────────────────────────────────");
  const sources = await db.dataSource.findMany({
    where: { code: { startsWith: "IDESCAT_CENS2021" } },
    select: { code: true, name: true, active: true },
  });
  const obsByVar = await db.statObservation.groupBy({
    by: ["variable"],
    _count: true,
    where: { variable: { in: ["CENS_MAIN_RENTAL", "CENS_MAIN_TOTAL", "CENS_MAIN_PROP", "INCASOL_CONTRACTES_PERIODE"] } },
  });
  console.log("   DataSource:", JSON.stringify(sources));
  console.log("   Observacions:", JSON.stringify(obsByVar.map((g) => ({ variable: g.variable, n: g._count }))));
  const runs = await db.importRun.findMany({
    where: { source: { startsWith: "RENTAL_SHARE" } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { source: true, status: true, rowsTotal: true, created: true, skipped: true },
  });
  console.log("   ImportRuns:", JSON.stringify(runs));

  // consistència: cada muni censal té fila C:2021; total de files per estat
  const byStatus = await db.rentalShareObservation.groupBy({ by: ["dataStatus"], _count: true });
  console.log("   RentalShareObservation per estat:", JSON.stringify(byStatus.map((g) => ({ status: g.dataStatus, n: g._count }))));

  console.log(`── OK (${Date.now() - t0} ms) ─────────────────────────────────────────────`);
  process.exit(0);
}

main().catch((e) => {
  console.error("E2E ERROR:", e);
  process.exit(1);
});
