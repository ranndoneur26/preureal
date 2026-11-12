import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

/**
 * Passkeys (WebAuthn) — v37.1: resolución de RP ID / origin.
 *
 * Las passkeys quedan LIGADAS al dominio donde se registran (es una
 * propiedad de WebAuthn, no de nuestro código): el RP ID se deriva del
 * Host real de la petición (validado contra una allowlist), así funcionan
 * tanto en preureal.vercel.app (pruebas) como en www.preureal.com
 * (producción) — cada uno con sus propias credenciales.
 *
 * El CHALLENGE viaja en una cookie httpOnly de 5 minutos (stateless y
 * segura en serverless: no hay memoria compartida entre invocaciones).
 */

const ALLOWED_HOSTS = [
  "www.preureal.com",
  "preureal.com",
  "preureal.vercel.app",
  "localhost",
];

const COOKIE = "pr_webauthn_challenge";

export interface RpContext {
  rpID: string;
  rpName: string;
  origin: string;
}

/** Deriva RP ID/origin del host real de la petición (allowlist, mai llança). */
export function rpContextFrom(req: NextRequest): RpContext | null {
  try {
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(":")[0].toLowerCase();
    if (!host || !ALLOWED_HOSTS.includes(host)) return null;
    const proto = req.headers.get("x-forwarded-proto") || (host === "localhost" ? "http" : "https");
    return { rpID: host, rpName: "Preureal", origin: `${proto}://${host}` };
  } catch {
    return null;
  }
}

export async function setChallengeCookie(challenge: string) {
  const jar = await cookies();
  jar.set(COOKIE, challenge, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 5 * 60,
    path: "/",
  });
}

export async function readChallengeCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

export async function clearChallengeCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Etiqueta amigable del dispositivo a partir del user-agent (best effort). */
export function deviceLabel(req: NextRequest): string {
  const ua = req.headers.get("user-agent") || "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Dispositiu";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${os} · ${br}`;
}
