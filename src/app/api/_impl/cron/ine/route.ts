import { NextResponse } from "next/server";
import { importIneIpva, importIneAtlasRenta, type AtlasScope } from "@/lib/ine-import";

export const maxDuration = 60;

/**
 * GET /api/cron/ine — Fase 2: actualització programada de les fonts INE.
 *
 * Vercel Cron la crida trimestralment (vegeu vercel.json: gener/març/juny/
 * setembre — cobreix la publicació de l'IPVA a la primavera i la de l'Atlas
 * a la tardor). Com /api/cron/emails: si CRON_SECRET està definit exigeix
 * `Authorization: Bearer $CRON_SECRET`; si no, queda oberta (les operacions
 * són idempotents i els àmbits es processen amb pressupost de temps).
 *
 * Estratègia anti-timeout: l'IPVA és petit i s'importa sencer; l'Atlas
 * processa àmbits fins a un pressupost de ~40 s (el 08-Barcelona, ~35 MB,
 * queda al final i es reintentarà a la propera execució si no hi ha temps).
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
  const BUDGET_MS = 40_000;

  const ipva = await importIneIpva(undefined, "system:cron");

  const atlas: Awaited<ReturnType<typeof importIneAtlasRenta>>[] = [];
  let stoppedEarly = false;
  for (const scope of ["NACIONAL", "17", "25", "43", "08"] as AtlasScope[]) {
    if (Date.now() - started > BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    atlas.push(await importIneAtlasRenta(scope, "system:cron"));
  }

  return NextResponse.json({
    ok: ipva.ok && atlas.every((a) => a.ok),
    ipva,
    atlas,
    stoppedEarly,
    elapsedMs: Date.now() - started,
    nextStep: stoppedEarly
      ? "La propera execució programada continua amb els àmbits pendents (o crida POST /api/admin/import-ine amb scope)."
      : undefined,
  });
}
