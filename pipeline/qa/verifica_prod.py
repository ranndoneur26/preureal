#!/usr/bin/env python3
"""Verificació §5 del runbook — ACCIO ① (càrrega de producció).

Connecta a $DATABASE_URL (Neon/managed) i executa les comprovacions del
runbook de docs/PIPELINE_GEO_ML.md §5. La URL MAI s'imprimeix (només host/db).

Ús:
  export DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
  python3 pipeline/qa/verifica_prod.py            # després de f3_produccio.sh
"""
from __future__ import annotations

import os
import sys

import psycopg2

DIM_ESPERAT = 142283
ILLES_ESPERADES = 11633
SECCIONS_ESPERADES = 1983
MITJANA_ESPERADA = 10.039          # €/m² (tolerància ±0,01)
MUNI_MOSTRA = "08019"              # Barcelona


def mask(url: str) -> str:
    try:
        rest = url.split("@", 1)[1]
        host = rest.split("/", 1)[0]
        db = rest.split("/", 1)[1].split("?")[0]
        return f"host={host} · db={db}"
    except Exception:
        return "(url no estàndard)"


def fail(msg: str) -> None:
    print(f"  ✗ {msg}")
    sys.exit(1)


def main() -> None:
    url = os.environ.get("DATABASE_URL") or os.environ.get("PREUREAL_PROD_DATABASE_URL") or ""
    if not url or url.startswith("file:"):
        fail("exporta DATABASE_URL (Neon/managed) — cap URL local file:")
    print(f"BD de producció: {mask(url)}")

    conn = psycopg2.connect(url, connect_timeout=20)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT 1 FROM pg_available_extensions WHERE name='postgis'")
    te_postgis = cur.fetchone() is not None
    print(f"PostGIS disponible: {te_postgis}")

    cur.execute("""SELECT count(*) FROM information_schema.tables
                   WHERE table_schema='geo'
                     AND table_name IN ('dim_building_rent_estimation','geo_illes','geo_seccions')""")
    if cur.fetchone()[0] < 3:
        fail("l'esquema geo no té les 3 taules — executa primer pipeline/f3_produccio.sh")

    cur.execute("""SELECT count(*), round(avg(renta_m2_mes), 3),
                          count(DISTINCT id_illa), count(DISTINCT id_seccio)
                   FROM geo.dim_building_rent_estimation""")
    files, mitjana, illes, seccions = cur.fetchone()
    print(f"dim: {files} edificis · {mitjana} €/m² · {illes} illes · {seccions} seccions")
    if files != DIM_ESPERAT:
        fail(f"edificis {files} != esperat {DIM_ESPERAT}")
    if illes != ILLES_ESPERADES or seccions != SECCIONS_ESPERADES:
        fail(f"illes/seccions {illes}/{seccions} != esperat {ILLES_ESPERADES}/{SECCIONS_ESPERADES}")
    if abs(float(mitjana) - MITJANA_ESPERADA) > 0.01:
        fail(f"mitjana {mitjana} != esperada {MITJANA_ESPERADA}")

    cur.execute("""SELECT ambito_ground_truth, count(*) FROM geo.dim_building_rent_estimation
                   GROUP BY 1 ORDER BY 2 DESC LIMIT 5""")
    print("ambito_ground_truth:", cur.fetchall())

    cur.execute("SELECT conname FROM pg_constraint WHERE conrelid='geo.dim_building_rent_estimation'::regclass AND contype='p'")
    if not cur.fetchone():
        fail("falta la PK id_edificio a dim_building_rent_estimation")
    print("PK id_edificio: OK")

    cur.execute("SELECT count(*) FROM geo.geo_illes")
    n_illes = cur.fetchone()[0]
    print(f"geo_illes: {n_illes} files (esperades {ILLES_ESPERADES})")
    if n_illes != ILLES_ESPERADES:
        fail(f"geo_illes {n_illes} != esperades {ILLES_ESPERADES}")

    if te_postgis:
        cur.execute("SELECT count(*) FROM geo.geo_illes WHERE NOT ST_IsValid(geom)")
        invalides = cur.fetchone()[0]
        print(f"ST_IsValid: {n_illes - invalides}/{n_illes} vàlides")
        if invalides:
            fail(f"{invalides} geometries invàlides")
        cur.execute("SELECT indexdef FROM pg_indexes WHERE schemaname='geo' AND indexname='idx_illes_geom'")
        gist = cur.fetchone()
        print("GIST idx_illes_geom:", gist[0] if gist else "ABSENT")
        if not gist:
            fail("falta l'índex GIST idx_illes_geom")
        cur.execute(f"SELECT count(*) FROM geo.geo_illes WHERE muni5=%s", (MUNI_MOSTRA,))
        print(f"illes de {MUNI_MOSTRA} (Barcelona): {cur.fetchone()[0]}")
    else:
        print("(sense PostGIS: fallback WKT — sense comprovacions espacials)")

    conn.close()
    print("\nVERIFICACIÓ PRODUCCIÓ OK — /api/geo/illes ja serveix dades reals (cache 10 min)")


if __name__ == "__main__":
    main()
