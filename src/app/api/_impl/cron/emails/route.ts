import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_TOTAL_ATTEMPTS,
  deliverWithResend,
  mailProvider,
  redactSecrets,
  type MailType,
} from "@/lib/mail";

/**
 * GET /api/cron/emails — manteniment del sistema de correu (v19).
 *
 * Vercel Cron el crida un cop al dia (vegeu vercel.json) i hi afegeix
 * `Authorization: Bearer $CRON_SECRET` si la variable CRON_SECRET està
 * definida. Si no ho està, l'endpoint queda obert (les operacions són
 * idempotents i limitades) — RECOMANAT definir CRON_SECRET a Vercel.
 *
 * Feines:
 *  1. OUTBOX durables: reintent amb backoff dels enviaments "pending"/"error"
 *     de tipus NO sensible (WELCOME/RECEIPT/GENERIC) amb nextRetryAt vençut i
 *     intents < MAX_TOTAL_ATTEMPTS. Els VERIFY/RESET no es reenvien des del
 *     log (el cos guardat va redactat i l'enllaç és d'un sol ús): l'usuari
 *     demana un enllaç nou, que és la UX existent.
 *  2. Neteja: tokens de verificació/restabliment caducats fa més de 7 dies.
 *  3. Retenció: EmailLog més vell que EMAILLOG_RETENTION_DAYS (90 per defecte).
 *  4. Xarxa de seguretat P0: redactar cossos llegats que encara continguin
 *     tokens (les files anteriors a v19).
 */

const RETRYABLE_TYPES: MailType[] = ["WELCOME", "RECEIPT", "GENERIC"];
const DAY = 86_400_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`)
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  } else {
    // sense secret configurat: límit de ritme bàsic anti-abús
    const rl = await rateLimit(`cron:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });
  }

  const summary = {
    provider: mailProvider(),
    retried: 0,
    sent: 0,
    tokensPurged: 0,
    logsPurged: 0,
    scrubbed: 0,
  };

  // ── 1. OUTBOX: reposar enviaments encallats (només tipus no sensibles) ──
  if (summary.provider === "resend") {
    const due = await db.emailLog.findMany({
      where: {
        provider: "resend",
        status: { in: ["pending", "error"] },
        attempts: { lt: MAX_TOTAL_ATTEMPTS },
        nextRetryAt: { lte: new Date() },
        type: { in: RETRYABLE_TYPES },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    for (const row of due) {
      summary.retried++;
      // el cos guardat d'aquests tipus NO conté secrets (la redacció és un no-op)
      const out = await deliverWithResend({ to: row.to, subject: row.subject, html: row.body }, 2);
      const total = row.attempts + out.attempts;
      if (out.ok) summary.sent++;
      await db.emailLog.update({
        where: { id: row.id },
        data: {
          status: out.ok ? "sent" : "error",
          error: out.ok ? null : out.error ?? "unknown",
          providerMessageId: out.ok ? out.messageId ?? null : row.providerMessageId,
          sentAt: out.ok ? new Date() : row.sentAt,
          attempts: total,
          nextRetryAt:
            out.ok || total >= MAX_TOTAL_ATTEMPTS || !out.retryable
              ? null
              : new Date(Date.now() + Math.min(2 ** Math.max(0, total - 2), 24) * 3600_000),
        },
      });
    }
  }

  // ── 2. tokens caducats fa més de 7 dies fora (els used ja no serveixen) ──
  const cutoff = new Date(Date.now() - 7 * DAY);
  const et = await db.emailToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  const pt = await db.passwordToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  summary.tokensPurged = et.count + pt.count;

  // ── 3. retenció del log de correus ──
  const days = Math.max(7, Number(process.env.EMAILLOG_RETENTION_DAYS || 90) || 90);
  const lp = await db.emailLog.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - days * DAY) } },
  });
  summary.logsPurged = lp.count;

  // ── 4. xarxa de seguretat: redactar cossos llegats amb tokens ──
  const legacy = await db.emailLog.findMany({
    where: { body: { contains: "token=" } },
    select: { id: true, body: true },
    take: 200,
  });
  for (const row of legacy) {
    const safe = redactSecrets(row.body);
    if (safe !== row.body) {
      await db.emailLog.update({ where: { id: row.id }, data: { body: safe } });
      summary.scrubbed++;
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
