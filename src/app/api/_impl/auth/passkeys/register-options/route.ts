import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { rpContextFrom, setChallengeCookie } from "@/lib/webauthn";

/**
 * POST /api/auth/passkeys/register-options — Pas 1 de l'alta d'una passkey:
 * genera les opcions WebAuthn i posa el CHALLENGE en una cookie httpOnly de
 * 5 min (stateless en serverless). excludeCredentials evita registrar el
 * MATEIX autenticador dues vegades.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`pk-setup:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const rp = rpContextFrom(req);
  if (!rp) return NextResponse.json({ error: "BAD_ORIGIN" }, { status: 400 });

  const existing = await db.passkeyCredential.findMany({
    where: { userId: user.id },
    select: { id: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  await setChallengeCookie(options.challenge);
  return NextResponse.json({ options });
}
