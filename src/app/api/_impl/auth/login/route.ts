import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionFor, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { normalizeEmail } from "@/lib/email";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  // normalitza Gmail (punts/+alias) abans de cercar el compte
  const email = normalizeEmail(String(body?.email || ""));
  const password = String(body?.password || "");
  if (email.length > 200 || password.length > 200) {
    return NextResponse.json({ error: "BAD_CREDENTIALS" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) return NextResponse.json({ error: "BAD_CREDENTIALS" }, { status: 401 });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "BAD_CREDENTIALS" }, { status: 401 });

  await createSessionFor(user);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await db.event.create({ data: { type: "LOGIN", userId: user.id } }).catch(() => {});

  return NextResponse.json({
    ok: true,
    emailVerified: Boolean(user.emailVerifiedAt), // Fase 1: la UI redirigeix a verificar si cal
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: user.plan,
      locale: user.locale,
    },
  });
}
