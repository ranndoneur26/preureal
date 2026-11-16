import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSiteUrlOrigin } from "@/lib/site-url";
import { hashToken } from "@/lib/token-hash";
import { createSessionFor } from "@/lib/auth";
import { safeInternalRoute } from "@/lib/email-first";

/**
 * v46 — Consumició del magic link (entrada sense contrasenya).
 *
 * P1.2 — la confirmació explícita és un POST; el GET MAI muta dades:
 *  GET  /api/auth/magic-link/consume?token=...
 *       → NOMÉS redirigeix a la vista /#/entrada-link?token=... (la SPA fa el
 *         POST). Els escàners d'enllaços (antispam, previews...) fan GET, no
 *         executen la SPA ni fan POST: el token no el poden "devorar".
 *  POST /api/auth/magic-link/consume { token }
 *       → ÚNIC camí que consumeix el token i crea la sessió. Un sol ús ATÒMIC
 *         (update amb condició used:false — una cursa entre dos clics només
 *         crea UNA sessió).
 *
 * Estats: ok | ja_usat | caducat | invalid — la vista mostra el resultat amb
 * el mateix vocabulari que la verificació de correu.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").slice(0, 100);
  const base = getSiteUrlOrigin() || url.origin;
  return NextResponse.redirect(`${base}/#/entrada-link?token=${encodeURIComponent(token)}`);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body?.token ? String(body.token).slice(0, 100) : "";
  if (!token) return NextResponse.json({ ok: false, estat: "invalid" }, { status: 400 });

  const mt = await db.magicToken.findUnique({
    where: { token: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, plan: true, active: true } } },
  });
  if (!mt) return NextResponse.json({ ok: false, estat: "invalid" }, { status: 400 });
  if (mt.used) return NextResponse.json({ ok: false, estat: "ja_usat" }, { status: 400 });
  if (mt.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, estat: "caducat" }, { status: 400 });
  }
  if (!mt.user || !mt.user.active) {
    return NextResponse.json({ ok: false, estat: "invalid" }, { status: 400 });
  }

  // un sol ús atòmic: només el primer POST que veu used:false el consumeix
  const claimed = await db.magicToken.updateMany({
    where: { id: mt.id, used: false },
    data: { used: true },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ ok: false, estat: "ja_usat" }, { status: 400 });
  }

  await createSessionFor(mt.user as never);
  await db.user.update({ where: { id: mt.user.id }, data: { lastLoginAt: new Date() } });
  await db.event.create({ data: { type: "LOGIN", userId: mt.user.id } }).catch(() => {});

  // returnTo revalidat contra l'allowlist (per si el valor de la BD fos vell)
  return NextResponse.json({
    ok: true,
    estat: "ok",
    returnTo: safeInternalRoute(mt.returnTo) ?? "/",
    user: {
      id: mt.user.id,
      email: mt.user.email,
      name: mt.user.name,
      role: mt.user.role,
      plan: mt.user.plan,
    },
  });
}
