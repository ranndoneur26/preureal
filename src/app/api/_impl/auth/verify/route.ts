import { NextResponse } from "next/server";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { verifyMail, sendMail } from "@/lib/mail";

/** GET /api/auth/verify?token=... — marca el correu com a verificat. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").slice(0, 100);
  const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  const et = await db.emailToken.findUnique({ where: { token } });
  if (!et || et.used || et.expiresAt < new Date()) {
    return NextResponse.redirect(`${base}/#/panell?verificacio=invalid`);
  }
  await db.$transaction([
    db.emailToken.update({ where: { id: et.id }, data: { used: true } }),
    db.user.update({ where: { id: et.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return NextResponse.redirect(`${base}/#/panell?verificacio=ok`);
}

/** POST /api/auth/verify — reenvia el correu de verificació (usuari amb sessió). */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`verify:${ip}`, 3, 300_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const token = crypto.randomBytes(24).toString("hex");
  await db.emailToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 24 * 3600_000) },
  });
  const locale = user.locale === "es" ? "es" : "ca";
  const mail = verifyMail(token, locale);
  sendMail({ to: user.email, subject: mail.subject, html: mail.html }).catch(() => {});
  return NextResponse.json({ ok: true });
}
