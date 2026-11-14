/**
 * v39 (Fase demografia) — Parsers PURS de les fonts IDESCAT.
 *
 *  - JSON-stat 2.0 (API Taules v2: api.idescat.cat/taules/v2/...) — Padró
 *    municipal d'habitants (pmh) i Cens de població i habitatges (censph).
 *  - «El municipi en xifres» (api.idescat.cat/emex/v1/dades.json) — superfície
 *    i densitat oficials amb tripletta [municipi, comarca, Catalunya].
 *
 * FUNCIONS PURES: cap BD ni fetch — testables amb bun test amb fixtures reals
 * (tests/fixtures/idescat/*.json, descarregats de l'API el 2026-11-14).
 *
 * Regles de dades: un valor null/«_» de la font és «no disponible» i mai
 * s'inventa; les agregacions (grans grups d'edat, població estrangera) només
 * sumen/resten CATEGORIES OFICIALS de la mateixa taula i documenten la
 * derivació a meta.
 */

// ── JSON-stat 2.0 ────────────────────────────────────────────────────────────

/** Dataset JSON-stat mínim (com retorna l'API Taules v2). */
export interface JsonStatDataset {
  id: string[];
  size: number[];
  dimension: Record<
    string,
    { label?: string; category: { index: string[] | Record<string, number>; label?: Record<string, string> } }
  >;
  value: Array<number | null>;
  source?: string | string[];
  updated?: string;
  extension?: { source?: string | string[]; status?: { label?: Record<string, string> } | Record<string, string> };
}

export interface StatCell {
  /** codes de cada dimensió (p. ex. { YEAR: "2025", MUN: "080193", SEX: "TOTAL" }) */
  dims: Record<string, string>;
  /** label llegible de cada dimensió, si la font el dóna */
  labels: Record<string, string>;
  value: number | null;
}

/** Índex d'una categoria JSON-stat (array = posició; objecte = code→posició). */
function catIndex(cat: { index: string[] | Record<string, number> }): string[] {
  if (Array.isArray(cat.index)) return cat.index;
  // objecte code→posició: ordenar per posició
  return Object.entries(cat.index)
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
}

/**
 * Desplega un dataset JSON-stat en cel·les individuals.
 * Ordre de valors JSON-stat: la PRIMERA dimensió de `id` varia MÉS LLENT
 * (C-order), verificat empíricament amb l'API real (pmh/446/477: YEAR lent,
 * SEX ràpid — vegeu tests/idescat fixture).
 */
export function jsonStatCells(ds: JsonStatDataset): StatCell[] {
  const order = ds.id;
  const dims = ds.dimension;
  const cats = order.map((k) => catIndex(dims[k].category));
  const size = ds.size;
  const labels = order.map((k) => dims[k].category.label ?? {});
  const cells: StatCell[] = [];
  const total = size.reduce((a, b) => a * b, 1);
  if (ds.value.length !== total) return cells; // dataset inconsistent: no explota
  const cur: number[] = new Array(order.length).fill(0);
  for (let i = 0; i < total; i++) {
    // descompondre índex lineal → multi-índex (first dim slowest)
    let rest = i;
    for (let d = order.length - 1; d >= 0; d--) {
      cur[d] = rest % size[d];
      rest = Math.floor(rest / size[d]);
    }
    const cellDims: Record<string, string> = {};
    const cellLabels: Record<string, string> = {};
    for (let d = 0; d < order.length; d++) {
      const code = cats[d][cur[d]];
      cellDims[order[d]] = code;
      cellLabels[order[d]] = labels[d][code] ?? code;
    }
    cells.push({ dims: cellDims, labels: cellLabels, value: ds.value[i] });
  }
  return cells;
}

/** Fonts citades pel dataset (extension.source o source). */
export function jsonStatSources(ds: JsonStatDataset): string[] {
  const raw = ds.extension?.source ?? ds.source;
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

/**
 * Sèries per territori d'una taula poblacional JSON-stat.
 * filters selecciona CATEGORIES fixes (p. ex. { SEX: ["TOTAL"] }).
 * dimGeo = "MUN" | "COM"; dimAny = "YEAR". Retorna any→valor per geoCode.
 */
export function jsonStatSeries(
  ds: JsonStatDataset,
  opts: { geoDim: string; timeDim: string; filters?: Record<string, string[]>; valueDim?: string }
): Map<string, Array<{ year: string; value: number }>> {
  const out = new Map<string, Array<{ year: string; value: number }>>();
  const push = (geo: string, year: string, v: number | null) => {
    if (v == null || !Number.isFinite(v)) return;
    const arr = out.get(geo) ?? [];
    arr.push({ year, value: v });
    out.set(geo, arr);
  };
  for (const cell of jsonStatCells(ds)) {
    let keep = true;
    for (const [dim, allowed] of Object.entries(opts.filters ?? {})) {
      if (!allowed.includes(cell.dims[dim])) {
        keep = false;
        break;
      }
    }
    if (!keep) continue;
    push(cell.dims[opts.geoDim], cell.dims[opts.timeDim], cell.value);
  }
  for (const arr of out.values()) arr.sort((a, b) => a.year.localeCompare(b.year));
  return out;
}

// ── Agregacions oficials ─────────────────────────────────────────────────────

/** Grups quinquennals PMH (taula 10494, dimensió AGE) → grans grups oficials.
 * Còdigs verificats amb l'API real (2026-11-14): 85+ = Y085_089, Y090_094,
 * Y095_099 i Y_GE100 (mai s'usa la categoria TOTAL com a component). */
export const AGE_QUINQ = {
  "0_14": ["Y000_004", "Y005_009", "Y010_014"],
  "15_64": [
    "Y015_019", "Y020_024", "Y025_029", "Y030_034", "Y035_039",
    "Y040_044", "Y045_049", "Y050_054", "Y055_059", "Y060_064",
  ],
  "65_84": ["Y065_069", "Y070_074", "Y075_079", "Y080_084"],
  "85_mes": ["Y085_089", "Y090_094", "Y095_099", "Y_GE100"],
} as const;

export type AgeGroupKey = keyof typeof AGE_QUINQ;

/** Suma GRUPS OFICIALS quinquennals en grans grups (mai interpola edats). */
export function aggregateAgeGroups(
  quinq: Partial<Record<string, number>>
): Partial<Record<AgeGroupKey, number>> | null {
  const out: Partial<Record<AgeGroupKey, number>> = {};
  let any = false;
  for (const [gk, codes] of Object.entries(AGE_QUINQ) as Array<[AgeGroupKey, readonly string[]]>) {
    let sum = 0;
    let seen = 0;
    for (const c of codes) {
      const v = quinq[c];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        seen++;
      }
    }
    // exigim TOTS els components del grup: un grup parcialment absent és
    // «no disponible» per aquell any (no s'estima la part que falta)
    if (seen === codes.length) {
      out[gk] = sum;
      any = true;
    }
  }
  return any ? out : null;
}

