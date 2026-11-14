/**
 * v40 — Importadors del bloc «Serveis i qualitat de l'entorn» (Fase A).
 *
 * Fonts oficials (portal Socrata de la Generalitat — SODA REST):
 *  - tb2m-m33b  estacions de recàrrega EV (2.353 files — 1 pas)
 *  - nrmq-ytje  establiments sanitaris autoritzats (5.680 files — 1 pas)
 *  - kvmv-ahh4  directori de centres docents (38.108 files — lots per municipis)
 *  - 8gmd-gz7i  equipaments de Catalunya, filtre Cultura/Esports (lots per municipis)
 *  - j6ii-t3w2  certificats d'eficiència energètica ICAEN (1,34 M files):
 *               NO es fa scrape complet — lookup ON-DEMAND per referència
 *               catastral quan un usuari obre la fitxa d'un edifici, amb
 *               resultat cachejat a BuildingAssociation 30 dies (mateix
 *               patró que ICGC/Catastro). Evita ingestar 1,34 M files.
 *
 * Garanties (mateixes que idescat-import.ts): IDEMPOTENT (substitució per
 * lot després d'una càrrega correcta), ADITIU (mai toca cap altra taula),
 * TRAÇABLE (DataSource + ImportRun + AuditLog). Sense PostGIS: els punts
 * viuen amb lat/lng indexats; les distàncies es calculen amb haversine en
 * lectura i sempre s'etiqueten com a línia recta.
 */
import { db } from "@/lib/db";
import { audit } from "@/lib/security";
import {
  mapDocent,
  mapEquipament,
  mapRecarrega,
  mapSanitari,
  mapCertificat,
  normalizeRefcat,
  type GeoPointInput,
} from "@/lib/entorn-parse";

const UA = "Preureal/1.0 (dades oficials Generalitat; +https://www.preureal.com)";
const SODA = "https://analisi.transparenciacatalunya.cat/resource";
const PAGE = 2000;
/** Presupost de temps per pas del cron (el límit de Vercel és 60 s). */
export const STEP_BUDGET_MS = 40_000;
/** Finestra de frescor de les fonts puntuals (reimportació completa). */
const FRESH_MS = 60 * 24 * 3600 * 1000;
/** Municipis per lot (les fonts puntuals s'importen per lots de municipis). */
export const MUNIS_PER_CHUNK = 60;

export const ENTORNT_SOURCES = [
  "ENTORNT_RECARREGA",
  "ENTORNT_SANITARIS",
  "ENTORNT_DOCENTS",
  "ENTORNT_EQUIPAMENTS",
  "ENTORNT_ENERGIA",
] as const;

type SourceMeta = {
  code: string;
  name: string;
  institution: string;
  url: string;
  license: string;
  unit: string;
  periodicity: string;
  methodology: string;
};

const LIC_GENCAT =
  "Llicència oberta d'ús d'informació — Catalunya (citar font i data d'actualització)";

