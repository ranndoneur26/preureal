/**
 * v38.8 — FULFILLMENT dels informes de pagament únic: un sol lloc on
 *  - es marca una compra com a PAGADA (idempotent, genera el token de
 *    descàrrega i registra l'event) — l'usen el webhook de Stripe, el
 *    endpoint de retorn i el checkout DEMO;
 *  - es genera el PDF d'una compra des dels paràmetres SNAPSHOT (el que es
 *    paga es regenera exactament igual encara que les dades o els preus
 *    canvïin després).
 * Les rutes de _impl/reports/shop només fan gating HTTP; la lògica viu aquí.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeValuation, valueForYear, yearOfPeriod, type EstatConservacio, type ValuationData } from "@/lib/territorial";
import { getMuniRentRows } from "@/lib/indicators-data";
import { buildReportPdf } from "@/lib/pdf-report";
import { buildValuationPdf, type ValuationReportInput } from "@/lib/pdf-valuation";
import { buildComparisonPdf, type ComparisonReportInput } from "@/lib/pdf-comparison";
import { gatherMuniReportInput, maskEmail } from "@/lib/report-data";
import { newDownloadToken, pdfFilename, reportProduct, type ReportKind, type ValidReportParams } from "@/lib/reports-shop";
import { reportReadyMail, sendMail } from "@/lib/mail";

type PurchaseRow = Awaited<ReturnType<typeof db.reportPurchase.findUnique>>;

function fmtDate(locale: "ca" | "es"): string {
  return new Date().toLocaleDateString(locale === "es" ? "es-ES" : "ca-ES", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Marca una compra com a pagada UNA SOLA VEGADA (idempotent): si ja estava
 * pagada retorna la fila existent amb tokenRaw=null (el token només es genera
 * una vegada; si es perd, l'usuari el té al correu).
 */
export async function fulfillPurchase(
  purchaseId: string,
  opts: { paymentIntent?: string | null; event: string }
): Promise<{ purchase: NonNullable<PurchaseRow>; tokenRaw: string | null }> {
  const existing = await db.reportPurchase.findUnique({ where: { id: purchaseId } });
  if (!existing) throw new Error("PURCHASE_NOT_FOUND");
  if (existing.status === "paid") {
    return { purchase: existing, tokenRaw: null };
  }
  const tok = newDownloadToken();
  const purchase = await db.reportPurchase.update({
    where: { id: purchaseId },
    data: {
      status: "paid",
      paidAt: new Date(),
      downloadTokenHash: tok.hash,
      ...(opts.paymentIntent ? { stripePaymentIntent: opts.paymentIntent } : {}),
    },
  });
  await db.event
    .create({ data: { type: opts.event, userId: purchase.userId, meta: JSON.stringify({ purchaseId, kind: purchase.kind }) } })
    .catch(() => {});
  return { purchase, tokenRaw: tok.raw };
}

/** URL absoluta de descàrrega (mai relativa: viatja per correu). */
export function purchaseDownloadUrl(purchaseId: string, tokenRaw: string): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.preureal.com";
  return `${origin}/api/reports/shop/download?p=${purchaseId}&t=${tokenRaw}`;
}

/**
 * Correu d'entrega del PDF (enllaç de descàrrega amb token, vàlid per sempre
 * del producte comprat). Idempotent per compra: només surt una vegada encara
 * que el webhook o el endpoint de retorn compleixin dues vegades.
 */
export async function notifyReportReady(
  purchase: NonNullable<PurchaseRow>,
  tokenRaw: string | null
): Promise<void> {
  if (!tokenRaw) return; // ja estava pagada abans: el correu ja va sortir (o l'usuari té l'URL en pantalla)
  const u = await db.user.findUnique({ where: { id: purchase.userId }, select: { id: true, email: true, locale: true } });
  if (!u) return;
  const locale = u.locale === "es" ? "es" : "ca";
  const kind = purchase.kind as ReportKind;
  const product = reportProduct(kind);
  const mail = reportReadyMail(locale === "es" ? product.nameEs : product.nameCa, purchaseDownloadUrl(purchase.id, tokenRaw), locale);
  await sendMail({
    to: u.email,
    subject: mail.subject,
    html: mail.html,
    type: "RECEIPT",
    userId: u.id,
    idempotencyKey: `report-ready:${purchase.id}`,
  });
}

function parseParams(purchase: NonNullable<PurchaseRow>): { params: ValidReportParams; locale: "ca" | "es" } {
  const p = JSON.parse(purchase.params) as ValidReportParams & { locale?: string };
  return { params: p, locale: p.locale === "es" ? "es" : "ca" };
}

export interface ValuationMuniLite {
  code: string; name: string; comarca: string | null; province: string | null;
  rentLatest: number | null; rentPeriod: string | null; contractsLatest: number | null;
  comarcaRefLatest: number | null; comarcaRefPeriod: string | null;
  isTense: boolean; tenseList: string | null; rentHistory: string | null;
}

type ValuationOkOutcome = Extract<ReturnType<typeof computeValuation>, { ok: true }>;

export type LoadedValuation =
  | { ok: true; mun: ValuationMuniLite; result: ValuationOkOutcome["result"] }
  | { ok: false; reason: "MUNICIPALITY_NOT_FOUND" | "NO_DATA" };

/**
 * Carrega el municipi + pools territorials i calcula la valoració v2. La usen
 * el checkout (comprovació ABANS de cobrar: sense base oficial no es cobra)
 * i el download (regeneració del PDF).
 */
