/**
 * PreuReal.cat — Fase 2: importadors dels serveis Tempus3 de l'INE.
 *
 * Baixa les taules verificades de l'IPVA i de l'Atlas de distribució de la
 * renda (ADRH), les parseja amb src/lib/ine-parse.ts i les desa a
 * StatObservation amb traçabilitat completa (DataSource, ImportRun, AuditLog).
 *
 * Garanties:
 *  - IDEMPOTENT: cada importació substitueix la finestra de dades de la font
 *    (només files de StatObservation de la font/àmbit importat); reexecutar
 *    no duplica ni corrompe res.
 *  - ADITIU: mai toca cap altra taula (ni Municipality, ni User, ni pagaments).
 *  - TRAÇABLE: cada fila guarda sourceId, runId (ImportRun) i la sèrie INE
 *    d'origen a meta; el punts amb secreto estadístic es descarten i es
 *    comptabilitzen.
 *
 * Taules Tempus3 verificades (10-11-2026):
 *  - 59056 IPVA índex NAC+CCAA · 59058 IPVA províncies · 59060 IPVA municipis
 *    >10.000 hab (base 2015=100, sèries anuals).
 *  - 53689 ADRH nacional (CCAA+províncies) · 30896/31016/31079/31223 ADRH
 *    provincials amb sèries municipals 2015-2024 «Renta neta media por
 *    persona / por hogar».
 */
import { db } from "@/lib/db";
import { audit } from "@/lib/security";
import {
  buildMuniMatcher,
  parseAtlasMuni,
  parseAtlasNacional,
  parseIpvaMuni,
  parseIpvaNacCcaa,
  parseIpvaProv,
  type MuniLite,
  type ParseResult,
  type RawObservation,
} from "@/lib/ine-parse";

export const INE_IPVA = "INE_IPVA";
export const INE_ATLAS_RENTA = "INE_ATLAS_RENTA";

export const IPVA_SCOPES = ["NAC_CCAA", "PROV", "MUNI"] as const;
export type IpvaScope = (typeof IPVA_SCOPES)[number];

export const ATLAS_SCOPES = ["NACIONAL", "17", "25", "43", "08"] as const; // 08 al final: la més gran
export type AtlasScope = (typeof ATLAS_SCOPES)[number];

const UA = "PreuReal.cat/1.0 (dades oficials INE; +https://preureal.cat)";
const API = "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA";
const NULT = 12; // sèries anuals des de 2015: n'hi ha prou amb 12 punts

const IPVA_SOURCE = {
  code: INE_IPVA,
  name: "Índex de Preus de la Vivienda en Alquiler (IPVA), base 2015",
  institution: "INE (Instituto Nacional de Estadística)",
  url: "https://www.ine.es/experimental/ipva/experimental_precios_vivienda_alquiler.htm",
  license: "Reutilització lliure (INE); estadística experimental",
  unit: "índex (base 2015=100) i % de variació anual",
  periodicity: "ANUAL",
  methodology:
    "Estadística experimental de l'INE a partir del model 100 d'IRPF (AEAT). És un ÍNDEX d'evolució: NO és un nivell de preu en euros i no es pot barrejar amb les mitjanes de fiances. Taules Tempus3 59056 (NAC+CCAA), 59058 (províncies) i 59060 (municipis >10.000 hab).",
};

const ATLAS_SOURCE = {
  code: INE_ATLAS_RENTA,
  name: "Atlas de distribució de la renda dels llars (ADRH)",
  institution: "INE (Instituto Nacional de Estadística)",
  url: "https://www.ine.es/experimental/atlas/experimental_atlas.htm",
  license: "Reutilització lliure (INE); estadística experimental",
  unit: "€/any (renda neta mitjana per persona i per llar)",
  periodicity: "ANUAL",
  methodology:
    "Renda neta mitjana per persona i per llar d'origen tributari. És la renda MITJANA del territori: mai un salari individual. Sèries municipals 2015-2024 (taules 30896 Barcelona, 31016 Girona, 31079 Lleida, 31223 Tarragona) i àmbits superiors (taula 53689). Els valors amb secreto estadístic no es desen.",
};

const ADRH_PROV_TABLES: Record<string, number> = {
  "08": 30896, // Barcelona
  "17": 31016, // Girona
  "25": 31079, // Lleida
  "43": 31223, // Tarragona
};

// ── Utilitats ────────────────────────────────────────────────────────────────

