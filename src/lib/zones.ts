/**
 * zones — capa de lectura del BUSCADOR INVERS (v67).
 *
 * Serveix els agregats per SECCIÓ CENSAL de geo.municipis /
 * geo.seccions_censals / geo.dades_lloguer_agregades (DDL:
 * pipeline/sql/002_zones_buscador_invers.sql, càrrega: pipeline/f4_zones_buscador.py).
 *
 * RGPD: nivell mínim de agregació = secció censal (unitat estadística oficial
 * Idescat/INE). Mai dades d'edifici o vivenda: la taula d'edificis
 * (geo.dim_building_rent_estimation) NO es consulta en aquesta ruta pública.
 *
 * Degradació honesta: si les taules encara no estan carregades, les rutes
 * donen 503 DATA_NOT_READY (patró de src/lib/geo.ts); si el municipi no té
 * cobertura (fora del pilot), la resposta és 200 amb cobertura FORA_ABAST —
 * mai s'inventen dades ni se simula cobertura.
 */
import { db } from "@/lib/db";
import { cached } from "@/lib/cache";
import { isGeoNotReady } from "@/lib/geo";

export type ZoneRow = {
  idSeccio: string;
  nom: string | null;
  anyReferencia: number | null;
  preuRealMitjaEurM2: number | null;
  indexReferenciaEurM2: number | null;
  complimentPct: number | null;
  nivellDada: string;
  complimentMetode: string | null;
  estimacio: boolean;
  numContractes: number | null;
  nEdificis: number;
  numViviendas: number | null;
  lat: number | null;
  lon: number | null;
};

export function isZonesNotReady(e: unknown): boolean {
  return isGeoNotReady(e);
}

/**
 * Zones d'un municipi ordenades de MAJOR a MENOR compliment de l'índex de
 * referència (NULLS LAST) i, a igualtat, per preu més baix. La consulta usa
 * l'índex idx_dades_muni_compliment (muni5, percentatge_compliment DESC NULLS
 * LAST) de manera que el planner no necessita escanejar ni ordenar en memòria.
 * La geometria MAI surt al payload (patró geo/illes): només atributs + centroide.
 */
export async function getZonesByMuni(muni5: string): Promise<ZoneRow[]> {
  return cached(`zones:muni:${muni5}`, 600_000, async () => {
    const rows = await db.$queryRaw<
      Array<{
        id_seccio: string;
        nom: string | null;
        anyo: number | null;
        preu: number | null;
        idx: number | null;
        comp: number | null;
        nivell_dada: string;
        compliment_metode: string | null;
        num_contractes: number | null;
        n_edificis: number;
        num_viviendas: number | null;
        estimacio: boolean;
        lat: number | null;
        lon: number | null;
      }>
    >`SELECT d."id_seccio", s."nom",
              d."any_referencia"::int                 AS anyo,
              d."preu_real_mitja_eur_m2"::float8      AS preu,
              d."index_referencia_eur_m2"::float8     AS idx,
              d."percentatge_compliment"::float8      AS comp,
              d."nivell_dada", d."compliment_metode",
              d."num_contractes"::int                 AS num_contractes,
              d."n_edificis"::int                     AS n_edificis,
              d."num_viviendas"::int                  AS num_viviendas,
              d."estimacio",
              s."lat"::float8 AS lat, s."lon"::float8 AS lon
       FROM geo.dades_lloguer_agregades d
       JOIN geo.seccions_censals s ON s."id_seccio" = d."id_seccio"
       WHERE d."muni5" = ${muni5}
       ORDER BY d."percentatge_compliment" DESC NULLS LAST,
                d."preu_real_mitja_eur_m2" ASC NULLS LAST
       LIMIT 2000`;
    return rows.map((r) => ({
      idSeccio: r.id_seccio,
      nom: r.nom,
      anyReferencia: r.anyo,
      preuRealMitjaEurM2: r.preu,
      indexReferenciaEurM2: r.idx,
      complimentPct: r.comp,
      nivellDada: r.nivell_dada,
      complimentMetode: r.compliment_metode,
      estimacio: r.estimacio,
      numContractes: r.num_contractes,
      nEdificis: r.n_edificis,
      numViviendas: r.num_viviendas,
      lat: r.lat,
      lon: r.lon,
    }));
  });
}

/** Munis amb cobertura del buscador (pilot carregat) — per a notes d'honestedat. */
export async function hasCoberturaZones(muni5: string): Promise<boolean> {
  return cached(`zones:cobert:${muni5}`, 600_000, async () => {
    const rows = await db.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS(
        SELECT 1 FROM geo.dades_lloguer_agregades WHERE "muni5" = ${muni5}
      ) AS ok`;
    return Boolean(rows[0]?.ok);
  });
}