export async function loadValuation(
  munCode: string,
  params: { surfaceM2: number | null; rooms: number | null; estat: EstatConservacio | null }
): Promise<LoadedValuation> {
  const mun = await db.municipality.findUnique({
    where: { code: munCode },
    select: {
      code: true, name: true, comarca: true, province: true,
      rentLatest: true, rentPeriod: true, contractsLatest: true,
      comarcaRefLatest: true, comarcaRefPeriod: true, isTense: true, tenseList: true, rentHistory: true,
    },
  });
  if (!mun) return { ok: false, reason: "MUNICIPALITY_NOT_FOUND" };

  let history: Record<string, number> | null = null;
  if (mun.rentHistory) {
    try {
      const h = JSON.parse(mun.rentHistory);
      if (h && typeof h === "object" && !Array.isArray(h)) history = h as Record<string, number>;
    } catch {
      history = null;
    }
  }
  const data: ValuationData = {
    rentLatest: mun.rentLatest,
    rentPeriod: mun.rentPeriod,
    contracts: mun.contractsLatest,
    history,
    comarcaValues: [],
    provinciaValues: [],
    comarcaRefLatest: mun.comarcaRefLatest,
    comarcaRefPeriod: mun.comarcaRefPeriod,
  };
  const year = yearOfPeriod(mun.rentPeriod) ?? yearOfPeriod(mun.comarcaRefPeriod);
  if (year) {
    const [comRows, provRows] = await Promise.all([
      getMuniRentRows({ comarca: mun.comarca }),
      getMuniRentRows({ province: mun.province }),
    ]);
    data.comarcaValues = comRows.map((r) => valueForYear(r, year)).filter((v): v is number => v !== null);
    data.provinciaValues = provRows.map((r) => valueForYear(r, year)).filter((v): v is number => v !== null);
  }
  const outcome = computeValuation(data, params);
  if (!outcome.ok) return { ok: false, reason: "NO_DATA" };
  return { ok: true, mun, result: outcome.result };
}

/**
 * Genera el PDF corresponent al kind de la compra a partir dels paràmetres
 * persistits. Llança si falta dada greu (només hauria de passar si la BD ha
 * canviat sota els peus de la compra: la ruta ho tracta com a 500).
 */
export async function buildPurchasePdf(
  purchase: NonNullable<PurchaseRow>
): Promise<{ bytes: Uint8Array; filename: string }> {
  const { params, locale } = parseParams(purchase);
  const muniNames: string[] = [];

  if (params.kind === "INFORME_MUNICIPI") {
    const mun = await db.municipality.findUnique({ where: { code: params.mun } });
    if (!mun) throw new Error("MUNICIPALITY_NOT_FOUND");
    muniNames.push(mun.name);
    const user = await db.user.findUnique({ where: { id: purchase.userId }, select: { email: true } });
    const input = await gatherMuniReportInput(mun, {
      subscriberMasked: maskEmail(user?.email || "compra@preureal.com"),
      planLabel: `Informe individual (${reportProduct("INFORME_MUNICIPI").priceCents / 100} €)`,
    });
    return {
      bytes: await buildReportPdf(input),
      filename: pdfFilename("INFORME_MUNICIPI", muniNames),
    };
  }

  if (params.kind === "VALORACIO") {
    const loaded = await loadValuation(params.mun, {
      surfaceM2: params.surfaceM2,
      rooms: params.rooms,
      estat: params.estat as EstatConservacio | null,
    });
    if (!loaded.ok) throw new Error(loaded.reason);
    const { mun, result } = loaded;
    muniNames.push(mun.name);

    const input: ValuationReportInput = {
      muni: {
        name: mun.name,
        comarca: mun.comarca,
        province: mun.province,
        code: mun.code,
        rentLatest: mun.rentLatest,
        rentPeriod: mun.rentPeriod,
        contractsLatest: mun.contractsLatest,
        isTense: mun.isTense,
        tenseList: mun.tenseList,
      },
      params: {
        surfaceM2: params.surfaceM2,
        rooms: params.rooms,
        estat: params.estat as EstatConservacio | null,
      },
      valuation: result,
      locale,
      genDate: fmtDate(locale),
      purchaseRef: purchase.id.slice(-6).toUpperCase(),
    };
    return {
      bytes: await buildValuationPdf(input),
      filename: pdfFilename("VALORACIO", muniNames),
    };
  }

  // COMPARATIVA
  const munis = await db.municipality.findMany({
    where: { code: { in: params.muns } },
    select: {
      code: true, name: true, comarca: true, province: true,
      rentLatest: true, rentPeriod: true, rentPrevYear: true, rentPrevPeriod: true,
      contractsLatest: true, isTense: true, tenseList: true, rentHistory: true,
    },
  });
  // mateix ordre que els paràmetres de la compra (el que va veure l'usuari)
  const ordered = params.muns
    .map((code) => munis.find((m) => m.code === code))
    .filter((m): m is (typeof munis)[number] => Boolean(m));
  if (ordered.length < 1) throw new Error("MUNICIPALITIES_NOT_FOUND");
  muniNames.push(...ordered.map((m) => m.name));

  const input: ComparisonReportInput = {
    munis: ordered,
    locale,
    genDate: fmtDate(locale),
    purchaseRef: purchase.id.slice(-6).toUpperCase(),
  };
  return {
    bytes: await buildComparisonPdf(input),
    filename: pdfFilename("COMPARATIVA", muniNames),
  };
}

/** Resposta d'error JSON estàndard per als endpoints de la botiga. */
export function shopError(error: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...(extra || {}) }, { status });
}
