import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * GET  /api/favorites            — llista preferits de l'usuari
 * POST /api/favorites            — afegeix { entityKey, buildingId?, municipalityCode?, label? }
 * PATCH /api/favorites           — alerta de preu: { entityKey, alertPct } (null = sense alerta; 1-50 = %)
 * DELETE /api/favorites?key=...  — elimina per entityKey
 * Requereix planAllows(features.preferits) → Premium/Pro (Fase 5/9).
 */
export async function GET() {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  // v23 — el docblock ja deia "Requereix planAllows(preferits)" però GET no el
  // comprovava (només POST): un usuari FREE podia LLEGIR preferits via API.
  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "preferits"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }
  const favorites = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ favorites });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
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
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key.length > 80) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  await db.favorite.deleteMany({ where: { userId: user.id, entityKey: key } });
  return NextResponse.json({ ok: true });
}

/**
 * v37 — PATCH: configura l'ALERTA DE PREU d'un favorit.
 * alertPct null = sense alerta; 1..50 = avisa quan el valor vigent variï un
 * >= N% respecte de l'últim valor notificat (el cron /api/cron/emails fixa la
 * línia base i envia l'avís amb idempotència via PriceAlertLog).
 */
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`fav-alert:${user.id}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "preferits"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const entityKey = body?.entityKey ? String(body.entityKey).slice(0, 80) : "";
  if (!entityKey || (entityKey.split(":")[0] !== "MUNI" && entityKey.split(":")[0] !== "BUILDING")) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }
  const raw = body?.alertPct;
  let alertPct: number | null = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return NextResponse.json({ error: "BAD_INPUT", message: "alertPct ha de ser un número d'1 a 50, o null per desactivar." }, { status: 400 });
    }
    alertPct = n;
  }
  const fav = await db.favorite.updateMany({
    where: { userId: user.id, entityKey },
    data: { alertPct },
  });
  if (fav.count === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, alertPct });
}
