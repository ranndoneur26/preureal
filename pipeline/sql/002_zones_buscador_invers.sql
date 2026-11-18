-- ============================================================================
-- BUSCADOR INVERS — esquema `geo` per a la cerca de zones (v67)
-- PreuReal · taula 1: geo.municipis · taula 2: geo.seccions_censals ·
--             taula 3: geo.dades_lloguer_agregades
--
-- Propòsit: donar suport al «buscador invers» de la portada: trobar zones
-- (seccions censals / barris) on el preu real del lloguer compleix l'índex de
-- referència, amb estat ZMRT del municipi i percentatge de compliment.
--
-- Carregat per pipeline/f4_zones_buscador.py (idempotent: DROP+CREATE només
-- d'aquestes 3 taules; mai toca les taules del app ni les taules geo_* del
-- pipeline F1-F3). Si la BD no té PostGIS, el loader crea les columnes
-- geomètriques com a WKT text + lat/lon (mateix DDL conceptual).
--
-- RGPD (principi de mínima agregació): TOTA la lògica de dades d'aquest
-- esquema treballa a nivell de SECCIÓ CENSAL (unitat estadística oficial
-- Idescat/INE, milers de llars per unitat) o superior. Mai dades a nivell
-- d'edifici o de vivenda no anonimitzada: el nivell edifici viu únicament a
-- geo.dim_building_rent_estimation (ruta gated Premium/Pro) i NO s uneix mai
-- a aquestes taules en cap endpoint públic.
--
-- Traçabilitat del compliment legal:
--   · preu_real_mitja / índex de referència → fiances de lloguer (Incasòl)
--     via habitatge.gencat.cat; conversió a €/m²·mes amb la superfície mitjana
--     del parc (Catastro) — la MATEIXA conversió que el pipeline F2 usa per a
--     l'àncora municipal.
--   · estat ZMRT → Resolucions TER/3739/2026 (pròrroga) i TER/3740/2026
--     (nous) del DOGC 19-10-2026 (mateixa font que Municipality.isTense).
--   · geometria de secció censal → Idescat «bseccen» (seccionat vigent),
--     font ja autoritzada pel pipeline F1 (--seccions).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS geo;

CREATE EXTENSION IF NOT EXISTS postgis;  -- en producció (Neon/managed): disponible

-- ----------------------------------------------------------------------------
-- Taula 1 · MUNICIPIS — estat normatiu ZMRT + cobertura del pilot
-- (mirall analític espacial de public."Municipality": el app manté la seva
--  taula; aquesta només el que el buscador necessita en consultes geogràfiques)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS geo.dades_lloguer_agregades CASCADE;
DROP TABLE IF EXISTS geo.seccions_censals CASCADE;
DROP TABLE IF EXISTS geo.municipis CASCADE;

CREATE TABLE geo.municipis (
  muni5           text PRIMARY KEY,            -- codi INE de 5 dígits ("08019")
  nom             text NOT NULL,               -- "Barcelona"
  comarca         text,                        -- "Barcelonès"
  provincia       text,                        -- "Barcelona"
  zmrt            boolean NOT NULL DEFAULT false,
                                               -- Zona de Mercat Residencial
                                               -- Tensionat (DOGC 19-10-2026)
  tense_llista    text,                        -- 'A' (TER/3739/2026 pròrroga) |
                                               -- 'C' (TER/3740/2026 nous) | 'A/C'
  zmrt_font       text,                        -- traçabilitat de la declaració
  zmrt_publicacio text,                        -- "DOGC 19-10-2026"
  cobert          boolean NOT NULL DEFAULT false,
                                               -- true = amb dades de lloguer del
                                               -- pilot (àmbit geogràfic carregat)
  lat             double precision,            -- centroide municipal (ICGC)
  lon             double precision
);
COMMENT ON TABLE geo.municipis IS
  'Buscador invers: estat ZMRT i cobertura per municipi. Font: DOGC TER/3739/2026 + TER/3740/2026; municipis Idescat. Agregació municipal (pública).';

