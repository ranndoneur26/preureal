/**
 * Fase 2 — Muestra las filas exactas que irían a createMany (sin BD).
 * Uso: npx tsx scripts/fase2_preview_rows.ts
 */
import * as fs from "fs";
import {
  parseAtlasNacional,
  parseIpvaNacCcaa,
  parseIpvaMuni,
  parseAtlasMuni,
  buildMuniMatcher,
} from "../src/lib/ine-parse";

const FIX = "data/fixtures";
const munis = JSON.parse(fs.readFileSync("data/municipalities.json", "utf-8"));
const match = buildMuniMatcher(munis);

const r1 = parseIpvaNacCcaa(JSON.parse(fs.readFileSync(`${FIX}/ipva_nac_ccaa.json`, "utf-8")));
const rProv = parseIpvaProvFixtures();
const r3 = parseIpvaMuni(JSON.parse(fs.readFileSync(`${FIX}/ipva_muni.json`, "utf-8")), match);
const r2 = parseAtlasNacional(JSON.parse(fs.readFileSync(`${FIX}/atlas_nacional.json`, "utf-8")));
const rBcn = parseAtlasMuni(JSON.parse(fs.readFileSync(`${FIX}/atlas_prov_08_barcelona.json`, "utf-8")), match);

function parseIpvaProvFixtures() {
  const { parseIpvaProv } = require("../src/lib/ine-parse") as typeof import("../src/lib/ine-parse");
  return parseIpvaProv(JSON.parse(fs.readFileSync(`${FIX}/ipva_prov.json`, "utf-8")));
}

console.log("--- Fila IPVA ESTATAL 2024 ---");
console.log(JSON.stringify(r1.observations.find((o) => o.period === "2024" && o.geoLevel === "ESTATAL"), null, 1));
console.log("--- Fila ATLAS ESTATAL 2024 ---");
console.log(JSON.stringify(r2.observations.find((o) => o.geoLevel === "ESTATAL" && o.period === "2024"), null, 1));
console.log("--- Fila IPVA MUNI Barcelona 2024 ---");
console.log(JSON.stringify(r3.observations.find((o) => o.municipalityCode === "080193" && o.period === "2024"), null, 1));
console.log("--- Fila ATLAS MUNI Barcelona 2024 ---");
console.log(JSON.stringify(rBcn.observations.find((o) => o.municipalityCode === "080193" && o.period === "2024"), null, 1));

const ipvaTotal = r1.observations.length + rProv.observations.length + r3.observations.length;
console.log("\nTotales esperados en BD:");
console.log("  IPVA: nac/ccaa", r1.observations.length, "+ prov", rProv.observations.length, "+ muni", r3.observations.length, "=", ipvaTotal);
console.log("  ATLAS: nacional", r2.observations.length, "+ municipal Barcelona", rBcn.observations.length, "(+ Girona/Lleida/Tarragona ~10.000 más)");
