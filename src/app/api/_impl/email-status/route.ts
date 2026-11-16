import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { normalizeEmail } from "@/lib/email";

/**
 * v46 — POST /api/email-status: comprovació d'e-mail del flux email-first.
 *
 * Endpoint PÚBLIC i rate-limitat (5 req/min per IP). Resposta MÍNIMA:
 * { registered: boolean } — mai noms, mai pla, mai cap altra dada del compte
 * (anti-enumeració: l'única informació que fuita és el booleà exigit per la
 * taula de decisió de l'encàrrec). L'e-mail arriba normalitzat amb la mateixa
 * funció que el registre i el login (aliases de Gmail col·lapsats), perquè la
 * comprovació coincideixi SEMPRE amb la taula d'usuaris (e-mail únic).
 *
 * Aquest endpoint NO calcula res ni escriu res a la BD (llegida puntual per
 * clau única).
 */

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`email-status:${ip}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const email = normalizeEmail(String(body?.email || ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "EMAIL_INVALID" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  // NOMÉS aquest camp: cap nom, cap pla, cap estat del compte
  return NextResponse.json({ registered: user !== null });
}
