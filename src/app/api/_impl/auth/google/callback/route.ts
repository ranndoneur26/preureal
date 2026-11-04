import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { normalizeEmail } from "@/lib/email";
import { sendMail, welcomeMail } from "@/lib/mail";
import {
  googleExchange,
  googleOAuthEnabled,
  GOOGLE_STATE_COOKIE,
  publicOrigin,
} from "@/lib/google";

// El correu de benvinguda va EN BACKGROUND amb after() (ignorat fora de Vercel).
export const maxDuration = 60;

/**
 * GET /api/auth/google/callback — finalitza el flux OAuth de Google.
 *
 *  1. valida l'estat CSRF (cookie vs ?state)
 *  2. intercanvia ?code → access_token → perfil openid (email, nom)
 *  3. exigeix email_verified=true (protecció contra segrest de compte)
 *  4. find-or-create: si el correu ja existeix entra al compte; si no, el crea
 *     amb una contrasenya aleatòria inutilitzable (només es pot entrar amb Google)
 *  5. crea la sessió JWT pròpia (mateixa cookie que el login amb contrasenya)
 *
 * Tots els errors tornen a /#/entrada?error=GOOGLE_* (text a i18n).
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  await rateLimit(`googlecb:${ip}`, 20, 60_000);

  const base = publicOrigin(req);
  const toError = (code: string) => NextResponse.redirect(`${base}/#/entrada?error=${code}`);

  if (!googleOAuthEnabled()) return toError("GOOGLE_OFF");

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return toError("GOOGLE_DENIED");
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return toError("GOOGLE_FAILED");

  const jar = await cookies();
  const expected = jar.get(GOOGLE_STATE_COOKIE)?.value || "";
  jar.set(GOOGLE_STATE_COOKIE, "", { maxAge: 0, path: "/" }); // un sol ús
  if (!expected || expected !== state) return toError("GOOGLE_STATE");

  let profile;
  try {
    profile = await googleExchange(req, code);
  } catch {
    return toError("GOOGLE_FAILED");
  }

  if (!profile.email || profile.email_verified !== true) {
    // sense correu verificat per Google no podem vincular amb seguretat
    return toError("GOOGLE_UNVERIFIED");
  }
  const email = normalizeEmail(profile.email);

  let user = await db.user.findUnique({ where: { email } });
  if (user) {
    // Google només entrega correus verificats (email_verified=true s'exigeix
    // més amunt): si el compte local no constava com a verificat, es queda
    // verificat ara — mateixa garantia, sense correu de verificació extra.
    if (!user.emailVerifiedAt) {
      await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }
    await db.event.create({ data: { type: "LOGIN_GOOGLE", userId: user.id } }).catch(() => {});
  } else {
    // contrasenya aleatòria: el compte només es pot obrir amb Google
    // (l'usuari sempre pot afegir-hi contrasenya amb el restabliment de contrasenya)
    const randomPw = cryptoRandomHex();
    user = await db.user.create({
      data: {
        email,
        passwordHash: await hashPassword(randomPw),
        name: profile.name ? String(profile.name).slice(0, 80) : null,
        locale: "ca",
        role: "USER",
        plan: "FREE",
        emailVerifiedAt: new Date(), // verificat per Google (email_verified=true)
      },
    });
    await db.event.create({ data: { type: "SIGNUP_GOOGLE", userId: user.id } }).catch(() => {});
    const mail = welcomeMail(user.name, user.locale === "es" ? "es" : "ca");
    // after(): sense això la promesa flotant es congela en respondre (i a més
    // era una promesa sense catch: rejoecció no gestionada).
    after(async () => {
      await sendMail({ to: email, subject: mail.subject, html: mail.html });
    });
  }

  await createSession({
    userId: user.id,
    email: user.email,
    tv: user.tokenVersion,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    plan: (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE",
  });

  return NextResponse.redirect(`${base}/#/mapa`);
}

function cryptoRandomHex(): string {
  // 24 bytes → 48 hex; impossibilitat pràctica d'endevinar-la
  return crypto.randomBytes(24).toString("hex");
}
