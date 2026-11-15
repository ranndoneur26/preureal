import { NextResponse } from "next/server";
import {
  importIdescatCensTenencia,
  importIncasolFlux,
  recalcRentalShare,
} from "@/lib/rental-share";

export const maxDuration = 60;

/**
 * GET /api/cron/rental-share — v41: actualització programada (mensual) de
 * l'indicador «% estimat de lloguer sobre el parc residencial».
 * Tres passos idempotents en seqüència amb guarda de pressupost (40s, mateixa
 * convenció que els crons demografia/entorn):
 *  1. CENS      — reimporta la taula censal Idescat (refinestrament idempotent)
 *  2. FLUX      — reimporta el flux anual de fiances SODA qww9-bvhh
 *  3. RECALC    — recalcula RentalShareObservation per als 947 municipis
 * Els components pendents (fiances vigentes, parc catastral) s'activen via
 * /api/admin/import-rental-share quan les fonts oficials publiquin dades.
 * Auth: si CRON_SECRET està definit exigeix `Authorization: Bearer $CRON_SECRET`.
 */
const BUDGET_MS = 40_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  }
  const started = Date.now();
  const steps: Record<string, unknown> = {};
  let stoppedEarly = false;

  // 1) Cens 2021 (referència censal)
  steps.cens = await importIdescatCensTenencia("system:cron");
  if (Date.now() - started > BUDGET_MS) stoppedEarly = true;

  // 2) Flux anual de fiances (referència de mercat)
  if (!stoppedEarly) {
    steps.flux = await importIncasolFlux("system:cron");
    if (Date.now() - started > BUDGET_MS) stoppedEarly = true;
  }

  // 3) Recàlcul de l'indicador compost
  if (!stoppedEarly) {
    steps.recalc = await recalcRentalShare("system:cron");
    if (Date.now() - started > BUDGET_MS) stoppedEarly = true;
  }

  const ok = Object.values(steps).every((s) => (s as { ok: boolean })?.ok !== false);
  return NextResponse.json({
    ok,
    steps,
    stoppedEarly,
    elapsedMs: Date.now() - started,
    message: stoppedEarly
      ? "Pressupost de temps esgotat: els passos restants es completaran a la propera execució (idempotent)."
      : "Indicador actualitzat (cens + flux + recàlcul).",
  });
}
