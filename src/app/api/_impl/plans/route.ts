import { NextResponse } from "next/server";
import { getPlanSettings, planName, type PlanId } from "@/lib/plans";

/**
 * GET /api/plans — configuració EFECTIVA dels plans (públic, sense sessió).
 *
 * v23 — unificació de preus (punt 9 de l'auditoria): el frontend (PricingView)
 * dibuixa els preus i features DES D'AQUÍ (config PlanSetting/PLANS), la
 * mateixa font que usen el checkout, els rebuts (import real de Stripe) i
 * l'MRR d'admin. Si l'API no respon, el frontend manté els textos i18n per
 * defecte (degradació elegant, mai pàgina trencada).
 */
export async function GET() {
  const s = await getPlanSettings();
  const ids: PlanId[] = ["FREE", "PREMIUM", "PRO"];
  return NextResponse.json({
    plans: ids.map((id) => ({
      id,
      name: planName(id, "ca"),
      priceEur: s[id].priceEur,
      quotaMonth: s[id].quotaMonth,
      features: s[id].features,
    })),
  });
}
