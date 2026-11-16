import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPlanSettings } from "@/lib/plans";
import { consumeDetailQuery } from "@/lib/subscription";

/**
 * v46 — BLOQUEIG REAL AL SERVIDOR del flux email-first (mai només visual).
 *
 * Tota ruta que calcula/desenvolupa REGISTRES DETALLATS de consulta
 * (/api/analitza, /api/estima) passa per gateDetailedQuery() ABANS de fer cap
 * càlcul:
 *
 *  1. Sense sessió autenticada → 401 { error: "UNAUTHENTICATED",
 *     code: "REGISTRAT_PRIMER" } i NO s'executa cap càlcul detallat (ni tan
 *     sols es llegeix el municipi). El client mostra el panell
 *     «Registra't primer» i redirigeix al registre del pla Free.
 *  2. Amb sessió → quota del pla aplicada PER USER_ID al servidor (mai per
 *     cookie ni sessió anònima), amb la mateixa font atòmica v23 que
 *     /api/lookup (SubscriptionUsage DETAIL_QUERY). Les consultes dels
 *     formularis COMPUTEN dins de la quota (3/mes al pla Free; recomanat i
 *     decidit a l'encàrrec). Quota exhaurida → 402 QUOTA_EXCEEDED amb
 *     { quota: { used, limit }, plan } — el mateix contracte que el mapa,
 *     perquè el client reutilitzi el missatge existent del límit del pla.
 *
 * Nota RGPD/seguretat: aquí només cal SESSIÓ (requireUser-equivalent via
 * getAuthUser); la verificació de correu continua sent una porta pròpia del
 * mapa (P1.3). Si esrequireixés verificació aquí també, l'usuari acabat de
 * registrar quedaria encerclat sense poder executar la consulta automàtica de
 * retorn — exactament el cas que l'encàrrec prohibeix («l'usuari no ha de
 * tornar a escriure res»).
 */

export interface GateOk {
  ok: true;
  user: { id: string; email: string; plan: "FREE" | "PREMIUM" | "PRO" };
}

export interface GateBlocked {
  ok: false;
  res: Response;
}

export function registratPrimerResponse(): Response {
  return NextResponse.json(
    { error: "UNAUTHENTICATED", code: "REGISTRAT_PRIMER" },
    { status: 401 },
  );
}

export async function gateDetailedQuery(): Promise<GateOk | GateBlocked> {
  const user = await getAuthUser();
  if (!user) return { ok: false, res: registratPrimerResponse() };

  const plan = (user.plan === "PREMIUM" || user.plan === "PRO" ? user.plan : "FREE");
  const limit = (await getPlanSettings())[plan].quotaMonth;
  const quota = await consumeDetailQuery(user.id, limit);
  if (!quota.ok) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "QUOTA_EXCEEDED", quota: { used: quota.used, limit: quota.limit }, plan },
        { status: 402 },
      ),
    };
  }
  return { ok: true, user: { id: user.id, email: user.email, plan } };
}
