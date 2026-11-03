/**
 * Utilitats de seguretat de PreuReal.cat (BLOC A de l'auditoria).
 */

import * as crypto from "crypto";
import { db } from "@/lib/db";

/** IP del client (darrere de proxy/Vercel: primer valor de x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
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
