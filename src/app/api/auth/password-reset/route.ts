import { NextResponse } from "next/server";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { resetMail, verifyMail, sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/email";

/** Demana un enllaç de restabliment de contrasenya (i de verificació si cal). */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`pwreset:${ip}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  // normalitza Gmail (punts/+alias) abans de cercar el compte
  const email = normalizeEmail(String(body?.email || ""));
  const user = await db.user.findUnique({ where: { email } });

  // resposta sempre ok (no revelem si el correu existeix)
  if (user && user.active) {
    const token = crypto.randomBytes(24).toString("hex");
    await db.passwordToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600_000) },
    });
    await db.event.create({ data: { type: "PASSWORD_RESET", userId: user.id } }).catch(() => {});
    const locale = user.locale === "es" ? "es" : "ca";
    const mail = resetMail(token, locale);
    sendMail({ to: email, subject: mail.subject, html: mail.html }).catch(() => {});

    // si el correu no està verificat, aprofitem per reenviar la verificació
    if (!user.emailVerifiedAt) {
      const vt = crypto.randomBytes(24).toString("hex");
      await db.emailToken.create({
        data: { userId: user.id, token: vt, expiresAt: new Date(Date.now() + 24 * 3600_000) },
      });
      const vmail = verifyMail(vt, locale);
      sendMail({ to: email, subject: vmail.subject, html: vmail.html }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}
