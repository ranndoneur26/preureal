import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createSessionFor, hashPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, sanitizeName } from "@/lib/security";
import { welcomeMail, verifyMail, sendMail } from "@/lib/mail";
import { getPlanSettings } from "@/lib/plans";
import { hashToken } from "@/lib/token-hash";
import { normalizeEmail } from "@/lib/email";
import * as crypto from "crypto";

// Els correus s'envien EN BACKGROUND amb after(): Vercel reserva aquest temps
// total per a la invocació (resposta + treball en segon pla). Ignorat fora de Vercel.
export const maxDuration = 60;

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
  // P1.6: cursa entre registres simultanis del mateix correu — la comprovació
  // prèvia (findUnique) pot passar en dues peticions alhora; la restricció
  // UNIQUE de la BD decideix i aquí es tradueix a 409, MAI a un 500.
  let user;
  try {
    user = await db.user.create({
      data: { email, passwordHash, name, locale, role: "USER", plan: "FREE" },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }
    throw e;
  }

  await createSessionFor(user);
  await db.event
    .create({ data: { type: "SIGNUP", userId: user.id, meta: JSON.stringify({ locale }) } })
    .catch(() => {});

  // correu de verificació (Fase 6) — no bloqueja l'ús del compte
  // P0 v19: a la BD només el HASH del token; el token cru només viatja al correu
  const token = crypto.randomBytes(24).toString("hex");
  await db.emailToken.create({
    data: { userId: user.id, token: hashToken(token), expiresAt: new Date(Date.now() + 24 * 3600_000) },
  });

  // BENVINGUDA + VERIFICACIÓ van EN BACKGROUND amb after(): Vercel manté la
  // funció viva fins que els enviaments acaben. Sense after(), la promesa
  // flotant es congela en tornar la resposta, el fetch mor amb
  // «TimeoutError [23]» i el correu de verificació MAI arriba (cas real v17:
  // l'usuari quedava encerclat al bloqueig «Verifica tu correo» del mapa).
  // v21: EN PARAL·LEL (Promise.allSettled) — abans anaven en sèrie i si el
  // primer consumia el temps reservat (maxDuration 60), el segon no sortia.
  after(async () => {
    // v23 — preu eficaç de la configuració de plans (mai hardcodejat)
    const planSettings = await getPlanSettings();
    const mail = welcomeMail(name, locale, planSettings.PREMIUM.priceEur);
    const vmail = verifyMail(token, locale);
    await Promise.allSettled([
      sendMail({ to: email, subject: mail.subject, html: mail.html, type: "WELCOME", userId: user.id }),
      sendMail({ to: email, subject: vmail.subject, html: vmail.html, type: "VERIFY", userId: user.id }),
    ]);
  });

  return NextResponse.json({
    ok: true,
    verificationSent: true, // Fase 1: la UI mostra «Revisa el teu correu»
    user: { id: user.id, email, name, plan: "FREE" },
  });
}