const SOURCES: Record<string, SourceMeta> = {
  ENTORNT_RECARREGA: {
    code: "ENTORNT_RECARREGA",
    name: "Estacions de recàrrega per a vehicle elèctric a Catalunya",
    institution: "Generalitat de Catalunya — Institut Català d'Energia (ICAEN)",
    url: "https://analisi.transparenciacatalunya.cat/d/tb2m-m33b",
    license: LIC_GENCAT,
    unit: "estació (punt)",
    periodicity: "SETMANAL",
    methodology:
      "Punts geolocalitzats d'estacions de recàrrega (potència kW, AC/DC, tipus de connexió i accés). Importació íntegra idempotent (substitució per lot).",
  },
  ENTORNT_SANITARIS: {
    code: "ENTORNT_SANITARIS",
    name: "Establiments sanitaris autoritzats a Catalunya",
    institution: "Generalitat de Catalunya — Departament de Salut (CatSalut)",
    url: "https://analisi.transparenciacatalunya.cat/d/nrmq-ytje",
    license: LIC_GENCAT,
    unit: "establiment (punt)",
    periodicity: "SETMANAL",
    methodology:
      "Catàleg d'establiments sanitariament autoritzats amb tipologia (farmàcies, CAP, hospitals...) i coordenades. Filtratge de tipologies en lectura; cap inferència sobre la qualitat del servei.",
  },
  ENTORNT_DOCENTS: {
    code: "ENTORNT_DOCENTS",
    name: "Directori de centres docents anual (Educació)",
    institution: "Generalitat de Catalunya — Departament d'Educació",
    url: "https://analisi.transparenciacatalunya.cat/d/kvmv-ahh4",
    license: LIC_GENCAT,
    unit: "centre (punt)",
    periodicity: "MENSUAL",
    methodology:
      "Centres educatius del curs vigent amb coordenades geogràfiques. Importació per lots de municipis (substitució idempotent per lot).",
  },
  ENTORNT_EQUIPAMENTS: {
    code: "ENTORNT_EQUIPAMENTS",
    name: "Equipaments de Catalunya (filtre Cultura i Esports)",
    institution: "Generalitat de Catalunya — Direcció General de Serveis Digitals",
    url: "https://analisi.transparenciacatalunya.cat/d/8gmd-gz7i",
    license: LIC_GENCAT,
    unit: "equipament (punt)",
    periodicity: "MENSUAL",
    methodology:
      "Integra equipaments per categoria. Només s'importen les categories rellevants per a la fitxa (Cultura i Esports. Lleure); altres categories queden fora per evitar duplicats amb les fonts específiques.",
  },
  ENTORNT_ENERGIA: {
    code: "ENTORNT_ENERGIA",
    name: "Certificats d'eficiència energètica d'edificis",
    institution: "Generalitat de Catalunya — Institut Català d'Energia (ICAEN)",
    url: "https://icaen.gencat.cat/ca/lenergia/usos-de-lenergia/als-edificis/CEEC_CAT",
    license: LIC_GENCAT,
    unit: "certificat (edifici, referència catastral)",
    periodicity: "ON_DEMAND",
    methodology:
      "Lookup per referència catastral quan s'obre la fitxa d'un edifici (el registre té 1,34 M certificats; no s'ingesta complet). Resultat cachejat 30 dies a BuildingAssociation. És el certificat oficial registrat, no un consum real mesurat.",
  },
};

async function auditSystem(action: string, target: string, meta: Record<string, unknown>) {
  try {
    await audit(null, action, target, meta);
  } catch {
    /* la auditoria no pot mai trencar la importació */
  }
}

async function ensureSources(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const meta of Object.values(SOURCES)) {
    const existing = await db.dataSource.findUnique({ where: { code: meta.code }, select: { id: true } });
    if (existing) {
      out[meta.code] = existing.id;
      continue;
    }
    const created = await db.dataSource.create({ data: { ...meta, notes: "v40 — bloc entorn (Fase A)" }, select: { id: true } });
    out[meta.code] = created.id;
  }
  return out;
}

