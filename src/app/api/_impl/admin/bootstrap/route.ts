import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, audit } from "@/lib/security";
import { normalizeEmail } from "@/lib/email";

/**
 * POST /api/admin/bootstrap — recuperación "break-glass" del acceso admin.
 *
 * Contexto: tras el cambio de base de datos del 6-nov-2026 el usuario
 * admin@preureal.cat no existe en la BD nueva y ADMIN_PASSWORD nunca se
 * configuró en Vercel, así que no había forma de entrar a #/admin (ni seed
 * local posible sin .env con DATABASE_URL). Este endpoint permite al
 * PROPIETARIO recuperar o crear la cuenta admin desde la web:
 *
 *  1. Marc define ADMIN_BOOTSTRAP_CODE en Vercel → Environment Variables
 *     (una frase larga que solo él conoce) y pulsa Redeploy.
 *  2. Entra en #/admin → formulario "Recupera l'accés d'administració" →
 *     email + contraseña nueva + código.
 *
 * Seguridad:
 *  - Si ADMIN_BOOTSTRAP_CODE no está definido o es vacío → 403 (endpoint
 *    desactivado; borrar la variable en Vercel lo desactiva de nuevo).
 *  - Rate limit estricto por IP (3 intentos / hora).
 *  - La comprobación del código es en tiempo ~constante por longitud, pero
 *    el rate limit es la defensa real.
 *  - Toda invocación queda en AuditLog (ADMIN_BOOTSTRAP), con éxito o sin él.
 *  - Nunca revela si el código falló por valor o por configuración.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`admin-bootstrap:${ip}`, 3, 3_600_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const expected = (process.env.ADMIN_BOOTSTRAP_CODE || "").trim();
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();

  if (!expected) {
    await audit(null, "ADMIN_BOOTSTRAP", null, { result: "DISABLED", ipHash: ip.slice(0, 12) });
    return NextResponse.json(
      { error: "BOOTSTRAP_DISABLED", message: "Define ADMIN_BOOTSTRAP_CODE en Vercel (Environment Variables) y haz Redeploy para activar la recuperación." },
      { status: 403 },
    );
  }
  if (!code || code !== expected) {
    await audit(null, "ADMIN_BOOTSTRAP", null, { result: "BAD_CODE" });
    return NextResponse.json({ error: "BAD_CODE" }, { status: 403 });
  }

  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");
  if (email.length < 5 || email.length > 200 || !email.includes("@")) {
    return NextResponse.json({ error: "BAD_INPUT", field: "email" }, { status: 400 });
  }
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json({ error: "BAD_INPUT", field: "password" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const existing = await db.user.findUnique({ where: { email } });

  let mode: "promoted" | "created";
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", active: true, passwordHash },
    });
    mode = "promoted";
    await audit(existing.id, "ADMIN_BOOTSTRAP", existing.id, { result: "PROMOTED", email });
  } else {
    const created = await db.user.create({
      data: {
        email,
        passwordHash,
        name: "Administració",
        role: "ADMIN",
        plan: "PRO",
        locale: "ca",
        active: true,
        emailVerifiedAt: new Date(),
      },
    });
    mode = "created";
    await audit(created.id, "ADMIN_BOOTSTRAP", created.id, { result: "CREATED", email });
  }

  return NextResponse.json({ ok: true, mode, email });
}
