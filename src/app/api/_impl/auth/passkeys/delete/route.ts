import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";

/**
 * POST /api/auth/passkeys/delete — elimina UNA passkey pròpia.
 * Demana la CONTRASENYA (com la baixa del 2FA): una sessió robada sola no
 * pot treure els factors d'accés del compte.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`pk-del:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").slice(0, 255);
  const password = String(body?.password || "");
  if (!id) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "BAD_PASSWORD", message: "Contrassenya incorrecta." }, { status: 400 });
  }
  const del = await db.passkeyCredential.deleteMany({ where: { id, userId: user.id } });
  if (del.count === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await audit(user.id, "PASSKEY_REMOVED", id, {}).catch(() => {});
  return NextResponse.json({ ok: true });
}
