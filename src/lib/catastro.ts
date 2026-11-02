/**
 * Integració amb els serveis lliures del Cadastre (Direcció General del
 * Catastro) per obtenir l'ANY DE CONSTRUCCIÓ d'un edifici a partir de la
 * referència catastral.
 *
 * REGLES:
 *  - Totes les crides tenen timeout curt i DEGRADACIÓ ENCALLAT (mai trenquen
 *    la resposta de la API: si Catastro no respon, anyBuilt = null).
 *  - El resultat es posa en memòria cau a la BD (Building.yearBuilt).
 *  - L'estat d'integració es pot consultar a /api/health i al panell admin.
 *
 * Servei utilitzat (documentació oficial):
 *  https://www.catastro.hacienda.gob.es/ws/Webservices_Libres.pdf
 *  COVCCatastro.svc/Consulta_DNPPC (datos no protegidos de parcela urbana)
 */
import { db } from "@/lib/db";

const CATASTRO_HOST = "ovc.catastro.meh.es";

export function catastroConfigured(): boolean {
  // Els serveis lliures no requereixen clau; només arribabilitat de xarxa.
  return true;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "PreuReal.cat/1.0 (consulta dades obertes)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`catastro ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Consulta DNPPC: retorna l'any de la construcció principal de la parcel·la. */
export async function fetchYearBuiltByRefcat(refcat: string): Promise<number | null> {
  const rc = refcat.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9]{7}[A-Z]{1,2}[0-9]{3,7}[A-Z0-9]{2,4}$|^[0-9A-Z]{14,20}$/.test(rc)) return null;
  const url = `https://${CATASTRO_HOST}/OVCServWeb/OVCWcfCatastro/COVCCatastro.svc/Consulta_DNPPC?RC=${encodeURIComponent(rc)}`;
  const xml = await fetchWithTimeout(url, 6000);
  // el servei pot respondre HTML d'error de la seu; detectem resposta vàlida
  if (!xml || xml.includes("<title>####")) return null;
  const matches = [...xml.matchAll(/<data:antiguedad>(\d{4})<\/data:antiguedad>/gi)];
  const years = matches.map((m) => parseInt(m[1], 10)).filter((y) => y > 1500 && y <= new Date().getFullYear());
  if (years.length === 0) return null;
  return Math.min(...years); // any de l'edifici original
}

/** any de construcció amb cau: retorna {year, source} o null. */
export async function getYearBuilt(buildingId: string, refcat: string | null) {
  if (!refcat) return null;
  const existing = await db.building.findUnique({
    where: { id: buildingId },
    select: { yearBuilt: true, yearSource: true },
  });
  if (existing?.yearBuilt) {
    return { year: existing.yearBuilt, source: existing.yearSource || "CADASTRE_DNP" };
  }
  try {
    const year = await fetchYearBuiltByRefcat(refcat);
    if (year) {
      await db.building.update({
        where: { id: buildingId },
        data: { refcat, yearBuilt: year, yearSource: "CADASTRE_DNP" },
      });
      return { year, source: "CADASTRE_DNP" };
    }
  } catch {
    // degradació: sense dades
  }
  return null;
}
