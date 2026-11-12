import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { normalizeEmail } from "@/lib/email";
import { rpContextFrom, setChallengeCookie } from "@/lib/webauthn";

/**
 * POST /api/auth/passkeys/auth-options — opcions d'INICI DE SESSIÓ amb passkey.
 * {email} opcional: si el compte té passkeys, es restringeixen (allowCredentials);
 * si no existeix o no en té, es tornen opcions "descobribles" IGUALMENT
 * (anti-enumeració: mai es revela si el compte existeix). El verificat real
 * és al auth-verify contra la BD.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`pk-auth:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const rp = rpContextFrom(req);
  if (!rp) return NextResponse.json({ error: "BAD_ORIGIN" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const email = body?.email ? normalizeEmail(String(body.email)) : null;

  let allowCredentials: Array<{ id: string; transports?: string[] }> | undefined = undefined;
  if (email) {
    const user = await db.user.findUnique({
      where: { email },
      select: { passkeys: { select: { id: true, transports: true } } },
    });
    if (user && user.passkeys.length > 0) {
      allowCredentials = user.passkeys.map((c) => ({
        id: c.id,
        transports: c.transports ? JSON.parse(c.transports) : undefined,
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "preferred",
    ...(allowCredentials ? { allowCredentials } : {}),
  });
  await setChallengeCookie(options.challenge);
  return NextResponse.json({ options });
}
