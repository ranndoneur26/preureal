/**
 * v40 — Parsers i helpers PURS del bloc «Serveis i qualitat de l'entorn»
 * (Fase A). Sense BD ni xarxa: testable amb fixtures reals
 * (tests/fixtures/entorn/*.json).
 *
 * Fonts (portal Socrata de la Generalitat, analisi.transparenciacatalunya.cat):
 *  - ENTORNT_ENERGIA     ICAEN j6ii-t3w2 — certificats d'eficiència energètica
 *                        d'edificis AMB referència catastral (associació REFCAT).
 *  - ENTORNT_RECARREGA   tb2m-m33b — estacions de recàrrega de vehicle elèctric.
 *  - ENTORNT_SANITARIS   nrmq-ytje — establiments sanitaris autoritzats
 *                        (CatSalut; inclou farmàcies).
 *  - ENTORNT_DOCENTS     kvmv-ahh4 — directori de centres docents.
 *  - ENTORNT_EQUIPAMENTS 8gmd-gz7i — equipaments de Catalunya (filtre
 *                        Cultura / Esports. Lleure).
 *
 * Regla d'or de l'encàrrec: una fila sense coordenades vàlides o sense
 * identificador NO s'inventa — es descarta i queda comptada com a "skipped".
 */

export type GeoPointInput = {
  category: string;
  kind: string | null;
  externalId: string | null;
  name: string;
  municipalityCode: string | null;
  lat: number;
  lng: number;
  props: string;
  /** codi INE de 5 dígits en cru de la font (el lliga la capa d'importació). */
  ine5: string | null;
};

type Row = Record<string, unknown>;

const str = (v: unknown): string =>
  v == null ? "" : typeof v === "string" ? v.trim() : String(v).trim();

/** Normalitza una referència catastral: majúscules, sense espais ni guions. */
export function normalizeRefcat(rc: string): string {
  return rc.replace(/[\s-]/g, "").toUpperCase();
}

