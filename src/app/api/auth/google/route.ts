import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as crypto from "crypto";
import { rateLimit } from "@/lib/analytics";
import { googleAuthUrl, googleOAuthEnabled, GOOGLE_STATE_COOKIE, publicOrigin } from "@/lib/google";

/**
 * GET /api/auth/google — inicia el flux OAuth: redirigeix a la pantalla de
 * consentiment de Google amb un estat CSRF (cookie httpOnly, 10 min).
 * Si no hi ha credencials configurades, torna a l'entrada amb error GOOGLE_OFF.
 */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  rateLimit(`google:${ip}`, 10, 60_000);

  const base = publicOrigin(req);
  if (!googleOAuthEnabled()) {
    return NextResponse.redirect(`${base}/#/entrada?error=GOOGLE_OFF`);
  }

  const state = crypto.randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(googleAuthUrl(req, state));
}
