import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/ine/status — Fase 2: estat públic de les fonts oficials INE.
 *
 * Probe de verificació post-desplegament (mateix patró que /api/provenance):
 * només dades PÚBLIQUES de l'INE (comptes, períodes, metadades de font i
 * última importació). No exposa cap dada d'usuari ni de negoci.
 */
export async function GET() {
  const [fuentes, porFuente, periodos, runs] = await Promise.all([
    db.dataSource.findMany({
      where: { code: { in: ["INE_IPVA", "INE_ATLAS_RENTA"] } },
      select: {
        id: true,
        code: true,
        name: true,
        institution: true,
        unit: true,
        periodicity: true,
        url: true,
        updatedAt: true,
      },
      orderBy: { code: "asc" },
    }),
    db.statObservation.groupBy({
      by: ["sourceId", "variable", "geoLevel"],
      _count: { _all: true },
    }),
    db.statObservation.groupBy({
      by: ["sourceId", "variable"],
      _min: { period: true },
      _max: { period: true },
    }),
    db.importRun.findMany({
      where: { source: { in: ["INE_IPVA", "INE_ATLAS_RENTA"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        source: true,
        status: true,
        rowsTotal: true,
        created: true,
        skipped: true,
        error: true,
        createdAt: true,
      },
    }),
  ]);

  const byId = new Map(fuentes.map((f) => [f.id, f.code]));
  const observaciones = porFuente
    .map((g) => ({
      fuente: byId.get(g.sourceId) ?? g.sourceId,
      variable: g.variable,
      geoLevel: g.geoLevel,
      count: g._count._all,
    }))
    .sort((a, b) => a.fuente.localeCompare(b.fuente) || a.variable.localeCompare(b.variable));

  const rangosPeriodo = periodos
    .map((p) => ({
      fuente: byId.get(p.sourceId) ?? p.sourceId,
      variable: p.variable,
      desde: p._min.period,
      hasta: p._max.period,
    }))
    .sort((a, b) => a.fuente.localeCompare(b.fuente) || a.variable.localeCompare(b.variable));

  return NextResponse.json({
    ok: true,
    fuentes,
    observaciones,
    rangosPeriodo,
    ultimasImportaciones: runs,
  });
}
