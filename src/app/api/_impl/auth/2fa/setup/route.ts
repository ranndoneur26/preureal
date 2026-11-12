import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { generateTotpSecret, encryptTotpSecret, otpauthUri } from "@/lib/totp";

/**
 * POST /api/auth/2fa/setup — Pas 1 de l'alta TOTP: genera un secret nou,
 * el guarda CIFRAT (totpEnabled continua false fins al verify) i torna la
 * URI otpauth:// per pintar el QR al client. Si ja hi ha un pendent, es
 * substitueix (mai es desactiva un 2FA ja actiu des d'aquí).
 */
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ error: "ALREADY_ENABLED" }, { status: 409 });
  }
  const rl = await rateLimit(`2fa-setup:${user.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptTotpSecret(secret), totpEnabled: false },
  });
  return NextResponse.json({
    ok: true,
    uri: otpauthUri(user.email, secret),
    // el secret en clar només surt aquí, UNA vegada, per alta manual al client
    secret,
  });
}
