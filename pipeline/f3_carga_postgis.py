#!/usr/bin/env python3
"""F3 — Càrrega del resultat F2 (AMB) a PostgreSQL/PostGIS.

Tres taules en l'esquema `geo` (mai toca cap taula del app):
  · geo.dim_building_rent_estimation  — nivell EDIFICI (esquema PASO 4 complet)
  · geo.geo_illes                     — nivell ILLA, amb geometria + lat/lon
  · geo.geo_seccions                  — nivell SECCIÓ CENSAL

PostGIS-ready: prova CREATE EXTENSION postgis; si la BD no el porta (p. ex. el
PG local del sandbox), les columnes geomètriques es creen com a WKT text +
lat/lon (mateix DDL conceptual; en producció amb PostGIS el mateix script fa
ST_GeomFromText automàticament). Idempotent: DROP+CREATE de només aquestes 3.

Ús:
  python3 f3_carga_postgis.py --dim <dim.csv|parquet> --cache <_cache.parquet> \
      [--url postgresql://preureal@127.0.0.1:5432/preureal] [--out informe.json]
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd

DIM_COLS_TIPOS = {
    "id_edificio": "text", "id_illa": "text", "ref_catastral": "text", "id_seccio": "text",
    "num_viviendas": "int", "sup_media_m2": "numeric(10,1)", "antiguedad": "numeric(10,1)",
    "anyo_construccion": "int", "renta_serpavi_inf": "numeric(10,3)", "renta_serpavi_sup": "numeric(10,3)",
    "renta_media_contractual_ambito": "numeric(12,2)", "num_contratos_ambito": "int",
    "ambito_ground_truth": "text", "renta_estimada_edificio": "numeric(12,1)", "renta_m2_mes": "numeric(10,4)",
    "renta_ic95_edificio_inf": "numeric(12,1)", "renta_ic95_edificio_sup": "numeric(12,1)",
    "calidad_estimacion": "numeric(8,3)", "calidad_grado": "text", "procedencia": "text",
    "procedencia_pct_incasol": "int", "fuera_rango_serpavi": "boolean", "anio_referencia": "int",
    "metodologia_version": "text",
}


def limpa_dim(dim: pd.DataFrame) -> pd.DataFrame:
    d = dim.copy()
    d.columns = [c.strip().lower() for c in d.columns]
    for col, tip in DIM_COLS_TIPOS.items():
        if col not in d.columns:
            raise SystemExit(f"dim incompleta: falta {col}")
        if tip.startswith("numeric") or tip == "int":
            if d[col].dtype == object:
                d[col] = pd.to_numeric(d[col].astype(str).str.replace(",", "."), errors="coerce")
            d[col] = d[col].fillna(0 if tip == "int" else np.nan)
            d[col] = d[col].round(4)
        elif tip == "boolean" and d[col].dtype == object:
            d[col] = d[col].astype(str).str.lower().isin(["true", "1", "yes"])
    return d[list(DIM_COLS_TIPOS)]


def main() -> None:
    ap = argparse.ArgumentParser(description="F3 càrrega PostGIS (dim + illes + seccions)")
    ap.add_argument("--dim", required=True, help="dim_building_rent_estimation (.csv ; sep o .parquet)")
    ap.add_argument("--cache", help="_cache.parquet (per a les geometries d'illa)")
    ap.add_argument("--url", default=os.environ.get("DATABASE_URL", "postgresql://preureal@127.0.0.1:5432/preureal"))
    ap.add_argument("--out", default="f3_carga.json")
    args = ap.parse_args()
    t0 = time.time()

    import geopandas as gpd  # noqa: F401  (necessari per al parquet amb geometria)
    import psycopg2

    pth = Path(args.dim)
    dim = pd.read_parquet(pth) if pth.suffix == ".parquet" else pd.read_csv(pth, sep=";", dtype=str)
    dim = limpa_dim(dim)
    print(f"dim: {len(dim)} edificis, {dim.id_illa.nunique()} illes, {dim.id_seccio.nunique()} seccions")

    conn = psycopg2.connect(args.url)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_available_extensions WHERE name='postgis'")
    te_postgis = cur.fetchone() is not None
    if te_postgis:
        cur.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    print("PostGIS disponible:", te_postgis)

    cur.execute("CREATE SCHEMA IF NOT EXISTS geo")
    cur.execute("DROP TABLE IF EXISTS geo.dim_building_rent_estimation CASCADE")
    cols_sql = ",\n  ".join(
        (f"{c} {t} PRIMARY KEY" if c == "id_edificio" else f"{c} {t}")
        for c, t in DIM_COLS_TIPOS.items())
    cur.execute(f"CREATE TABLE geo.dim_building_rent_estimation (\n  {cols_sql})")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dim_illa ON geo.dim_building_rent_estimation (id_illa)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dim_seccio ON geo.dim_building_rent_estimation (id_seccio)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dim_refcat ON geo.dim_building_rent_estimation (ref_catastral)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dim_muni ON geo.dim_building_rent_estimation (substring(ref_catastral,1,5))")

    # inserció per tandes amb execute_values (400 files × 24 col = 9.600 paràmetres
    # per sentència, molt per sota del límit de 65.535 de Postgres — lliçó v41;
    # sobre WAN/Neon evita 142k anades-i-tornades d'executemany fila a fila)
    from psycopg2.extras import execute_values

    cols = list(DIM_COLS_TIPOS)
    rows = []
    for r in dim[cols].itertuples(index=False, name=None):
        rows.append(tuple(None if (isinstance(v, float) and np.isnan(v)) else v for v in r))
    for i in range(0, len(rows), 400):
        execute_values(cur, f"INSERT INTO geo.dim_building_rent_estimation ({','.join(cols)}) VALUES %s",
                       rows[i:i + 400], page_size=400)
    print(f"  ✓ dim_building_rent_estimation: {len(rows)} files")

    # illes + seccions (amb geometria si hi ha cache)
    cur.execute("DROP TABLE IF EXISTS geo.geo_illes CASCADE")
    cur.execute("""CREATE TABLE geo.geo_illes (
        id_illa text PRIMARY KEY, muni5 text NOT NULL, n_edificios int NOT NULL,
        num_viviendas int, renta_m2_media numeric(10,3), calidad_media numeric(8,3),
        geom %s, lat double precision, lon double precision)"""
                % ("geometry(MultiPolygon,4258)" if te_postgis else "text"))
    cur.execute("""DROP TABLE IF EXISTS geo.geo_seccions CASCADE;
        CREATE TABLE geo.geo_seccions (
        id_seccio text PRIMARY KEY, muni5 text NOT NULL, n_edificios int NOT NULL,
        renta_m2_media numeric(10,3), calidad_media numeric(8,3))""")
    if te_postgis:
        # GIST només amb PostGIS (amb WKT text no té sentit)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_illes_geom ON geo.geo_illes USING GIST (geom)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_illes_muni ON geo.geo_illes (muni5)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_seccions_muni ON geo.geo_seccions (muni5)")

    stats_i = dim.groupby(["id_illa"]).agg(
        renta_m2_media=("renta_m2_mes", "mean"), calidad_media=("calidad_estimacion", "mean"),
        n_edificios=("id_edificio", "count"), num_viviendas=("num_viviendas", "sum")).reset_index()
    muni_map = dim.assign(m5=dim.ref_catastral.str[:5]).drop_duplicates("id_illa").set_index("id_illa")["m5"]
    stats_i["muni5"] = stats_i.id_illa.map(muni_map)

    n_geom = 0
    rows_i = []
    if args.cache:
        import shapely

        full = gpd.read_parquet(args.cache)
        g_illes = full[["id_illa", "geometry"]].dissolve(by="id_illa").reset_index()
        # simplify → buffer(0) → make_valid: el dissolve d'illes pot produir
        # autointerseccions que PostGIS rebutjaria (ST_IsValid) a la producció
        g_illes["geometry"] = shapely.make_valid(g_illes.geometry.simplify(2).buffer(0))
        g4258 = g_illes.to_crs(4258)
        # la reproyecció a 4258 pot reintroduir autointerseccions (pèrdua de
        # precisió sobre arestes simplificades): make_valid FINAL en el SRID que
        # es persisteix; buffer(0) col·lapsa col·leccions a MultiPolygon net
        g4258["geometry"] = shapely.make_valid(shapely.make_valid(g4258.geometry).buffer(0))
        gmap = g4258.set_index("id_illa")
        for _, r in stats_i.iterrows():
            g = gmap.geometry.get(r.id_illa) if hasattr(gmap, "geometry") else None
            if g is None or g.is_empty:
                rows_i.append((r.id_illa, r.muni5, int(r.n_edificios), int(r.num_viviendas),
                               round(float(r.renta_m2_media), 3), round(float(r.calidad_media), 3),
                               None, None, None))
                continue
            c = g.centroid
            if te_postgis:
                # en PostGIS es fa ST_GeomFromText en la INSERT (SQL per fila)
                rows_i.append(("st", r.id_illa, r.muni5, int(r.n_edificios), int(r.num_viviendas),
                               round(float(r.renta_m2_media), 3), round(float(r.calidad_media), 3),
                               g.wkt, c.y, c.x))
            else:
                rows_i.append(("wkt", r.id_illa, r.muni5, int(r.n_edificios), int(r.num_viviendas),
                               round(float(r.renta_m2_media), 3), round(float(r.calidad_media), 3),
                               g.wkt, c.y, c.x))
            n_geom += 1
    else:
        for _, r in stats_i.iterrows():
            rows_i.append(("null", r.id_illa, r.muni5, int(r.n_edificios), int(r.num_viviendas),
                           round(float(r.renta_m2_media), 3), round(float(r.calidad_media), 3),
                           None, None, None))
    for r in rows_i:
        tipus, id_illa, muni5, n_ed, n_viv, renta, cal, wkt, lat, lon = r
        if tipus == "st":
            cur.execute(
                "INSERT INTO geo.geo_illes VALUES (%s,%s,%s,%s,%s,%s,ST_GeomFromText(%s,4258),%s,%s)",
                (id_illa, muni5, n_ed, n_viv, renta, cal, wkt, lat, lon))
        else:
            cur.execute("INSERT INTO geo.geo_illes VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (id_illa, muni5, n_ed, n_viv, renta, cal, wkt, lat, lon))
    print(f"  ✓ geo_illes: {len(rows_i)} files ({n_geom} amb geometria)")

    stats_s = dim.groupby("id_seccio").agg(
        renta_m2_media=("renta_m2_mes", "mean"), calidad_media=("calidad_estimacion", "mean"),
        n_edificios=("id_edificio", "count")).reset_index()
    stats_s["muni5"] = stats_s.id_seccio.str[:5]
    rows_s = [(r.id_seccio, r.muni5, int(r.n_edificios), round(float(r.renta_m2_media), 3),
               round(float(r.calidad_media), 3)) for _, r in stats_s.iterrows()]
    cur.executemany("INSERT INTO geo.geo_seccions VALUES (%s,%s,%s,%s,%s)", rows_s)
    print(f"  ✓ geo_seccions: {len(rows_s)} files")

    cur.execute("SELECT count(*), round(avg(renta_m2_mes),3), count(DISTINCT id_illa) FROM geo.dim_building_rent_estimation")
    verif = cur.fetchone()
    print("verificació dim:", verif)
    if te_postgis:
        cur.execute("ANALYZE geo.dim_building_rent_estimation; ANALYZE geo.geo_illes; ANALYZE geo.geo_seccions")
        print("ANALYZE ok (estadístiques del planificador actualitzades)")
    conn.close()

    informe = {"postgis": te_postgis, "dim_edificios": len(rows), "illes": len(rows_i),
               "seccions": len(rows_s), "verificacio": {"files": verif[0], "renta_m2_media": float(verif[1]),
                                                        "illes_distintes": int(verif[2])},
               "runtime_seg": round(time.time() - t0, 1), "url": args.url.split("@")[-1]}
    Path(args.out).write_text(json.dumps(informe, indent=1))
    print("F3 càrrega OK →", args.out)


if __name__ == "__main__":
    main()
