import { NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionFor, verifyTotpChallenge } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { decryptTotpSecret, verifyTotp, normalizeRecoveryCode } from "@/lib/totp";

/**
 * POST /api/auth/2fa/verify — SEGON PAS del login amb 2FA.
 * Entrada: { challenge, code } (codi TOTP de 6 dígits) o
 * { challenge, recoveryCode } (codi de recuperació d'un sol ús).
 * El challenge és el JWT curt de 5 min que va tornar /api/auth/login quan
 * l'usuari té 2FA actiu (mai una sessió). Al verificar-lo es crea la sessió
 * real de 30 dies — mateixa política que un login normal.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`2fa-verify:${ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const challenge = String((body as any)?.challenge || "");
  const ch = await verifyTotpChallenge(challenge);
  if (!ch) {
    return NextResponse.json({ error: "CHALLENGE_EXPIRED", message: "La verificació ha caducat: torna a entrar." }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: ch.userId } });
  if (!user || !user.active || !user.totpEnabled || user.tokenVersion !== ch.tv) {
    return NextResponse.json({ error: "CHALLENGE_EXPIRED", message: "La verificació ha caducat: torna a entrar." }, { status: 401 });
  }

  const secret = decryptTotpSecret(user.totpSecret);
  if (!secret) {
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }

  // Opció A: codi TOTP de 6 dígits
  const code = String((body as any)?.code || "");
  if (code && verifyTotp(secret, code)) {
    await createSessionFor(user);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await db.event.create({ data: { type: "LOGIN", userId: user.id, meta: "2FA" } }).catch(() => {});
    return NextResponse.json({
      ok: true,
      emailVerified: Boolean(user.emailVerifiedAt),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan, locale: user.locale },
    });
  }

  // Opció B: codi de recuperació d'un sol ús (es CONSUMEIX: es treu del JSON)
  const recoveryCode = normalizeRecoveryCode(String((body as any)?.recoveryCode || ""));
  if (recoveryCode) {
    let hashes: string[] = [];
    try {
      const parsed = JSON.parse(user.totpRecoveryCodes || "[]");
      if (Array.isArray(parsed)) hashes = parsed.map(String);
    } catch {
      /* JSON corrupt: tracta com sense codis */
    }
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(recoveryCode, hashes[i])) {
        const rest = hashes.filter((_, j) => j !== i);
        await db.user.update({
          where: { id: user.id },
          data: { totpRecoveryCodes: JSON.stringify(rest) },
        });
        await createSessionFor(user);
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await db.event.create({ data: { type: "LOGIN", userId: user.id, meta: "2FA_RECOVERY" } }).catch(() => {});
        return NextResponse.json({
          ok: true,
          emailVerified: Boolean(user.emailVerifiedAt),
          recoveryCodesLeft: rest.length,
          user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan, locale: user.locale },
        });
      }
    }
    // bcrypt.compare de 10 codis quan cap coincideix: resposta igualment ràpida suficient
  }

  return NextResponse.json({ error: "BAD_CODE", message: "Codi incorrecte. Torna-ho a provar o fes servir un codi de recuperació." }, { status: 400 });
}
