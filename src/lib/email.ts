/**
 * Normalització de correus electrònics — evita comptes duplicats d'un mateix Gmail.
 *
 * Gmail ignora aquestes diferències (totes arriben a la mateixa bústia):
 *  - els punts del nom local:   joan.perez@gmail.com === joanperez@gmail.com
 *  - les etiquetes "+alias":    joan+proma@gmail.com  === joan@gmail.com
 *  - el domini equivalent:      compte@googlemail.com === compte@gmail.com
 *
 * Sense normalitzar, algú podria registrar-se N vegades (joan.perez@, joanperez@,
 * joan+1@, joan+2@…) per doblar les consultes gratuites de cada compte.
 *
 * La normalització NOMÉS s'aplica a Gmail: a la resta de proveïdors (outlook,
 * proton, yahoo, corporatius…) els punts i el '+' són significatius i poden
 * correspondre a bústies realment diferents.
 *
 * Convenció: a la BD el correu es desa SEMPRE normalitzat, i el login (i el
 * restabliment de contrasenya) normalitzen l'entrada abans de cercar-lo. Així
 * l'usuari pot escriure la seva adreça amb punts o sense i entra igualment.
 */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    // treu l'etiqueta +alias i els punts del nom local
    const base = local.split("+")[0].replace(/\./g, "");
    // defensa: si es queda buit (ex. ".@gmail.com"), deixa-ho com era
    return base ? `${base}@gmail.com` : email;
  }

  return email;
}
