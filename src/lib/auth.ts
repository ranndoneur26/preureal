import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-secret-cambia-esto"
);
const COOKIE = "pr_session";

export interface SessionPayload {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
  plan: "FREE" | "PREMIUM" | "PRO";
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
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

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      role: payload.role === "ADMIN" ? "ADMIN" : "USER",
      plan:
        payload.plan === "PREMIUM" || payload.plan === "PRO"
          ? payload.plan
          : "FREE",
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const s = await requireUser();
  if (s.role !== "ADMIN") throw new Error("FORBIDDEN");
  return s;
}

export async function refreshSessionPayload() {
  const s = await getSession();
  if (!s) return;
  const user = await db.user.findUnique({ where: { id: s.userId } });
  if (user) {
    await createSession({
      userId: user.id,
      email: user.email,
      role: user.role === "ADMIN" ? "ADMIN" : "USER",
      plan: (user.plan as SessionPayload["plan"]) || "FREE",
    });
  }
}
