#!/usr/bin/env python3
"""F4 — Càrrega de les taules del BUSCADOR INVERS a PostgreSQL/PostGIS (v67).

Tres taules en l'esquema `geo` (mai toca cap taula del app ni les taules geo_*
del pipeline F1-F3; DDL de referència: pipeline/sql/002_zones_buscador_invers.sql):
  · geo.municipis             — estat ZMRT (DOGC) + cobertura del pilot
  · geo.seccions_censals      — secció censal (unitat d'agregació mínima, RGPD)
  · geo.dades_lloguer_agregades — preu real vs índex de referència + compliment

Fonts (TOTES ja autoritzades i JA presents a la mateixa BD):
  · public."Municipality"          — fiances Incasòl (habitatge.gencat.cat),
                                     estat ZMRT (TER/3739/2026 + TER/3740/2026)
  · geo.dim_building_rent_estimation — superfície mitjana (Catastro) i estimació
                                     per edifici del pipeline F2 (àncla municipal)
  · geo.geo_seccions / geo.geo_illes — seccions i illes del pipeline

Fórmules (les mateixes que la resta del producte, tracejades a la columna font):
  m² mitjà municipal     = Σ(sup_media_m2·num_viviendas) / Σ(num_viviendas)  [dim]
  índex de referència €/m²·mes = fiança mitjana oficial (€/mes, Incasòl o ref.
                                 de comarca ESTIMACIÓ) ÷ m² mitjà municipal
  preu real secció €/m²·mes    = Σ(renta_m2_mes·num_viviendas) / Σ(num_viviendas)
                                 dels edificis de la secció (àmbit MUNICIPAL:
                                 ancla + residu hedònic d'illa del F2)
  % compliment secció          = 100 · Σ(num_viviendas dels edificis amb
                                 renta_m2_mes ≤ índex) / Σ(num_viviendas)
                                 [mètode QUOTA_EDIFICIS_ESTIMADA; amb el fitxer
                                 seccional d'Incasòl passarà a CONTRACTES_REALS]

Idempotent: DROP+CREATE de només aquestes 3 taules. La URL de connexió MAI
s'imprimeix (només host/base, com a f3/verifica_prod). sense DATABASE_URL:
--url o la local per defecte del sandbox.

Ús:
  python3 f4_zones_buscador.py [--url postgresql://...] [--any 2025] \
      [--seccions-shp fitxer_bseccen.gpkg] [--out f4_carga.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

MIN_EDIFICIS_SECCIO = 5  # higiene RGPD: no publiquem agregats de seccions amb <5 edificis


def llegir_sql(cur, sql: str) -> pd.DataFrame:
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    return pd.DataFrame(cur.fetchall(), columns=cols)


def main() -> None:
    ap = argparse.ArgumentParser(description="F4 càrrega buscador invers (municipis + seccions + agregats)")
    ap.add_argument("--url", default=os.environ.get("DATABASE_URL", "postgresql://preureal@127.0.0.1:5432/preureal"),
                    help="connexió PG (mai s'imprimeix)")
    ap.add_argument("--any", dest="any_ref", type=int, default=None,
                    help="any de referència (per defecte: el màxim de la dim)")
    ap.add_argument("--seccions-shp", default=None,
                    help="opcional: geopackage/shapefile de seccions censals (Idescat bseccen) per a la geometria")
    ap.add_argument("--out", default="f4_carga.json")
    args = ap.parse_args()
    t0 = time.time()

    import psycopg2
    from psycopg2.extras import execute_values

    conn = psycopg2.connect(args.url)
    conn.autocommit = True
    cur = conn.cursor()
    print("BD:", conn.info.host, "/", conn.info.dbname)

    cur.execute("SELECT 1 FROM pg_available_extensions WHERE name='postgis'")
    te_postgis = cur.fetchone() is not None
    if te_postgis:
        cur.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    print("PostGIS disponible:", te_postgis)

    # ------------------------------------------------------------------
    # 0) fonts presents?
    # ------------------------------------------------------------------
    cur.execute("SELECT to_regclass('geo.dim_building_rent_estimation') IS NOT NULL AS dim_ok, "
                "to_regclass('geo.geo_seccions') IS NOT NULL AS seccions_ok, "
                "to_regclass('geo.geo_illes') IS NOT NULL AS illes_ok, "
                "to_regclass('public.\"Municipality\"') IS NOT NULL AS munis_ok")
    r = cur.fetchone()
    if not r[0] or not r[3]:
        sys.exit("Falten fonts: geo.dim_building_rent_estimation o public.\"Municipality\". "
                 "Executa primer el pipeline F3 i sembra els municipis (scripts/seed_municipis_pglocal.ts).")
    te_seccions, te_illes = bool(r[1]), bool(r[2])

    # ------------------------------------------------------------------
    # 1) municipis (app): fiances Incasòl + estat ZMRT (DOGC)
    # ------------------------------------------------------------------
    munis = llegir_sql(cur, '''
        SELECT COALESCE("ineCode", substring(code,1,5)) AS muni5, code AS code6, name AS nom,
               comarca, province AS provincia, lat, lng,
               "isTense" AS is_tense, "tenseList" AS tense_llista,
               "rentLatest" AS rent_latest, "rentPeriod" AS rent_period,
               "comarcaRefLatest" AS comarca_ref_latest, "comarcaRefPeriod" AS comarca_ref_period,
               "rentSource" AS rent_source, "contractsLatest" AS contracts_latest
        FROM public."Municipality"''')
    munis["muni5"] = munis["muni5"].astype(str)
    print(f"municipis (app): {len(munis)}")

    # ------------------------------------------------------------------
    # 2) agregats del pipeline per muni i per secció (dim)
    # ------------------------------------------------------------------
    dim = llegir_sql(cur, '''
        SELECT substring(ref_catastral,1,5) AS muni5, id_seccio, id_illa,
               renta_m2_mes::float8 AS renta_m2_mes, num_viviendas::int AS num_viviendas,
               sup_media_m2::float8 AS sup_media_m2, anio_referencia::int AS anio_referencia
        FROM geo.dim_building_rent_estimation''')
    dim["muni5"] = dim["muni5"].astype(str)
    dim["id_seccio"] = dim["id_seccio"].astype(str)
    any_ref = args.any_ref or int(dim["anio_referencia"].max())
    print(f"dim: {len(dim)} edificis · {dim.id_seccio.nunique()} seccions · {dim.muni5.nunique()} munis · any {any_ref}")

    # m² mitjà municipal (ponderat per vivendes) — la mateixa conversió de l'àncora F2
    tmp = dim.dropna(subset=["sup_media_m2"]).copy()
    tmp["v"] = tmp.num_viviendas.clip(lower=1)
    tmp["w_sup"] = tmp.sup_media_m2 * tmp.v
    agg_m2 = tmp.groupby("muni5").agg(sup_w=("w_sup", "sum"), v_sum=("v", "sum"))
    m2_mitja = agg_m2.sup_w / agg_m2.v_sum

    # índex de referència €/m²·mes per municipi (font de la fiança + traçabilitat)
    idx = {}
    for _, m in munis.iterrows():
        if m.muni5 not in m2_mitja.index or pd.isna(m2_mitja[m.muni5]) or m2_mitja[m.muni5] <= 0:
            continue
        m2 = float(m2_mitja[m.muni5])
        if m.rent_source == "INCASOL" and pd.notna(m.rent_latest) and m.rent_latest > 0:
            idx[m.muni5] = (float(m.rent_latest) / m2, False, m.rent_period,
                            "Fiances de lloguer (Incasòl) via habitatge.gencat.cat ÷ superfície mitjana del parc (Catastro)")
        elif pd.notna(m.comarca_ref_latest) and m.comarca_ref_latest > 0:
            idx[m.muni5] = (float(m.comarca_ref_latest) / m2, True, m.comarca_ref_period,
                            "Referència de comarca (Incasòl) ÷ superfície mitjana del parc (Catastro), marcada ESTIMACIÓ")
    print(f"índex de referència computat per {len(idx)} munis (amb àncora municipal)")

    # ------------------------------------------------------------------
    # 3) DDL (idempotent, només aquestes 3 taules)
    # ------------------------------------------------------------------
    cur.execute("CREATE SCHEMA IF NOT EXISTS geo")
    cur.execute("DROP TABLE IF EXISTS geo.dades_lloguer_agregades CASCADE")
    cur.execute("DROP TABLE IF EXISTS geo.seccions_censals CASCADE")
    cur.execute("DROP TABLE IF EXISTS geo.municipis CASCADE")
    cur.execute("""CREATE TABLE geo.municipis (
        muni5 text PRIMARY KEY, nom text NOT NULL, comarca text, provincia text,
        zmrt boolean NOT NULL DEFAULT false, tense_llista text, zmrt_font text,
        zmrt_publicacio text, cobert boolean NOT NULL DEFAULT false,
        lat double precision, lon double precision)""")
    geom_tipus = "geometry(MultiPolygon,4258)" if te_postgis else "text"
    cur.execute(f"""CREATE TABLE geo.seccions_censals (
        id_seccio text PRIMARY KEY, muni5 text NOT NULL, nom text,
        n_edificis int NOT NULL DEFAULT 0, num_viviendas int,
        geom {geom_tipus}, wkt_fallback text,
        lat double precision, lon double precision)""")
    cur.execute("""CREATE TABLE geo.dades_lloguer_agregades (
        id text PRIMARY KEY, id_seccio text NOT NULL, muni5 text NOT NULL,
        any_referencia int NOT NULL,
        preu_real_mitja_eur_m2 numeric(10,3), index_referencia_eur_m2 numeric(10,3),
        percentatge_compliment numeric(5,2),
        nivell_dada text NOT NULL, compliment_metode text, num_contractes int,
        n_edificis int, num_viviendas int, estimacio boolean NOT NULL DEFAULT true,
        font text, actualitzat_at timestamp NOT NULL DEFAULT now())""")
    cur.execute("CREATE INDEX idx_seccions_z_muni ON geo.seccions_censals (muni5)")
    if te_postgis:
        cur.execute("CREATE INDEX idx_seccions_z_geom ON geo.seccions_censals USING GIST (geom)")
    cur.execute("CREATE INDEX idx_dades_muni_compliment ON geo.dades_lloguer_agregades "
                "(muni5, percentatge_compliment DESC NULLS LAST)")
    cur.execute("CREATE INDEX idx_dades_seccio ON geo.dades_lloguer_agregades (id_seccio)")
    cur.execute("CREATE INDEX idx_dades_any ON geo.dades_lloguer_agregades (any_referencia)")

    # ------------------------------------------------------------------
    # 4) seccions censals (del pipeline) + centroide des de les illes
    # ------------------------------------------------------------------
    if te_seccions:
        secc = llegir_sql(cur, "SELECT id_seccio, muni5, n_edificios::int AS n_edificios "
                               "FROM geo.geo_seccions")
        secc["id_seccio"] = secc["id_seccio"].astype(str)
        secc["muni5"] = secc["muni5"].astype(str)
    else:
        secc = dim.groupby("id_seccio").agg(muni5=("muni5", "first"),
                                            n_edificios=("id_seccio", "size")).reset_index()
        secc.columns = ["id_seccio", "muni5", "n_edificios"]
    # vivendes per secció (Catastro, agregat) + centroide des de les illes
    viv_sec = dim.groupby("id_seccio").agg(num_viviendas=("num_viviendas", "sum")).reset_index()
    if te_illes:
        illes = llegir_sql(cur, "SELECT id_illa, lat::float8 AS lat, lon::float8 AS lon FROM geo.geo_illes "
                                "WHERE lat IS NOT NULL AND lon IS NOT NULL")
        mapa_sec_illa = dim[["id_illa", "id_seccio"]].drop_duplicates()
        cent = mapa_sec_illa.merge(illes, on="id_illa", how="inner").groupby("id_seccio")[
            ["lat", "lon"]].mean().reset_index()
    else:
        cent = pd.DataFrame(columns=["id_seccio", "lat", "lon"])

    secc = secc.merge(viv_sec, on="id_seccio", how="left").merge(cent, on="id_seccio", how="left")
    print(f"seccions censals: {len(secc)} · amb centroide: {int(secc.lat.notna().sum())}")

    # geometria opcional des de bseccen (font autoritzada F1; encara no integrada)
    n_geom = 0
    if args.seccions_shp:
        try:
            import geopandas as gpd
            g = gpd.read_file(args.seccions_shp)
            col_sec = next((c for c in g.columns if c.upper() in ("CUSEC", "CUSEC_VIG", "SECCION", "SECCIO")), None)
            if col_sec is None:
                print("  ! shapefile sense columna CUSEC reconeixible; geometries omeses")
            else:
                g[col_sec] = g[col_sec].astype(str).str.strip()
                g = g[g.geometry.notna()]
                from shapely.ops import unary_union
                from shapely import wkt as shp_wkt
                # dissolve per CUSEC (pot ser multipolígon — mateix tractament que F3)
                g["geom_wkt"] = g.geometry.buffer(0).apply(lambda x: shp_wkt.dumps(x, rounding_precision=7))
                wkt_by_sec = dict(zip(g[col_sec], g["geom_wkt"]))
                for _, row in secc.iterrows():
                    w = wkt_by_sec.get(row.id_seccio)
                    if not w:
                        continue
                    if te_postgis:
                        cur.execute("UPDATE geo.seccions_censals SET geom = ST_GeomFromText(%s, 4258) WHERE id_seccio = %s",
                                    (w, row.id_seccio))
                    else:
                        cur.execute("UPDATE geo.seccions_censals SET wkt_fallback = %s WHERE id_seccio = %s",
                                    (w, row.id_seccio))
                    n_geom += 1
                print(f"  ✓ geometries carregades des de {Path(args.seccions_shp).name}: {n_geom}")
        except Exception as e:  # geometria és additiva: un fallo no atura la càrrega de dades
            print(f"  ! geometries omeses ({str(e)[:120]})")

    # ------------------------------------------------------------------
    # 5) municipis → inserció
    # ------------------------------------------------------------------
    seccions_amb_edificis = set(dim["id_seccio"].unique())
    munis_coberts = set(dim["muni5"].unique())
    mrows = []
    for _, m in munis.iterrows():
        if not isinstance(m.muni5, str) or len(m.muni5) != 5:
            continue
        mrows.append((m.muni5, str(m.nom), m.comarca, m.provincia,
                      bool(m.is_tense) if pd.notna(m.is_tense) else False,
                      m.tense_llista,
                      "Resolucions TER/3739/2026 + TER/3740/2026 (Generalitat)" if m.is_tense else None,
                      "DOGC 19-10-2026" if m.is_tense else None,
                      m.muni5 in munis_coberts,
                      float(m.lat) if pd.notna(m.lat) else None,
                      float(m.lng) if pd.notna(m.lng) else None))
    execute_values(cur, "INSERT INTO geo.municipis (muni5, nom, comarca, provincia, zmrt, tense_llista, "
                        "zmrt_font, zmrt_publicacio, cobert, lat, lon) VALUES %s", mrows, page_size=400)
    print(f"  ✓ municipis: {len(mrows)} files · coberts (pilot): {len(munis_coberts)}")

    # ------------------------------------------------------------------
    # 6) seccions → inserció
    # ------------------------------------------------------------------
    srows = []
    for _, s in secc.iterrows():
        if s.id_seccio not in seccions_amb_edificis:
            continue  # només seccions amb parc carregat (pilot)
        srows.append((s.id_seccio, str(s.muni5), None,
                      int(s.n_edificios), int(s.num_viviendas) if pd.notna(s.num_viviendas) else None,
                      None, None,
                      float(s.lat) if pd.notna(s.lat) else None,
                      float(s.lon) if pd.notna(s.lon) else None))
    for i in range(0, len(srows), 400):
        execute_values(cur, "INSERT INTO geo.seccions_censals (id_seccio, muni5, nom, n_edificis, "
                            "num_viviendas, geom, wkt_fallback, lat, lon) VALUES %s", srows[i:i + 400],
                       page_size=400)
    print(f"  ✓ seccions_censals: {len(srows)} files")

    # ------------------------------------------------------------------
    # 7) dades_lloguer_agregades (per secció; mètode QUOTA_EDIFICIS_ESTIMADA)
    # ------------------------------------------------------------------
    dim_idx = dim[dim.muni5.isin(idx.keys())].copy()
    dim_idx["v"] = dim_idx.num_viviendas.clip(lower=1)
    drows = []
    font_txt = ("Fiances de lloguer (Incasòl) via habitatge.gencat.cat + superfície mitjana del parc "
                "(Catastro) + estimació seccional del pipeline PASO 3 (àncla municipal, RESIDU hedònic "
                "d'illa); fitxer seccional d'Incasòl pendent → nivell_dada=MUNICIPAL (ESTIMACIÓ)")
    for sec, d in dim_idx.groupby("id_seccio"):
        m5 = d.muni5.iloc[0]
        val_idx, es_estim, periode, font_idx = idx[m5]
        if len(d) < MIN_EDIFICIS_SECCIO:
            continue
        n_viv = int(d.v.sum())
        if n_viv <= 0:
            continue
        preu = float(np.average(d.renta_m2_mes.clip(lower=0), weights=d.v))
        comp = 100.0 * float(d.loc[d.renta_m2_mes <= val_idx, "v"].sum()) / n_viv
        drows.append((f"{sec}_{any_ref}", sec, m5, any_ref,
                      round(preu, 3), round(val_idx, 3), round(comp, 2),
                      "MUNICIPAL", "QUOTA_EDIFICIS_ESTIMADA", None,
                      int(len(d)), n_viv, True, f"{font_idx} · període fiança: {periode} · {font_txt}"))
    for i in range(0, len(drows), 400):
        execute_values(cur, "INSERT INTO geo.dades_lloguer_agregades (id, id_seccio, muni5, any_referencia, "
                            "preu_real_mitja_eur_m2, index_referencia_eur_m2, percentatge_compliment, "
                            "nivell_dada, compliment_metode, num_contractes, n_edificis, num_viviendas, "
                            "estimacio, font) VALUES %s", drows[i:i + 400], page_size=400)
    print(f"  ✓ dades_lloguer_agregades: {len(drows)} files (mètode QUOTA_EDIFICIS_ESTIMADA)")

    cur.execute("ANALYZE geo.municipis; ANALYZE geo.seccions_censals; ANALYZE geo.dades_lloguer_agregades;")

    # ------------------------------------------------------------------
    # 8) mostra de verificació (sense credencials)
    # ------------------------------------------------------------------
    cur.execute("""SELECT m.nom, d.preu_real_mitja_eur_m2, d.index_referencia_eur_m2, d.percentatge_compliment
                   FROM geo.dades_lloguer_agregades d JOIN geo.municipis m ON m.muni5 = d.muni5
                   WHERE d.muni5 = '08019' ORDER BY d.percentatge_compliment DESC LIMIT 3""")
    mostra = cur.fetchall()
    print("mostra Barcelona (major compliment):")
    for r in mostra:
        print(f"   {r[0]} · preu {r[1]} €/m² · índex {r[2]} €/m² · compliment {r[3]} %")

    resum = {
        "taula": "geo.municipis + geo.seccions_censals + geo.dades_lloguer_agregades",
        "municipis": len(mrows), "munis_coberts": len(munis_coberts),
        "seccions": len(srows), "dades": len(drows),
        "any_referencia": any_ref, "postgis": te_postgis, "geometries_carregades": n_geom,
        "min_edificis_seccio": MIN_EDIFICIS_SECCIO,
        "compliment_metode": "QUOTA_EDIFICIS_ESTIMADA (fitxer seccional Incasòl pendent)",
        "segons": round(time.time() - t0, 1),
    }
    Path(args.out).write_text(json.dumps(resum, ensure_ascii=False, indent=2), encoding="utf-8")
    print("resum →", args.out)
    conn.close()


if __name__ == "__main__":
    main()
