import { NextResponse } from "next/server";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { verifyMail, sendMail } from "@/lib/mail";

/** GET /api/auth/verify?token=... — marca el correu com a verificat.
 *  Estats diferenciats (Fase 1): ok | ja_usat | caducat | invalid — la UI mostra
 *  el missatge específic i, en caducat, oferir demanar un token nou.
 *
 *  Dues maneres de resposta:
 *   - ?resposta=json → JSON { estat } (el fa servir la vista /#/verifica de la SPA)
 *   - sense → redirecció a /#/panell?verificacio=... (comportament original)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").slice(0, 100);
  const json = url.searchParams.get("resposta") === "json";
  // base segura per a la redirecció: env validada (mai llança) o origen de la
  // pròpia petició — evita redireccions malformades si l'env està mal escrita
  const base = pickBase() || url.origin;

  const et = await db.emailToken.findUnique({ where: { token } });
  if (!et) return finish(json, base, "invalid");
  if (et.used) {
    // missatge específic quan l'enllaç ja s'ha utilitzat
    return finish(json, base, "ja_usat");
  }
  if (et.expiresAt < new Date()) {
    // caducat (24 h): es pot demanar un token nou sense tornar-se a registrar
    return finish(json, base, "caducat");
  }
  const user = await db.user.findUnique({ where: { id: et.userId } });
  if (!user || !user.active) {
    return finish(json, base, "invalid");
  }

  await db.$transaction([
    db.emailToken.update({ where: { id: et.id }, data: { used: true } }),
    // un sol ús lògic: qualsevol altre enllaç pendent del compte queda anul·lat
    db.emailToken.updateMany({
      where: { userId: et.userId, used: false, id: { not: et.id } },
      data: { used: true },
    }),
    db.user.update({ where: { id: et.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  await db.event.create({ data: { type: "EMAIL_VERIFIED", userId: et.userId } }).catch(() => {});
  return finish(json, base, "ok");
}

function pickBase(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.hostname.includes(".") && !/\s/.test(u.hostname)) return u.origin;
  } catch {
    /* env mal escrit: cap a l'origen de la petició */
  }
  return null;
}

function finish(json: boolean, base: string, estat: string) {
  if (json) return NextResponse.json({ estat });
  return NextResponse.redirect(`${base}/#/panell?verificacio=${estat}`);
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
