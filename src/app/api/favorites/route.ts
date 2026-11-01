import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * GET  /api/favorites            — llista preferits de l'usuari
 * POST /api/favorites            — afegeix { entityKey, buildingId?, municipalityCode?, label? }
 * DELETE /api/favorites?key=...  — elimina per entityKey
 * Requereix planAllows(features.preferits) → Premium/Pro (Fase 5/9).
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const favorites = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ favorites });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const ip = clientIp(req);
  const rl = await rateLimit(`fav:${user.id}:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "preferits"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const buildingId = body?.buildingId ? String(body.buildingId).slice(0, 40) : null;
  const municipalityCode = body?.municipalityCode ? String(body.municipalityCode).slice(0, 10) : null;
  const label = body?.label ? String(body.label).slice(0, 120) : null;
  if (!buildingId && !municipalityCode) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }
  const entityKey = buildingId ? `BUILDING:${buildingId}` : `MUNI:${municipalityCode}`;
  const fav = await db.favorite.upsert({
    where: { userId_entityKey: { userId: user.id, entityKey } },
    create: { userId: user.id, entityKey, buildingId, municipalityCode, label },
    update: { label: label || undefined },
  });
  return NextResponse.json({ ok: true, favorite: fav });
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key.length > 80) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  await db.favorite.deleteMany({ where: { userId: user.id, entityKey: key } });
  return NextResponse.json({ ok: true });
}
