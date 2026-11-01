import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { logEvent, rateLimit } from "@/lib/analytics";
import { welcomeMail, sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/email";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = rateLimit(`register:${ip}`, 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  // gmail: punts i +alias ignorats (joan.perez+app@gmail.com → joanperez@gmail.com)
  const email = normalizeEmail(String(body?.email || ""));
  const password = String(body?.password || "");
  const name = body?.name ? String(body.name).slice(0, 80) : null;
  const locale = body?.locale === "es" ? "es" : "ca";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "EMAIL_INVALID" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "PASSWORD_SHORT" }, { status: 400 });
  }
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: { email, passwordHash, name, locale, role: "USER", plan: "FREE" },
  });

  await createSession({
    userId: user.id,
    email: user.email,
    role: "USER",
    plan: "FREE",
  });
  await logEvent("SIGNUP", user.id, { locale });

  const mail = welcomeMail(name, locale);
  sendMail({ to: email, subject: mail.subject, html: mail.html });

  return NextResponse.json({ ok: true, user: { id: user.id, email, name, plan: "FREE" } });
}
