import { NextResponse } from "next/server";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { logEvent, rateLimit } from "@/lib/analytics";
import { resetMail, sendMail } from "@/lib/mail";

/** Demana un enllaç de restabliment de contrasenya. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = rateLimit(`pwreset:${ip}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });

  // resposta sempre ok (no revelem si el correu existeix)
  if (user) {
    const token = crypto.randomBytes(24).toString("hex");
    await db.passwordToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await logEvent("PASSWORD_RESET", user.id);
    const locale = user.locale === "es" ? "es" : "ca";
    const mail = resetMail(token, locale);
    sendMail({ to: email, subject: mail.subject, html: mail.html });
  }
  return NextResponse.json({ ok: true });
}
