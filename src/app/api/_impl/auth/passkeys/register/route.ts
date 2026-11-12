import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { rpContextFrom, readChallengeCookie, clearChallengeCookie, deviceLabel } from "@/lib/webauthn";

/**
 * POST /api/auth/passkeys/register — Pas 2 de l'alta: verifica la resposta
 * del navegador (challenge signat), guarda la credencial (PK = credential ID)
 * i neteja la cookie del challenge. Mai accepta un challenge antic ni un
 * origin fora de l'allowlist.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`pk-reg:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const rp = rpContextFrom(req);
  if (!rp) return NextResponse.json({ error: "BAD_ORIGIN" }, { status: 400 });
  const expectedChallenge = await readChallengeCookie();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "CHALLENGE_EXPIRED", message: "L'alta ha caducat: torna-ho a provar." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.credential) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });

  try {
    const verification = await verifyRegistrationResponse({
      response: body.credential,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: false, // preferred: alguns dispositius no imposen PIN
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "VERIFICATION_FAILED", message: "No s'ha pogut verificar la passkey." }, { status: 400 });
    }
    const info = verification.registrationInfo;
    await db.passkeyCredential.upsert({
      where: { id: info.credential.id },
      create: {
        id: info.credential.id,
        userId: user.id,
        publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
        counter: info.credential.counter,
        transports: info.credential.transports ? JSON.stringify(info.credential.transports) : null,
        deviceType: info.credentialDeviceType,
        backedUp: Boolean(info.credentialBackedUp),
        label: deviceLabel(req),
      },
      update: {
        userId: user.id,
        publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
        counter: info.credential.counter,
      },
    });
    await clearChallengeCookie();
    await audit(user.id, "PASSKEY_ADDED", info.credential.id, {}).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await clearChallengeCookie();
    console.error("passkeys/register", e?.message || e);
    return NextResponse.json({ error: "VERIFICATION_FAILED", message: "No s'ha pogut verificar la passkey (origin o challenge no vàlid)." }, { status: 400 });
  }
}
