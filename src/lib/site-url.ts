/**
 * Preureal — Resolució segura de la URL pública del lloc.
 *
 * NEXT_PUBLIC_SITE_URL es defineix a Vercel (Settings → Environment
 * Variables). Si el valor és inexistent, buit o està mal escrit
 * (p. ex. "https//domini.cat" sense els dos punts després de "https"),
 * el build NO s'ha d'aturar: `new URL()` llançaria ERR_INVALID_URL dins
 * de "collect page data" i tot el desplegament cauria (cas real vist
 * en producció). Aquest helper retorna sempre un objecte URL vàlid:
 * el valor correcte si és usable, o la fallback oficial en cas contrari.
 */

/**
 * URL oficial del projecte, usada quan la variable d'entorn no és usable.
 *
 * v20: el domini CANÒNIC en producció és https://www.preureal.com (comprat
 * a Vercel, DNS automàtic; l'apex redirigeix 308 a www). El domini
 * `preureal.cat` NO està registrat (confirmació del propietari el
 * 2026-11-11: potser es registrarà més endavant): mentre no existeixi,
 * cap enllaç funcional hi ha de senyalar — un correu de verificació amb
 * enllaç mort deixa l'usuari encerclat al bloqueig «Verifica tu correo».
 */
const FALLBACK = "https://www.preureal.com";

/** Hosts locals vàlids sense punt (entorn de desenvolupament). */
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/;

/**
 * Retorna la URL pública del lloc com a objecte URL.
 * Mai llança excepcions.
 */
export function getSiteUrl(): URL {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();

  if (raw) {
    // Perdonem l'oblit de l'esquema: "preureal.cat" → "https://preureal.cat"
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      // Un host mínimament sèrio té un punt ("domini.tld") o és local.
      // Així descartem el típic "https//domini" mal escrit, que es
      // parsearia amb host invàlid en lloc de fallar.
      if ((url.hostname.includes(".") || LOCAL_HOSTS.test(url.hostname)) && !/\s/.test(url.hostname)) {
        return url;
      }
    } catch {
      // Valor mal format: cap al fallback.
    }
  }

  return new URL(FALLBACK);
}

/**
 * Variància en cadena, sense barra final. Útil per construir URLs
 * d'API/redirects a partir de la mateixa font.
 */
export function getSiteUrlOrigin(): string {
  return getSiteUrl().origin;
}
