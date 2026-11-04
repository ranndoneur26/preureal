import { NextResponse } from "next/server";
import * as crypto from "crypto";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { verifyMail, sendMail } from "@/lib/mail";

/**
 * P1.2 — La verificació del correu MAI muta dades en un GET.
 *
 * Els escàners d'enllaços (antispam, previews de missatgeria, antivirus de
 * correu...) visiten les URL del correu sense cap acció humana: si el GET
 * consumís el token, l'enllaç podria quedar «devorat» abans que l'usuari hi
 * hagi clicat de veritat. Per això el flux queda així:
 *
 *  GET  /api/auth/verify?token=...&resposta=json
 *       → NOMÉS CONSULTA l'estat del token i el retorna: pendent | ja_usat |
 *         caducat | invalid. Cap efecte secundari.
 *  GET  /api/auth/verify?token=...   (sense resposta=json)
 *       → redirigeix a la vista /#/verifica?token=... (la SPA fa el POST).
 *  POST /api/auth/verify { token }
 *       → CONFIRMACIÓ EXPLÍCITA: l'únic camí que consumeix el token i marca
 *         emailVerifiedAt. L'initia la pròpia vista quan l'usuari obre la
 *         pàgina (un escàner fa GET, no executa la SPA ni fa POST).
 *  POST /api/auth/verify  (sense token)
 *       → reenviament del correu de verificació (usuari amb sessió).
 *
 * Estats (Fase 1): ok | ja_usat | caducat | invalid | pendent — la UI mostra
 * el missatge específic i, en caducat, ofereix demanar un token nou.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").slice(0, 100);
  const json = url.searchParams.get("resposta") === "json";
  // base segura per a la redirecció: env validada (mai llança) o origen de la
  // pròpia petició — evita redireccions malformades si l'env està mal escrita
  const base = pickBase() || url.origin;

  const te = await tokenEstat(token); // lectura pura, sense mutacions
  if (json) return NextResponse.json(te);
  return NextResponse.redirect(`${base}/#/verifica?token=${encodeURIComponent(token)}`);
}

/**
 * Estat d'un token de verificació + estat REAL del compte — LECTURA PURA (P1.2).
 *
 * `used: true` pot significar DUES coses: (a) verificació completada amb aquest
 * token o (b) enllaç ANUL·LAT perquè després es va demanar un de nou (la
 * confirmació correcta marca tots els altres tokens pendents com a usats).
 * Sense el flag `verified`, la UI no pot distingir (a) de (b) i pot dir a
 * l'usuari «ja està verificat, no cal fer res més» quan en realitat NO ho està
 * — i l'usuari queda encerclat al bloqueig del mapa (cas real vist en producció).
 */
async function tokenEstat(token: string): Promise<{ estat: string; verified: boolean | null }> {
  if (!token) return { estat: "invalid", verified: null };
  const et = await db.emailToken.findUnique({ where: { token } });
  if (!et) return { estat: "invalid", verified: null };
  const user = await db.user.findUnique({
    where: { id: et.userId },
    select: { active: true, emailVerifiedAt: true },
  });
  const verified = Boolean(user?.emailVerifiedAt);
  if (et.used) return { estat: "ja_usat", verified };
  if (et.expiresAt < new Date()) return { estat: "caducat", verified };
  if (!user || !user.active) return { estat: "invalid", verified: user ? verified : null };
  return { estat: "pendent", verified };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = body?.token ? String(body.token).slice(0, 100) : "";

  if (token) {
    // --- CONFIRMACIÓ EXPLÍCITA (l'únic camí que muta dades) ---
    const ip = clientIp(req);
    const rl = await rateLimit(`verify-confirm:${ip}`, 20, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

    const et = await db.emailToken.findUnique({ where: { token } });
    if (!et) return NextResponse.json({ estat: "invalid" });
    if (et.used) {
      // enllaç ja consumit: informem del estat REAL del compte (vegeu tokenEstat)
      const u = await db.user.findUnique({ where: { id: et.userId }, select: { emailVerifiedAt: true } });
      return NextResponse.json({ estat: "ja_usat", verified: Boolean(u?.emailVerifiedAt) });
    }
    if (et.expiresAt < new Date()) {
      const u = await db.user.findUnique({ where: { id: et.userId }, select: { emailVerifiedAt: true } });
      return NextResponse.json({ estat: "caducat", verified: Boolean(u?.emailVerifiedAt) });
    }
    const user = await db.user.findUnique({ where: { id: et.userId } });
    if (!user || !user.active) return NextResponse.json({ estat: "invalid" });

    await db.$transaction([
      db.emailToken.update({ where: { id: et.id }, data: { used: true } }),
      // un sol ús lògic: qualsevol altre enllaç pendent del compte queda anul·lat
      db.emailToken.updateMany({
        where: { userId: et.userId, used: false, id: { not: et.id } },
        data: { used: true },
      }),
      // si ja estava verificat es conserva la data del PRIMER verificat
      db.user.update({
        where: { id: et.userId },
        data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      }),
    ]);
    await db.event.create({ data: { type: "EMAIL_VERIFIED", userId: et.userId } }).catch(() => {});
    return NextResponse.json({ estat: "ok", verified: true });
  }

  // sense token al cos → REENVIAMENT del correu de verificació
  const ip = clientIp(req);
  const rl = await rateLimit(`verify:${ip}`, 3, 300_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  const newToken = crypto.randomBytes(24).toString("hex");
  await db.emailToken.create({
    data: { userId: user.id, token: newToken, expiresAt: new Date(Date.now() + 24 * 3600_000) },
  });
  const locale = user.locale === "es" ? "es" : "ca";
  const mail = verifyMail(newToken, locale);
  sendMail({ to: user.email, subject: mail.subject, html: mail.html }).catch(() => {});
  return NextResponse.json({ ok: true });
}

function pickBase(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.hostname.includes(".") && !/\s/.test(u.hostname)) return u.origin;
  } catch {
    /* env mal escrit: cap a l'origen de la petició */
  }
  return null;
}
