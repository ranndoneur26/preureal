import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { NORM_FACTS } from "@/lib/analitza";
import { alertaMail, deliverWithResend, mailProvider, MAX_TOTAL_ATTEMPTS, type AlertaEntry } from "@/lib/mail";

/**
 * GET /api/cron/alertes — FASE 2 (plans migració progressiva), punt «Nou» de
 * Premium: revisió DIÀRIA de les alertes configurades (taula UserAlert —
 * panell → Alertes) contra FONTS OFICIALS, amb correu consolidat per usuari.
 *
 * Cron diari (vercel.json «15 3 * * *», abans del resum d'e-mails de les 04:00
 * perquè l'outbox compartit pugui reintentar el mateix dia). Auth: si
 * CRON_SECRET està definit exigeix `Authorization: Bearer $CRON_SECRET`
 * (mateix patró que la resta de crons).
 *
 * Per tipus d'alerta (TOTES amb font oficial i idempotència via PriceAlertLog,
 * la mateixa taula del flux de preferits v37/v60 — mai doble notificació):
 *   PRICE     → fiances Incasòl via habitatge.gencat.cat: avís quan el període
 *               oficial vigent del municipi AVANÇA (rentPeriod > darrer log).
 *   TENSE     → llistes d'àrees tensades (DOGC 19-10-2026): avís quan el
 *               municipi ENTRA o SURT (canvi d'estat isTense vs darrer log).
 *   NORMATIVA → canvi de la normativa vigent consolidada (IRAV/INE, resolucions
 *               TER/3739 i TER/3740, amiant): versió = hash dels NORM_FACTS;
 *               avís quan la versió canvia (mateix muni per a qualsevol alerta
 *               NORMATIVA de l'usuari).
 *
 * Comportaments garantits:
 *  - PRIMERA passada de cada alerta: només ANCLA la línia base (mai rajada
 *    d'avisos amb dades velles) — mateix contracte que la secció 0.6 de v60.
 *  - Usuaris FREE: les seves alertes NO s'esborren, però el cron les OMET
 *    (pausa; es reprendre'n si torna a Premium/Pro — no destructiu).
 *  - ultimaComprovacio s'actualitza sempre (traces de la passada).
 *  - El correu entra a l'outbox (EmailLog, type ALERT, idempotencyKey diària)
 *    i es lliura EN LA MATEIXA passada si el provider és resend; si no,
 *    queda "logged" (sandbox, visible al panell admin).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  } else {
    const rl = await rateLimit(`cron:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });
  }

  const summary = {
    provider: mailProvider(),
    usersProcessed: 0,
    alertsChecked: 0,
    baselinesSet: 0,
    priceEntries: 0,
    tenseEntries: 0,
    normativaEntries: 0,
    queued: 0,
    sent: 0,
    skippedFree: 0,
  };

  /** Versió de la normativa vigent consolidada: canvia quan canvia QUALVOL
   *  fet normatiu dels NORM_FACTS (IRAV, resolucions DOGC, amiant). */
  const normativaVersion = () =>
    createHash("sha256")
      .update(
        [
          NORM_FACTS.iravLatestPct,
          NORM_FACTS.iravLatestPeriod,
          ...NORM_FACTS.tenseResolutions,
          NORM_FACTS.amiantNote,
        ].join("|")
      )
      .digest("hex")
      .slice(0, 12);
  const normV = normativaVersion();
  /** Etiqueta de la publicació DOGC vigent (per als logs TENSE). */
  const DOGC_PERIOD = "DOGC 19-10-2026";

  try {
    // Sense relació Prisma User↔UserAlert (mateixa convenció que PriceAlertLog):
    // 1) userIds amb alertes actives, 2) filtre d'usuaris de pagament verificats.
    // Un usuari FREE mai no es processa: les seves alertes NO s'esborren (pausa,
    // no destructiu — es reprendre'n si torna a Premium/Pro).
    const withAlerts = await db.userAlert.findMany({
      where: { activa: true },
      select: { userId: true },
      distinct: ["userId"],
      take: 2000,
    });
    const users = withAlerts.length
      ? await db.user.findMany({
          where: {
            id: { in: withAlerts.map((w) => w.userId) },
            active: true,
            emailVerifiedAt: { not: null },
            plan: { in: ["PREMIUM", "PRO"] },
          },
          select: { id: true, email: true, locale: true },
          take: 500,
        })
      : [];

    const dayKey = new Date().toISOString().slice(0, 10);

    for (const u of users) {
      const alerts = await db.userAlert.findMany({
        where: { userId: u.id, activa: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      if (alerts.length === 0) continue;
      summary.usersProcessed++;

      const ca = u.locale !== "es";
      const codes = [...new Set(alerts.map((a) => a.entityKey.replace(/^MUNI:/, "")))];
      const muns = codes.length
        ? await db.municipality.findMany({
            where: { code: { in: codes } },
            select: { code: true, name: true, rentLatest: true, rentPeriod: true, isTense: true },
          })
        : [];
      const munMap = new Map(muns.map((m) => [m.code, m]));

      const entries: AlertaEntry[] = [];
      const checkedIds: string[] = [];

      for (const a of alerts) {
        const code = a.entityKey.replace(/^MUNI:/, "");
        const m = munMap.get(code);
        checkedIds.push(a.id);
        summary.alertsChecked++;
        const url = `/#/mapa?mun=${encodeURIComponent(code)}`;
        const label = m?.name || code;

        // ── PRICE: avança del període oficial (fiances Incasòl) ──
        if (a.tipus === "PRICE") {
          if (!m?.rentPeriod) continue;
          const prev = await db.priceAlertLog.findFirst({
            where: { userId: u.id, entityKey: a.entityKey, kind: "PRICE" },
            orderBy: { period: "desc" },
          });
          if (!prev) {
            // línia base sense establir: la PRIMERA passada només ancla
            await db.priceAlertLog
              .create({ data: { userId: u.id, entityKey: a.entityKey, kind: "PRICE", period: m.rentPeriod, newValue: m.rentLatest ?? null } })
              .catch(() => null); // P2002: el flux de preferits ja va anclar aquest període
            summary.baselinesSet++;
            continue;
          }
          if (m.rentPeriod > prev.period) {
            const created = await db.priceAlertLog
              .create({
                data: {
                  userId: u.id,
                  entityKey: a.entityKey,
                  kind: "PRICE",
                  period: m.rentPeriod,
                  prevValue: prev.newValue ?? null,
                  newValue: m.rentLatest ?? null,
                },
              })
              .catch(() => null);
            if (created) {
              summary.priceEntries++;
              entries.push({
                label,
                detail: ca
                  ? `Preu oficial nou: <b>${m.rentLatest != null ? m.rentLatest.toFixed(0) + " €/mes" : "encara sense valor publicat"}</b> <span style="color:#777">· ${prev.period} → ${m.rentPeriod} (Incasòl)</span>`
                  : `Precio oficial nuevo: <b>${m.rentLatest != null ? m.rentLatest.toFixed(0) + " €/mes" : "todavía sin valor publicado"}</b> <span style="color:#777">· ${prev.period} → ${m.rentPeriod} (Incasòl)</span>`,
                url,
              });
            }
            // P2002 → el flux de preferits ja va notificar aquest període: cap doble avís
          }
          continue;
        }

        // ── TENSE: entrada/sortida de les llistes oficials (DOGC) ──
        if (a.tipus === "TENSE") {
          if (!m) continue;
          const state = m.isTense ? 1 : 0;
          const prev = await db.priceAlertLog.findFirst({
            where: { userId: u.id, entityKey: a.entityKey, kind: "TENSE" },
            orderBy: { notifiedAt: "desc" },
          });
          if (!prev) {
            await db.priceAlertLog
              .create({ data: { userId: u.id, entityKey: a.entityKey, kind: "TENSE", period: `${DOGC_PERIOD}#${state}`, newValue: state } })
              .catch(() => null);
            summary.baselinesSet++;
            continue;
          }
          if ((prev.newValue ?? 0) !== state) {
            const created = await db.priceAlertLog
              .create({ data: { userId: u.id, entityKey: a.entityKey, kind: "TENSE", period: `${DOGC_PERIOD}#${state}`, prevValue: prev.newValue ?? null, newValue: state } })
              .catch(() => null);
            if (created) {
              summary.tenseEntries++;
              entries.push({
                label,
                detail: ca
                  ? m.isTense
                    ? `Ara és <b>àrea de mercat residencial tensat</b>: els nous contractes poden quedar limitats per l'índex de referència (${DOGC_PERIOD})`
                    : `Ha DEIXAT de ser àrea de mercat residencial tensat (${DOGC_PERIOD})`
                  : m.isTense
                    ? `Ahora es <b>área de mercado residencial tensionado</b>: los nuevos contratos pueden quedar limitados por el índice de referencia (${DOGC_PERIOD})`
                    : `Ha DEJADO de ser área de mercado residencial tensionado (${DOGC_PERIOD})`,
                url,
              });
            }
          }
          continue;
        }

        // ── NORMATIVA: canvi de la versió consolidada (IRAV/INE, DOGC, RDL) ──
        if (a.tipus === "NORMATIVA") {
          const prev = await db.priceAlertLog.findFirst({
            where: { userId: u.id, entityKey: a.entityKey, kind: "NORMATIVA" },
            orderBy: { notifiedAt: "desc" },
          });
          if (!prev) {
            await db.priceAlertLog
              .create({ data: { userId: u.id, entityKey: a.entityKey, kind: "NORMATIVA", period: normV } })
              .catch(() => null);
            summary.baselinesSet++;
            continue;
          }
          if (prev.period !== normV) {
            const created = await db.priceAlertLog
              .create({ data: { userId: u.id, entityKey: a.entityKey, kind: "NORMATIVA", period: normV } })
              .catch(() => null);
            if (created) {
              summary.normativaEntries++;
              entries.push({
                label,
                detail: ca
                  ? `Normativa vigent actualitzada: IRAV (INE) o resolucions d'àrees tensades (DOGC) han canviat — revisa el mòdul normatiu al panell`
                  : `Normativa vigente actualizada: IRAV (INE) o resoluciones de áreas tensadas (DOGC) han cambiado — revisa el módulo normativo en el panel`,
                url,
              });
            }
          }
          continue;
        }
      }

      // traça de la passada (mai blocada per errors d'un municipi concret)
      if (checkedIds.length > 0) {
        await db.userAlert
          .updateMany({ where: { id: { in: checkedIds } }, data: { ultimaComprovacio: new Date() } })
          .catch(() => {});
      }

      // ── correu consolidat per usuari (1/dia màxim, outbox durable) ──
      if (entries.length > 0) {
        const mail = alertaMail(entries, ca ? "ca" : "es");
        try {
          const row = await db.emailLog.create({
            data: {
              to: u.email,
              subject: mail.subject,
              body: mail.html,
              provider: summary.provider,
              status: summary.provider === "resend" ? "pending" : "logged",
              type: "ALERT",
              userId: u.id,
              attempts: 0,
              nextRetryAt: summary.provider === "resend" ? new Date() : null,
              idempotencyKey: `alertes:${u.id}:${dayKey}`,
            },
          });
          summary.queued++;
          // Lliurament EN LA MATEIXA passada (el cos de l'ALERT no conté secrets;
          // els reintents posteriors els fa el cron d'e-mails, secció OUTBOX).
          if (summary.provider === "resend") {
            const out = await deliverWithResend({ to: u.email, subject: mail.subject, html: mail.html }, 2);
            const total = row.attempts + out.attempts;
            if (out.ok) summary.sent++;
            await db.emailLog
              .update({
                where: { id: row.id },
                data: {
                  status: out.ok ? "sent" : "error",
                  error: out.ok ? null : out.error ?? "unknown",
                  providerMessageId: out.ok ? out.messageId ?? null : null,
                  sentAt: out.ok ? new Date() : null,
                  attempts: total,
                  nextRetryAt:
                    out.ok || total >= MAX_TOTAL_ATTEMPTS || !out.retryable
                      ? null
                      : new Date(Date.now() + Math.min(2 ** Math.max(0, total - 2), 24) * 3600_000),
                },
              })
              .catch(() => {});
          }
        } catch {
          // idempotència diària (P2002) o altre: mai bloqueja la resta d'usuaris
        }
      }
    }
  } catch (e) {
    console.error("cron alertes: passada fallada", e);
    return NextResponse.json({ ok: false, error: "CRON_FAILED", ...summary }, { status: 500 });
  }

  return NextResponse.json({ ok: true, normativaVersion: normV, dogc: DOGC_PERIOD, ...summary });
}
