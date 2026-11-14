import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importIdescatPob,
  importIdescatEdat,
  importIdescatNac,
  importIdescatCensLlars,
  importIdescatEmexSeed,
  importIdescatEmexBatch,
  nextDemografiaStep,
} from "@/lib/idescat-import";

export const maxDuration = 60;

/**
 * GET /api/cron/demografia — v39: actualització programada de les fonts
 * demogràfiques IDESCAT (padró continu, censos de llars, emex).
 *
 * Vercel Cron crida el endpoint diàriament; cada execució fa UN pas
 * (finestra de 6 mesos per font anual; els lots emex avancen per codis
 * pendents). Idempotent: reexecutar no duplica res (finestra de substitució
 * per font + skipDuplicates).
 *
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
  const step = await nextDemografiaStep();
  if (step.step === "DONE") {
    return NextResponse.json({
      ok: true,
      step: "DONE",
      elapsedMs: Date.now() - started,
      message: "Totes les fonts demogràfiques IDESCAT són al dia.",
    });
  }

  let summary;
  switch (step.step) {
    case "EMEX_SEED":
      summary = await importIdescatEmexSeed("system:cron");
      break;
    case "POB":
      summary = await importIdescatPob(step.scope, "system:cron");
      break;
    case "EDAT":
      summary = await importIdescatEdat(step.scope, "system:cron");
      break;
    case "NAC":
      summary = await importIdescatNac(step.scope, "system:cron");
      break;
    case "CENS_LLARS":
      summary = await importIdescatCensLlars(step.scope, "system:cron");
      break;
    case "EMEX_BATCH":
      summary = await importIdescatEmexBatch(step.codes, "system:cron");
      break;
  }

  const stoppedEarly = Date.now() - started > BUDGET_MS;
  return NextResponse.json({
    ok: summary.ok,
    step: step.step,
    summary,
    stoppedEarly,
    elapsedMs: Date.now() - started,
    nextStep: !summary.ok
      ? "Reintenta més tard; l'error queda registrat a ImportRun."
      : "Crida de nou (o espera el cron diari) per al següent pas.",
  });
}
