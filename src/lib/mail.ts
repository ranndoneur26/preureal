import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/security";
import { getSiteUrlOrigin } from "@/lib/site-url";

/**
 * Correos automáticos de Preureal.
 *
 * REGLA DE NEGOCIO: no se contrata ningún proveedor sin autorización del
 * propietario. Comportamiento:
 *  - Si RESEND_API_KEY está definida → envía con Resend (el usuario habrá
 *    autorizado y conectado su cuenta).
 *  - Si no → modo sandbox: guarda el email en EmailLog (visible en el panel
 *    de administración) sin enviar nada.
 *
 * CRÍTICO (serverless/Vercel): sendMail SIEMPRE dentro de `after()` de
 * next/server (o con await antes de responder). Una promesa flotante se
 * congela cuando la función devuelve la respuesta: el fetch a Resend queda
 * a medias y, al descongelarse la función, el guardián de timeout lo mata
 * → en EmailLog aparece «fetch: TimeoutError [23] ...» sin que el correo
 * haya salido (caso real v17: el correo de verificación no llegaba y el
 * usuario quedaba encerrado en el bloqueo «Verifica tu correo» del mapa).
 *
 * v19 (auditoría del sistema de correo):
 *  - P0 SEGURIDAD: el cuerpo guardado en EmailLog va SIEMPRE REDACTADO — el
 *    token de verificación/restablecimiento se sustituye por *** antes de
 *    persistir. La BD nunca contiene enlaces vivos.
 *  - P1 FIABILIDAD: la fila se crea ANTES de enviar (outbox duradero, status
 *    "pending"); reintentos con backoff (800ms/3.2s) dentro de la invocación
 *    y, si sigue fallando, el cron /api/cron/emails lo recupera más tarde
 *    (tipos no sensibles). status "sent" = Resend ACEPTÓ el correo (con su
 *    providerMessageId); la entrega real en bandeja requeriría los eventos
 *    de Resend (futuro).
 *  - P1 IDEMPOTENCIA: idempotencyKey (p. ej. recibos Stripe) garantiza un
 *    correo lógico = un envío, aunque el webhook se reentregue.
 */

export function mailProvider(): "resend" | "sandbox" {
  return process.env.RESEND_API_KEY ? "resend" : "sandbox";
}

/** Tipo de correo (telemetría EmailLog). */
export type MailType = "WELCOME" | "VERIFY" | "RESET" | "RECEIPT" | "GENERIC" | "DIGEST" | "ALERT";

/**
 * P0: los correos de verificación/restablecimiento llevan el token en la URL
 * (?token=...). Antes de guardar el cuerpo en EmailLog se redacta el valor.
 * El HTML REAL (con el token) solo viaja hacia Resend, nunca a la BD.
 */
