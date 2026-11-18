#!/usr/bin/env python3
"""Smoke test de la ruta seccional (accio 2 del desplegament):
quan INCASÒL publiqui el fitxer seccional, PASO 3 puja de MUNICIPI a SECCIO
SENSE tocar el DDL (ambito_ground_truth ja el contempla).

Mètode: fixture SINTÈTIC determinista (etiquetat SINTETIC — MAI producció)
derivat de la cache municipal AMB; després f1 ancla seccional → f2 --ambito
SECCIO → verificació d'esquema i guàrdia negativa.

Execució:  python3 scripts/smoke_seccional.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import os
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(os.environ.get("PREUREAL_ROOT", "/home/z/my-project"))  # sandbox; ajusta si cal
PIPE = ROOT / "preureal" / "pipeline"
SMOKE = ROOT / "pilot_data" / "out_amb" / "_smoke_seccional"
CACHE = ROOT / "pilot_data" / "out_amb" / "_cache_amb.parquet"
DIM_COLS = ["id_edificio", "id_illa", "ref_catastral", "id_seccio", "num_viviendas",
            "sup_media_m2", "antiguedad", "anyo_construccion", "renta_serpavi_inf",
            "renta_serpavi_sup", "renta_media_contractual_ambito", "num_contratos_ambito",
            "ambito_ground_truth", "renta_estimada_edificio", "renta_m2_mes",
            "renta_ic95_edificio_inf", "renta_ic95_edificio_sup", "calidad_estimacion",
            "calidad_grado", "procedencia", "procedencia_pct_incasol", "fuera_rango_serpavi",
            "anio_referencia", "metodologia_version"]


def run(cmd: list) -> subprocess.CompletedProcess:
    print("$", " ".join(str(c) for c in cmd))
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    print(r.stdout[-3500:])
    if r.returncode != 0:
        print(r.stderr[-3500:])
        sys.exit(f"FAIL: {cmd[2]}")
    return r


def main() -> None:
    SMOKE.mkdir(parents=True, exist_ok=True)
    cache = pd.read_parquet(CACHE)

    # -- 1) fixture SINTÈTIC seccional (determinista, mai producció) ----------
    per_sec = cache.groupby("id_seccio").agg(
        n=("id_edificio", "count"), muni=("muni5", "first"))
    anchors = cache.groupby("muni5").agg(
        contr=("renta_media_contractual_ambito", "first"),
        nc=("num_contratos_ambito", "first"))
    tot = cache.groupby("muni5")["id_edificio"].count()
    rows = []
    for sec, r in per_sec.iterrows():
        eps = ((int(sec) % 2000) / 2000 - 0.5) * 0.12      # ±6% determinista
        contr = round(float(anchors.loc[r.muni, "contr"]) * (1 + eps), 2)
        nc = max(1, round(float(anchors.loc[r.muni, "nc"]) * r.n / tot[r.muni]))
        rows.append((sec, contr, nc, 2025))
    fix = SMOKE / "incasol_seccional_SINTETIC.csv"
    pd.DataFrame(rows, columns=["codi_seccio", "import_mitja_mensual",
                                "num_contractes", "publicacio_any"]).to_csv(fix, index=False)
    print(f"fixture SINTÈTIC: {fix} ({len(rows)} seccions) — MAI producció\n")

    # -- 2) f1: àncla seccional sobre la cache municipal -----------------------
    run([sys.executable, PIPE / "f1_ingesta.py", "--incasol-seccional-csv",
         fix, "--cache", CACHE, "--out", SMOKE])
    cache_sec = pd.read_parquet(SMOKE / "cache_ambito.parquet")
    assert (cache_sec["ambito_ground_truth"] == "SECCIO").all()
    cob = float(cache_sec["renta_media_contractual_ambito"].notna().mean())
    assert cob == 1.0, f"cobertura àncla seccional {cob:.2%} != 100%"
    # la cache municipal ORIGINAL queda intacta (fitxer diferent)
    assert (pd.read_parquet(CACHE)["ambito_ground_truth"] == "MUNICIPI").all()
    print("✓ f1: àncla seccional 100% cobertura; cache municipal intacta\n")

    # -- 3) guard negatiu: SECCIO sense àncla ha de fallar ----------------------
    r = subprocess.run([sys.executable, str(PIPE / "f2_modelo_amb.py"),
                        "--desde-cache", str(CACHE), "--ambito", "SECCIO",
                        "--out", str(SMOKE / "_tmp_guard")], capture_output=True, text=True)
    assert r.returncode != 0 and "àncla seccional" in (r.stdout + r.stderr), \
        "guard SECCIO sense àncla no ha fallat"
    print("✓ guard negatiu: --ambito SECCIO sense àncla → SystemExit (correcte)\n")

    # -- 4) f2 en àmbit SECCIO --------------------------------------------------
    run([sys.executable, PIPE / "f2_modelo_amb.py", "--desde-cache",
         SMOKE / "cache_ambito.parquet", "--ambito", "SECCIO",
         "--out", SMOKE / "out_f2_seccional"])
    inf = json.loads((SMOKE / "out_f2_seccional" / "informe_f2.json").read_text())
    assert inf["ambito_ground_truth"] == "SECCIO"
    assert inf["modelo_qa"]["modo"] == "SECCIO"
    assert inf["paso1_qa"] == {"n_edificios": 142283, "n_illes": 11633, "n_secciones": 1983}
    assert inf["modelo_qa"]["n_ambitos_observados"] == 1983
    dim = pd.read_parquet(SMOKE / "out_f2_seccional" / "dim_building_rent_estimation.parquet")
    assert list(dim.columns) == DIM_COLS, "les 24 columnes PASO 4 han de ser EXACTES"
    assert (dim["ambito_ground_truth"] == "SECCIO").all()
    assert dim["fuera_rango_serpavi"].mean() == 0.0
    print("✓ f2 SECCIO:", json.dumps(inf["modelo_qa"], ensure_ascii=False))
    print("  LOMO municipal (seccional):", json.dumps(
        {"rmse": inf["lomo_ciego_municipal"]["rmse_eur_m2"]}, ensure_ascii=False), "\n")

    # -- 5) validació creuada del ground truth sintètic ------------------------
    # la mitjana seccional ponderada per habitatges ha de girar al voltant de la
    # municipal (el fixture pertorba ±6% simètricament)
    sec_w = cache_sec.groupby("muni5").apply(
        lambda g: np.average(g["renta_media_contractual_ambito"], weights=g["num_viviendas"]),
        include_groups=False)
    ratio = (sec_w / anchors["contr"]).dropna()
    assert (ratio - 1).abs().max() < 0.07, f"fixture incoherent: {ratio.describe()}"
    print("✓ fixture coherent: mitjana seccional vs municipal, desviació màx "
          f"{float((ratio - 1).abs().max()) * 100:.2f}%\n")

    print("SMOKE SECCIONAL OK — PASO 3 municipal→seccional sense tocar el DDL")


if __name__ == "__main__":
    main()
