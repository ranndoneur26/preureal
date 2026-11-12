import { NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { generateRecoveryCodes } from "@/lib/totp";

/**
 * POST /api/auth/2fa/recovery — regenera els codis de recuperació (els
 * anteriors moren). Exigeix la contrasenya: si un atacant tingués la sessió
 * oberta i pogués regenerar codis, els tindria ell — la contrasenya evita-ho.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`2fa-recovery:${user.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const password = String((body as any)?.password || "");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "BAD_PASSWORD", message: "Contrassenya incorrecta." }, { status: 400 });
  }
  if (!user.totpEnabled) {
    return NextResponse.json({ error: "NOT_ENABLED" }, { status: 400 });
  }
  const plain = generateRecoveryCodes(10);
  const hashes: string[] = [];
  for (const c of plain) hashes.push(await bcrypt.hash(c, 10));
  await db.user.update({
    where: { id: user.id },
    data: { totpRecoveryCodes: JSON.stringify(hashes) },
  });
  return NextResponse.json({ ok: true, recoveryCodes: plain });
}