export function redactSecrets(html: string): string {
  return html.replace(/([?&]token=)[^&"'<>\s]+/gi, "$1***");
}

interface MailInput {
  to: string;
  subject: string;
  html: string;
  /** tipo lógico del correo (telemetría) */
  type?: MailType;
  /** usuario relacionado (telemetría) */
  userId?: string | null;
  /** clave de idempotencia: si ya existe una fila "sent" con esta clave, no se reenvía */
  idempotencyKey?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** guardián por intento: si Resend no responde en 15s, abortamos y reintentamos */
const PER_ATTEMPT_TIMEOUT_MS = 15_000;
/** intentos dentro de la MISMA invocación (con backoff entre ellos) */
const INLINE_ATTEMPTS = 3;
const INLINE_BACKOFF_MS = [800, 3_200];
/** límite TOTAL de intentos por correo (invocación + cron); después, error final */
export const MAX_TOTAL_ATTEMPTS = 5;
/**
 * El cron solo puede reenviar correos cuyo cuerpo guardado es completo y sin
 * secrets (WELCOME/RECEIPT/GENERIC — no llevan tokens). VERIFY/RESET no se
 * reenvían desde el log (el cuerpo va redactado y el enlace es de un solo
 * uso): el usuario pide un enlace nuevo, que es la UX existente.
 */
/** v31: única definición (el cron de reintentos la importa — antes había 2 copias que podían divergir). */
export const RETRYABLE_TYPES: MailType[] = ["WELCOME", "RECEIPT", "GENERIC", "DIGEST", "ALERT"];

function retryDelayMs(totalAttempts: number): number {
  const hours = Math.min(2 ** Math.max(0, totalAttempts - 2), 24);
  return hours * 3600_000;
}

/**
 * Descripció tècnica COMPLETA d'un error, recorrent la cadena `cause`.
 *
 * Node (undici) embolcalla tots els errors de xarxa dins un genèric
 * "TypeError: fetch failed" — la causa real (DNS que no resol, certificat
 * TLS, timeout de connexió, socket tancat pel servidor) és a `e.cause`.
 * Sense recórrer la cadena, el log només diu "fetch failed" i el problema
 * és indiagnosticable (cas real: EmailLog ple de "TypeError: fetch failed").
 */
function describeError(e: unknown): string {
  const parts: string[] = [];
  let cur: any = e;
  for (let depth = 0; cur && depth < 5; depth++) {
    const bits = [String(cur.name ?? "Error")];
    if (cur.code) bits.push(`[${cur.code}]`);
    if (cur.syscall || cur.hostname) {
      bits.push(`(${[cur.syscall, cur.hostname].filter(Boolean).join(" ")})`);
    }
    if (cur.message) bits.push(String(cur.message));
    parts.push(bits.join(" "));
    cur = cur.cause;
  }
  return parts.join("  <-  ") || "unknown";
}

export interface DeliverResult {
  ok: boolean;
  /** id que Resend devuelve al aceptar el envío (trazabilidad) */
  messageId?: string;
  error?: string;
  attempts: number;
  /** true si el fallo es transitorio (red/5xx) y tiene sentido reintentar */
  retryable: boolean;
}

/**
 * Enviament CRU a Resend amb reintent + backoff.
 * L'usen sendMail (3 intents inline) i el cron /api/cron/emails (2 per passada).
 * Els 4xx NO es reintenten (són deterministes: clau invàlida, domini sense
 * verificar, 422 de validació...). Els errors de xarxa i els 5xx sí.
 */
export async function deliverWithResend(
  mail: { to: string; subject: string; html: string },
  maxAttempts: number
): Promise<DeliverResult> {
  const payload = JSON.stringify({
    from: process.env.MAIL_FROM || "Preureal <onboarding@resend.dev>",
    to: [mail.to],
    subject: mail.subject,
    html: mail.html,
  });
  const headers = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };

  let lastErr: string | null = null;
  let lastRetryable = true;
  let used = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    used = attempt;
    const t0 = Date.now();
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers,
        body: payload,
        // evita quedar penjat indefinidament si la connexió queda col·gada
        signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
      });
      if (res.ok) {
        let messageId: string | undefined;
        try {
          const j: any = await res.json();
          if (j && typeof j.id === "string") messageId = j.id;
        } catch {
          /* resposta sense JSON: l'enviament igualment ha estat acceptat */
        }
        return { ok: true, messageId, attempts: attempt, retryable: false };
      }
      // inclou el codi HTTP i la durada: 401 clau invàlida, 403 domini sense
      // verificar / destinatari de prova, 422 validació, 429 quota
      lastErr = `HTTP ${res.status} [intento ${attempt}, ${Date.now() - t0}ms]: ${await res.text()}`;
      lastRetryable = res.status >= 500;
      if (!lastRetryable) break; // 4xx determinista: reintentar no ajuda
    } catch (netErr) {
      // la durada diagnostica sola: ~15000ms → guardià d'abort (connexió
      // congelada/penjada); pocs ms → error real de DNS/socket/TLS
      lastErr = `fetch [intento ${attempt}, ${Date.now() - t0}ms]: ${describeError(netErr)}`;
      lastRetryable = true;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) =>
        setTimeout(r, INLINE_BACKOFF_MS[Math.min(attempt - 1, INLINE_BACKOFF_MS.length - 1)])
      );
    }
  }
  return { ok: false, error: lastErr ?? "unknown", attempts: used, retryable: lastRetryable };
}

