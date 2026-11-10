import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importIneIpva,
  importIneAtlasRenta,
  IPVA_SCOPES,
  ATLAS_SCOPES,
  INE_IPVA,
  INE_ATLAS_RENTA,
  type AtlasScope,
  type IpvaScope,
} from "@/lib/ine-import";

export const maxDuration = 60;

/**
 * GET /api/cron/ine — Fase 2: actualització programada de les fonts INE.
 *
 * Vercel Cron la crida trimestralment (vegeu vercel.json: gener/març/juny/
 * setembre — cobreix la publicació de l'IPVA a la primavera i la de l'Atlas
 * a la tardor). Com /api/cron/emails: si CRON_SECRET està definit exigeix
 * `Authorization: Bearer $CRON_SECRET`; si no, queda oberta (les operacions
 * són idempotents i limitades).
 *
 * Anti-timeout: cada àmbit importat marca un ImportRun OK («INE_ATLAS_RENTA:08»)
 * vàlid 20 dies; el cron SALTA els àmbits ja fets i avança cap als pendents
 * (el 08-Barcelona, ~35 MB, és l'últim i es reintenta fins que encaixa).
 */
const RECENT_WINDOW_MS = 20 * 24 * 3600 * 1000; // 20 dies

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

  // àmbits amb importació OK recent: es salten (idempotència per execucions)
  const recent = await db.importRun.findMany({
    where: {
      source: { startsWith: "INE_" },
      status: "OK",
      createdAt: { gte: new Date(started - RECENT_WINDOW_MS) },
    },
    select: { source: true },
  });
  const done = new Set(recent.map((r) => r.source));

  type Res = Awaited<ReturnType<typeof importIneIpva>>;
  const results: { ipva?: Res[]; atlas: Res[] } = { atlas: [] };

  let stoppedEarly = false;

  // 1) IPVA (petit) — només si no hi ha importació completa recent
  if (!done.has(INE_IPVA)) {
    for (const scope of ["NAC_CCAA", "PROV", "MUNI"] as IpvaScope[]) {
      const key = `${INE_IPVA}:${scope}`;
      if (done.has(key)) continue;
      if (Date.now() - started > BUDGET_MS) {
        stoppedEarly = true;
        break;
      }
      results.ipva = results.ipva ?? [];
      results.ipva.push(await importIneIpva(scope, "system:cron"));
    }
  }

  // 2) Atlas — àmbits pendents, el 08 al final
  for (const scope of ATLAS_SCOPES) {
    const key = `${INE_ATLAS_RENTA}:${scope}`;
    if (done.has(key) || done.has(INE_ATLAS_RENTA)) continue;
    if (Date.now() - started > BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    results.atlas.push(await importIneAtlasRenta(scope, "system:cron"));
  }

  const all = [...(results.ipva ?? []), ...results.atlas];
  return NextResponse.json({
    ok: all.length > 0 && all.every((a) => a.ok),
    scopesSaltados: [...done],
    ipva: results.ipva ?? [],
    atlas: results.atlas,
    stoppedEarly,
    elapsedMs: Date.now() - started,
    nextStep: stoppedEarly
      ? "Queden àmbits pendents: crida de nou aquest endpoint o espera la propera execució programada."
      : undefined,
  });
}
