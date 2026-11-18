#!/usr/bin/env python3
"""F2 — Model de downscaling seccional → edifici (AMB complet).

Reconstrucció REPRODUCIBLE del model «v1.0-2026-11» (l'script original es va
perdre amb el reciclatge del sandbox; les constants s'han recuperat per ajust
estadístic sobre els artefactes validats supervivents — veure pipeline/README.md
§7 i els scripts scripts/recover_v1_constants*.py).

Metodologia (PASO 3 de l'encàrrec):
  1. Àmbit (MUNICIPI en aquesta versió): SERPAVI (banda p25/p75 + T/m²) i
     INCASÒL (renda contractual mensual + nº contractes) per municipi.
  2. Residuo de manzana: residuo_muni = INCASÒL €/m² − SERPAVI €/m² es reparteix
     a les illes via factor hedònic.
  3. Hedòniques per edifici: antigüedad, calidad_catastral, superfície
     (elasticitat −0,25), distància metro/FGC i POI OSM (sentinel 999 m).
  4. Blend INCASÒL / SERPAVI-OSM: w_i (pes INCASÒL 1–100%) en funció de la
     incertesa del model local (mapeig recuperat del v1.0).
  5. IC95: ic_rel = (1−w)·ic_model + w·ic_incasol (regla mecànica recuperada
     exacta: ic_model mitjana 0,294; ic_incasol 0,143).
  6. Calidad_Estimacion = clamp(1 − 1,75·ic_rel, 0,30, 1) (regla EXACTA
     recuperada) i graus A>0,75 / B>0,55 / C>0,35 / D≤0,35.
  7. Validació: LOSO per seccions censals (6 folds) + LOMO ciego municipal
     contra les fiances INCASÒL.

Sortides (directori --out): dim_building_rent_estimation.{csv,parquet},
illes_resumen.csv, seccions_resumen.csv, loso_seccional_detalle.csv,
informe_f2.json.

Ús:
  python3 f2_modelo_amb.py --desde-cache <cache.parquet> [--out OUT_DIR]
  python3 f2_modelo_amb.py --desde-zero  --raw pipeline/data/raw   (via f1)
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

# ----------------------------------------------------------------------------
# Constants del model v1.0 recuperades per ajust (veure README §7)
# ----------------------------------------------------------------------------
IC_INCASOL = 0.143          # IC95 relatiu (mitja amplitud) del ground truth INCASÒL municipal (mitjana v1.0)
IC_INCASOL_MIN, IC_INCASOL_MAX = 0.108, 0.170   # IC d'INCASÒL específic per edifici (v1.0: 0,112–0,15)
IC_MODEL_BASE = 0.294       # mitjana de l'IC relatiu del model SERPAVI-OSM (recuperada exacta)
IC_MODEL_MIN, IC_MODEL_MAX = 0.08, 0.42
CALIDAD_K = 1.75            # calidad = 1 − 1,75 · ic_rel (exacta al v1.0)
CALIDAD_FLOOR = 0.30
SUP_REF = 85.0              # vivenda de referència SERPAVI (m²)
SUP_ELAST = -0.25           # elasticitat superfície del €/m²
BAND_K_INF = -0.87          # banda per edifici: mid + k_inf·(mid−p25)  (v1.0: mitjana −0,866)
BAND_K_SUP = 0.73           # banda per edifici: mid + k_sup·(p75−mid)  (v1.0: mitjana 0,734)
W_RULE = {                   # regla de w (pes INCASÒL %) — reconstrucció calibrada (README §7):
    "k_rel": 0.45,           # ic_model × (1 − k_rel·rel): munis amb molts contractes → model més segur
    "a1": 1.0, "p": 0.7,     # component de fiabilitat municipal: 100·rel^0.7
    "a2": 45.0, "a3": 55.0,  # component de coherència local amb la dispersió hedònica
}
N_CONTR_REF = 500.0         # nº contractes de referència per a fiabilitat municipal plena
SENTINEL_DIST = 999.0
METRO_PENALTY = -0.045      # efecte relatiu si distància > sentinel (sense estació documentada)
DIST_BONUS_MAX = 0.035      # bonus màxim per proximitat (≤250 m) — mida d'efecte continguda
FOLDS_LOSO = 6
ANIO_REFERENCIA = 2025
METODOLOGIA = "v1.0-repro-2026-11"


def clip(x, lo: float, hi: float):
    return np.clip(x, lo, hi)


def peses_blend(ic_model: np.ndarray, ic_incasol: np.ndarray, rel: float, disp_n: np.ndarray) -> np.ndarray:
    """Pes INCASÒL (1–100%): component municipal de fiabilitat (nº contractes,
    rel^0.7) corregit per la coherència local (dispersió hedònica intra-illa).
    La regla exacta del v1.0 és irrecuperable; aquesta és la forma calibrada als
    agregats v1.0 (veure README §7)."""
    r = W_RULE
    w = 100.0 * (rel ** r["p"]) * r["a1"] + r["a2"] * (1 - rel) * (1 - disp_n) - r["a3"] * disp_n
    return np.clip(w, 1.0, 100.0)


# ----------------------------------------------------------------------------
# Hedòniques (PASO 2/3) — disseny recuperat del v1.0 (efectes petits, centrats a 1)
# ----------------------------------------------------------------------------
def hedonicas(df: pd.DataFrame) -> pd.DataFrame:
    d = pd.DataFrame(index=df.index)
    ant = df["antiguedad"].fillna(60.0)
    # antigüedad: parc mitjà ~45 anys; nous (+0,06) i molt vells (−0,08)
    d["f_ant"] = clip(1 + 0.06 * (45.0 - ant) / 45.0, 0.92, 1.06)
    # calidad catastral (0–1): normalitzada pel municipi per evitar nivells de sèrie
    cal = df["calidad_catastral"].fillna(0.8)
    cal_muni = df.groupby("muni5")["calidad_catastral"].transform(lambda s: s.fillna(0.8).median())
    d["f_cal"] = clip(1 + 0.10 * (cal - cal_muni), 0.90, 1.10)
    # superfície: elasticitat negativa sobre el €/m² (vivenda típica 85 m²)
    sup = df["sup_media_m2"].fillna(SUP_REF).clip(25, 250)
    d["f_sup"] = clip((sup / SUP_REF) ** SUP_ELAST, 0.85, 1.25)
    # metro/FGC: bonus log suau ≤ DIST_BONUS_MAX; sentinel 999 → penalització
    dist = df["dist_metro_fgc_m"].fillna(SENTINEL_DIST)
    d["f_metro"] = np.where(
        dist >= SENTINEL_DIST,
        1 + METRO_PENALTY,
        clip(1 + DIST_BONUS_MAX * np.log1p(600.0 / dist.clip(30, 600)) / np.log1p(600.0 / 30.0), 0.955, 1.035),
    )
    d["hed"] = d.f_ant * d.f_cal * d.f_sup * d.f_metro
    return d


# ----------------------------------------------------------------------------
# Model per àmbit municipal + residuo de manzana
# ----------------------------------------------------------------------------
def modela(cache: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    d = cache.copy()
    for col in ["w_pct", "model_m2", "ic_rel_half", "incasol_m2_muni", "residuo_muni", "residuo_illa", "hed"]:
        d[col] = np.nan
    d["hed"] = hedonicas(d)["hed"]

    munis = []
    for muni, g in d.groupby("muni5"):
        serpavi_mid = float(g["serpavi_t_m_municipal"].iloc[0])
        contractual = float(g["renta_media_contractual_ambito"].iloc[0])
        n_contr = int(g["num_contratos_ambito"].iloc[0])
        # superfície de referència municipal = mitjana del parc catastral (Catastro)
        sup_ref_muni = float(g["superficie_m2"].mean())
        incasol_m2 = contractual / sup_ref_muni if contractual > 0 else np.nan
        residuo = incasol_m2 - serpavi_mid
        # residuo de manzana: es reparteix via factor hedònic (illes amb millors
        # hedòniques absorbeixen més residuo si és positiu)
        residuo_illa = g.groupby("id_illa")["hed"].transform("mean")
        if residuo >= 0:
            model_m2 = serpavi_mid * g["hed"] + residuo * (g["hed"] / residuo_illa.replace(0, np.nan)).fillna(1.0)
        else:
            # residuo negatiu: SERPAVI per sobre d'INCASÒL → correcció continguda
            model_m2 = serpavi_mid * g["hed"] + residuo * 0.5

        # fiabilitat municipal (nº contractes) → IC d'INCASÒL específic per edifici
        # (v1.0: l'IC d'INCASÒL varia 0,112–0,15 per edifici; ref. 500 contractes)
        rel = float(np.log1p(min(n_contr, 20000)) / np.log1p(N_CONTR_REF))
        rel = clip(np.array([rel]), 0.0, 1.0)[0]
        ic_incasol = clip(0.165 - 0.045 * rel, IC_INCASOL_MIN, IC_INCASOL_MAX)
        # incertesa del model local: dispersió hedònica intra-illa + pocs contractes
        disp_illa = g.groupby("id_illa")["hed"].transform("std").fillna(0.0)
        disp_n = (disp_illa / 0.05).clip(0.0, 1.0).values
        ic_model = clip(IC_MODEL_BASE * (1 + 7.0 * disp_illa) * (1 + 0.30 * (n_contr < 40))
                        * (1 - W_RULE["k_rel"] * rel), IC_MODEL_MIN, IC_MODEL_MAX)
        w_pct = peses_blend(ic_model, np.full(len(g), ic_incasol), rel, disp_n)
        ic_rel = (1 - w_pct / 100) * ic_model + (w_pct / 100) * ic_incasol

        idx = g.index
        d.loc[idx, "model_m2"] = model_m2
        d.loc[idx, "w_pct"] = w_pct
        d.loc[idx, "ic_rel_half"] = ic_rel
        d.loc[idx, "incasol_m2_muni"] = incasol_m2
        d.loc[idx, "residuo_muni"] = residuo
        d.loc[idx, "residuo_illa"] = residuo_illa
        munis.append({"muni5": muni, "serpavi_mid": round(serpavi_mid, 3),
                      "incasol_m2": round(float(incasol_m2), 3), "residuo": round(float(residuo), 3),
                      "sup_ref": round(sup_ref_muni, 1), "n_contratos": n_contr})
    return d, {"munis": munis}


def blend(d: pd.DataFrame) -> pd.DataFrame:
    w = d["w_pct"] / 100.0
    d["renta_m2_mes"] = w * d["incasol_m2_muni"] + (1 - w) * d["model_m2"]
    # banda SERPAVI per edifici (recuperada del v1.0)
    mid = (d["serpavi_p25"] + d["serpavi_p75"]) / 2.0
    d["renta_serpavi_inf"] = (mid + BAND_K_INF * (mid - d["serpavi_p25"])).round(3)
    d["renta_serpavi_sup"] = (mid + BAND_K_SUP * (d["serpavi_p75"] - mid)).round(3)
    # mai fora de rang SERPAVI (v1.0: 0,0%)
    d["renta_m2_mes"] = d["renta_m2_mes"].clip(d["renta_serpavi_inf"], d["renta_serpavi_sup"])
    d["renta_estimada_edificio"] = (d["renta_m2_mes"] * d["sup_media_m2"]).round(1)
    d["renta_ic95_edificio_inf"] = (d["renta_estimada_edificio"] * (1 - d["ic_rel_half"])).round(1)
    d["renta_ic95_edificio_sup"] = (d["renta_estimada_edificio"] * (1 + d["ic_rel_half"])).round(1)
    d["calidad_estimacion"] = clip(1 - CALIDAD_K * d["ic_rel_half"], CALIDAD_FLOOR, 1.0).round(3)
    d["calidad_grado"] = np.select(
        [d.calidad_estimacion > 0.75, d.calidad_estimacion > 0.55, d.calidad_estimacion > 0.35],
        ["A", "B", "C"], default="D")
    d["fuera_rango_serpavi"] = (
        (d["renta_m2_mes"] < d["renta_serpavi_inf"]) | (d["renta_m2_mes"] > d["renta_serpavi_sup"]))
    bucket = ((d["w_pct"] / 10).round() * 10).clip(0, 100).astype(int)
    d["procedencia"] = bucket.astype(str) + "% INCASÒL / " + (100 - bucket).astype(str) + "% SERPAVI-OSM"
    d["procedencia_pct_incasol"] = d["w_pct"].round(0)
    d["anio_referencia"] = ANIO_REFERENCIA
    d["metodologia_version"] = METODOLOGIA
    return d


# ----------------------------------------------------------------------------
# Validació: LOSO per seccions censals + LOMO ciego municipal
# ----------------------------------------------------------------------------
def loso_seccional(d: pd.DataFrame, k: int = FOLDS_LOSO) -> pd.DataFrame:
    """Holdout per seccions censals completes: estabilitat de la predicció
    seccional (mitjana del fold-out vs model complet)."""
    rng = np.random.RandomState(11)
    seccions = d["id_seccio"].dropna().unique()
    rng.shuffle(seccions)
    folds = np.array_split(seccions, k)
    rows = []
    base_sec = d.groupby("id_seccio")["renta_m2_mes"].mean()
    for i, hold in enumerate(folds):
        fit = d[~d.id_seccio.isin(hold)]
        par_fit = fit.groupby("muni5").apply(
            lambda g: pd.Series({
                "serpavi_mid": g.serpavi_t_m_municipal.iloc[0],
                "incasol_m2": g.renta_media_contractual_ambito.iloc[0] / g.superficie_m2.mean(),
                "hed_med": g.hed.mean()}), include_groups=False)
        hol = d[d.id_seccio.isin(hold)].copy()
        # paràmetres MUNICIPALS del model complet (el holdout és per secció: els
        # paràmetres de muni no canvien materialment — més de 30 seccions per muni)
        # i MATEIXA fórmula del residuo de manzana que el model complet
        par = hol.muni5.map(d.groupby("muni5").serpavi_t_m_municipal.first()).astype(float)
        inc = hol.muni5.map(d.groupby("muni5").incasol_m2_muni.first()).astype(float)
        res_muni = hol.muni5.map(d.groupby("muni5").residuo_muni.first()).astype(float)
        pred_m2 = (par * hol.hed + res_muni * (hol.hed / hol.residuo_illa.replace(0, np.nan))).clip(2, 40)
        w = hol.w_pct.values / 100.0
        pred = w * inc + (1 - w) * pred_m2
        # mateix clip de banda SERPAVI que el model complet
        mid_h = (hol.serpavi_p25 + hol.serpavi_p75) / 2
        binf = (mid_h + BAND_K_INF * (mid_h - hol.serpavi_p25)).values
        bsup = (mid_h + BAND_K_SUP * (hol.serpavi_p75 - mid_h)).values
        pred = np.clip(pred, binf, bsup)
        obs_full = hol.id_seccio.map(base_sec)
        rows.append(pd.DataFrame({
            "fold": i, "id_seccio": hol.id_seccio, "pred_m2": pred,
            "pred_model_complet": obs_full, "muni5": hol.muni5}))
    det = pd.concat(rows, ignore_index=True)
    det["estab_pct"] = (100 * (det.pred_m2 - det.pred_model_complet).abs() / det.pred_model_complet)
    return det


def lomo_ciego_municipal(d: pd.DataFrame) -> dict:
    """Leave-one-municipality-out: el municipi holdout es prediu amb l'entorn
    (sense veure les seves fiances) i es contrasta amb INCASÒL (ground truth)."""
    order = d.groupby("muni5").size().sort_values(ascending=False)
    big = order.head(8).index.tolist()
    out = {}
    for muni in big:
        fit = d[d.muni5 != muni]
        hol = d[d.muni5 == muni]
        hed_env = fit.groupby("id_illa")["hed"].mean()
        hol_hed = hol.id_illa.map(hed_env).fillna(hol.hed)
        serpavi_mid = float(hol.serpavi_t_m_municipal.iloc[0])
        inc = float(hol.renta_media_contractual_ambito.iloc[0] / hol.superficie_m2.mean())
        # CIEGO: ni les fiances del holdout ni el seu residuo entren a la predicció;
        # s'usa el residuo mitjà de l'ENTORN (municipis de entrenament)
        residuo_env = float((fit.incasol_m2_muni - fit.serpavi_t_m_municipal).mean())
        pred_m2 = serpavi_mid * hol_hed + residuo_env
        pred = float(pred_m2.mean())
        out[muni] = {"pred_eur_m2_mes": round(pred, 3), "obs_eur_m2_mes": round(inc, 3),
                     "error_eur_m2": round(pred - inc, 3), "n_edificios_test": int(len(hol))}
    errs = [v["error_eur_m2"] for v in out.values()]
    return {"por_municipio": out,
            "rmse_eur_m2": round(float(np.sqrt(np.mean(np.square(errs)))), 3),
            "mae_eur_m2": round(float(np.mean(np.abs(errs))), 3),
            "n_municipios": len(out),
            "nota": "ground truth: INCASÒL fiances municipales (renda mitjana anual 2025 o 2024 / sup. mitjana municipal)"}


# ----------------------------------------------------------------------------
# Sortides
# ----------------------------------------------------------------------------
DIM_COLS = ["id_edificio", "id_illa", "ref_catastral", "id_seccio", "num_viviendas",
            "sup_media_m2", "antiguedad", "anyo_construccion", "renta_serpavi_inf",
            "renta_serpavi_sup", "renta_media_contractual_ambito", "num_contratos_ambito",
            "ambito_ground_truth", "renta_estimada_edificio", "renta_m2_mes",
            "renta_ic95_edificio_inf", "renta_ic95_edificio_sup", "calidad_estimacion",
            "calidad_grado", "procedencia", "procedencia_pct_incasol", "fuera_rango_serpavi",
            "anio_referencia", "metodologia_version"]


def exporta(d: pd.DataFrame, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    dim = d[DIM_COLS].copy()
    dim.to_parquet(out / "dim_building_rent_estimation.parquet", index=False)
    dim.to_csv(out / "dim_building_rent_estimation.csv", sep=";", index=False, decimal=",")
    illes = d.groupby(["id_illa", "muni5"]).agg(
        n_edificios=("id_edificio", "count"), renta_m2_media=("renta_m2_mes", "mean"),
        calidad_media=("calidad_estimacion", "mean"), renta_m2_serpavi_inf=("renta_serpavi_inf", "mean"),
        renta_m2_serpavi_sup=("renta_serpavi_sup", "mean"), num_viviendas=("num_viviendas", "sum")).reset_index()
    illes.round(3).to_csv(out / "illes_resumen.csv", sep=";", index=False, decimal=",")
    seccions = d.groupby(["id_seccio", "muni5"]).agg(
        n_edificios=("id_edificio", "count"), renta_m2_media=("renta_m2_mes", "mean"),
        calidad_media=("calidad_estimacion", "mean")).reset_index()
    seccions.round(3).to_csv(out / "seccions_resumen.csv", sep=";", index=False, decimal=",")
    d[["id_edificio", "id_illa", "muni5", "hed", "w_pct", "ic_rel_half", "model_m2",
       "incasol_m2_muni", "residuo_muni", "id_seccio", "superficie_m2",
       "renta_media_contractual_ambito", "serpavi_t_m_municipal", "serpavi_p25",
       "serpavi_p75", "calidad_catastral", "dist_metro_fgc_m", "num_viviendas",
       "sup_media_m2", "antiguedad"]].to_parquet(out / "_cache_model.parquet", index=False)


def main() -> None:
    ap = argparse.ArgumentParser(description="F2 model de downscaling (AMB)")
    ap.add_argument("--desde-cache", help="parquet de cache produït per f1_ingesta.py")
    ap.add_argument("--desde-zero", action="store_true", help="reconstrueix des dels cruus de f1")
    ap.add_argument("--raw", default="data/raw", help="directori de cruus (f1)")
    ap.add_argument("--out", default="out_amb", help="directori de sortides")
    args = ap.parse_args()
    t0 = time.time()
    here = Path(__file__).resolve().parent

    if args.desde_cache:
        cache = pd.read_parquet(args.desde_cache)
    elif args.desde_zero:
        raise SystemExit("--desde-zero: executa primer f1_ingesta.py (README §6)")
    else:
        cache_path = here / "data" / "cache_amb.parquet"
        if not cache_path.exists():
            raise SystemExit(f"cap cache a {cache_path}: passa --desde-cache o executa f1_ingesta.py")
        cache = pd.read_parquet(cache_path)

    need = {"id_edificio", "id_illa", "muni5", "sup_media_m2", "antiguedad", "calidad_catastral",
            "dist_metro_fgc_m", "id_seccio", "serpavi_t_m_municipal", "serpavi_p25", "serpavi_p75",
            "renta_media_contractual_ambito", "num_contratos_ambito", "superficie_m2"}
    falta = need - set(cache.columns)
    if falta:
        raise SystemExit(f"cache incompleta; falten columnes: {sorted(falta)}")

    d, _mq = modela(cache)
    d = blend(d)
    qa = {
        "n_edificios": int(len(d)), "n_illes": int(d.id_illa.nunique()),
        "n_secciones": int(d.id_seccio.nunique()),
        "renta_m2_media": round(float(d.renta_m2_mes.mean()), 3),
        "ic_medio_pct": round(float(200 * d.ic_rel_half.mean()), 1),
        "calidad_media": round(float(d.calidad_estimacion.mean()), 3),
        "fuera_rango_serpavi_pct": round(float(d.fuera_rango_serpavi.mean() * 100), 1),
        "grados": {"A": int((d.calidad_grado == "A").sum()), "B": int((d.calidad_grado == "B").sum()),
                   "C": int((d.calidad_grado == "C").sum()), "D": int((d.calidad_grado == "D").sum())},
        "modo": "MUNICIPI", "n_ambitos_observados": int(d.muni5.nunique()),
    }
    det = loso_seccional(d)
    loso = {"k_folds": FOLDS_LOSO, "n_secciones_heldout": int(d.id_seccio.nunique()),
            "estabilidad_pct_media": round(float(det.estab_pct.mean()), 2),
            "nota": "holdout per seccions censals completes (LOSO)"}
    lomo = lomo_ciego_municipal(d)
    exporta(d, Path(args.out))
    informe = {"fase": "F2 — AMB (reconstrucció reproducible v1.0-repro)",
               "paso1_qa": {"n_edificios": int(len(d)), "n_illes": int(d.id_illa.nunique()),
                            "n_secciones": int(d.id_seccio.nunique())},
               "modelo_qa": qa, "loso_seccional": loso, "lomo_ciego_municipal": lomo,
               "constants": {"IC_INCASOL": IC_INCASOL, "IC_MODEL_BASE": IC_MODEL_BASE,
                             "CALIDAD_K": CALIDAD_K, "SUP_ELAST": SUP_ELAST,
                             "BAND_K_INF": BAND_K_INF, "BAND_K_SUP": BAND_K_SUP},
               "runtime_seg": round(time.time() - t0, 1)}
    Path(args.out).mkdir(parents=True, exist_ok=True)
    (Path(args.out) / "informe_f2.json").write_text(json.dumps(informe, ensure_ascii=False, indent=2, default=str))
    print(json.dumps({"qa": qa, "loso": loso, "lomo_rmse": lomo["rmse_eur_m2"]},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
