import { NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { decryptTotpSecret, verifyTotp, generateRecoveryCodes } from "@/lib/totp";

/**
 * POST /api/auth/2fa/enable — Pas 2 de l'alta: verifica el codi de 6 dígits
 * de l'app d'autenticació i ACTIVA el 2FA. Genera 10 codis de recuperació
 * d'un sol ús (hash bcrypt a la BD; els valors en clar es tornen UNA vegada).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ error: "ALREADY_ENABLED" }, { status: 409 });
  }
  const rl = await rateLimit(`2fa-enable:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const code = String((body as any)?.code || "");
  const secret = decryptTotpSecret(user.totpSecret);
  if (!secret) {
    return NextResponse.json({ error: "NO_SETUP", message: "Primer genera el codi QR (pas 1)." }, { status: 400 });
  }
  if (!verifyTotp(secret, code)) {
    return NextResponse.json({ error: "BAD_CODE", message: "El codi no és vàlid. Comprova l'hora del telèfon i torna-ho a provar." }, { status: 400 });
  }

  // activa el 2FA + genera codis de recuperació (hash bcrypt de cadascun)
  const plain = generateRecoveryCodes(10);
  const hashes: string[] = [];
  for (const c of plain) hashes.push(await bcrypt.hash(c, 10));
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpRecoveryCodes: JSON.stringify(hashes) },
  });
  await audit(user.id, "2FA_ENABLED", user.id, {}).catch(() => {});
  return NextResponse.json({ ok: true, recoveryCodes: plain });
}
