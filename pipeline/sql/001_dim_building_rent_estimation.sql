-- ============================================================================
-- PASO 4 del encargo — esquema dim_building_rent_estimation (PostGIS)
-- PreuReal · pipeline ETL geoespacial + ML · versión v1.0-2026-11
--
-- Se ejecuta EN LA BASE DE DATOS DE PRODUCCIÓN por pipeline/f3_carga_postgis.py
-- (idempotente: DROP+CREATE sólo de las tablas del esquema `geo`, nunca toca
--  tablas del app). Si la BD no tiene PostGIS, el mismo script crea las
-- columnas geométricas como WKT text + lat/lon (mismo DDL conceptual).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS geo;

CREATE EXTENSION IF NOT EXISTS postgis;  -- en producción (Neon/managed): disponible

-- ----------------------------------------------------------------------------
-- Nivel EDIFICIO: esquema dim_building_rent_estimation (columnas del encargo)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS geo.dim_building_rent_estimation CASCADE;
CREATE TABLE geo.dim_building_rent_estimation (
  id_edificio                    text PRIMARY KEY,      -- CAT_<refcat14>
  id_illa                        text NOT NULL,         -- <muni5>_<masa> (illa/manzana)
  ref_catastral                  text NOT NULL,         -- <muni5>_<refcat14>
  id_seccio                      text NOT NULL,         -- CUSEC (sección censal)
  num_viviendas                  int    NOT NULL,
  sup_media_m2                   numeric(10,1),
  antiguedad                     numeric(10,1),         -- años (referencia 2024 SERPAVI)
  anyo_construccion              int,
  renta_serpavi_inf              numeric(10,3),         -- banda SERPAVI m²/mes (p25 ajustado)
  renta_serpavi_sup              numeric(10,3),         -- banda SERPAVI m²/mes (p75 ajustado)
  renta_media_contractual_ambito numeric(12,2),         -- fianza INCASÒL mensual media del ámbito (ground truth)
  num_contratos_ambito           int,                   -- nº contratos con fianza del ámbito
  ambito_ground_truth            text,                  -- 'MUNICIPI' (fichero seccional INCASÒL pendiente)
  renta_estimada_edificio        numeric(12,1),         -- €/mes estimados (edificio)
  renta_m2_mes                   numeric(10,4),         -- €/m²·mes estimados
  renta_ic95_edificio_inf        numeric(12,1),         -- IC95% inferior (€/mes)
  renta_ic95_edificio_sup        numeric(12,1),         -- IC95% superior (€/mes)
  calidad_estimacion             numeric(8,3),          -- 0,30–1,00 = 1 − 1,75·IC_rel
  calidad_grado                  text,                  -- A>0,75 / B>0,55 / C>0,35 / D≤0,35
  procedencia                    text,                  -- p.ej. '20% INCASÒL / 80% SERPAVI-OSM'
  procedencia_pct_incasol        int,                   -- peso INCASÒL 1–100
  fuera_rango_serpavi            boolean DEFAULT false, -- siempre false por construcción (clip a banda)
  anio_referencia                int,                   -- 2025 (fianza) / ancla SERPAVI 2024
  metodologia_version            text                   -- 'v1.0-2026-11'
);
CREATE INDEX IF NOT EXISTS idx_dim_illa   ON geo.dim_building_rent_estimation (id_illa);
CREATE INDEX IF NOT EXISTS idx_dim_seccio ON geo.dim_building_rent_estimation (id_seccio);
CREATE INDEX IF NOT EXISTS idx_dim_refcat ON geo.dim_building_rent_estimation (ref_catastral);
CREATE INDEX IF NOT EXISTS idx_dim_muni   ON geo.dim_building_rent_estimation (substring(ref_catastral,1,5));

-- ----------------------------------------------------------------------------
-- Nivel ILLA (manzana) — agregado + geometría (PostGIS)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS geo.geo_illes CASCADE;
CREATE TABLE geo.geo_illes (
  id_illa        text PRIMARY KEY,
  muni5          text NOT NULL,
  n_edificios    int    NOT NULL,
  num_viviendas  int,
  renta_m2_media numeric(10,3),
  calidad_media  numeric(8,3),
  geom           geometry(Polygon, 4258),      -- ETRS89; fallback sin PostGIS: WKT text
  lat            double precision,             -- centroide
  lon            double precision
);
CREATE INDEX IF NOT EXISTS idx_illes_muni ON geo.geo_illes (muni5);
CREATE INDEX IF NOT EXISTS idx_illes_geom ON geo.geo_illes USING GIST (geom);

-- ----------------------------------------------------------------------------
-- Nivel SECCIÓN CENSAL — agregado
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS geo.geo_seccions CASCADE;
CREATE TABLE geo.geo_seccions (
  id_seccio      text PRIMARY KEY,             -- CUSEC
  muni5          text NOT NULL,
  n_edificios    int    NOT NULL,
  renta_m2_media numeric(10,3),
  calidad_media  numeric(8,3)
);
CREATE INDEX IF NOT EXISTS idx_seccions_muni ON geo.geo_seccions (muni5);

-- ----------------------------------------------------------------------------
-- Consulta de ejemplo: edificios de una sección censal ordenados por calidad
-- ----------------------------------------------------------------------------
-- SELECT ref_catastral, num_viviendas, sup_media_m2, renta_m2_mes,
--        calidad_grado, procedencia
-- FROM   geo.dim_building_rent_estimation
-- WHERE  id_seccio = '08001801007'
-- ORDER  BY calidad_estimacion DESC;
