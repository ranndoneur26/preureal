import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSessionFor, revokeSessions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { hashToken } from "@/lib/token-hash";

/** Confirmació de restabliment amb token. Revoca TOTES les sessions anteriors. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`pwconfirm:${ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const token = String(body?.token || "").slice(0, 100);
  const password = String(body?.password || "");
  if (password.length < 8)
    return NextResponse.json({ error: "PASSWORD_SHORT" }, { status: 400 });

  // P0 v19: a la BD el token està HASHAT — una filtració de BD no dona enllaços vius
  const pt = await db.passwordToken.findUnique({ where: { token: hashToken(token) } });
  if (!pt || pt.used || pt.expiresAt < new Date())
    return NextResponse.json({ error: "TOKEN_INVALID" }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: pt.userId } });
  if (!user || !user.active) return NextResponse.json({ error: "TOKEN_INVALID" }, { status: 400 });

  const passwordHash = await hashPassword(password);

  // P0 v19 — CONSUM ATÒMIC del token: només UNA de les peticions concurrents
  // pot fer used false→true (updateMany condicionat dins transacció); la resta
  // surten amb TOKEN_INVALID. Abans hi havia una finestra de carrera.
  const claim = await db.$transaction([
    db.passwordToken.updateMany({
      where: { id: pt.id, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    }),
  ]);
  if (claim[0].count === 0)
    return NextResponse.json({ error: "TOKEN_INVALID" }, { status: 400 });

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // seguretat: qualsevol ALTRE enllaç de restabliment pendent queda anul·lat
    db.passwordToken.updateMany({
      where: { userId: user.id, used: false, id: { not: pt.id } },
      data: { used: true },
    }),
  ]);
  // seguretat: invalida qualsevol sessió oberta amb la contrasenya antiga
  await revokeSessions(user.id);

  // nova sessió amb la versió de token actualitzada
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  if (fresh) await createSessionFor(fresh);
  return NextResponse.json({ ok: true });
}
