import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionFor, hashPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, sanitizeName } from "@/lib/security";
import { welcomeMail, verifyMail, sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/email";
import * as crypto from "crypto";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`register:${ip}`, 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body || String(body?.email || "").length > 200 || String(body?.password || "").length > 200) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }
  // gmail: punts i +alias ignorats (joan.perez+app@gmail.com → joanperez@gmail.com)
  const email = normalizeEmail(String(body?.email || ""));
  const password = String(body?.password || "");
  const name = body?.name ? sanitizeName(String(body.name)) : null;
  const locale = body?.locale === "es" ? "es" : "ca";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
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

  await createSessionFor(user);
  await db.event
    .create({ data: { type: "SIGNUP", userId: user.id, meta: JSON.stringify({ locale }) } })
    .catch(() => {});

  const mail = welcomeMail(name, locale);
  sendMail({ to: email, subject: mail.subject, html: mail.html }).catch(() => {});

  // correu de verificació (Fase 6) — no bloqueja l'ús del compte
  const token = crypto.randomBytes(24).toString("hex");
  await db.emailToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 24 * 3600_000) },
  });
  const vmail = verifyMail(token, locale);
  sendMail({ to: email, subject: vmail.subject, html: vmail.html }).catch(() => {});

  return NextResponse.json({ ok: true, user: { id: user.id, email, name, plan: "FREE" } });
}
