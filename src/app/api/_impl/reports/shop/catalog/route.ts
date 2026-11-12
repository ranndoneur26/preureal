import { NextResponse } from "next/server";
import { REPORT_KINDS, SHOP_LIMITS, SHOP_ESTATS, reportProduct, type ReportKind } from "@/lib/reports-shop";

/**
 * GET /api/reports/shop/catalog — catàleg PÚBLIC dels informes individuals de
 * pagament únic (sense auth: la pàgina de preus el mostra a tothom). Els preus
 * venen de la mateixa font que el checkout (reportProduct), mai de text dur al
 * client, perquè no puguin divergir.
 */
export async function GET() {
  const products = REPORT_KINDS.map((k) => {
    const p = reportProduct(k as ReportKind);
    return {
      kind: p.kind,
      priceCents: p.priceCents,
      nameCa: p.nameCa,
      nameEs: p.nameEs,
      descCa: p.descCa,
      descEs: p.descEs,
    };
  });
  return NextResponse.json({
    ok: true,
    products,
    limits: SHOP_LIMITS,
    estats: SHOP_ESTATS,
  });
}
