/**
 * Google OAuth 2.0 (flux "authorization code" per a apps web confidencials).
 *
 * Es reutilitza el sistema de sessions propi (JWT a cookie, src/lib/auth.ts):
 * el callback fa find-or-create de l'usuari i crida createSession().
 *
 * Configuració (Google Cloud Console — veure DEPLOY.md §8):
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   Redirect URI autoritzada: {NEXT_PUBLIC_SITE_URL}/api/auth/google/callback
 *
 * Sense credencials el flux queda desactivat i la UI amaga el botó
 * (vegeu /api/auth/google/status).
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_STATE_COOKIE = "pr_gstate";

export function googleOAuthEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Base pública de la web (darrere d'un proxy, millor la variable d'entorn). */
export function publicOrigin(req: Request): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return new URL(req.url).origin;
}

export function googleRedirectUri(req: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return `${publicOrigin(req)}/api/auth/google/callback`;
}

export function googleAuthUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    // deixa triar compte cada vegada (útil amb més d'un Gmail)
    prompt: "select_account",
    access_type: "online",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/** Intercanvia el ?code per un token i demana el perfil (openid userinfo). */
export async function googleExchange(req: Request, code: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: googleRedirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token_exchange_${res.status}`);
  const tokens = (await res.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("no_access_token");

  const profRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profRes.ok) throw new Error(`userinfo_${profRes.status}`);
  return (await profRes.json()) as GoogleProfile;
}
