import { db } from "@/lib/db";

/** Registros de eventos del embudo de conversión */
export async function logEvent(
  type: string,
  userId?: string | null,
  meta?: Record<string, unknown>
) {
  try {
    await db.event.create({
      data: {
        type,
        userId: userId ?? null,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
  } catch (e) {
    console.error("logEvent", e);
  }
}

/** Rate limit sencillo en memoria por clave (IP, acción). */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= max) {
    return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  b.count++;
  return { ok: true, retryAfter: 0 };
}

/** Limpieza periódica para no acumular memoria */
if (typeof setInterval !== "undefined") {
  const t = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }, 60_000);
  if (typeof t.unref === "function") t.unref();
}
