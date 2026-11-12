import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { createSessionFor } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { rpContextFrom, readChallengeCookie, clearChallengeCookie } from "@/lib/webauthn";

/**
 * POST /api/auth/passkeys/auth-verify — login amb passkey.
 * Verifica el challenge signat contra la credencial GUARDADA a la BD
 * (anti-clonatge: si el comptador del dispositiu no avança, es rebutja i
 * es desactiva la credencial sospitosa). Al verificar: sessió de 30 dies
 * amb la MATEIXA política que un login amb contrasenya.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`pk-verify:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const rp = rpContextFrom(req);
  if (!rp) return NextResponse.json({ error: "BAD_ORIGIN" }, { status: 400 });
  const expectedChallenge = await readChallengeCookie();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "CHALLENGE_EXPIRED", message: "La verificació ha caducat: torna-ho a provar." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.credential) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });

  // el client ens dona el credential ID: el BUSQUEM a la BD (mai confiem el PK)
  const credId = String(body.credential?.id || "");
  const cred = await db.passkeyCredential.findUnique({ where: { id: credId } });
  const genericFail = { error: "BAD_CREDENTIALS" };
  if (!cred) {
    await clearChallengeCookie();
    return NextResponse.json(genericFail, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: cred.userId } });
  if (!user || !user.active) {
    await clearChallengeCookie();
    return NextResponse.json(genericFail, { status: 401 });
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: body.credential,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: cred.id,
        publicKey: Buffer.from(cred.publicKey, "base64url"),
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
      requireUserVerification: false,
    });
    if (!verification.verified) {
      await clearChallengeCookie();
      return NextResponse.json(genericFail, { status: 401 });
    }
    const info = verification.authenticationInfo;
    // anti-clonatge: el comptador només pot avanear (o ser 0 en authentism sense comptador)
    if (info.newCounter <= cred.counter && info.newCounter !== 0) {
      await db.passkeyCredential.delete({ where: { id: cred.id } }).catch(() => {});
      await clearChallengeCookie();
      return NextResponse.json(genericFail, { status: 401 });
    }
    await db.passkeyCredential.update({
      where: { id: cred.id },
      data: {
        counter: info.newCounter,
        backedUp: Boolean(info.credentialBackedUp),
        deviceType: info.credentialDeviceType,
        lastUsedAt: new Date(),
      },
    });
    await clearChallengeCookie();
    await createSessionFor(user);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await db.event.create({ data: { type: "LOGIN", userId: user.id, meta: "PASSKEY" } }).catch(() => {});
    return NextResponse.json({
      ok: true,
      emailVerified: Boolean(user.emailVerifiedAt),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan, locale: user.locale },
    });
  } catch (e: any) {
    await clearChallengeCookie();
    console.error("passkeys/auth-verify", e?.message || e);
    return NextResponse.json(genericFail, { status: 401 });
  }
}
