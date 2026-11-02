/**
 * Rate limiting COMPARTIT entre instàncies (V3 de l'auditoria).
 *
 * Implementació sobre PostgreSQL (taula "RateLimit") amb un ÚNIC enunciat
 * atòmic (INSERT ... ON CONFLICT ... RETURNING): correcte en serverless on
 * cada instància té la seva pròpia memòria. Si la BD no està disponible,
 * degrada a un comptador en memòria (millor que bloquejar el servei).
 */

import { db } from "@/lib/db";

const memBuckets = new Map<string, { count: number; reset: number }>();

function memoryFallback(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = memBuckets.get(key);
  if (!b || b.reset < now) {
    memBuckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= max) return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  b.count++;
  return { ok: true, retryAfter: 0 };
}

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfter: number }> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  try {
    const rows = await db.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"`;
    const r = rows[0];
    // neteja oportunista (~2% de crides) per no créixer sense fi
    if (Math.random() < 0.02) {
      db.rateLimit
        .deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 3600_000) } } })
        .catch(() => {});
    }
    if (r.count > max) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((r.resetAt.getTime() - now.getTime()) / 1000)) };
    }
    return { ok: true, retryAfter: 0 };
  } catch (e) {
    console.error("rateLimit: BD no disponible, fallback memòria", e);
    return memoryFallback(key, max, windowMs);
  }
}