async function fetchIneTable(tid: number): Promise<unknown> {
  const url = `${API}/${tid}?nult=${NULT}`;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(attempt === 1 ? 45_000 : 75_000),
      });
      if (!res.ok) throw new Error(`INE HTTP ${res.status} (taula ${tid})`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1_500 * attempt));
    }
  }
  throw new Error(`INE inabastable: ${String(lastErr)}`);
}

async function getMuniMatcher(): Promise<(name: string) => MuniLite | null> {
  const munis = await db.municipality.findMany({
    select: { code: true, ineCode: true, name: true, province: true },
  });
  return buildMuniMatcher(munis);
}

async function chunksInsert(sourceId: string, runId: string, obs: RawObservation[]): Promise<number> {
  let created = 0;
  const CHUNK = 800;
  for (let i = 0; i < obs.length; i += CHUNK) {
    const slice = obs.slice(i, i + CHUNK);
    const r = await db.statObservation.createMany({
      data: slice.map((o) => ({
        sourceId,
        variable: o.variable,
        geoLevel: o.geoLevel,
        geoCode: o.geoCode,
        geoName: o.geoName,
        municipalityCode: o.municipalityCode,
        period: o.period,
        value: o.value,
        unit: o.unit,
        meta: o.meta,
        runId,
      })),
      skipDuplicates: true,
    });
    created += r.count;
  }
  return created;
}

function skipsTotal(p: ParseResult): number {
  const s = p.skips;
  return s.secreto + s.sinMunicipio + s.fueraAmbito + s.desglose + s.sinDatos;
}

async function ensureDataSource(source: typeof IPVA_SOURCE | typeof ATLAS_SOURCE): Promise<string> {
  const row = await db.dataSource.upsert({
    where: { code: source.code },
    create: source,
    update: {
      name: source.name,
      institution: source.institution,
      url: source.url,
      license: source.license,
      unit: source.unit,
      periodicity: source.periodicity,
      methodology: source.methodology,
      active: true,
    },
  });
  return row.id;
}

async function openRun(source: string, createdBy: string) {
  return db.importRun.create({ data: { source, status: "OK", createdBy } });
}

async function closeRun(
  runId: string,
  data: { status: string; rowsTotal: number; created: number; skipped: number; error?: string },
) {
  await db.importRun.update({ where: { id: runId }, data });
}

async function auditSystem(action: string, target: string, meta: Record<string, unknown>) {
  try {
    await audit(null, action, target, meta);
  } catch {
    /* l'auditoria no pot fer fallar la importació */
  }
}

// ── IPVA ─────────────────────────────────────────────────────────────────────

export interface ImportSummary {
  ok: boolean;
  source: string;
  scopes: string[];
  created: number;
  skipped: number;
  secreto: number;
  unmatched: string[];
  runId: string;
  durationMs: number;
  error?: string;
}

