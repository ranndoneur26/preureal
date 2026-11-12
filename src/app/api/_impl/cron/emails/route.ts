import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import {
  MAX_TOTAL_ATTEMPTS,
  RETRYABLE_TYPES,
  deliverWithResend,
  favoritesDigestMail,
  priceAlertMail,
  mailProvider,
  redactSecrets,
  type DigestItem,
  type MailType,
  type PriceAlertEntry,
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
 *  0. v24 RESUM MENSUAL DE PREFERITS (opt-in): els dies 1–3 de cada mes
 *     encola un correu DIGEST per a cada usuari verificat amb
 *     alertsEnabled=true i almenys un preferit. La fila entra a l'outbox
 *     (status "pending", idempotencyKey única per usuari i mes) i la mateixa
 *     passada la lliura via la secció 1 (fins a 20/passada); si n'hi ha més,
 *     els dies següents continuen. En mode sandbox queda "logged" i visible
 *     al panell admin sense enviar res.
 *  1. OUTBOX durables: reintent amb backoff dels enviaments "pending"/"error"
 *     de tipus NO sensible (WELCOME/RECEIPT/GENERIC) amb nextRetryAt vençut i
 *     intents < MAX_TOTAL_ATTEMPTS. Els VERIFY/RESET no es reenvien des del
 *     log (el cos guardat va redactat i l'enllaç és d'un sol ús): l'usuari
 *     demana un enllaç nou, que és la UX existent. DIGEST sí (sense secrets).
 *  2. Neteja: tokens de verificació/restabliment caducats fa més de 7 dies.
 *  3. Retenció: EmailLog més vell que EMAILLOG_RETENTION_DAYS (90 per defecte).
 *  4. Xarxa de seguretat P0: redactar cossos llegats que encara continguin
 *     tokens (les files anteriors a v19).
 */

const DAY = 86_400_000;
/** v24: màxim de favorits llistats al resum mensual (la resta es resum en una nota) */
const DIGEST_MAX_ITEMS = 10;
/** v24: els primers 3 dies de cada mes s'intenta enviar el resum mensual */
const DIGEST_SEND_DAYS = [1, 2, 3];

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
    digestsQueued: 0,
    priceAlertsQueued: 0,
    priceAlertEntries: 0,
    priceBaselinesSet: 0,
    retried: 0,
    sent: 0,
    tokensPurged: 0,
    logsPurged: 0,
    scrubbed: 0,
  };

  // ── 0. v24: resum mensual de preferits (encolat, OPT-IN) ──
  // El cron corre diari (0 4 * * *). Els correus s'encolen amb idempotència
  // per usuari+mes: reexecucions i dies 2–3 (si el dia 1 va fallar) no dupliquen.
  try {
    const now = new Date();
    if (DIGEST_SEND_DAYS.includes(now.getUTCDate())) {
      const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const users = await db.user.findMany({
        where: { active: true, alertsEnabled: true, emailVerifiedAt: { not: null }, plan: { in: ["PREMIUM", "PRO"] } },
        select: { id: true, email: true, locale: true },
      });
      for (const u of users) {
        // només usuaris amb almenys un preferit (evita correus buits)
        const favs = await db.favorite.findMany({
          where: { userId: u.id },
          orderBy: { createdAt: "asc" },
          take: DIGEST_MAX_ITEMS + 1,
        });
        if (favs.length === 0) continue;
        const shown = favs.slice(0, DIGEST_MAX_ITEMS);
        // dades vigents per als favorits tipus municipi i edifici (una consulta
        // per taula; mai s'inventa cap xifra)
        const muniCodes = shown.map((f) => f.municipalityCode).filter(Boolean) as string[];
        const buildingIds = shown.map((f) => f.buildingId).filter(Boolean) as string[];
        const muns = muniCodes.length
          ? await db.municipality.findMany({
              where: { code: { in: muniCodes } },
              select: { code: true, name: true, rentLatest: true, rentPeriod: true, rentPrevYear: true },
            })
          : [];
        const munMap = new Map(muns.map((m) => [m.code, m]));
        const blds = buildingIds.length
          ? await db.building.findMany({
              where: { id: { in: buildingIds } },
              select: { id: true, nom: true, refcat: true, avgRentEurMonth: true, municipalityCode: true },
            })
          : [];
        const bldMap = new Map(blds.map((b) => [b.id, b]));
        const items: DigestItem[] = [];
        for (const f of shown) {
          if (f.buildingId) {
            const b = bldMap.get(f.buildingId);
            items.push({
              label: f.label || b?.nom || b?.refcat || "Edifici",
              rentLatest: b?.avgRentEurMonth ?? null,
              rentPeriod: null,
              trendPct: null,
              url: `/#/mapa?edifici=${encodeURIComponent(f.buildingId)}`,
            });
          } else if (f.municipalityCode) {
            const m = munMap.get(f.municipalityCode);
            const trend =
              m?.rentLatest && m?.rentPrevYear
                ? ((m.rentLatest - m.rentPrevYear) / m.rentPrevYear) * 100
                : null;
            items.push({
              label: f.label || m?.name || f.municipalityCode,
              rentLatest: m?.rentLatest ?? null,
              rentPeriod: m?.rentPeriod ?? null,
              trendPct: trend,
              url: `/#/mapa?mun=${encodeURIComponent(f.municipalityCode)}`,
            });
          }
        }
        if (items.length === 0) continue;
        const extra = favs.length - shown.length;
        const mail = favoritesDigestMail(items, u.locale === "es" ? "es" : "ca");
        // nota (si n'hi ha més de DIGEST_MAX_ITEMS) afegida just abans del peu
        const html = extra > 0
          ? mail.html.replace(
              "</table>",
              `<tr><td style="padding:6px 0;font-size:12px;color:#777">${u.locale === "es" ? `+ ${extra} favoritos más en tu panel` : `+ ${extra} preferits més al teu panell`}</td></tr></table>`
            )
          : mail.html;
        // En mode Resend: fila "pending" → la secció 1 la lliura AQUESTA mateixa
        // passada (o els dies següents). En sandbox: "logged", visible al admin.
        try {
          await db.emailLog.create({
            data: {
              to: u.email,
              subject: mail.subject,
              body: redactSecrets(html),
              provider: summary.provider,
              status: summary.provider === "resend" ? "pending" : "logged",
              type: "DIGEST",
              userId: u.id,
              attempts: 0,
              nextRetryAt: summary.provider === "resend" ? new Date() : null,
              idempotencyKey: `favs-digest:${u.id}:${monthKey}`,
            },
          });
          summary.digestsQueued++;
        } catch {
          // P2002 (clau d'idempotència) o qualsevol altre: no bloqueja els altres
        }
      }
    }
  } catch (e) {
    console.error("cron emails: digest de preferits fallat", e);
  }

  // ── 0.5. v37: ALERTES DE PREU (favorits amb alertPct) + àrees tensades noves ──
  // Semàntica: lastNotifiedValue és la LÍNIA BASE (l'últim valor usat en un avís
  // o el primer valor conegut). El % es mesura SEMPRE des de la línia base, així
  // que un canvi gradual s'acumula fins travessar el llindar (mai es reseteja
  // amb variacions petites). Idempotència: PriceAlertLog únic per
  // usuari+entitat+tipus+període → cap avís doble per la mateixa publicació.
  try {
    const users = await db.user.findMany({
      where: {
        active: true,
        emailVerifiedAt: { not: null },
        plan: { in: ["PREMIUM", "PRO"] },
        favorites: { some: { alertPct: { not: null } } },
      },
      select: { id: true, email: true, locale: true },
      take: 500,
    });
    for (const u of users) {
      const favs = await db.favorite.findMany({
        where: { userId: u.id, alertPct: { not: null } },
        take: 50,
      });
      const muniCodes = favs.map((f) => f.municipalityCode).filter(Boolean) as string[];
      const buildingIds = favs.map((f) => f.buildingId).filter(Boolean) as string[];
      const muns = muniCodes.length
        ? await db.municipality.findMany({
            where: { code: { in: muniCodes } },
            select: { code: true, name: true, rentLatest: true, rentPeriod: true, isTense: true },
          })
        : [];
      const munMap = new Map(muns.map((m) => [m.code, m]));
      const blds = buildingIds.length
        ? await db.building.findMany({
            where: { id: { in: buildingIds } },
            select: { id: true, nom: true, refcat: true, avgRentEurMonth: true },
          })
        : [];
      const bldMap = new Map(blds.map((b) => [b.id, b]));

      const entries: PriceAlertEntry[] = [];
      for (const f of favs) {
        const threshold = f.alertPct ?? 0;
        if (!threshold) continue;
        const cur = f.buildingId
          ? bldMap.get(f.buildingId)?.avgRentEurMonth ?? null
          : munMap.get(f.municipalityCode || "")?.rentLatest ?? null;
        const period = f.buildingId
          ? null
          : munMap.get(f.municipalityCode || "")?.rentPeriod ?? null;
        const label =
          f.label ||
          (f.buildingId
            ? bldMap.get(f.buildingId)?.nom || bldMap.get(f.buildingId)?.refcat || "Edifici"
            : munMap.get(f.municipalityCode || "")?.name || f.municipalityCode || "Preferit");
        const url = f.buildingId
          ? `/#/mapa?edifici=${encodeURIComponent(f.buildingId)}`
          : `/#/mapa?mun=${encodeURIComponent(f.municipalityCode || "")}`;

        // línia base sense establir: la PRIMERA passada només l'ancla (mai avís)
        if (cur != null && f.lastNotifiedValue == null) {
          await db.favorite.update({ where: { id: f.id }, data: { lastNotifiedValue: cur } });
          summary.priceBaselinesSet++;
        } else if (cur != null && f.lastNotifiedValue != null && f.lastNotifiedValue > 0) {
          const pct = ((cur - f.lastNotifiedValue) / f.lastNotifiedValue) * 100;
          if (Math.abs(pct) >= threshold) {
            // idempotència per període oficial (o "vigent" per a edificis)
            const dedupeKey = { userId: u.id, entityKey: f.entityKey, kind: "PRICE", period: period || "vigent" };
            const dup = await db.priceAlertLog.findUnique({ where: { userId_entityKey_kind_period: dedupeKey } });
            if (!dup) {
              await db.priceAlertLog.create({
                data: {
                  ...dedupeKey,
                  prevValue: f.lastNotifiedValue,
                  newValue: cur,
                  pctChange: +pct.toFixed(2),
                },
              }).catch(() => null);
              entries.push({
                label,
                kind: pct > 0 ? "PRICE_UP" : "PRICE_DOWN",
                prevValue: f.lastNotifiedValue,
                newValue: cur,
                pct: +pct.toFixed(1),
                period,
                url,
              });
              await db.favorite.update({ where: { id: f.id }, data: { lastNotifiedValue: cur } });
            }
          }
        }

        // nova ÀREA TENSADA: només MUNI, només la primera vegada que isTense=true
        if (!f.buildingId && f.municipalityCode) {
          const m = munMap.get(f.municipalityCode);
          if (m?.isTense && !f.tenseNoticed) {
            const dedupeKey = { userId: u.id, entityKey: f.entityKey, kind: "TENSE", period: m.rentPeriod || "vigent" };
            const dup = await db.priceAlertLog.findUnique({ where: { userId_entityKey_kind_period: dedupeKey } });
            if (!dup) {
              await db.priceAlertLog.create({ data: { ...dedupeKey, newValue: m.rentLatest } }).catch(() => null);
              entries.push({
                label: m.name || label,
                kind: "TENSE",
                prevValue: null,
                newValue: m.rentLatest,
                pct: null,
                period: m.rentPeriod,
                url,
              });
            }
            await db.favorite.update({ where: { id: f.id }, data: { tenseNoticed: true } });
          }
        }
      }

      if (entries.length > 0) {
        const dayKey = new Date().toISOString().slice(0, 10);
        const mail = priceAlertMail(entries, u.locale === "es" ? "es" : "ca");
        try {
          await db.emailLog.create({
            data: {
              to: u.email,
              subject: mail.subject,
              body: redactSecrets(mail.html),
              provider: summary.provider,
              status: summary.provider === "resend" ? "pending" : "logged",
              type: "ALERT",
              userId: u.id,
              attempts: 0,
              nextRetryAt: summary.provider === "resend" ? new Date() : null,
              idempotencyKey: `price-alerts:${u.id}:${dayKey}`,
            },
          });
          summary.priceAlertsQueued++;
          summary.priceAlertEntries += entries.length;
        } catch {
          // idempotència diària (P2002) o altre: mai bloqueja la resta
        }
      }
    }
  } catch (e) {
    console.error("cron emails: alertes de preu fallades", e);
  }

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
