#!/usr/bin/env python3
"""Ensayo de PRODUCCIÓN del accio ①: f3 contra un PostgreSQL CON PostGIS real:
  te_postgis=True → geometry(Polygon,4258) · ST_GeomFromText · índice GIST · ANALYZE.
Ús: python3 scripts/rehersal_postgis.py [URL]
  sense URL → prova pgserver; amb URL → l'usa directament (p. ex. el PG local)"""
import json
import os
import subprocess
import sys
from pathlib import Path

import psycopg2

ROOT = Path(os.environ.get("PREUREAL_ROOT", "/home/z/my-project"))  # sandbox; ajusta si cal
DIR = ROOT / ".pgserver-data"
F3 = "/home/z/my-project/preureal/pipeline/f3_carga_postgis.py"
DIM = os.environ.get("PREUREAL_DIM", str(ROOT / "pilot_data/out_amb/dim_building_rent_estimation_amb.parquet"))
CACHE = os.environ.get("PREUREAL_CACHE", str(ROOT / "pilot_data/out_amb/_cache_amb.parquet"))

if len(sys.argv) > 1:
    uri = sys.argv[1]
else:
    import pgserver  # noqa: E402

    db = pgserver.get_server(str(DIR))
    uri = db.get_uri()
print("BD objectiu:", uri.rsplit("@", 1)[-1])

conn = psycopg2.connect(uri)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT name, default_version FROM pg_available_extensions WHERE name='postgis'")
row = cur.fetchone()
print("pg_available_extensions postgis:", row)
assert row is not None, "BD sense PostGIS"
conn.close()

r = subprocess.run([sys.executable, F3, "--dim", DIM, "--cache", CACHE,
                    "--url", uri, "--out", "/tmp/f3_postgis_rehersal.json"],
                   capture_output=True, text=True)
print(r.stdout[-1500:])
assert r.returncode == 0, r.stderr[-3000:]

informe = json.loads(Path("/tmp/f3_postgis_rehersal.json").read_text())
assert informe["postgis"] is True, "f3 no ha detectat PostGIS"
print("informe f3:", json.dumps(informe, ensure_ascii=False))

conn = psycopg2.connect(uri)
cur = conn.cursor()
cur.execute("""SELECT f_geometry_column, srid, type FROM geometry_columns
               WHERE f_table_schema='geo' AND f_table_name='geo_illes'""")
print("geometry_columns:", cur.fetchall())
cur.execute("SELECT count(*), count(*) FILTER (WHERE ST_IsValid(geom)), count(DISTINCT ST_SRID(geom)) FROM geo.geo_illes")
n, valid, srids = cur.fetchone()
print(f"geo_illes: {n} illes · {valid} geometries ST_IsValid · SRID distinct: {srids}")
assert n == 11633 and valid == n and srids == 1
cur.execute("SELECT ST_SRID(geom), GeometryType(geom) FROM geo.geo_illes LIMIT 1")
print("exemple:", cur.fetchone())
cur.execute("SELECT count(*) FROM geo.geo_illes WHERE ST_Intersects(geom, (SELECT geom FROM geo.geo_illes WHERE id_illa LIKE '08019%' LIMIT 1))")
print("illes que toquen una illa de Barcelona (intersecció espacial):", cur.fetchone()[0])
cur.execute("SELECT indexdef FROM pg_indexes WHERE schemaname='geo' AND indexname='idx_illes_geom'")
gist = cur.fetchone()
print("índex GIST:", gist[0] if gist else "ABSENT")
assert gist is not None, "índex GIST absent"
cur.execute("SELECT count(*) FROM geo.dim_building_rent_estimation")
assert cur.fetchone()[0] == 142283
cur.execute("SELECT round(avg(renta_m2_mes),3) FROM geo.dim_building_rent_estimation")
print("verificació SQL amb PostGIS:", cur.fetchone()[0], "€/m² (10.039 esperat)")
conn.close()
print("REHERSAL POSTGIS OK — mateixa ruta que producció (Neon/managed)")