// ── emex («El municipi en xifres») ───────────────────────────────────────────

export interface EmexIndicator {
  id: string;
  name: string;
  unit: string | null;
  ref: string | null;
  /** tripletta oficial [municipi, comarca, Catalunya] — null = «_» a la font */
  values: [number | null, number | null, number | null];
  updated: string | null;
}

export interface EmexTable {
  name: string;
  ref: string | null;
  sourceText: string | null;
  updated: string | null;
  indicators: EmexIndicator[];
}

function emexNum(x: string): number | null {
  if (x === "_" || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Navega l'arbre fitxes.* de la resposta emex i recull TOTES les taules.
 * Variants reals de l'API (verificades amb fixtures 2026-11-14):
 *  - A: {"tt": {"t": {"ff": {"f":[...]}, c, id, l}, r?, c?}, "c": group}
 *  - B: {"ff": {"f": [...] | {fulla}}, "r": any, "c": nom, "s": font, "updated": ...}
 * Els metadats (r, c, s, updated) poden estar al mateix node que «ff» o en
 * ancestres propers (variant A): s'acumulen pel camí (guanya el més proper).
 */
export function parseEmexTables(json: unknown): EmexTable[] {
  const tables: EmexTable[] = [];
  const visit = (node: unknown, meta: EmexTableMeta) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((x) => visit(x, meta));
      return;
    }
    const obj = node as Record<string, unknown>;
    const here: EmexTableMeta = {
      ref: typeof obj.r === "string" ? obj.r : meta.ref,
      name: typeof obj.c === "string" ? obj.c : meta.name,
      sourceText: typeof obj.s === "string" ? obj.s : meta.sourceText,
      updated: typeof obj.updated === "string" ? obj.updated : meta.updated,
    };
    const ff = obj.ff;
    if (ff && typeof ff === "object") {
      collectFf(ff as Record<string, unknown>, here, tables);
    } else if (Array.isArray(obj.tt)) {
      obj.tt.forEach((x) => visit(x, here));
      return;
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") visit(v, here);
    }
  };
  visit(json, { ref: null, name: "", sourceText: null, updated: null });
  return tables;
}

interface EmexTableMeta {
  name: string;
  ref: string | null;
  sourceText: string | null;
  updated: string | null;
}

function collectFf(ff: Record<string, unknown>, meta: EmexTableMeta, tables: EmexTable[]): void {
  const leaves: EmexIndicator[] = [];
  const pushLeaf = (f: Record<string, unknown>) => {
    const id = typeof f.id === "string" ? f.id : null;
    const v = typeof f.v === "string" ? f.v : null;
    if (!id || !id.startsWith("f") || v === null) return;
    const parts = v.split(",");
    leaves.push({
      id,
      name: typeof f.c === "string" ? f.c : typeof f.calt === "string" ? f.calt : meta.name,
      unit: typeof f.u === "string" ? f.u : null,
      ref: typeof f.r === "string" ? f.r : meta.ref,
      values: [emexNum(parts[0] ?? "_"), emexNum(parts[1] ?? "_"), emexNum(parts[2] ?? "_")],
      updated: typeof f.updated === "string" ? f.updated : meta.updated,
    });
  };
  const f = ff.f;
  if (Array.isArray(f)) {
    f.forEach((x) => pushLeaf(x as Record<string, unknown>));
  } else if (f && typeof f === "object") {
    pushLeaf(f as Record<string, unknown>);
  }
  if (leaves.length > 0) {
    tables.push({
      name: meta.name,
      ref: meta.ref,
      sourceText: meta.sourceText,
      updated: meta.updated,
      indicators: leaves,
    });
  }
}

/** Cerca una taula emex pel seu nom exacte (p. ex. «Densitat de població»). */
export function emexTable(tables: EmexTable[], name: string): EmexTable | null {
  return tables.find((t) => t.name === name) ?? null;
}
