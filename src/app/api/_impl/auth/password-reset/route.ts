import { NextResponse, after } from "next/server";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { resetMail, verifyMail, sendMail } from "@/lib/mail";
import { hashToken } from "@/lib/token-hash";
import { normalizeEmail } from "@/lib/email";

// Els correus s'envien EN BACKGROUND amb after() (ignorat fora de Vercel).
export const maxDuration = 60;

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
    // P1 v19: límit addicional PER COMPTE (3/h) — el límit per IP no protegeix
    // una compte concret contra abús dirigit
    const rlMail = await rateLimit(`pwreset:mail:${email}`, 3, 3600_000);
    if (!rlMail.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

    const token = crypto.randomBytes(24).toString("hex");
    // P1 v19: UN SOL enllaç de restobliment viu — els pendents anteriors
    // s'anul·len en la mateixa transacció en què es crea el nou
    await db.$transaction([
      db.passwordToken.updateMany({ where: { userId: user.id, used: false }, data: { used: true } }),
      db.passwordToken.create({
        data: { userId: user.id, token: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) },
      }),
    ]);
    await db.event.create({ data: { type: "PASSWORD_RESET", userId: user.id } }).catch(() => {});
    const locale = user.locale === "es" ? "es" : "ca";
    const mail = resetMail(token, locale);

    // si el correu no està verificat, aprofitem per reenviar la verificació
    let vmail: ReturnType<typeof verifyMail> | null = null;
    if (!user.emailVerifiedAt) {
      const vt = crypto.randomBytes(24).toString("hex");
      await db.emailToken.create({
        data: { userId: user.id, token: hashToken(vt), expiresAt: new Date(Date.now() + 24 * 3600_000) },
      });
      vmail = verifyMail(vt, locale);
    }

    // Enviaments EN BACKGROUND amb after() (vegeu register): sense after(),
    // Vercel congela la funció en respondre i els fetch moren amb TimeoutError
    // sense haver enviat res.
    after(async () => {
      await sendMail({ to: email, subject: mail.subject, html: mail.html, type: "RESET", userId: user.id });
      if (vmail) await sendMail({ to: email, subject: vmail.subject, html: vmail.html, type: "VERIFY", userId: user.id });
    });
  }
  return NextResponse.json({ ok: true });
}
