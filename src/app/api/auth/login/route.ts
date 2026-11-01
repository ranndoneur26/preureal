import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { logEvent, rateLimit } from "@/lib/analytics";
import { normalizeEmail } from "@/lib/email";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  // normalitza Gmail (punts/+alias) abans de cercar el compte
  const email = normalizeEmail(String(body?.email || ""));
  const password = String(body?.password || "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "BAD_CREDENTIALS" }, { status: 401 });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "BAD_CREDENTIALS" }, { status: 401 });

  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    plan: (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE",
  });
  await logEvent("LOGIN", user.id);

  return NextResponse.json({
    ok: true,
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
