import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * Sessions de PreuReal.cat.
 *
 * JWT signat (HS256) dins d'una cookie httpOnly + SameSite=Lax + Secure en
 * producció. Millores de seguretat (BLOC A):
 *  - AUTH_SECRET és OBLIGATORI en producció: si falta, falla al PRIMER ÚS en
 *    runtime (mai durant el build — vegeu getSecretKey()).
 *  - El JWT incorpora `tv` (tokenVersion): canviar contrasenya o desactivar
 *    un usuari incrementa el comptador i revoca TOTES les sessions actives.
 *  - requireUser() verifica contra la BD (usuari existent, actiu, versió de
 *    token vigent) i retorna el rol/pla FRESCOS, no els del JWT.
 */

const COOKIE = "pr_session";
const encoder = new TextEncoder();

/**
 * Secret LAZY: s'avalua al primer ús en runtime i es cacheja.
 *
 * Per què no a nivell de mòdul: `next build` importa els mòduls de ruta per
 * recollir la seva configuració ("collect page data"). Una validació amb
 * throw a l'arrel del mòdul faria fallir el BUILD sencer encara que les
 * variables d'entorn estiguin (o no) ben configurades per al runtime —
 * exactament el que va passar a Vercel ("Failed to collect page data for
 * /api/[[...path]]"). Amb aquesta versió, el build mai depèn de AUTH_SECRET.
 */
let cachedSecretKey: Uint8Array | null = null;
function getSecretKey(): Uint8Array {
  if (cachedSecretKey) return cachedSecretKey;
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
      throw new Error(
        "AUTH_SECRET és obligatori en producció — configura'l a Vercel → " +
          "Settings → Environment Variables (valor: openssl rand -hex 32)",
      );
    }
    // desenvolupament: secret local amb avís
    console.warn("[auth] AUTH_SECRET no definit — s'usa un secret local de desenvolupament");
    cachedSecretKey = encoder.encode("dev-secret-preureal-local");
    return cachedSecretKey;
  }
  cachedSecretKey = encoder.encode(s);
  return cachedSecretKey;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
  plan: "FREE" | "PREMIUM" | "PRO";
  tv: number; // tokenVersion per revocació
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function sessionPayloadFor(user: User): SessionPayload {
  return {
    userId: user.id,
    email: user.email,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    plan: (user.plan === "PREMIUM" || user.plan === "PRO" ? user.plan : "FREE"),
    tv: user.tokenVersion,
  };
}

export async function createSessionFor(user: User) {
  return createSession(sessionPayloadFor(user));
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Incrementa tokenVersion → totes les sessions anteriors queden invàlides. */
export async function revokeSessions(userId: string) {
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}

async function decodeToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      role: payload.role === "ADMIN" ? "ADMIN" : "USER",
      plan: payload.plan === "PREMIUM" || payload.plan === "PRO" ? payload.plan : "FREE",
      tv: Number(payload.tv || 0),
    };
  } catch {
    return null;
  }
}

/**
 * Sessió "ràpida" (només JWT, sense BD). Ús LEGÍTIM: routes on només cal saber
 * si hi ha sessió per elegir teaser vs registre — mai per autoritzar res.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return decodeToken(token);
}

/**
 * Autoritat de sessió: verifica el JWT I l'usuari a la BD (existeix, actiu,
 * tokenVersion vigent). Retorna el pla/rol FRESCOS de la BD.
 * Llança "UNAUTHENTICATED" / "FORBIDDEN" / "INACTIVE".
 */
export async function requireUser(): Promise<User> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) throw new Error("UNAUTHENTICATED");
  const s = await decodeToken(token);
  if (!s) throw new Error("UNAUTHENTICATED");
  const user = await db.user.findUnique({ where: { id: s.userId } });
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!user.active) throw new Error("INACTIVE");
  if (user.tokenVersion !== s.tv) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

/** Alternativa no-llançadora per a routes que volen resposta controlada. */
export async function getAuthUser(): Promise<User | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}
