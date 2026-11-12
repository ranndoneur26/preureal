import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";

/**
 * POST /api/auth/2fa/disable — desactiva el 2FA. Exigeix la CONTRASENYA
 * (mai només un codi TOTP: qui tingui el telèfon robat no ha de poder fer-ho).
 * No incrementa tokenVersion (no cal revocar sessions: la sessió vigent era
 * legítima), però queda auditat.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`2fa-disable:${user.id}`, 5, 60_000);
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
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpRecoveryCodes: null },
  });
  await audit(user.id, "2FA_DISABLED", user.id, {}).catch(() => {});
  return NextResponse.json({ ok: true });
}
