import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/security";

/**
 * Correos automáticos de PreuReal.cat.
 *
 * REGLA DE NEGOCIO: no se contrata ningún proveedor sin autorización del
 * propietario. Comportamiento:
 *  - Si RESEND_API_KEY está definida → envía con Resend (el usuario habrá
 *    autorizado y conectado su cuenta).
 *  - Si no → modo sandbox: guarda el email en EmailLog (visible en el panel
 *    de administración) sin enviar nada.
 */

export function mailProvider(): "resend" | "sandbox" {
  return process.env.RESEND_API_KEY ? "resend" : "sandbox";
}

interface MailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: MailInput) {
  const provider = mailProvider();
  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM || "PreuReal.cat <onboarding@resend.dev>",
          to: [to],
          subject,
          html,
        }),
      });
      const ok = res.ok;
      const err = ok ? null : await res.text();
      await db.emailLog.create({
        data: { to, subject, body: html, provider, status: ok ? "sent" : "error", error: err },
      });
      return ok;
    }
    await db.emailLog.create({
      data: { to, subject, body: html, provider: "sandbox", status: "logged" },
    });
    return true;
  } catch (e: any) {
    try {
      await db.emailLog.create({
        data: { to, subject, body: html, provider, status: "error", error: String(e) },
      });
    } catch {}
    return false;
  }
}

const BRAND = "PreuReal.cat";

function layout(title: string, body: string, locale: "ca" | "es") {
  const cta =
    locale === "ca"
      ? "Obre el mapa de PreuReal.cat"
      : "Abre el mapa de PreuReal.cat";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#faf9f7;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
    <div style="background:#0f2e21;color:#fff;padding:20px 28px;font-size:20px;font-weight:700">${BRAND}</div>
    <div style="padding:28px">
      <h2 style="margin:0 0 12px;font-size:18px;color:#0f2e21">${title}</h2>
      <div style="font-size:14px;line-height:1.6;color:#333">${body}</div>
      <a href="{{SITE_URL}}" style="display:inline-block;margin-top:20px;background:#e8673c;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">${cta}</a>
    </div>
    <div style="padding:16px 28px;background:#f5f4f1;font-size:12px;color:#777">
      ${locale === "ca" ? "Reps aquest correu perquè t'has registrat a PreuReal.cat." : "Recibes este correo porque te has registrado en PreuReal.cat."}
    </div>
  </div></body></html>`;
}

export function welcomeMail(name: string | null, locale: "ca" | "es") {
  // el nom ve de l'usuari: SEMPRE escapam (V2 de l'auditoria — injecció HTML)
  const safeName = name ? escapeHtml(name) : "";
  const title =
    locale === "ca"
      ? `Benvingut/da a PreuReal.cat${safeName ? ", " + safeName : ""}!`
      : `Bienvenido/a a PreuReal.cat${safeName ? ", " + safeName : ""}`;
  const body =
    locale === "ca"
      ? `<p>Ja pots consultar el <b>preu mitjà real de lloguer registrat oficialment</b> (fiances Incasòl) als municipis de Catalunya, juntament amb l'estat d'àrea de mercat residencial tensat.</p>
         <p>Tens <b>3 consultes detallades gratuïtes cada mes</b>. Quan s'acabin, pots activar el pla Premium (7,99 €/mes) per a consultes il·limitades.</p>`
      : `<p>Ya puedes consultar el <b>precio medio real de alquiler registrado oficialmente</b> (fianzas Incasòl) en los municipios de Cataluña, junto con el estado de área de mercado residencial tensionado.</p>
         <p>Tienes <b>3 consultas detalladas gratuitas cada mes</b>. Cuando se acaben, puedes activar el plan Premium (7,99 €/mes) para consultas ilimitadas.</p>`;
  return { subject: title, html: layout(title, body, locale) };
}

export function receiptMail(planName: string, amount: string, locale: "ca" | "es") {
  const title = locale === "ca" ? "Subscripció activada" : "Suscripción activada";
  const body =
    locale === "ca"
      ? `<p>El teu pla <b>${planName}</b> ja està actiu (${amount}/mes). Gràcies per donar suport a un projecte independent!</p><p>Ja tens consultes il·limitades al mapa.</p>`
      : `<p>Tu plan <b>${planName}</b> ya está activo (${amount}/mes). ¡Gracias por apoyar un proyecto independiente!</p><p>Ya tienes consultas ilimitadas en el mapa.</p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}

export function verifyMail(token: string, locale: "ca" | "es") {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/#/verifica?token=${token}`;
  const title = locale === "ca" ? "Verifica el teu correu" : "Verifica tu correo";
  const body =
    locale === "ca"
      ? `<p>Confirma la teva adreça electrònica clicant aquest enllaç (vàlid 24 hores):</p><p><a href="${url}">${url}</a></p>`
      : `<p>Confirma tu dirección de correo electrónico abriendo este enlace (válido 24 horas):</p><p><a href="${url}">${url}</a></p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}

export function resetMail(token: string, locale: "ca" | "es") {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/#/restablir?token=${token}`;
  const title = locale === "ca" ? "Restableix la contrasenya" : "Restablece la contraseña";
  const body =
    locale === "ca"
      ? `<p>Has demanat restablir la contrasenya. Obre aquest enllaç (vàlid 1 hora):</p><p><a href="${url}">${url}</a></p>`
      : `<p>Has solicitado restablecer la contraseña. Abre este enlace (válido 1 hora):</p><p><a href="${url}">${url}</a></p>`;
  return { subject: `${BRAND} — ${title}`, html: layout(title, body, locale) };
}
