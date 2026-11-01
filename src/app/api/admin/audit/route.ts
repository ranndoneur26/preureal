import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/** GET /api/admin/audit — historial d'auditoria d'accions sensibles (Fase 12). */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const take = Math.min(parseInt(searchParams.get("take") || "100", 10) || 100, 300);
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { },
  });
  // resol correus d'actor (n+1 evitat: consultem els actorId presents)
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a.email]));
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      target: l.target,
      meta: l.meta ? JSON.parse(l.meta) : null,
      actorEmail: l.actorId ? actorMap.get(l.actorId) || l.actorId : null,
      createdAt: l.createdAt,
    })),
  });
}
