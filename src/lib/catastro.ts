/**
 * Integració amb els serveis lliures del Cadastre (Direcció General del
 * Catastro) per obtenir l'ANY DE CONSTRUCCIÓ d'un edifici a partir de la
 * referència catastral.
 *
 * 2026-11-11 — MIGRACIÓ DEL SERVEI (fix):
 *   El servei WCF REST `COVCCatastro.svc/Consulta_DNPPC`
 *   (ovc.catastro.meh.es/OVCServWeb/OVCWcfCatastro/) ha estat RETIRAT per la
 *   Direcció General del Catastro: totes les operacions i el WSDL responen 404
 *   (també al mirall www.catastro.hacienda.gob.es/ovc.catastro.meh.es/).
 *   El substitut viu és el servei clàssic amb GET binding:
 *     OVCSWLocalizacionRC/OVCCallejero.asmx → Consulta_DNPRC
 *   Paràmetres: Provincia + Municipio (en NOM, sense accents) + RC.
 *   L'any de construcció ve al camp <debi><ant> (abans <data:antiguedad> del
 *   .svc). Verificat en calent amb RC reals: Carrer de Sants 10, Barcelona →
 *   ant 1900. NOMÉS accepta RC de parcel·la (14 caràcters): amb 20 respon
 *   «LA REFERENCIA CATASTRAL NO ESTÁ CORRECTAMENTE FORMADA» → es retalla a 14.
 *
 * REGLES:
 *  - Totes les crides tenen timeout curt i DEGRADACIÓ ENCALLAT (mai trenquen
 *    la resposta de la API: si Catastro no respon, anyBuilt = null).
 *  - El resultat es posa en memòria cau a la BD (Building.yearBuilt).
 *  - L'estat d'integració es pot consultar a /api/health i al panell admin.
 *
 * Documentació oficial dels serveis lliures:
 *  https://www.catastro.hacienda.gob.es/ws/Webservices_Libres.pdf
 */
import { db } from "@/lib/db";

const CATASTRO_DNPRC =
  "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC";

// Provincies catastrals de Catalunya, per prefix del codi municipal (6 dígitos
// format Gencat/ICGC: "08xxxx" Barcelona, "17xxxx" Girona, "25xxxx" Lleida,
// "43xxxx" Tarragona).
const PROVINCIES: Record<string, string> = {
  "08": "BARCELONA",
  "17": "GIRONA",
  "25": "LLEIDA",
  "43": "TARRAGONA",
};

/** Normalitza un nom per al Catastro: sense accents, majúscules, espais nets. */
function normalitzaNom(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

/**
 * Consulta DNPRC (OVCCallejero.asmx): retorna l'any de la construcció
 * principal de la parcel·la. El servei .asmx exigeix Provincia i Municipio en
 * nom; sense aquest context territorial no es pot consultar (null).
 */
export async function fetchYearBuiltByRefcat(
  refcat: string,
  ctx?: { provincia?: string | null; municipio?: string | null; municipalityCode?: string | null }
): Promise<number | null> {
  let rc = refcat.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9]{7}[A-Z]{1,2}[0-9]{3,7}[A-Z0-9]{2,4}$|^[0-9A-Z]{14,20}$/.test(rc)) return null;
  // el servei només accepta la referència de PARCEL·LA (14); si ve amb
  // inmueble (20), es consulta la parcel·la: mateixa antiguitat de base
  if (rc.length > 14) rc = rc.slice(0, 14);

  const provincia = ctx?.provincia
    ? normalitzaNom(ctx.provincia)
    : ctx?.municipalityCode
      ? PROVINCIES[ctx.municipalityCode.slice(0, 2)] || null
      : null;
  const municipio = ctx?.municipio ? normalitzaNom(ctx.municipio) : null;
  if (!provincia || !municipio) return null;

  const url = `${CATASTRO_DNPRC}?${new URLSearchParams({
    Provincia: provincia,
    Municipio: municipio,
    RC: rc,
  })}`;
  const xml = await fetchWithTimeout(url, 6000);
  // la seu pot respondre HTML d'error («#### Sede Electrónica ####»); els
  // errors de negoci (RC inexistent, municipi no trobat…) arriben com a HTTP
  // 200 amb <err> dins el XML: en tots aquests casos → null (mai s'inventa)
  if (!xml || xml.includes("<title>####")) return null;
  if (!xml.includes("<consulta_dnp")) return null;
  // any de construcció: <debi><ant>1900</ant> (servei nou) o el format antic
  // <data:antiguedad>/<antiguedad> del .svc retirat (per robustesa)
  const matches = [
    ...xml.matchAll(
      /<ant>(\d{4})<\/ant>|<(?:data:)?antiguedad>(\d{4})<\/(?:data:)?antiguedad>/gi
    ),
  ];
  const years = matches
    .map((m) => parseInt(m[1] || m[2], 10))
    .filter((y) => y > 1500 && y <= new Date().getFullYear());
  if (years.length === 0) return null;
  return Math.min(...years); // any de l'edifici original
}

/** any de construcció amb cau: retorna {year, source} o null. */
export async function getYearBuilt(
  buildingId: string,
  refcat: string | null,
  ctx?: { provincia?: string | null; municipio?: string | null; municipalityCode?: string | null }
) {
  if (!refcat) return null;
  const existing = await db.building.findUnique({
    where: { id: buildingId },
    select: { yearBuilt: true, yearSource: true },
  });
  if (existing?.yearBuilt) {
    return { year: existing.yearBuilt, source: existing.yearSource || "CADASTRE_DNP" };
  }
  try {
    const year = await fetchYearBuiltByRefcat(refcat, ctx);
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
