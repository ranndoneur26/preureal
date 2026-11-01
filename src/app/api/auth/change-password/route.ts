import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, hashPassword, verifyPassword, revokeSessions, createSessionFor } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/** POST /api/auth/change-password { currentPassword, newPassword } — Fase 6. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`chpw:${ip}`, 5, 300_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");
  if (newPassword.length < 8) return NextResponse.json({ error: "PASSWORD_SHORT" }, { status: 400 });

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "BAD_CREDENTIALS" }, { status: 401 });

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  // revoca totes les sessions (inclosa l'actual) i en crea una de nova
  await revokeSessions(user.id);
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (fresh) await createSessionFor(fresh);
  return NextResponse.json({ ok: true });
}