-- ----------------------------------------------------------------------------
-- Taula 2 · SECCIONS CENSALS — unitat d'agregació mínima del buscador (RGPD)
-- ----------------------------------------------------------------------------
CREATE TABLE geo.seccions_censals (
  id_seccio      text PRIMARY KEY,             -- CUSEC INE de 10-11 dígits ("08001801007")
  muni5          text NOT NULL,                -- FK lògica → geo.municipis(muni5)
  nom            text,                         -- nom del barri/secció quan la font
                                               -- el porti (Idescat bseccen); NULL
                                               -- → la UI mostra "Secció censal NNNNN"
  n_edificis     int    NOT NULL DEFAULT 0,    -- edificis del pipeline dins la secció
  num_viviendas  int,                          -- vivendes (Catastro) agregades
  geom           geometry(MultiPolygon, 4258), -- ETRS89 (Idescat bseccen); NULL fins
                                               -- la càrrega cartogràfica; sense
                                               -- PostGIS: WKT a wkt_fallback
  wkt_fallback   text,                         -- mateix polígon en WKT (sense PostGIS)
  lat            double precision,             -- centroide (bseccen o de les illes)
  lon            double precision
);
CREATE INDEX IF NOT EXISTS idx_seccions_z_muni ON geo.seccions_censals (muni5);
-- GIST només té sentit amb PostGIS; el loader el crea condicionalment
CREATE INDEX IF NOT EXISTS idx_seccions_z_geom ON geo.seccions_censals USING GIST (geom);
COMMENT ON TABLE geo.seccions_censals IS
  'Buscador invers: seccions censals (unitat estadística oficial). La geometria mai surt al payload públic; només atributs + centroide. RGPD: agregació ≥ secció censal, mai edifici/vivenda.';

-- ----------------------------------------------------------------------------
-- Taula 3 · DADES LLOGUER AGREGADES — mètriques del buscador per secció i any
-- ----------------------------------------------------------------------------
CREATE TABLE geo.dades_lloguer_agregades (
  id                       text PRIMARY KEY,   -- "<id_seccio>_<any>"
  id_seccio                text NOT NULL,      -- FK lògica → geo.seccions_censals
  muni5                    text NOT NULL,      -- FK lògica → geo.municipis
  any_referencia           int    NOT NULL,    -- "2025" (fiances Incasòl)
  preu_real_mitja_eur_m2   numeric(10,3),      -- €/m²·mes preu real (àmbit vigent)
  index_referencia_eur_m2  numeric(10,3),      -- €/m²·mes índex de referència
                                               -- (fiances Incasòl ÷ superfície
                                               --  mitjana del parc, Catastro)
  percentatge_compliment   numeric(5,2),       -- % de contractes ≤ índex (0-100);
                                               -- NULL si el mètode no el permet
  nivell_dada              text NOT NULL,      -- 'SECCIONAL' (fitxer seccional
                                               --  Incasòl publicat) |
                                               --  'MUNICIPAL' (àncla municipal
                                               --  aplicada a la secció: ESTIMACIÓ)
  compliment_metode        text,               -- 'CONTRACTES_REALS' (amb fitxer
                                               --  seccional) |
                                               --  'QUOTA_EDIFICIS_ESTIMADA' |
                                               --  NULL (sense índex comparable)
  num_contractes           int,                -- nº contractes amb fiances (àmbit)
  n_edificis               int,                -- edificis del pipeline a la secció
  num_viviendas            int,                -- vivendes ponderades
  estimacio                boolean NOT NULL DEFAULT true,
                                               -- true = mai presentar com a dada
                                               -- seccional oficial
  font                     text,               -- traçabilitat completa
  actualitzat_at           timestamp NOT NULL DEFAULT now()
);
-- Índex de la consulta optimitzada del buscador: per municipi, ordenat per
-- compliment DESC (NULLS LAST). El planner resol ORDER BY + LIMIT amb només
-- l'índex; el filtre per muni5 evita el scan de les altres comarques.
CREATE INDEX IF NOT EXISTS idx_dades_muni_compliment
  ON geo.dades_lloguer_agregades (muni5, percentatge_compliment DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_dades_seccio ON geo.dades_lloguer_agregades (id_seccio);
CREATE INDEX IF NOT EXISTS idx_dades_any    ON geo.dades_lloguer_agregades (any_referencia);
COMMENT ON TABLE geo.dades_lloguer_agregades IS
  'Buscador invers: agregats per secció censal i any. preu_real vs index_referencia + percentatge_compliment. RGPD: cap dada de contracte individual; només mitjanes/quotes de secció censal. nivell_dada=MUNICIPAL → ESTIMACIÓ fins que Incasòl publiqui el fitxer seccional.';

-- ----------------------------------------------------------------------------
-- Consulta de referència (la que implementa GET /api/zones?muni=):
-- ----------------------------------------------------------------------------
-- SELECT d.id_seccio, s.nom, d.preu_real_mitja_eur_m2, d.index_referencia_eur_m2,
--        d.percentatge_compliment, d.nivell_dada, d.compliment_metode,
--        d.estimacio, d.num_contractes, d.n_edificis, d.num_viviendas
-- FROM   geo.dades_lloguer_agregades d
-- JOIN   geo.seccions_censals s ON s.id_seccio = d.id_seccio
-- WHERE  d.muni5 = '08019' AND d.any_referencia = 2025
-- ORDER  BY d.percentatge_compliment DESC NULLS LAST,
--           d.preu_real_mitja_eur_m2 ASC NULLS LAST
-- LIMIT  2000;
