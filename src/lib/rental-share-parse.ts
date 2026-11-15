/**
 * v41 — Parsers PURS i calculadora de l'indicador «% estimat d'alquiler
 * sobre el parc residencial» (encàrrec INDICADOR_ALQUILER).
 *
 * FUNCIONS PURES: cap BD ni fetch — testables amb bun test amb fixtures
 * reals descarregades de les fonts el 2026-11-15:
 *  - tests/fixtures/rental-share/idescat_cens2021_tenencia_mun.json
 *    (API Taules v2: api.idescat.cat/taules/v2/censph/310/20419/mun/data)
 *  - tests/fixtures/rental-share/soda_flujo_municipi_sample.json
 *    (Socrata: analisi.transparenciacatalunya.cat/resource/qww9-bvhh.json)
 *
 * Regles de dades (encàrrec §5, obligatòries):
 *  - Mai es calcula el % si falta el numerador (fiances VIGENTES) o el
 *    denominador (parc residencial catastral), si el denominador és 0, si
 *    hi ha valors negatius o si numerador i denominador són de municipis
 *    diferents.
 *  - El flux anual de contractes amb fiança MAI substitueix el stock de
 *    fiances vigents com a numerador (flujo ≠ stock).
 *  - % superior a 100 → no es publica, queda en revisió.
 *  - Numerador i denominador de períodes incompatibles → càlcul marcat
 *    TIMING_MISMATCH amb avís (mai presentat com a definitiu).
 *  - Components absents MAI es substitueixen per zeros.
 */

import { jsonStatCells, type JsonStatDataset } from "@/lib/idescat-parse";

// ── Cens 2021 (Idescat taules censph/310/20419) ──────────────────────────────

export const CENS_TENENCIA_TAULA = "censph/310/20419";
export const CENS_YEAR_DEFAULT = "2021";

export interface CensTenenciaRow {
  /** codi censal 6 dígits (== Municipality.code) o "TOTAL" (Catalunya) */
  geoCode: string;
  geoName?: string;
  property: number | null;
  rental: number | null;
  oth: number | null;
  /** «No consta» (categoria oficial _U de la taula) */
  notStated: number | null;
  total: number | null;
}

/** Converteix la taula JSON-stat «Habitatges principals. Per règim de tinença» en files per territori. */
export function parseCensTenencia(ds: JsonStatDataset): CensTenenciaRow[] {
  const byGeo = new Map<string, CensTenenciaRow>();
  for (const cell of jsonStatCells(ds)) {
    if (cell.dims.CONCEPT !== "MAIN_DWELL") continue;
    const geo = cell.dims.MUN;
    if (!geo) continue;
    let row = byGeo.get(geo);
    if (!row) {
      row = {
        geoCode: geo,
        geoName: cell.labels.MUN || undefined,
        property: null,
        rental: null,
        oth: null,
        notStated: null,
        total: null,
      };
      byGeo.set(geo, row);
    }
    const v = cell.value;
    switch (cell.dims.TENURE_REGIME) {
      case "PROPERTY":
        row.property = v;
        break;
      case "RENTAL":
        row.rental = v;
        break;
      case "OTH":
        row.oth = v;
        break;
      case "_U":
        row.notStated = v;
        break;
      case "TOTAL":
        row.total = v;
        break;
    }
  }
  return [...byGeo.values()];
}

// ── Flux de fiances (SODA qww9-bvhh) — REFERÈNCIA, mai numerador ─────────────

export const FLUX_DATASET = "qww9-bvhh";
/** Únic període que s'importa com a sèrie anual: l'any complet. */
export const FLUX_PERIODE_ANUAL = "gener-desembre";

export interface FluxRow {
  /** codi INE de 5 dígits de la font (l'unió amb Municipality és per ineCode) */
  ineCode: string;
  name: string;
  year: string;
  habitatges: number | null;
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[.,]/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Filtra i normalitza les files SODA del dataset de fiances: només
 * ambit_territorial="Municipi" i (per defecte) només el període anual
 * «gener-desembre». La renda del dataset NO s'importa (és dada de negoci que
 * ja viu a Municipality; aquí només el flux de contractes com a referència).
 */
export function parseFluxMunicipiRows(
  rawRows: unknown,
  opts?: { periode?: string }
): FluxRow[] {
  const periode = opts?.periode ?? FLUX_PERIODE_ANUAL;
  const out: FluxRow[] = [];
  if (!Array.isArray(rawRows)) return out;
  for (const r of rawRows as Array<Record<string, unknown>>) {
    if (!r || typeof r !== "object") continue;
    if (String(r.ambit_territorial ?? "") !== "Municipi") continue;
    if (String(r.periode ?? "") !== periode) continue;
    const ineCode = String(r.codi_territorial ?? "").trim();
    if (!/^\d{5}$/.test(ineCode)) continue;
    const year = String(r.any ?? "").trim();
    if (!/^\d{4}$/.test(year)) continue;
    out.push({
      ineCode,
      name: String(r.nom_territori ?? "").slice(0, 120),
      year,
      habitatges: toInt(r.habitatges),
    });
  }
  return out;
}