export async function sendMail({
  to,
  subject,
  html,
  type = "GENERIC",
  userId = null,
  idempotencyKey,
}: MailInput): Promise<boolean> {
  const provider = mailProvider();
  // P0: el cos a la BD mai conté tokens (el real només surt cap a Resend)
  const safeBody = redactSecrets(html);

  try {
    if (provider !== "resend") {
      await db.emailLog.create({
        data: { to, subject, body: safeBody, provider: "sandbox", status: "logged", type, userId },
      });
      return true;
    }

    // ── Idempotència: si aquest correu lògic ja va sortir, no es repeteix ──
    if (idempotencyKey) {
      const dup = await db.emailLog.findUnique({ where: { idempotencyKey } }).catch(() => null);
      if (dup) return dup.status === "sent";
    }

    // ── OUTBOX: la fila durables es crea ABANS d'enviar ──
    // Si l'execució mor a mitges (deploy, timeout d'infraestructura, kill),
    // la fila queda "pending" amb nextRetryAt i el cron la recupera després.
    let row;
    try {
      row = await db.emailLog.create({
        data: {
          to,
          subject,
          body: safeBody,
          provider,
          status: "pending",
          type,
          userId,
          idempotencyKey,
          attempts: 0,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // clau d'idempotència duplicada: una altra invocació ja ha registrat
        // aquest correu (o se n'ocupa) — mai dos enviaments pel mateix esdeveniment
        return false;
      }
      throw e;
    }

    // ── enviament amb reintent + backoff ──
    const out = await deliverWithResend({ to, subject, html }, INLINE_ATTEMPTS);

    if (out.ok) {
      await db.emailLog.update({
        where: { id: row.id },
        data: {
          status: "sent",
          error: null,
          providerMessageId: out.messageId ?? null,
          sentAt: new Date(),
          attempts: out.attempts,
        },
      });
      return true;
    }

    // ── fallo: estat durables + programar reposició (outbox) si té sentit ──
    const total = row.attempts + out.attempts;
    const scheduleRetry =
      out.retryable && total < MAX_TOTAL_ATTEMPTS && RETRYABLE_TYPES.includes(type);
    await db.emailLog.update({
      where: { id: row.id },
      data: {
        status: "error",
        error: out.error ?? "unknown",
        attempts: total,
        nextRetryAt: scheduleRetry ? new Date(Date.now() + retryDelayMs(total)) : null,
      },
    });
    return false;
  } catch (e: any) {
    try {
      await db.emailLog.create({
        data: { to, subject, body: safeBody, provider, status: "error", error: describeError(e), type, userId },
      });
    } catch {}
    return false;
  }
}

const BRAND = "Preureal";

function layout(title: string, body: string, locale: "ca" | "es") {
  const cta =
    locale === "ca"
      ? "Obre el mapa de Preureal"
      : "Abre el mapa de Preureal";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#faf9f7;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
    <div style="background:#0f2e21;color:#fff;padding:20px 28px;font-size:20px;font-weight:700">${BRAND}</div>
    <div style="padding:28px">
      <h2 style="margin:0 0 12px;font-size:18px;color:#0f2e21">${title}</h2>
      <div style="font-size:14px;line-height:1.6;color:#333">${body}</div>
      <a href="${getSiteUrlOrigin()}" style="display:inline-block;margin-top:20px;background:#e8673c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">${cta}</a>
    </div>
    <div style="padding:16px 28px;background:#f5f4f1;font-size:12px;color:#777">
      ${locale === "ca" ? "Reps aquest correu perquè t'has registrat a Preureal." : "Recibes este correo porque te has registrado en Preureal."}
    </div>
  </div></body></html>`;
}

export function welcomeMail(
  name: string | null,
  locale: "ca" | "es",
  // v23 — preu eficaç de la configuració de plans (mai hardcodejat): si l'admin
  // canvia el preu de Premium, els correus de benvinguda el reflecteixen.
  premiumPriceEur: number = 7.99
) {
  const premiumPrice = `${premiumPriceEur.toFixed(2).replace(".", ",")} €`;
  // el nom ve de l'usuari: SEMPRE escapam (V2 de l'auditoria — injecció HTML)
  const safeName = name ? escapeHtml(name) : "";
  const title =
    locale === "ca"
      ? `Benvingut/da a Preureal${safeName ? ", " + safeName : ""}!`
      : `Bienvenido/a a Preureal${safeName ? ", " + safeName : ""}`;
  const body =
    locale === "ca"
      ? `<p>Ja pots consultar el <b>preu mitjà real de lloguer registrat oficialment</b> (fiances Incasòl) als municipis de Catalunya, juntament amb l'estat d'àrea de mercat residencial tensat.</p>
         <p>Tens <b>3 consultes detallades gratuïtes cada mes</b>. Quan s'acabin, pots activar el pla Premium (${premiumPrice}/mes) per a consultes il·limitades.</p>`
      : `<p>Ya puedes consultar el <b>precio medio real de alquiler registrado oficialmente</b> (fianzas Incasòl) en los municipios de Cataluña, junto con el estado de área de mercado residencial tensionado.</p>
         <p>Tienes <b>3 consultas detalladas gratuitas cada mes</b>. Cuando se acaben, puedes activar el plan Premium (${premiumPrice}/mes) para consultas ilimitadas.</p>`;
  return { subject: title, html: layout(title, body, locale) };
}

export function receiptMail(planName: string, amount: string, locale: "ca" | "es") {
  // el nom del pla i l'import venen del servidor, però s'escapen per defensa en
  // profunditat (cap dada dinàmica entra sense escapar al HTML — auditoria v19)
  const safePlan = escapeHtml(planName);
  const safeAmount = escapeHtml(amount);
  const title = locale === "ca" ? "Subscripció activada" : "Suscripción activada";
  const body =
    locale === "ca"
      ? `<p>El teu pla <b>${safePlan}</b> ja està actiu (${safeAmount}/mes). Gràcies per donar suport a un projecte independent!</p><p>Ja tens consultes il·limitades al mapa.</p>`
      : `<p>Tu plan <b>${safePlan}</b> ya está activo (${safeAmount}/mes). ¡Gracias por apoyar un proyecto independiente!</p><p>Ya tienes consultas ilimitadas en el mapa.</p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}

/**
 * v38.8 — correu d'entrega d'un informe individual de pagament únic. L'URL de
 * descàrrega porta el TOKEN cru (256 bits, base64url): és l'única credencial
 * de descàrrega sense login, per això a la BD només hi consta el seu SHA-256.
 * El nom del producte ve del servidor i s'escapa (auditoria v19).
 */
export function reportReadyMail(productName: string, downloadUrl: string, locale: "ca" | "es") {
  const safeName = escapeHtml(productName);
  const safeUrl = escapeHtml(downloadUrl);
  const title = locale === "ca" ? "El teu informe ja està a punt" : "Tu informe ya está listo";
  const body =
    locale === "ca"
      ? `<p>La compra de l'informe <b>${safeName}</b> s'ha confirmat i el document ja està generat.</p>
         <p><a href="${safeUrl}" style="display:inline-block;margin-top:8px;background:#e8673c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">${locale === "ca" ? "Descarregar el PDF" : "Descargar el PDF"}</a></p>
         <p>L'enllaç és personal: el PDF es pot descarregar sempre amb aquesta adreça (no caduca), i també des del teu compte a preureal.com.</p>`
      : `<p>La compra del informe <b>${safeName}</b> se ha confirmado y el documento ya está generado.</p>
         <p><a href="${safeUrl}" style="display:inline-block;margin-top:8px;background:#e8673c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">Descargar el PDF</a></p>
         <p>El enlace es personal: el PDF se puede descargar siempre con esta dirección (no caduca), y también desde tu cuenta en preureal.com.</p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}

export function verifyMail(token: string, locale: "ca" | "es") {
  // URL sempre absoluta i ben formada (mai relativa, mai env mal escrita)
  const url = `${getSiteUrlOrigin()}/#/verifica?token=${token}`;
  const title = locale === "ca" ? "Verifica el teu correu" : "Verifica tu correo";
  const body =
    locale === "ca"
      ? `<p>Confirma la teva adreça electrònica clicant aquest enllaç (vàlid 24 hores, d'un sol ús):</p><p><a href="${url}">${url}</a></p>`
      : `<p>Confirma tu dirección de correo electrónico abriendo este enlace (válido 24 horas, de un solo uso):</p><p><a href="${url}">${url}</a></p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}

export function resetMail(token: string, locale: "ca" | "es") {
  // URL sempre absoluta i ben formada (mai relativa, mai env mal escrita)
  const url = `${getSiteUrlOrigin()}/#/restablir?token=${token}`;
  const title = locale === "ca" ? "Restableix la contrasenya" : "Restablece la contraseña";
  const body =
    locale === "ca"
      ? `<p>Has demanat restablir la contrasenya. Obre aquest enllaç (vàlid 1 hora, d'un sol ús):</p><p><a href="${url}">${url}</a></p>`
      : `<p>Has solicitado restablecer la contraseña. Abre este enlace (válido 1 hora, de un solo uso):</p><p><a href="${url}">${url}</a></p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}

// ── v24: resum mensual de preferits ─────────────────────────────────────────

export interface DigestItem {
  label: string;
  rentLatest: number | null;
  rentPeriod: string | null;
  /** % de variació vs l'any anterior (null si no hi ha dades per calcular-la) */
  trendPct: number | null;
  /** enllaç directe "obre-ho al mapa" (/#/mapa?mun=... o ?edifici=...) */
  url: string;
}

/**
 * Resum mensual dels preferits (v24, opt-in): el preu mitjà vigent de cada
 * municipi/edifici desat amb el seu enllaç directe al mapa. Totes les dades
 * dinàmiques venen de la BD (noms oficials Incasòl) i s'escapen; els enllaços
 * es construeixen amb codis validats en origen (municipalityCode / buildingId).
 */
export function favoritesDigestMail(items: DigestItem[], locale: "ca" | "es") {
  const ca = locale === "ca";
  const title = ca ? "Els teus preferits aquest mes" : "Tus favoritos este mes";
  const rows = items
    .map((it) => {
      const rent =
        it.rentLatest != null
          ? `<b>${it.rentLatest.toFixed(0)} €/mes</b>${it.rentPeriod ? ` <span style="color:#777">(${escapeHtml(it.rentPeriod)})</span>` : ""}`
          : ca ? "sense dades oficials aquest període" : "sin datos oficiales este período";
      const trend =
        it.trendPct != null
          ? ` · <span style="color:${it.trendPct > 0 ? "#b0431c" : "#1e7a41"}">${it.trendPct > 0 ? "+" : ""}${it.trendPct.toFixed(1)}% vs any anterior</span>`
          : "";
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #eee"><a href="${getSiteUrlOrigin()}${it.url}" style="color:#0f2e21;font-weight:600;text-decoration:none">${escapeHtml(it.label)}</a><br>${rent}${trend}</td></tr>`;
    })
    .join("");
  const body =
    ca
      ? `<p>Preu mitjà de lloguer (fiances Incasòl) dels municipis i edificis que tens desats als preferits:</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="font-size:12px;color:#777">Pots desactivar aquest avís al panell → Preferits.</p>`
      : `<p>Precio medio de alquiler (fianzas Incasòl) de los municipios y edificios que tienes guardados en favoritos:</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="font-size:12px;color:#777">Puedes desactivar este aviso en el panel → Favoritos.</p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}

// ── v37: alertes de preu i àrees tensades ───────────────────────────────────

export interface PriceAlertEntry {
  label: string;
  kind: "PRICE_UP" | "PRICE_DOWN" | "TENSE";
  prevValue: number | null;
  newValue: number | null;
  pct: number | null;
  period: string | null;
  url: string;
}

/**
 * Avís d'alerta de preu (v37): el cron detecta que un preferit amb alerta
 * activada ha canviat >= alertPct% (o el municipi ha passat a àrea tensada)
 * i agrupa tots els canvis d'un usuari en UN correu. Dades només de la BD;
 * els enllaços són ?mun=/?edifici= amb codis validats en origen.
 */
export function priceAlertMail(items: PriceAlertEntry[], locale: "ca" | "es") {
  const ca = locale === "ca";
  const title = ca ? "Avís: canvis als teus preferits" : "Aviso: cambios en tus favoritos";
  const rows = items
    .map((it) => {
      const icon = it.kind === "PRICE_UP" ? "▲" : it.kind === "PRICE_DOWN" ? "▼" : "●";
      const color = it.kind === "PRICE_UP" ? "#b0431c" : it.kind === "PRICE_DOWN" ? "#1e7a41" : "#8a5a00";
      const pricePart =
        it.kind === "TENSE"
          ? ca
            ? "Ara és <b>àrea de mercat residencial tensat</b>: els nous contractes poden quedar limitats per l'índex de referència."
            : "Ahora es <b>área de mercado residencial tensionado</b>: los nuevos contratos pueden quedar limitados por el índice de referencia."
          : [
              it.prevValue != null ? `${it.prevValue.toFixed(0)} €` : "—",
              " → ",
              `<b>${it.newValue != null ? it.newValue.toFixed(0) + " €" : "—"}</b>`,
              it.pct != null ? ` <span style="color:${color};font-weight:600">(${it.pct > 0 ? "+" : ""}${it.pct.toFixed(1)}%)</span>` : "",
            ].join("");
      const periodPart = it.period ? ` <span style="color:#777">· ${escapeHtml(it.period)}</span>` : "";
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><a href="${getSiteUrlOrigin()}${it.url}" style="color:#0f2e21;font-weight:600;text-decoration:none">${escapeHtml(it.label)}</a><br><span style="color:${color}">${icon}</span> ${pricePart}${periodPart}</td></tr>`;
    })
    .join("");
  const body = ca
    ? `<p>S'ha canviat el valor vigent de lloguer registrat (fiances Incasòl) d'algun dels teus preferits amb alerta activada:</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="font-size:12px;color:#777">Gestiona les alertes al panell → Preferits. Pots ajustar el llindar % o desactivar-les quan vulguis.</p>`
    : `<p>Ha cambiado el valor vigente de alquiler registrado (fianzas Incasòl) de alguno de tus favoritos con alerta activada:</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="font-size:12px;color:#777">Gestiona las alertas en el panel → Favoritos. Puedes ajustar el umbral % o desactivarlas cuando quieras.</p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}