/** Importa l'IPVA (índex base 2015=100 i variació anual). */
export async function importIneIpva(
  scope?: IpvaScope,
  createdBy = "system",
): Promise<ImportSummary> {
  const t0 = Date.now();
  const scopes: IpvaScope[] = scope ? [scope] : [...IPVA_SCOPES];
  const sourceId = await ensureDataSource(IPVA_SOURCE);
  // ImportRun.source lleva el ámbito para que el cron pueda saltar los
  // ámbitos ya importados («INE_IPVA», «INE_IPVA:NAC_CCAA», …)
  const runSource = `${INE_IPVA}:${scope ?? "FULL"}`;
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  let secreto = 0;
  const unmatched: string[] = [];
  const levels = new Set<string>();
  try {
    const match = await getMuniMatcher();
    const all: RawObservation[] = [];
    for (const sc of scopes) {
      if (sc === "NAC_CCAA") {
        const r = parseIpvaNacCcaa(await fetchIneTable(59056));
        all.push(...r.observations);
        levels.add("ESTATAL");
        levels.add("CCAA");
        skipped += skipsTotal(r);
        secreto += r.skips.secreto;
        unmatched.push(...r.unmatched);
      } else if (sc === "PROV") {
        const r = parseIpvaProv(await fetchIneTable(59058));
        all.push(...r.observations);
        levels.add("PROV");
        skipped += skipsTotal(r);
        secreto += r.skips.secreto;
        unmatched.push(...r.unmatched);
      } else {
        const r = parseIpvaMuni(await fetchIneTable(59060), match);
        all.push(...r.observations);
        levels.add("MUNI");
        skipped += skipsTotal(r);
        secreto += r.skips.secreto;
        unmatched.push(...r.unmatched);
      }
    }
    // finestra de substitució: només files d'aquesta font i àmbits importats
    await db.statObservation.deleteMany({
      where: { sourceId, geoLevel: { in: [...levels] } },
    });
    created = await chunksInsert(sourceId, run.id, all);
    await closeRun(run.id, {
      status: "OK",
      rowsTotal: all.length,
      created,
      skipped,
    });
    await auditSystem("IMPORT_RUN", run.id, {
      source: runSource,
      scopes,
      created,
      skipped,
      secreto,
      unmatchedCount: unmatched.length,
    });
    return {
      ok: true,
      source: INE_IPVA,
      scopes,
      created,
      skipped,
      secreto,
      unmatched: unmatched.slice(0, 20),
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, scopes, status: "ERROR", error: msg });
    return {
      ok: false,
      source: INE_IPVA,
      scopes,
      created,
      skipped,
      secreto,
      unmatched: [],
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}

// ── Atlas de renda (ADRH) ────────────────────────────────────────────────────

/** Importa l'ADRH (renda neta mitjana per persona/llar). Un àmbit o tots. */
export async function importIneAtlasRenta(
  scope?: AtlasScope,
  createdBy = "system",
): Promise<ImportSummary> {
  const t0 = Date.now();
  const scopes: AtlasScope[] = scope ? [scope] : [...ATLAS_SCOPES];
  const sourceId = await ensureDataSource(ATLAS_SOURCE);
  // ImportRun.source lleva el ámbito («INE_ATLAS_RENTA», «INE_ATLAS_RENTA:08», …)
  const runSource = `${INE_ATLAS_RENTA}:${scope ?? "FULL"}`;
  const run = await openRun(runSource, createdBy);
  let created = 0;
  let skipped = 0;
  let secreto = 0;
  const unmatched: string[] = [];
  const muniCodesTouched = new Set<string>();
  const upperLevels = new Set<string>();
  try {
    const match = await getMuniMatcher();
    const all: RawObservation[] = [];
    for (const sc of scopes) {
      if (sc === "NACIONAL") {
        const r = parseAtlasNacional(await fetchIneTable(53689));
        all.push(...r.observations);
        for (const o of r.observations) upperLevels.add(o.geoLevel);
        skipped += skipsTotal(r);
        secreto += r.skips.secreto;
        unmatched.push(...r.unmatched);
      } else {
        const tid = ADRH_PROV_TABLES[sc];
        if (!tid) throw new Error(`Àmbit ADRH desconegut: ${sc}`);
        const r = parseAtlasMuni(await fetchIneTable(tid), match);
        all.push(...r.observations);
        for (const o of r.observations) {
          if (o.municipalityCode) muniCodesTouched.add(o.geoCode);
        }
        skipped += skipsTotal(r);
        secreto += r.skips.secreto;
        unmatched.push(...r.unmatched);
      }
    }
    // finestra de substitució:
    //  - àmbits superiors (ESTATAL/CCAA/PROV) de la taula nacional
    if (upperLevels.size > 0) {
      await db.statObservation.deleteMany({
        where: { sourceId, geoLevel: { in: [...upperLevels] } },
      });
    }
    //  - municipals: només els geoCode que porta aquesta importació
    //    (una província no esborra les altres)
    if (muniCodesTouched.size > 0) {
      const codes = [...muniCodesTouched];
      const CHUNK = 400;
      for (let i = 0; i < codes.length; i += CHUNK) {
        await db.statObservation.deleteMany({
          where: { sourceId, geoLevel: "MUNI", geoCode: { in: codes.slice(i, i + CHUNK) } },
        });
      }
    }
    created = await chunksInsert(sourceId, run.id, all);
    await closeRun(run.id, { status: "OK", rowsTotal: all.length, created, skipped });
    await auditSystem("IMPORT_RUN", run.id, {
      source: runSource,
      scopes,
      created,
      skipped,
      secreto,
      unmatchedCount: unmatched.length,
    });
    return {
      ok: true,
      source: INE_ATLAS_RENTA,
      scopes,
      created,
      skipped,
      secreto,
      unmatched: unmatched.slice(0, 20),
      runId: run.id,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await closeRun(run.id, { status: "ERROR", rowsTotal: 0, created, skipped, error: msg });
    await auditSystem("IMPORT_RUN", run.id, { source: runSource, scopes, status: "ERROR", error: msg });
    return {
      ok: false,
      source: INE_ATLAS_RENTA,
      scopes,
      created,
      skipped,
      secreto,
      unmatched: [],
      runId: run.id,
      durationMs: Date.now() - t0,
      error: msg,
    };
  }
}
