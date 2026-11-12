/**
 * v38.8 — INFORMES INDIVIDUALS de pagament únic (Stripe mode "payment", sense
 * subscripció). Tinsa cobra 29 € per informe i Evaluo 19,99 €: aquí els preus
 * són PROPOSTOS (4,99 / 6,99 / 7,99 €) i es poden retocar sense desplegar via
 * variables d'entorn REPORT_PRICE_*_CENTS. La validació dels paràmetres és
 * PURA (testable amb bun test): cap BD ni auth aquí — les rutes de
 * _impl/reports/shop fan el gating i la reunió de dades.
 *
 * Pendent de verificar pel propietari (nota del propi encàrrec): cost efectiu
 * de generació, llicències de redistribució de les dades oficials (Incasòl,
 * INE, ICGC) i tractament de l'IVA (avui: «IVA inclòs si escau», mateixa nota
 * que les subscripcions; Stripe Tax faria el càrrec automàtic).
 */
import * as crypto from "crypto";
import { hashToken } from "@/lib/token-hash";

export const REPORT_KINDS = ["INFORME_MUNICIPI", "VALORACIO", "COMPARATIVA"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface ReportProduct {
  kind: ReportKind;
  priceCents: number;
  /** Nom visible del producte a Stripe (line item) i al catàleg. */
  nameCa: string;
  nameEs: string;
  descCa: string;
  descEs: string;
}

// Preus en CENTS (font de veritat del cobrament). Els env permeten recalibrar
// sense desplegar; un valor no numèric o absurd cau al default.
function priceFromEnv(envVar: string, def: number): number {
  const raw = Number(process.env[envVar]);
  if (Number.isFinite(raw) && raw >= 50 && raw <= 100_000) return Math.round(raw);
  return def;
}

export function reportProduct(kind: ReportKind): ReportProduct {
  const products: Record<ReportKind, ReportProduct> = {
    INFORME_MUNICIPI: {
      kind,
      priceCents: priceFromEnv("REPORT_PRICE_MUNICIPI_CENTS", 499),
      nameCa: "Informe municipal PDF",
      nameEs: "Informe municipal PDF",
      descCa: "Informe professional de 8 pàgines d'un municipi: preu real registrat, banda P25-P75, indicadors oficials, històric i ajuts.",
      descEs: "Informe profesional de 8 páginas de un municipio: precio real registrado, banda P25-P75, indicadores oficiales, histórico y ayudas.",
    },
    VALORACIO: {
      kind,
      priceCents: priceFromEnv("REPORT_PRICE_VALORACIO_CENTS", 699),
      nameCa: "Valoració d'habitatge",
      nameEs: "Valoración de vivienda",
      descCa: "Horquilla de renta orientativa per a UNA vivenda concreta (superfície, estat i habitacions) amb el motor v2 i desglossament d'ajustos.",
      descEs: "Horquilla de renta orientativa para UNA vivienda concreta (superficie, estado y habitaciones) con el motor v2 y desglose de ajustes.",
    },
    COMPARATIVA: {
      kind,
      priceCents: priceFromEnv("REPORT_PRICE_COMPARATIVA_CENTS", 799),
      nameCa: "Comparativa de municipis",
      nameEs: "Comparativa de municipios",
      descCa: "PDF comparatiu de fins a 6 municipis: preu vigent, evolució, contractes, àrea tensada i €/m² estimat de l'habitatge típic.",
      descEs: "PDF comparativo de hasta 6 municipios: precio vigente, evolución, contratos, área tensionada y €/m² estimado de la vivienda típica.",
    },
  };
  return products[kind];
}

// ---- límits d'entrada (compartits UI ⇄ API; mateixos que /api/valuation) ----
export const SHOP_LIMITS = {
  MUNI_MIN: 2,
  MUNI_MAX: 6,
  SURFACE_MIN_M2: 5,
  SURFACE_MAX_M2: 500,
  ROOMS_MAX: 10,
} as const;

export const SHOP_ESTATS = ["A_REFORMAR", "BON_ESTAT", "REFORMADA", "OBRA_NOVA"] as const;
export type ShopEstat = (typeof SHOP_ESTATS)[number];

const MUNI_RE = /^\d{6}$/;

/** Paràmetres validats per kind (exactament els que es persisteixen a params). */
export type ValidReportParams =
  | { kind: "INFORME_MUNICIPI"; mun: string }
  | { kind: "VALORACIO"; mun: string; surfaceM2: number | null; rooms: number | null; estat: ShopEstat | null }
  | { kind: "COMPARATIVA"; muns: string[] };

export type ParamValidation =
  | { ok: true; params: ValidReportParams }
  | { ok: false; error: "BAD_KIND" | "BAD_MUNICIPALITY" | "BAD_MUNICIPALITIES" | "BAD_SURFACE" | "BAD_ROOMS" | "BAD_ESTAT" | "BAD_COMPARE_COUNT" };

/**
 * Valida el cos del checkout. NO toca la BD: l'existència dels municipis i la
 * viabilitat de la valoració (NO_DATA) les comprova la ruta ABAN de cobrar.
 */
export function validateReportParams(kindRaw: unknown, body: Record<string, unknown>): ParamValidation {
  const kind = String(kindRaw ?? "");
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "BAD_KIND" };

  if (kind === "INFORME_MUNICIPI") {
    const mun = String(body.mun ?? "").slice(0, 6);
    if (!MUNI_RE.test(mun)) return { ok: false, error: "BAD_MUNICIPALITY" };
    return { ok: true, params: { kind, mun } };
  }

  if (kind === "VALORACIO") {
    const mun = String(body.mun ?? "").slice(0, 6);
    if (!MUNI_RE.test(mun)) return { ok: false, error: "BAD_MUNICIPALITY" };
    const surfaceRaw = Number(body.surfaceM2);
    const surfaceM2 =
      Number.isFinite(surfaceRaw) && surfaceRaw >= SHOP_LIMITS.SURFACE_MIN_M2 && surfaceRaw <= SHOP_LIMITS.SURFACE_MAX_M2
        ? surfaceRaw
        : null;
    if (body.surfaceM2 != null && surfaceM2 === null) return { ok: false, error: "BAD_SURFACE" };
    const roomsRaw = Number(body.rooms);
    const rooms =
      Number.isFinite(roomsRaw) && roomsRaw >= 0 && roomsRaw <= SHOP_LIMITS.ROOMS_MAX ? Math.round(roomsRaw) : null;
    if (body.rooms != null && rooms === null) return { ok: false, error: "BAD_ROOMS" };
    const estatRaw = String(body.estat ?? "");
    const estat = (SHOP_ESTATS as readonly string[]).includes(estatRaw) ? (estatRaw as ShopEstat) : null;
    if (body.estat != null && estat === null) return { ok: false, error: "BAD_ESTAT" };
    return { ok: true, params: { kind, mun, surfaceM2, rooms, estat } };
  }

  // COMPARATIVA: 2-6 municipis, sense repetits
  const raw = body.muns;
  const list = Array.isArray(raw) ? raw.map((m) => String(m ?? "").slice(0, 6)) : [];
  const muns = [...new Set(list)].filter((m) => MUNI_RE.test(m));
  if (muns.length < SHOP_LIMITS.MUNI_MIN || muns.length > SHOP_LIMITS.MUNI_MAX) {
    return { ok: false, error: "BAD_COMPARE_COUNT" };
  }
  return { ok: true, params: { kind: "COMPARATIVA", muns } };
}

/** Nom del fitxer per Content-Disposition, per kind i params. */
export function pdfFilename(kind: ReportKind, muniNames: string[]): string {
  const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  if (kind === "INFORME_MUNICIPI") return `preureal_informe_municipal_${slug(muniNames[0] || "municipi")}.pdf`;
  if (kind === "VALORACIO") return `preureal_valoracio_${slug(muniNames[0] || "municipi")}.pdf`;
  return `preureal_comparativa_${muniNames.length}municipis.pdf`;
}

// ---- tokens de descàrrega (el cru només viatja al correu / pantalla) ----
const TOKEN_BYTES = 32; // 256 bits d'entropia

/** Genera el token cru (base64url) i el seu hash per persistir. */
export function newDownloadToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** Comparació de tokens en temps constant sobre el hash. */
export function downloadTokenMatches(raw: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  return hashToken(raw) === storedHash;
}
