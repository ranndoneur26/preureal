import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importEntornRecarrega,
  importEntornSanitaris,
  importEntornDocentsChunk,
  importEntornEquipamentsChunk,
  nextEntornStep,
  STEP_BUDGET_MS,
} from "@/lib/entorn-import";

export const maxDuration = 60;

/**
 * GET /api/cron/entorn — v40 (Fase A): actualització programada dels punts
 * d'entorn (recàrrega EV, establiments sanitaris, centres docents i
 * equipaments de Catalunya). Els certificats ICAEN NO s'ingesten aquí: van
 * on-demand per referència catastral quan s'obre una fitxa (patró BD-cau).
 *
 * Vercel Cron crida el endpoint diàriament. Cada execució FA MÈS D'UN PAS
 * mentre hi hagi pressupost de temps (40 s sobre el límit de 60 s de Vercel):
 * els lots de municipis són curts (un fetch + substitució per lot), així que
 * el sembrat inicial complet triga 2-3 dies de cron i els refrescos (finestra
 * de 60 dies) es resolen en una sola execució. Idempotent: reexecutar no
 * duplica res; si una font cau, el pas queda pendent i es reintenta sense
 * esborrar les dades vigents.
 *
 * Auth: si CRON_SECRET està definit exigeix `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  }
  const started = Date.now();
  const steps: Array<Record<string, unknown>> = [];
  let stoppedEarly = false;

  // Bucle amb pressupost: cada lot és curt; amb 40 s es fan 8-15 passos/crida.
  for (;;) {
    const step = await nextEntornStep();
    if (step.step === "DONE") break;
    const t0 = Date.now();
    let summary: { ok: boolean; created: number; skipped: number };
    switch (step.step) {
      case "RECARREGA":
        summary = await importEntornRecarrega("system:cron");
        break;
      case "SANITARIS":
        summary = await importEntornSanitaris("system:cron");
        break;
      case "DOCENTS":
        summary = await importEntornDocentsChunk(step.chunk, "system:cron");
        break;
      case "EQUIPAMENTS":
        summary = await importEntornEquipamentsChunk(step.chunk, "system:cron");
        break;
    }
    steps.push({ step: step.step, chunk: "chunk" in step ? step.chunk : 0, ...summary, elapsedMs: Date.now() - t0 });
    if (!summary.ok) {
      // superfície de diagnòstic: l'error complet queda a ImportRun; aquí una
      // pista sanejada per poder depurar sense accés d'admin
      const lastRun = await db.importRun.findFirst({
        where: { source: { startsWith: "ENTORNT_" }, status: "ERROR" },
        orderBy: { createdAt: "desc" },
        select: { source: true, error: true },
      });
      steps.push({ diagnostic: lastRun?.source ?? null, error: (lastRun?.error ?? "").slice(0, 220) });
      break; // error de font: es reintentarà l'endemà (no esborra res)
    }
    if (Date.now() - started > STEP_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
  }

  return NextResponse.json({
    ok: steps.every((s) => s.ok !== false),
    steps,
    stoppedEarly,
    elapsedMs: Date.now() - started,
    done: await nextEntornStep().then((s) => s.step === "DONE"),
    nextStep: "Crida de nou (o espera el cron diari) per continuar el sembrat.",
  });
}
