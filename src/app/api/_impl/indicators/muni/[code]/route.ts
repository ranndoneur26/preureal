import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { planAllows, type PlanId } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { getMuniIndicators } from "@/lib/indicators-data";
import { gateIndicators } from "@/lib/indicators-gating";

/**
 * GET /api/indicators/muni/:code?price=NNN — Fase 4.
 *
 * Bloc d'indicadors oficials d'un municipi per a la fitxa del mapa i el
 * comparador. La decisió FREE/Premium SEMPRE al servidor (Taula 8):
 *  - FREE: mediana municipal de referència + teaser de disponibilitat;
 *    cap dada premium surt de l'API.
 *  - PREMIUM/PRO: banda P25/mediana/P75 + posició del preu + IPVA + renda
 *    + esforç econòmic + deltas territorials (segons flags del pla).
 *
 * Autenticació amb correu verificat (mateix criteri que /api/lookup) i
 * rate-limit per usuari. NO consumeix quota: les consultes detallades ja es
 * compten a /api/lookup; aquest bloc és el context que acompanya la fitxa.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const { code } = await ctx.params;
  const muniCode = String(code || "").slice(0, 6);
  if (!/^\d{6}$/.test(muniCode)) {
    return NextResponse.json({ error: "BAD_CODE" }, { status: 400 });
  }

  const session = await getAuthUser();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!session.emailVerifiedAt && session.role !== "ADMIN") {
    return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
  }
  const rl = await rateLimit(`indicators:${session.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });
  }

  // preu concret opcional (€/mes) per a la posició dins la banda: sanejat
  const rawPrice = parseFloat(new URL(req.url).searchParams.get("price") || "");
  const price = Number.isFinite(rawPrice) && rawPrice >= 50 && rawPrice <= 100_000 ? rawPrice : null;

  const full = await getMuniIndicators(muniCode, { price });
  if (!full) {
    return NextResponse.json({ error: "MUNICIPALITY_NOT_FOUND" }, { status: 404 });
  }

  const plan = (session.plan as PlanId) || "FREE";
  const [referenciaAmpliada, indicadorsTerritorials, evolucioTemporal, comparativaTerritorial] = await Promise.all([
    planAllows(plan, "referenciaAmpliada"),
    planAllows(plan, "indicadorsTerritorials"),
    planAllows(plan, "evolucioTemporal"),
    planAllows(plan, "comparativaTerritorial"),
  ]);

  return NextResponse.json(
    gateIndicators(full, plan, { referenciaAmpliada, indicadorsTerritorials, evolucioTemporal, comparativaTerritorial }),
  );
}
