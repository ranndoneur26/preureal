import { NextResponse, after } from "next/server";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { normalizeEmail } from "@/lib/email";
import { hashToken } from "@/lib/token-hash";
import { safeInternalRoute } from "@/lib/email-first";
import { magicMail, sendMail } from "@/lib/mail";

// L'enviament va EN BACKGROUND amb after(): Vercel reserva el temps total per
// a la invocació (mateix patró que register/verify — sense after(), la promesa
// flotant es congela en tornar la resposta i el correu mai arriba).
export const maxDuration = 60;

/**
 * v46 — POST /api/auth/magic-link: enllaç d'entrada d'un sol ús (15 min).
 *
 * Cas de la taula de decisió «E-mail registrat + sense sessió»: NO es demana
 * contrasenya al formulari públic de la Home (mai) — s'envia un ENLLAÇ al
 * correu; en obrir-lo, la SPA consumeix el token via POST i crea la sessió
 * (anti-suplantació: només qui rep el correu entra).
 *
 * Anti-enumeració: la resposta és { sent: true } SEMPRE, hi hagi o no compte.
 * Un atacant no pot distingir «compte existeix» per aquesta ruta; el booleà
 * d'existència només surt de /api/email-status (exigit per l'encàrrec).
 * Comptes INACTIUS (bans/RGPD) no reben enllaç — mateix comportament que el
 * login (BAD_CREDENTIALS), silenciós aquí.
 *
 * Tokens: 192 bits d'entropia; a la BD NOMÉS el hash sha256 (P0 v19); un nou
 * enllaç ANUL·LA els anteriors pendents (mateixa semàntica que la verificació
 * de correu: fes servir sempre l'últim). `returnTo` revalidada contra
 * l'allowlist del flux email-first (mai open redirect).
 */

const TOKEN_TTL_MS = 15 * 60_000;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`magic-link:${ip}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const email = normalizeEmail(String(body?.email || ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "EMAIL_INVALID" }, { status: 400 });
  }
  const returnTo = safeInternalRoute(String(body?.return || ""));
  const locale = body?.locale === "es" ? "es" : "ca";

  const user = await db.user.findUnique({ where: { email } });
  if (user && user.active) {
    // un enllaç nou anul·la els pendents anteriors (primer els marca usats,
    // DESPRÉS crea el nou — així el nou mai queda marcat pel seu propi pass)
    await db.magicToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });
    const token = crypto.randomBytes(24).toString("hex");
    await db.magicToken.create({
      data: {
        userId: user.id,
        token: hashToken(token),
        returnTo,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    await db.event
      .create({ data: { type: "MAGIC_LINK", userId: user.id } })
      .catch(() => {});

    after(async () => {
      const mail = magicMail(token, locale);
      await sendMail({
        to: email,
        subject: mail.subject,
        html: mail.html,
        type: "MAGIC_LINK",
        userId: user.id,
      });
    });
  }

  // resposta idèntica en tots els casos (anti-enumeració)
  return NextResponse.json({ sent: true });
}
