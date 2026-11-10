/**
 * Fase 2 — Test dels parsers INE amb fixtures reals (sense base de dades).
 *
 * Valida el parseig i el mapeig territorial contra les xifres PUBLICADES
 * oficialment (nota de premsa IPVA 2024: +3,5% nacional; Atlas 2024:
 * renda neta mitjana per persona nacional 15.948 €; Catalunya +3,1% IPVA).
 *
 * Uso: npx tsx scripts/fase2_test_parse.ts
 */
import * as fs from "fs";
import {
  parseIpvaNacCcaa,
  parseIpvaProv,
  parseIpvaMuni,
  parseAtlasMuni,
  parseAtlasNacional,
  buildMuniMatcher,
  IPVA_INDICE,
  IPVA_TASA_ANUAL,
  RENTA_NETA_MEDIA_PERSONA,
  type RawObservation,
} from "../src/lib/ine-parse";

const FIX = "/home/z/my-project/data/fixtures";
const MUNIS = "/home/z/my-project/data/municipalities.json";

let failures = 0;
function check(desc: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✓" : "✗"} ${desc}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function near(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

function find(
  obs: RawObservation[],
  variable: string,
  geoLevel: string,
  geoCode: string,
  period: string,
): RawObservation | undefined {
  return obs.find(
    (o) => o.variable === variable && o.geoLevel === geoLevel && o.geoCode === geoCode && o.period === period,
  );
}

const munis = JSON.parse(fs.readFileSync(MUNIS, "utf-8"));
const match = buildMuniMatcher(munis);

// sanity del matcher: article invertit de l'INE (el catàleg Gencat usa
// forma invertida «Vendrell, el»; l'INE «Vendrell, El»)
const vendrell = munis.find((m: { name: string }) => m.name.replace(/,/g, "").toLowerCase().includes("vendrell"));
check("matcher: 'Vendrell, El' mapeja el codi d'El Vendrell",
  !!vendrell && match("Vendrell, El")?.code === vendrell.code,
  `${vendrell?.code} → ${match("Vendrell, El")?.code}`);
check("matcher: 'Barcelona' → Barcelona (080193)", match("Barcelona")?.code === "080193");
check("matcher: 'Lleida' mapeja", match("Lleida")?.code === "25119" || match("Lleida")?.name === "Lleida",
  match("Lleida")?.name);

// ── IPVA ─────────────────────────────────────────────────────────────────────
const ipvaNac = parseIpvaNacCcaa(JSON.parse(fs.readFileSync(`${FIX}/ipva_nac_ccaa.json`, "utf-8")));
check("IPVA NAC/CCAA: observaciones > 30", ipvaNac.observations.length > 30,
  `${ipvaNac.observations.length}`);

const nacInd24 = find(ipvaNac.observations, IPVA_INDICE, "ESTATAL", "ES", "2024");
check("IPVA índice nacional 2024 = 122,92", !!nacInd24 && near(nacInd24.value, 122.92),
  nacInd24 ? String(nacInd24.value) : "no encontrado");
const nacTasa24 = find(ipvaNac.observations, IPVA_TASA_ANUAL, "ESTATAL", "ES", "2024");
check("IPVA tasa nacional 2024 = 3,5%", !!nacTasa24 && near(nacTasa24.value, 3.5),
  nacTasa24 ? String(nacTasa24.value) : "no encontrado");
const catTasa24 = find(ipvaNac.observations, IPVA_TASA_ANUAL, "CCAA", "09", "2024");
check("IPVA tasa Cataluña 2024 = 3,1% (nota de prensa)", !!catTasa24 && near(catTasa24.value, 3.1),
  catTasa24 ? String(catTasa24.value) : "no encontrado");
check("IPVA NAC: sin municipios ni desgloses colados",
  ipvaNac.observations.every((o) => o.geoLevel === "ESTATAL" || o.geoLevel === "CCAA"));

const ipvaProv = parseIpvaProv(JSON.parse(fs.readFileSync(`${FIX}/ipva_prov.json`, "utf-8")));
const provCodes = ["08", "17", "25", "43"];
check("IPVA prov: 4 provincias con índice 2024",
  provCodes.every((c) => find(ipvaProv.observations, IPVA_INDICE, "PROV", c, "2024")),
  provCodes.map((c) => find(ipvaProv.observations, IPVA_INDICE, "PROV", c, "2024")?.value ?? "-").join(", "));

const ipvaMuni = parseIpvaMuni(JSON.parse(fs.readFileSync(`${FIX}/ipva_muni.json`, "utf-8")), match);
const munisIpva = new Set(ipvaMuni.observations.map((o) => o.municipalityCode));
check("IPVA municipal: ≥ 110 municipios catalanes (>10.000 hab)", munisIpva.size >= 110,
  `${munisIpva.size} municipios`);
const bcnIdx = ipvaMuni.observations.find(
  (o) => o.municipalityCode === "080193" && o.variable === IPVA_INDICE && o.period === "2024",
);
check("IPVA municipal: Barcelona ciudad tiene índice 2024", !!bcnIdx, bcnIdx ? String(bcnIdx.value) : "-");
check("IPVA municipal: sin años < 2015", ipvaMuni.observations.every((o) => Number(o.period) >= 2015));

// ── Atlas de renta ───────────────────────────────────────────────────────────
const atlasNac = parseAtlasNacional(JSON.parse(fs.readFileSync(`${FIX}/atlas_nacional.json`, "utf-8")));
const nacRenta24 = find(atlasNac.observations, RENTA_NETA_MEDIA_PERSONA, "ESTATAL", "ES", "2024");
check("Atlas renta neta persona nacional 2024 = 15.948 €", !!nacRenta24 && near(nacRenta24.value, 15948, 0.01),
  nacRenta24 ? String(nacRenta24.value) : "no encontrado");
check("Atlas nacional: Cataluña 2024 presente",
  !!find(atlasNac.observations, RENTA_NETA_MEDIA_PERSONA, "CCAA", "09", "2024"));
check("Atlas nacional: 4 provincias 2024 presentes",
  provCodes.every((c) => find(atlasNac.observations, RENTA_NETA_MEDIA_PERSONA, "PROV", c, "2024")));

const atlasProvs: [string, string, string][] = [
  ["atlas_prov_08_barcelona.json", "Barcelona", "08"],
  ["atlas_prov_17_girona.json", "Girona", "17"],
  ["atlas_prov_25_lleida.json", "Lleida", "25"],
  ["atlas_prov_43_tarragona.json", "Tarragona", "43"],
];
let totalMuni = 0;
let unmatchedTotal: string[] = [];
const codesPorProv: Record<string, Set<string>> = {};
for (const [file, prov, code] of atlasProvs) {
  const r = parseAtlasMuni(JSON.parse(fs.readFileSync(`${FIX}/${file}`, "utf-8")), match);
  const codes = new Set(r.observations.map((o) => o.municipalityCode ?? ""));
  codesPorProv[code] = codes;
  totalMuni += r.observations.length;
  unmatchedTotal.push(...r.unmatched);
  const provMunis = munis.filter((m: { province: string }) => m.province === prov).length;
  check(`Atlas ${prov}: municipios mapeados ≈ catálogo (${provMunis})`,
    codes.size >= provMunis - 3 && codes.size <= provMunis + 3,
    `mapeados ${codes.size} de ${provMunis}; sinMunicipio=${r.skips.sinMunicipio}, unmatched=[${r.unmatched.slice(0, 5).join("|")}]`);
}
check("Atlas municipal: total observaciones 15.000–20.000 (con secreto excluido)",
  totalMuni >= 15_000 && totalMuni <= 20_000, String(totalMuni));
check("Atlas municipal: sin solapamientos entre provincias",
  !["08", "17", "25", "43"].some((a) => ["08", "17", "25", "43"].some((b) => b !== a &&
    [...(codesPorProv[a] ?? [])].some((x) => codesPorProv[b]?.has(x)))));

// Matadepera entre los top nacionales (nota de prensa ADRH 2024)
const matadepera = munis.find((m: { name: string }) => m.name === "Matadepera");
const matObs = matadepera
  ? [...codesPorProv["08"] ?? []].length > 0
    ? parseAtlasMuni(JSON.parse(fs.readFileSync(`${FIX}/atlas_prov_08_barcelona.json`, "utf-8")), match)
        .observations.find((o) => o.municipalityCode === matadepera.code &&
          o.variable === RENTA_NETA_MEDIA_PERSONA && o.period === "2024")
    : undefined
  : undefined;
check("Atlas: Matadepera 2024 > 25.000 € (entre los más altos, nota de prensa ADRH)",
  !!matObs && matObs.value > 25_000, matObs ? String(matObs.value) : "-");

console.log("\n─ Resumen skips IPVA muni:", JSON.stringify(ipvaMuni.skips));
console.log("─ Resumen skips Atlas nacional:", JSON.stringify(atlasNac.skips));
console.log(`\n${failures === 0 ? "TODOS LOS CHECKS OK" : `${failures} CHECKS FALLIDOS`}`);
process.exit(failures === 0 ? 0 : 1);
