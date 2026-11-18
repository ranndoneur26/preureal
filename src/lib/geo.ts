/**
 * geo — capa de lectura de las estimaciones del pipeline ETL+ML (F2/F3).
 *
 * Sirve los resultados del pipeline `pipeline/` (dim_building_rent_estimation,
 * geo_illes, geo_seccions) cargados en el esquema `geo` de la MISMA base de
 * datos. Nunca calcula en runtime: la inferencia es batch (f2_modelo_amb.py)
 * y aquí solo hay SELECTs puros con cache en memoria.
 *
 * Degradación honesta: si las tablas del esquema `geo` no existen todavía
 * (pipeline no ejecutado en esa BD), las rutas devuelven 503 DATA_NOT_READY —
 * jamás se inventan datos ni se simula cobertura.
 *
 * Gating del nivel EDIFICIO (valor de producción): PREMIUM/PRO. El nivel ILLA
 * es agregado municipal y queda público, coherente con el resto de datos
 * oficiales agregados del producto. Ningún endpoint existente cambia.
 */
import { db } from "@/lib/db";
import { cached } from "@/lib/cache";

export type GeoIlla = {
  id_illa: string;
  muni5: string;
  n_edificios: number;
  num_viviendas: number;
  renta_m2_media: number;
  calidad_media: number;
  lat: number | null;
  lon: number | null;
};

export type GeoEdifici = {
  id_edificio: string;
  id_illa: string;
  ref_catastral: string;
  id_seccio: string;
  num_viviendas: number;
  sup_media_m2: number;
  antiguedad: number;
  anyo_construccion: number;
  renta_serpavi_inf: number;
  renta_serpavi_sup: number;
  renta_estimada_edificio: number;
  renta_m2_mes: number;
  renta_ic95_edificio_inf: number;
  renta_ic95_edificio_sup: number;
  calidad_estimacion: number;
  calidad_grado: string;
  procedencia: string;
  fuera_rango_serpavi: boolean;
  anio_referencia: number;
  metodologia_version: string;
};

/** true si el error es "las tablas del esquema geo aún no están cargadas". */
export function isGeoNotReady(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e);
  return msg.includes("42P01") || msg.includes("does not exist") || msg.includes("P2022");
}

/** Illes de un municipio (agregado público; nivel de detalle illa/manzana). */
export async function getIllesByMuni(muni5: string): Promise<GeoIlla[]> {
  return cached(`geo:illes:${muni5}`, 600_000, async () => {
    const rows = await db.$queryRaw<
      Array<{
        id_illa: string;
        muni5: string;
        n_edificios: number;
        num_viviendas: number;
        renta_m2_media: number;
        calidad_media: number;
        lat: number | null;
        lon: number | null;
      }>
    >`SELECT "id_illa", "muni5", "n_edificios"::int AS "n_edificios",
              COALESCE("num_viviendas",0)::int AS "num_viviendas",
              "renta_m2_media"::float8 AS "renta_m2_media",
              "calidad_media"::float8 AS "calidad_media",
              "lat"::float8 AS "lat", "lon"::float8 AS "lon"
       FROM geo.geo_illes WHERE "muni5" = ${muni5}
       ORDER BY "id_illa" LIMIT 2000`;
    return rows;
  });
}

/** Estimación a nivel EDIFICIO por referencia catastral (gated Premium/Pro). */
export async function getEdificiEstimacio(refcatParam: string): Promise<GeoEdifici | null> {
  return cached(`geo:edifici:${refcatParam}`, 600_000, async () => {
    // admite '08001_000100300DF19C' (forma del dim) o la refcat de 14 en crudo
    const refcat = refcatParam.includes("_") ? refcatParam : `_%${refcatParam}`;
    const rows = await db.$queryRaw<GeoEdifici[]>`
      SELECT "id_edificio", "id_illa", "ref_catastral", "id_seccio",
             "num_viviendas"::int AS "num_viviendas",
             "sup_media_m2"::float8 AS "sup_media_m2",
             "antiguedad"::float8 AS "antiguedad",
             "anyo_construccion"::int AS "anyo_construccion",
             "renta_serpavi_inf"::float8 AS "renta_serpavi_inf",
             "renta_serpavi_sup"::float8 AS "renta_serpavi_sup",
             "renta_estimada_edificio"::float8 AS "renta_estimada_edificio",
             "renta_m2_mes"::float8 AS "renta_m2_mes",
             "renta_ic95_edificio_inf"::float8 AS "renta_ic95_edificio_inf",
             "renta_ic95_edificio_sup"::float8 AS "renta_ic95_edificio_sup",
             "calidad_estimacion"::float8 AS "calidad_estimacion",
             "calidad_grado", "procedencia", "fuera_rango_serpavi",
             "anio_referencia"::int AS "anio_referencia", "metodologia_version"
      FROM geo.dim_building_rent_estimation
      WHERE "ref_catastral" = ${refcatParam}
         OR (POSITION('_' IN ${refcatParam}) = 0 AND "ref_catastral" LIKE ${refcat})
      LIMIT 1`;
    return rows[0] ?? null;
  });
}