/** Normalitza un "kind": majúscules, sense accents, no alfanumèrics → "_". */
export function normalizeKind(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Converteix un valor de la font a número finit (null si no és usable). */
export function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Valida coordenades: lat [-90,90], lng [-180,180]. */
export function parseLat(v: unknown): number | null {
  const n = toNum(v);
  return n != null && Math.abs(n) <= 90 ? n : null;
}
export function parseLng(v: unknown): number | null {
  const n = toNum(v);
  return n != null && Math.abs(n) <= 180 ? n : null;
}

/** Estacions de recàrrega (tb2m-m33b) → GeoPointInput. */
export function mapRecarrega(row: Row): GeoPointInput | null {
  const lat = parseLat(row.latitud);
  const lng = parseLng(row.longitud);
  const id = str(row.id);
  if (lat == null || lng == null || !id) return null;
  const kw = toNum(row.kw);
  const adreca = str(row.adre_a);
  const props = {
    kw,
    acDc: str(row.ac_dc) || null,
    connexio: str(row.tipus_connexi) || null,
    velocitat: str(row.tipus_velocitat) || null,
    acces: str(row.acces) || null,
    promotor: str(row.promotor_gestor) || null,
    adreca: adreca || null,
    municipi: str(row.municipi) || null,
  };
  return {
    category: "CHARGING_STATION",
    kind: normalizeKind(str(row.tipus_velocitat)) || null,
    externalId: id,
    name: adreca || str(row.designaci_descriptiva) || "Estació de recàrrega",
    municipalityCode: null,
    lat,
    lng,
    props: JSON.stringify(props),
    ine5: str(row.codimun) || null,
  };
}

/** Establiments sanitaris (nrmq-ytje) → GeoPointInput. */
export function mapSanitari(row: Row): GeoPointInput | null {
  const lat = parseLat(row.latitud);
  const lng = parseLng(row.longitud);
  const id = str(row.establiment_codi);
  if (lat == null || lng == null || !id) return null;
  const props = {
    tipus: str(row.tipus_establiment_nom) || null,
    adreca: [str(row.tipus_via_nom), str(row.via_nom), str(row.numero_via)]
      .filter(Boolean)
      .join(" ") || null,
    cp: str(row.codi_postal) || null,
    abs: str(row.abs_nom) || null,
    regioSanitaria: str(row.regio_sanitaria_nom) || null,
    telefon: str(row.telefon) || null,
  };
  return {
    category: "PUBLIC_FACILITY",
    kind: normalizeKind(str(row.tipus_establiment_nom)) || "SANITARI",
    externalId: id,
    name: str(row.establiment_nom) || "Establiment sanitari",
    municipalityCode: null,
    lat,
    lng,
    props: JSON.stringify(props),
    ine5: str(row.municipi_codi) || null,
  };
}

/** Centres docents (kvmv-ahh4) → GeoPointInput. */
export function mapDocent(row: Row): GeoPointInput | null {
  const lat = parseLat(row.coordenades_geo_y);
  const lng = parseLng(row.coordenades_geo_x);
  const id = str(row.codi_centre);
  if (lat == null || lng == null || !id) return null;
  const props = {
    naturalesa: str(row.nom_naturalesa) || null,
    titularitat: str(row.nom_titularitat) || null,
    adreca: str(row.adre_a) || null,
    cp: str(row.codi_postal) || null,
    curs: str(row.curs) || null,
    nivells: [str(row.einf1c) && "EINF", str(row.epri) && "EPRI", str(row.eso) && "ESO", str(row.batx) && "BATX"].filter(Boolean),
  };
  return {
    category: "PUBLIC_FACILITY",
    kind: "EDUCACIO",
    externalId: id,
    name: str(row.denominaci_completa) || "Centre docent",
    municipalityCode: str(row.codi_municipi_6) || null,
    lat,
    lng,
    props: JSON.stringify(props),
    ine5: str(row.codi_municipi) || null,
  };
}

/** Equipaments de Catalunya (8gmd-gz7i) → GeoPointInput (amb filtre de
 * categoria; el filtre de categories es fa a la consulta SODA, aquí es
 * normalitza el "kind"). */
export function mapEquipament(row: Row): GeoPointInput | null {
  const lat = parseLat(row.latitud);
  const lng = parseLng(row.longitud);
  const id = str(row.idequipament);
  if (lat == null || lng == null || !id) return null;
  const cat = str(row.categoria);
  const top = cat.split("|")[0].trim();
  const kindMap: Record<string, string> = {
    Cultura: "CULTURA",
    "Esports. Lleure": "ESPORT",
    "Comerç. Consum": "COMERC",
    "Medi ambient": "MEDI_AMBIENT",
    Habitatge: "HABITATGE",
    Salut: "SALUT",
    "Serveis socials bàsics": "SERVEIS_SOCIALS",
    "Serveis socials especialitzats": "SERVEIS_SOCIALS",
  };
  const props = {
    categoria: cat || null,
    nom: str(row.nom) || null,
    adreca: [str(row.tipus_via), str(row.via), str(row.num)].filter(Boolean).join(" ") || null,
    cp: str(row.cpostal) || null,
    poblacio: str(row.poblacio) || null,
    propietats: str(row.propietats) || null,
  };
  return {
    category: "PUBLIC_FACILITY",
    kind: kindMap[top] ?? (normalizeKind(top) || null),
    externalId: id,
    name: str(row.nom) || str(row.alies) || "Equipament",
    municipalityCode: null,
    lat,
    lng,
    props: JSON.stringify(props),
    ine5: str(row.codi_municipi) || null,
  };
}

export type CertificatEnergetic = {
  numCas: string;
  refcat: string;
  us: string | null;
  qualificacioConsum: string | null;
  qualificacioEmissions: string | null;
  consumKwhM2: number | null;
  emissionsCo2KgM2: number | null;
  energiaPrimariaKwhM2: number | null;
  metresCadastre: number | null;
  eina: string | null;
  motiu: string | null;
  dataEntrada: string | null;
};

/** Certificats ICAEN (j6ii-t3w2) → BuildingAssociation.value (associació REFCAT). */
export function mapCertificat(row: Row): CertificatEnergetic | null {
  const refcat = normalizeRefcat(str(row.referencia_cadastral));
  const numCas = str(row.num_cas);
  if (!refcat || !numCas) return null;
  return {
    numCas,
    refcat,
    us: str(row.us_edifici) || null,
    qualificacioConsum: str(row.qualificaci_de_consum_d) || null,
    qualificacioEmissions: str(row.qualificacio_d_emissions) || null,
    consumKwhM2: toNum(row.consum_d_energia_final),
    emissionsCo2KgM2: toNum(row.emissions_de_co2),
    energiaPrimariaKwhM2: toNum(row.energia_prim_ria_no_renovable),
    metresCadastre: toNum(row.metres_cadastre),
    eina: str(row.eina_de_certificacio) || null,
    motiu: str(row.motiu_de_la_certificacio) || null,
    dataEntrada: str(row.data_entrada) || null,
  };
}

/** Distància haversine en metres (línia recta — SEMPRE s'etiqueta com a tal). */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Bbox que conté tots els punts a radiusM d'un centre (aprox. plana). */
export function bboxAround(
  lat: number,
  lng: number,
  radiusM: number
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/** Radios del encàrrec (300/500/1000/2000 m) als quals pertany una distància. */
export function radiusBuckets(distM: number): number[] {
  return [300, 500, 1000, 2000].filter((r) => distM <= r);
}

/** Comptes per radius a partir d'una llista de distàncies. */
export function countsByRadius(dists: number[]): Record<string, number> {
  const out: Record<string, number> = { "300": 0, "500": 0, "1000": 0, "2000": 0 };
  for (const d of dists) {
    for (const r of radiusBuckets(d)) out[String(r)] += 1;
  }
  return out;
}
