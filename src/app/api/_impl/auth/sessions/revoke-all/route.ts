import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, revokeSessions, createSessionFor } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * POST /api/auth/sessions/revoke-all — Fase 1 (gestió de sessions).
 *
 * Tanca TOTES les sessions obertes en ALTRES dispositius mantenint l'actual.
 * Implementació: incrementa `tokenVersion` (revoca tots els JWT emesos,
 * inclosos els d'altres navegadors/dispositius) i tot seguit emet una sessió
 * NOVA per al dispositiu que ha fet la petició.
 *
 * El panell (/panell → Seguretat) ja feia servir aquest endpoint; ara el
 * servidor el proporciona de veritat (abans responia 404).
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`revoke-all:${ip}`, 5, 300_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // +1 a tokenVersion → qualsevol JWT anterior deixa de ser vàlid a requireUser
  await revokeSessions(user.id);
  await db.event
    .create({ data: { type: "SESSIONS_REVOKED", userId: user.id } })
    .catch(() => {});

  // nova sessió (cookie fresca) per al dispositiu actual
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (fresh) await createSessionFor(fresh);

  return NextResponse.json({ ok: true });
}
