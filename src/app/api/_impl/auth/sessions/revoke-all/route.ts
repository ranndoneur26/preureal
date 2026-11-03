import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, revokeSessions, createSessionFor } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * POST /api/auth/sessions/revoke-all — Fase 1 (gestió de sessions).
 *
 * Tanca la sessió a TOTS els altres dispositius: incrementa `tokenVersion`
 * (tots els JWT anteriors queden invàlids a la propera petició) i crea una
 * sessió nova NOMÉS per al dispositiu actual, que no pateix el tancament.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`revokesessions:${ip}`, 5, 300_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  await revokeSessions(user.id);
  await db.event
    .create({ data: { type: "SESSIONS_REVOKED", userId: user.id } })
    .catch(() => {});

  // nova sessió amb la versió de token actualitzada (aquest dispositiu segueix dins)
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (fresh) await createSessionFor(fresh);

  return NextResponse.json({ ok: true });
}
