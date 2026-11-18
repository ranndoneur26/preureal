#!/usr/bin/env python3
"""Verifica la INVARIÀNCIA del DDL entre la càrrega municipal i la seccional:
mateixes columnes/tipus/PK/índexs amb el mateix f3 (accio 2 del desplegament).
Ús: python3 scripts/verifica_ddl.py <dim_seccional.parquet>"""
import os
import subprocess
import sys
from pathlib import Path

import psycopg2

URL = os.environ.get("PREUREAL_PG_URL", "postgresql://preureal@127.0.0.1:5432/preureal")


def snapshot() -> tuple[str, str, str]:
    conn = psycopg2.connect(URL)
    cur = conn.cursor()
    cur.execute("""SELECT string_agg(column_name||':'||data_type||':'||
                   coalesce(numeric_precision::text,'')||','||coalesce(numeric_scale::text,''), '|'
                   ORDER BY ordinal_position)
                   FROM information_schema.columns
                   WHERE table_schema='geo' AND table_name='dim_building_rent_estimation'""")
    cols = cur.fetchone()[0]
    cur.execute("SELECT conname FROM pg_constraint WHERE conrelid='geo.dim_building_rent_estimation'::regclass AND contype='p'")
    pk = ",".join(r[0] for r in cur.fetchall())
    cur.execute("SELECT string_agg(indexname, ';' ORDER BY indexname) FROM pg_indexes WHERE schemaname='geo'")
    idx = cur.fetchone()[0]
    conn.close()
    return cols, pk, idx


def main() -> None:
    dim_sec = Path(sys.argv[1])
    cols0, pk0, idx0 = snapshot()
    print("== DDL municipal ==")
    print("PK:", pk0)
    print("índexs:", idx0)
    r = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / "f3_carga_postgis.py"),
                        "--dim", str(dim_sec),
                        "--cache", os.environ.get("PREUREAL_CACHE", "/home/z/my-project/pilot_data/out_amb/_cache_amb.parquet"),
                        "--url", URL, "--out", "/tmp/f3_seccional.json"],
                       capture_output=True, text=True)
    print(r.stdout[-800:])
    assert r.returncode == 0, r.stderr[-2000:]
    cols1, pk1, idx1 = snapshot()
    print("== DDL seccional ==")
    assert (cols0, pk0, idx0) == (cols1, pk1, idx1), "¡EL DDL HA CAMBIADO!"
    print("✓ 24 columnas/tipos IDÉNTICAS · PK IDÉNTICA · índices IDÉNTICOS")
    conn = psycopg2.connect(URL)
    cur = conn.cursor()
    cur.execute("SELECT count(*), count(DISTINCT ambito_ground_truth), min(ambito_ground_truth), round(avg(renta_m2_mes),3) FROM geo.dim_building_rent_estimation")
    n, namb, amb, mitj = cur.fetchone()
    print(f"✓ dim seccional cargada: {n} edificios · ambito_ground_truth={amb} · media {mitj} €/m²")
    cur.execute("SELECT count(*) FROM geo.dim_building_rent_estimation WHERE ambito_ground_truth<>'SECCIO'")
    assert cur.fetchone()[0] == 0
    cur.execute("SELECT indexdef FROM pg_indexes WHERE schemaname='geo' AND indexname LIKE '%illes%'")
    print("índices illes:", [r[0] for r in cur.fetchall()])
    conn.close()
    print("INVARIÀNCIA DDL OK — PASO 3 municipal→seccional sense tocar el DDL")


if __name__ == "__main__":
    main()
