import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { rateLimit } from "@/lib/analytics";

/** Confirmació de restabliment amb token. */
export async function POST(req: Request) {
  const rl = rateLimit("pwconfirm", 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const token = String(body?.token || "");
  const password = String(body?.password || "");
  if (password.length < 8)
    return NextResponse.json({ error: "PASSWORD_SHORT" }, { status: 400 });

  const pt = await db.passwordToken.findUnique({ where: { token } });
  if (!pt || pt.used || pt.expiresAt < new Date())
    return NextResponse.json({ error: "TOKEN_INVALID" }, { status: 400 });

  const passwordHash = await hashPassword(password);
  const user = await db.user.update({
    where: { id: pt.userId },
    data: { passwordHash },
  });
  await db.passwordToken.update({ where: { id: pt.id }, data: { used: true } });

  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    plan: (user.plan as "FREE") || "FREE",
  });
  return NextResponse.json({ ok: true });
}