// ── Calculadora de l'indicador ───────────────────────────────────────────────

export interface RentalShareCalcInput {
  muniCode: string;
  // numerador oficial (stock de fiances vigents) — pendient de font municipal
  incasolActiveDeposits?: number | null;
  incasolPeriod?: string | null;
  incasolIneCode?: string | null;
  incasolSource?: string | null;
  // denominador oficial (parc residencial catastral) — pendient de font verificada
  residentialProperties?: number | null;
  cadastreYear?: string | null;
  cadastreIneCode?: string | null;
  cadastreSource?: string | null;
  // referència de mercat (FLUX anual, MAI numerador)
  incasolDepositsPeriod?: number | null;
  incasolFluxPeriod?: string | null;
  // referència censal (Cens 2021, viviendas principales)
  censusMainRental?: number | null;
  censusMainTotal?: number | null;
  censusYear?: string | null;
  censusSource?: string | null;
}

export interface RentalShareCalcResult {
  referenceKey: string | null;
  numeratorKind: "VIGENTES" | null;
  rentalPercentage: number | null;
  censusRentalPercentage: number | null;
  dataStatus:
    | "OK"
    | "TIMING_MISMATCH"
    | "REVIEW_OVER_100"
    | "NEGATIVE_INPUT"
    | "MISMATCH_MUNI"
    | "NO_NUMERATOR"
    | "NO_DENOMINATOR"
    | "CENS_REF_ONLY"
    | "NO_DATA";
  warnings: string[];
  incasolActiveDeposits: number | null;
  residentialProperties: number | null;
  incasolPeriod: string | null;
  cadastreYear: string | null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function yearOf(period: string | null | undefined): string | null {
  if (!period) return null;
  const m = String(period).match(/\d{4}/);
  return m ? m[0] : null;
}

/**
 * Càlcul pur amb totes les validacions de l'encàrrec (§5). Mai llança
 * excepcions: els problemes es reporten com a estat + avís perquè quedin
 * traçats a RentalShareObservation.warnings.
 */
export function computeRentalShare(input: RentalShareCalcInput): RentalShareCalcResult {
  const warnings: string[] = [];
  const num = input.incasolActiveDeposits;
  const den = input.residentialProperties;

  const numInvalid = num != null && (!Number.isFinite(num) || num < 0);
  const denInvalid = den != null && (!Number.isFinite(den) || den < 0);
  if (numInvalid) warnings.push(`Numerador invàlid o negatiu (${num}): no es calcula.`);
  if (denInvalid) warnings.push(`Denominador invàlit o negatiu (${den}): no es calcula.`);

  // mateix municipi per a numerador i denominador (comprovació per codi INE)
  const inN = input.incasolIneCode?.trim() || null;
  const inD = input.cadastreIneCode?.trim() || null;
  if (inN && inD && inN !== inD) {
    warnings.push(`Numerador i denominador pertanyen a municipis diferents (${inN} vs ${inD}): càlcul bloquejat.`);
    return {
      referenceKey: null,
      numeratorKind: null,
      rentalPercentage: null,
      censusRentalPercentage: null,
      dataStatus: "MISMATCH_MUNI",
      warnings,
      incasolActiveDeposits: null,
      residentialProperties: null,
      incasolPeriod: null,
      cadastreYear: null,
    };
  }

  const hasStock = num != null && Number.isFinite(num) && num >= 0;
  const hasDen = den != null && Number.isFinite(den) && den >= 0;

  let rentalPercentage: number | null = null;
  let dataStatus: RentalShareCalcResult["dataStatus"] = "NO_DATA";

  if (numInvalid || denInvalid) {
    // inputs invàlids/negatius: mai es calcula ni es substitueix per zeros
    dataStatus = "NEGATIVE_INPUT";
  } else if (hasStock && hasDen) {
    const denN = Number(den);
    if (denN === 0) {
      // denominador zero: sense càlcul (mai es divideix per zero)
      warnings.push("Parc residencial catastral = 0: sense càlcul.");
      dataStatus = "NO_DENOMINATOR";
    } else {
      const pct = round4((Number(num) / denN) * 100);
      if (pct > 100) {
        warnings.push(`Percentatge > 100% (${pct}%): requereix revisió manual, no es publica.`);
        dataStatus = "REVIEW_OVER_100";
      } else {
        rentalPercentage = pct;
        const yN = yearOf(input.incasolPeriod);
        const yD = yearOf(input.cadastreYear);
        if (yN && yD && yN !== yD) {
          warnings.push(
            `Desfase temporal: numerador ${input.incasolPeriod} vs denominador ${input.cadastreYear}. Valor indicatiu, no definitiu.`
          );
          dataStatus = "TIMING_MISMATCH";
        } else {
          dataStatus = "OK";
        }
      }
    }
  } else if (hasStock && !hasDen) {
    dataStatus = "NO_DENOMINATOR";
    warnings.push("Falta el denominador (parc residencial catastral): no es calcula el percentatge.");
  } else if (!hasStock && hasDen) {
    dataStatus = "NO_NUMERATOR";
    warnings.push(
      "Falta el numerador (fiances vigentes INCASÒL). El flux anual de contractes no és un substitut vàlid del stock vigent."
    );
  }

  // referència censal (Cens 2021): càlcul independent, mai es toca amb zeros
  const cr = input.censusMainRental;
  const ct = input.censusMainTotal;
  let censusRentalPercentage: number | null = null;
  if (cr != null && ct != null && Number.isFinite(cr) && Number.isFinite(ct) && cr >= 0 && ct >= 0) {
    if (ct === 0) {
      warnings.push("Cens: total de viviendas principales = 0, percentatge censal no calculable.");
    } else if (cr > ct) {
      warnings.push(`Cens anòmal: en alquiler (${cr}) > total (${ct}). Percentatge censal no publicat.`);
    } else {
      censusRentalPercentage = round4((Number(cr) / Number(ct)) * 100);
    }
  } else if (cr != null || ct != null) {
    warnings.push("Cens incomplet (manca en alquiler o total): percentatge censal no calculat.");
  }

  // clau de referència: compost quan hi ha components del càlcul; cens si és l'únic bloc
  const hasCompositeParts = hasStock || hasDen;
  let referenceKey: string | null = null;
  if (hasCompositeParts) {
    referenceKey = `N:${input.incasolPeriod ?? "n.d."}|D:${input.cadastreYear ?? "n.d."}`;
  } else if (censusRentalPercentage != null || (cr != null && ct != null)) {
    referenceKey = `C:${input.censusYear ?? CENS_YEAR_DEFAULT}`;
  }

  return {
    referenceKey,
    numeratorKind: rentalPercentage != null ? "VIGENTES" : null,
    rentalPercentage,
    censusRentalPercentage,
    dataStatus: referenceKey == null ? "NO_DATA" : dataStatus === "NO_DATA" ? (censusRentalPercentage != null ? "CENS_REF_ONLY" : "NO_DATA") : dataStatus,
    warnings,
    incasolActiveDeposits: hasStock ? Number(num) : null,
    residentialProperties: hasDen ? Number(den) : null,
    incasolPeriod: hasStock || hasDen ? input.incasolPeriod ?? null : null,
    cadastreYear: hasStock || hasDen ? input.cadastreYear ?? null : null,
  };
}

// ── Validació de les files del connector administratiu ───────────────────────

export interface AdminRentalShareRow {
  municipalityCode: string;
  ineCode: string | null;
  incasolActiveDeposits: number | null;
  incasolPeriod: string | null;
  incasolSource: string | null;
  residentialProperties: number | null;
  cadastreYear: string | null;
  cadastreSource: string | null;
}

/**
 * Valida les files d'una importació administrativa (connector de components
 * pendents de publicació oberta). Rebuja files buides, codis malformats i
 * valors negatius; MAI substitueix absències per zeros.
 */
export function validateAdminRentalShareRows(rawRows: unknown): {
  rows: AdminRentalShareRow[];
  errors: Array<{ index: number; reason: string }>;
} {
  const rows: AdminRentalShareRow[] = [];
  const errors: Array<{ index: number; reason: string }> = [];
  if (!Array.isArray(rawRows)) return { rows, errors: [{ index: -1, reason: "EXPECTED_ROWS_ARRAY" }] };

  rawRows.forEach((raw, index) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const code = String(r.municipalityCode ?? r.code ?? "").trim();
    const ine = String(r.ineCode ?? "").trim();
    const codeOk = /^\d{6}$/.test(code);
    const ineOk = /^\d{5}$/.test(ine);
    if (!codeOk && !ineOk) {
      errors.push({ index, reason: `municipalityCode/ineCode invàlids («${(code || ine).slice(0, 20)}»): cal codi censal de 6 dígits o ineCode de 5` });
      return;
    }
    const deposits = toInt(r.incasolActiveDeposits);
    const parc = toInt(r.residentialProperties);
    if (deposits == null && parc == null) {
      errors.push({ index, reason: "cap component present (incasolActiveDeposits / residentialProperties)" });
      return;
    }
    const rawDeposits = r.incasolActiveDeposits;
    const rawParc = r.residentialProperties;
    if (rawDeposits != null && deposits == null) {
      errors.push({ index, reason: `incasolActiveDeposits invàlid («${String(rawDeposits).slice(0, 20)}»)` });
      return;
    }
    if (rawParc != null && parc == null) {
      errors.push({ index, reason: `residentialProperties invàlid («${String(rawParc).slice(0, 20)}»)` });
      return;
    }
    rows.push({
      municipalityCode: codeOk ? code : "",
      ineCode: ineOk ? ine : null,
      incasolActiveDeposits: deposits,
      incasolPeriod: r.incasolPeriod != null ? String(r.incasolPeriod).slice(0, 20) : null,
      incasolSource: r.incasolSource != null ? String(r.incasolSource).slice(0, 200) : null,
      residentialProperties: parc,
      cadastreYear: r.cadastreYear != null ? String(r.cadastreYear).slice(0, 20) : null,
      cadastreSource: r.cadastreSource != null ? String(r.cadastreSource).slice(0, 200) : null,
    });
  });
  return { rows, errors };
}