/** Fetch SODA amb 3 intents i backoff curt. */
async function fetchSoda(datasetId: string, params: URLSearchParams, timeoutMs = 15000): Promise<unknown[]> {
  const url = `${SODA}/${datasetId}.json?${params.toString()}`;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${datasetId}`);
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? json : [];
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Mapa de codis municipals → codi censal de 6 dígits. Cada municipi es
 * indexa amb totes les variants que fan servir els datasets oficials:
 * ineCode ('08019'), censal ('080193') i sense zero inicial ('8019'/'80193')
 * — 8gmd-gz7i i tb2m-m33b publiquen «80193» sense el zero (comprovat v40). */
const strip0 = (s: string) => s.replace(/^0+/, "") || "0";

async function ine5Map(): Promise<Map<string, string>> {
  const munis = await db.municipality.findMany({ select: { code: true, ineCode: true } });
  const m = new Map<string, string>();
  const put = (key: string, code: string) => {
    if (!m.has(key)) m.set(key, code);
  };
  for (const mu of munis) {
    put(mu.code, mu.code);
    put(strip0(mu.code), mu.code);
    if (mu.ineCode) {
      put(mu.ineCode, mu.code);
      put(strip0(mu.ineCode), mu.code);
    }
  }
  return m;
}

function resolveMuni(point: GeoPointInput, muniMap: Map<string, string>): string | null {
  if (point.municipalityCode) return point.municipalityCode;
  return (point.ine5 && muniMap.get(point.ine5)) || null;
}

type PointRow = GeoPointInput & { datasetSourceCode: string };

function toRows(points: PointRow[], muniMap: Map<string, string>, version: string) {
  const rows: Array<{
    category: string; kind: string | null; externalId: string | null; name: string;
    municipalityCode: string | null; lat: number; lng: number; props: string | null;
    datasetSourceCode: string; datasetVersion: string;
  }> = [];
  let skipped = 0;
  for (const p of points) {
    rows.push({
      category: p.category,
      kind: p.kind,
      externalId: p.externalId,
      name: p.name,
      municipalityCode: resolveMuni(p, muniMap),
      lat: p.lat,
      lng: p.lng,
      props: p.props,
      datasetSourceCode: p.datasetSourceCode,
      datasetVersion: version,
    });
  }
  return { rows, skipped };
}

/** Afegeix el datasetSourceCode correcte a cada punt. */
function withSource(points: GeoPointInput[], sourceCode: string): PointRow[] {
  return points.map((p) => ({
    ...p,
    datasetSourceCode: p.category === "CHARGING_STATION" ? "ENTORNT_RECARREGA" : sourceCode,
  }));
}

/** Substitueix tots els punts d'una font (delete + create en transacció). */
async function replaceSource(
  sourceCode: string,
  points: GeoPointInput[],
  createdBy: string,
  runSource: string
): Promise<{ ok: boolean; created: number; skipped: number }> {
  await ensureSources();
  const muniMap = await ine5Map();
  const version = new Date().toISOString().slice(0, 10);
  const { rows, skipped } = toRows(withSource(points, sourceCode), muniMap, version);
  const run = await db.importRun.create({ data: { source: runSource, status: "OK", createdBy } });
  try {
    await db.$transaction([
      db.geoPoint.deleteMany({ where: { datasetSourceCode: sourceCode } }),
      db.geoPoint.createMany({ data: rows }),
    ]);
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created: rows.length, skipped });
    return { ok: true, created: rows.length, skipped };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
    await db.importRun.update({ where: { id: run.id }, data: { status: "ERROR", error: msg } });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return { ok: false, created: 0, skipped };
  }
}

/** Importació íntegra (paginada per $offset) d'una font SODA amb mapper. */
async function importFull(
  datasetId: string,
  sourceCode: string,
  mapRow: (row: Record<string, unknown>) => GeoPointInput | null,
  where?: string,
  createdBy = "system:cron"
): Promise<{ ok: boolean; created: number; skipped: number }> {
  const points: GeoPointInput[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({ $limit: String(PAGE), $offset: String(offset), $order: ":id" });
    if (where) params.set("$where", where);
    const rows = await fetchSoda(datasetId, params);
    for (const row of rows) {
      const p = mapRow(row as Record<string, unknown>);
      if (p) points.push(p);
    }
    if (rows.length < PAGE || offset > 200_000) break;
  }
  return replaceSource(sourceCode, points, createdBy, sourceCode);
}

/** Lot per municipis (substitució idempotent NOMÉS dels punts d'aquells munis).
 * field5: nom EXACTE de la columna SODA amb el codi municipal — comprovat
 * contra el dataset real (v40): kvmv «codi_municipi_6» (censal amb zero),
 * 8gmd «codi_municipi» (censal SENSE zero), nrmq «municipi_codi» (INE amb
 * zero), tb2m «codimun» (censal sense zero). */
async function importChunk(
  datasetId: string,
  sourceCode: string,
  chunkCodes: string[],
  extraWhere: string | null,
  field5: string, // columna SODA del codi municipal
  listFormat: "CENSAL6" | "STRIPPED",
  mapRow: (row: Record<string, unknown>) => GeoPointInput | null,
  createdBy: string,
  runSource: string
): Promise<{ ok: boolean; created: number; skipped: number }> {
  await ensureSources();
  const muniMap = await ine5Map();
  const version = new Date().toISOString().slice(0, 10);
  // format de la llista de codis segons el dataset:
  //  - CENSAL6: codi censal de 6 dígits amb zero (kvmv-ahh4: codi_municipi_6)
  //  - STRIPPED: codi censal SENSE zero inicial (8gmd-gz7i: «80193»)
  const codesList =
    listFormat === "CENSAL6"
      ? chunkCodes.map((c) => `'${c}'`)
      : chunkCodes.map((c) => `'${strip0(c)}'`);
  let where = `${field5} IN (${codesList.join(",")})`;
  if (extraWhere) where = `(${extraWhere}) AND (${where})`;
  const params = new URLSearchParams({ $limit: "50000", $where: where });
  let rowsRaw: unknown[];
  try {
    rowsRaw = await fetchSoda(datasetId, params);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
    const run = await db.importRun.create({ data: { source: runSource, status: "ERROR", error: msg, createdBy } });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, status: "ERROR", error: msg });
    return { ok: false, created: 0, skipped: 0 };
  }
  const points: GeoPointInput[] = [];
  let skipped = 0;
  for (const row of rowsRaw) {
    const p = mapRow(row as Record<string, unknown>);
    if (p) points.push(p);
    else skipped++;
  }
  const { rows } = toRows(withSource(points, sourceCode), muniMap, version);
  const run = await db.importRun.create({ data: { source: runSource, status: "OK", createdBy } });
  try {
    await db.$transaction([
      db.geoPoint.deleteMany({
        where: { datasetSourceCode: sourceCode, municipalityCode: { in: chunkCodes } },
      }),
      db.geoPoint.createMany({ data: rows }),
    ]);
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, created: rows.length, skipped });
    return { ok: true, created: rows.length, skipped };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
    await db.importRun.update({ where: { id: run.id }, data: { status: "ERROR", error: msg } });
    return { ok: false, created: 0, skipped };
  }
}

const EQUIPAMENTS_WHERE =
  "(starts_with(categoria,'Cultura') OR starts_with(categoria,'Esports. Lleure'))";

/** ── Passos de importació ─────────────────────────────────────────────── */

export async function importEntornRecarrega(createdBy = "system:cron") {
  return importFull("tb2m-m33b", "ENTORNT_RECARREGA", mapRecarrega, undefined, createdBy);
}

export async function importEntornSanitaris(createdBy = "system:cron") {
  return importFull("nrmq-ytje", "ENTORNT_SANITARIS", mapSanitari, undefined, createdBy);
}

export async function importEntornDocentsChunk(chunkIndex: number, createdBy = "system:cron") {
  const codes = await chunkCodesFor(chunkIndex);
  if (!codes) return { ok: false, created: 0, skipped: 0 };
  return importChunk("kvmv-ahh4", "ENTORNT_DOCENTS", codes, null, "codi_municipi_6", "CENSAL6", mapDocent, createdBy, `ENTORNT_DOCENTS:CHUNK-${chunkIndex}`);
}

export async function importEntornEquipamentsChunk(chunkIndex: number, createdBy = "system:cron") {
  const codes = await chunkCodesFor(chunkIndex);
  if (!codes) return { ok: false, created: 0, skipped: 0 };
  return importChunk("8gmd-gz7i", "ENTORNT_EQUIPAMENTS", codes, EQUIPAMENTS_WHERE, "codi_municipi", "STRIPPED", mapEquipament, createdBy, `ENTORNT_EQUIPAMENTS:CHUNK-${chunkIndex}`);
}

async function chunkCodesFor(chunkIndex: number): Promise<string[] | null> {
  const munis = await db.municipality.findMany({ select: { code: true }, orderBy: { code: "asc" } });
  const start = chunkIndex * MUNIS_PER_CHUNK;
  const codes = munis.slice(start, start + MUNIS_PER_CHUNK).map((m) => m.code);
  return codes.length > 0 ? codes : null;
}

/** Lookup ON-DEMAND de certificats ICAEN per referència catastral. */
export async function importEnergiaForBuilding(
  buildingId: string,
  refcat: string,
  createdBy = "system:demanda"
): Promise<{ ok: boolean; created: number }> {
  await ensureSources();
  const rc = normalizeRefcat(refcat);
  const params = new URLSearchParams({
    $where: `referencia_cadastral='${rc}'`,
    $order: "data_entrada DESC",
    $limit: "5",
  });
  let rows: unknown[];
  const run = await db.importRun.create({ data: { source: "ENTORNT_ENERGIA", status: "OK", createdBy } });
  try {
    rows = await fetchSoda("j6ii-t3w2", params, 9000);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
    await db.importRun.update({ where: { id: run.id }, data: { status: "ERROR", error: msg } });
    return { ok: false, created: 0 };
  }
  const certs = rows
    .map((r) => mapCertificat(r as Record<string, unknown>))
    .filter((c): c is NonNullable<typeof c> => c != null);
  await db.$transaction([
    db.buildingAssociation.deleteMany({ where: { buildingId, category: "ENERGY_CERT" } }),
    db.buildingAssociation.createMany({
      data: certs.map((c) => ({
        buildingId,
        category: "ENERGY_CERT",
        refKey: c.numCas,
        associationMethod: "REFCAT",
        value: JSON.stringify(c),
        datasetSourceCode: "ENTORNT_ENERGIA",
      })),
    }),
  ]);
  await db.importRun.update({
    where: { id: run.id },
    data: { rowsTotal: rows.length, created: certs.length, skipped: rows.length - certs.length },
  });
  await auditSystem("IMPORT_RUN", run.id, { source: "ENTORNT_ENERGIA", refcat: rc, certs: certs.length });
  return { ok: true, created: certs.length };
}

/** Decideix el proper pas del cron entorn (mateix patró que nextDemografiaStep). */
export async function nextEntornStep(): Promise<
  | { step: "RECARREGA" | "SANITARIS" | "DOCENTS" | "EQUIPAMENTS"; chunk: number }
  | { step: "DONE" }
> {
  const recent = await db.importRun.findMany({
    where: { source: { startsWith: "ENTORNT_" }, status: "OK", createdAt: { gte: new Date(Date.now() - FRESH_MS) } },
    select: { source: true },
  });
  const done = new Set(recent.map((r) => r.source));
  if (!done.has("ENTORNT_RECARREGA")) return { step: "RECARREGA", chunk: 0 };
  if (!done.has("ENTORNT_SANITARIS")) return { step: "SANITARIS", chunk: 0 };
  const nChunks = await db.municipality.count().then((n) => Math.max(1, Math.ceil(n / MUNIS_PER_CHUNK)));
  const firstPending = (prefix: string): number | null => {
    for (let i = 0; i < nChunks; i++) if (!done.has(`${prefix}:CHUNK-${i}`)) return i;
    return null;
  };
  const docents = firstPending("ENTORNT_DOCENTS");
  if (docents != null) return { step: "DOCENTS", chunk: docents };
  const equipaments = firstPending("ENTORNT_EQUIPAMENTS");
  if (equipaments != null) return { step: "EQUIPAMENTS", chunk: equipaments };
  return { step: "DONE" };
}
