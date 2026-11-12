/**
 * Utilitats de seguretat de Preureal (BLOC A de l'auditoria).
 */

import * as crypto from "crypto";
import { db } from "@/lib/db";

/**
 * IP del client (P1.5).
 *
 * El client CONTROLA les capçaleres que envia: un atacant pot posar
 * "x-forwarded-for: 1.2.3.4" per falsificar la seva IP i esquivar el rate
 * limit per IP. Per això el PRIMER valor de la cadena mai es considera fiable:
 *  1) `x-real-ip` — la posa l'edge de la plataforma (Vercel) amb la IP real de
 *     la connexió TCP; no és spoofable.
 *  2) l'ÚLTIM valor de `x-forwarded-for` — el que afegeix el darrer proxy de
 *     confiança just davant nostre (Vercel edge / Caddy al self-hosting).
 *  3) si res no és vàlid → "local" (bucket compartit: el rate limit segueix
 *     aplicant-se, fail-closed).
 */
export function clientIp(req: Request): string {
  const real = (req.headers.get("x-real-ip") || "").trim();
  if (isIp(real)) return real;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(isIp);
    if (parts.length) return parts[parts.length - 1];
  }
  return "local";
}

/** Validació estricta de format IP (v4 o v6) abans de confiar-hi. */
function isIp(s: string): boolean {
  if (!s || s.length > 45) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
    return s.split(".").every((n) => Number(n) <= 255);
  }
  return /^[0-9a-fA-F:]+$/.test(s) && s.includes(":");
}

/**
 * Pseudonimització RGPD de la IP: SHA-256 truncat amb sal secreta.
 * (Substitueix el hash multiplicatiu de 31 bits, reversible per força bruta.)
 */
export function hashIp(ip: string): string {
  const salt = process.env.AUTH_SECRET || "preureal-dev-salt";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Escapament HTML per interpolar dades d'usuari dins de correus/plantilles. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Text net per previsualitzar HTML de correus (mai es renderitza com a HTML). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Neteja entrada d'usuari tipus "nom": sense HTML ni caràcters de control. */
export function sanitizeName(raw: string): string | null {
  const clean = raw
    .normalize("NFC") // unicode compost consistent (í vs i + accent combinant)
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 80);
  return clean || null;
}

/** Registre d'auditoria d'accions sensibles (Fase 12) — mai llança excepcions. */
export async function audit(
  actorId: string | null,
  action: string,
  target?: string | null,
  meta?: Record<string, unknown>
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: actorId || null,
        action,
        target: target || null,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
  } catch (e) {
    console.error("audit", e);
  }
}

/**
 * Oculta la part local d'un correu per a la UX (respostes API compartides):
 * "joan.perez@gmail.com" → "jo***@gmail.com". Mai dona error: entrada
 * inesperada → "***".
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, Math.min(at, 2));
  return `${local}***${email.slice(at)}`;
}
