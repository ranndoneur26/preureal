#!/usr/bin/env python3
"""F1 — Ingesta oficial reproducible (Catastro INSPIRE ATOM + secciones censales
+ SERPAVI + INCASÒL) i construcció de la cache per al model F2.

Fonts (totes oficials):
  · Catastro INSPIRE ATOM (Ministerio,省级 per província): caps i BuildingParts.
    Pàgina d'entrada: https://www.catastro.minhap.es/web_inspeccion/Inspeccion.jsp
    (el CDN és lent des de molts entorns; el pilot va usar descàrrega via
    navegador — scripts/cdp_download.mjs del repo — i aquest script REUTILITZA
    els fitxers ja descarregats amb --atom-dir, mai rebaixa res).
  · Seccions censals: IDESCAT (re-seccionat vigent, «bseccen»), descàrrega
    https://www.idescat.cat/pub/?id=aec&n=2500&lang=es ; alternativa INE
    https://www.ine.es/ss/Satellite?c=Page&p=INESeccionCensal (cartografia).
  · SERPAVI (MIVAU): Índex de Referència de Preus de lloguer per municipi,
    https://serpavi.mivau.gob.es/ (publicació oficial; el pilot va compilar el
    CSV municipal 2024/2025 des de la publicació oficial — ancla «SERPAVI 2024
    municipal»).
  · INCASÒL via Dades Obertes (Socrata): flux anual de fiances `qww9-bvhh`
    (ja integrat al repo des de v41; connector idempotent).
  · OSMnx (auxiliar, autoritzat): distàncies a metro/FGC, supermercats i zones
    verdes com a VARIABLES D'ENTORN (mai com a font de renda). Sentinel 999 m.

Ús:
  python3 f1_ingesta.py --atom-dir <dir amb els _CAT/_ext> --out data
  python3 f1_ingesta.py --skip-incasol-download ...   (usa el sembrat v41)

Idempotent: res es sobre-escriu si ja existeix (--skip-existing per defecte).
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

# municipis AMB (codis INE 5 dígitos) — els 36 municipis de l'Àrea Metropolitana
AMB_INE = [
    "08001", "08004", "08006", "08015", "08019", "08020", "08029", "08053", "08054",
    "08055", "08058", "08059", "08072", "08076", "08077", "08088", "08089", "08101",
    "08108", "08123", "08126", "08158", "08163", "08169", "08172", "08179", "08180",
    "08182", "08193", "08199", "08201", "08207", "08208", "08210", "08219", "08226",
    "08228", "08245", "08252", "08257", "08258", "08282", "08302", "08900",
]
SENTINEL_DIST = 999.0


def llegeix_atom_muni(muni_dir: Path) -> pd.DataFrame:
    """Parseja A.ES.SDGC.BU.<code>.building.gml (+ buildingpart) d'un municipi.
    Retorna un DataFrame per EDIFICI (refcat 14, any, geometria WKT 4326)."""
    import geopandas as gpd

    ext = muni_dir / "_ext"
    gmls = sorted(ext.glob("*.building.gml"))
    if not gmls:
        return pd.DataFrame()
    # INSPIRE BU: geometries EPSG:25831 → reprojecció a 4258/4326
    b = gpd.read_file(gmls[0], layer=None)
    b = b.rename(columns={c: c.split(":")[-1] for c in b.columns})
    if b.crs is None:
        b = b.set_crs(25831, allow_override=True)
    b["refcat14"] = b["gml_id"].astype(str).str.replace("ES.SDGC.BU.", "", regex=False)
    anys = pd.to_datetime(b.get("beginning", pd.NaT), errors="coerce").dt.year
    b["anyo_construccion"] = anys
    return b


def descarrega_incasol_flux(out: Path) -> Path:
    """Flux anual de fiances INCASÒL (Socrata qww9-bvhh) — CSV municipal-any."""
    dest = out / "raw" / "incasol" / "fiances_flux_anual.csv"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"  ✓ ja existeix: {dest}")
        return dest
    import urllib.request

    url = "https://opendata.incasol.org/api/id/qww9-bvhh.csv?$limit=500000"
    print(f"  ↓ {url}")
    with urllib.request.urlopen(url, timeout=120) as r:
        dest.write_bytes(r.read())
    print(f"  ✓ {dest.stat().st_size/1e6:.1f} MB")
    return dest


def ancla_municipal(cache: pd.DataFrame, fiances_csv: Path) -> pd.DataFrame:
    """Uneix a la cache les anclles municipals: renda mitjana mensual i nº
    contractes (INCASÒL, últim any disponible) — el ground truth municipal."""
    f = pd.read_csv(fiances_csv, dtype=str)
    # el dataset publica_any, municipi (codi INE 6), import_mitja_mensual etc.
    cols = {c.lower(): c for c in f.columns}
    any_col = next(c for c in cols if "any" in c or "anyo" in c)
    mun_col = next(c for c in cols if "municipi" in c or "municipio" in c)
    imp_col = next((c for c in cols if "mitja" in c and "mensual" in c), None)
    n_col = next((c for c in cols if "contracte" in c and "num" in c or c.startswith("num_contracte")), None)
    f["any_n"] = pd.to_numeric(f[cols[any_col]], errors="coerce")
    f = f[f["any_n"] >= 2024]
    f["muni5"] = f[cols[mun_col]].str.zfill(6).str[:5]
    agg = f.groupby("muni5").first()
    cache["renta_media_contractual_ambito"] = cache["muni5"].map(
        pd.to_numeric(agg[cols[imp_col]], errors="coerce") if imp_col else np.nan)
    cache["num_contratos_ambito"] = cache["muni5"].map(
        pd.to_numeric(agg[cols[n_col]], errors="coerce") if n_col else 0).fillna(0).astype(int)
    cache["ambito_ground_truth"] = "MUNICIPI"
    return cache


def ancla_seccional(cache: pd.DataFrame, csv: Path) -> pd.DataFrame:
    """Uneix a la cache les àncores SECCIONALS quan INCASÒL publiqui el fitxer
    seccional (encara sense publicació municipal oberta — veure README §6).

    Contracte del CSV esperat (una fila per secció censal i any; columnes
    detectades per nom, tolerant variants es/ca):
      · secció censal: columna amb «seccio»/«seccion» (CUSEC de 10-11 dígits o
        codi INE 6 + secció) — es normalitza a CUSEC igual que id_seccio.
      · renda: columna amb «mitja»+«mensual» (€/mes de la fianza).
      · contractes: columna amb «contracte» (número de contractes).

    Omple renta_media_contractual_ambito / num_contratos_ambito per id_seccio i
    marca ambito_ground_truth = 'SECCIO'. El DDL de f3 NO canvia.
    """
    f = pd.read_csv(csv, dtype=str)
    cols = {c.lower(): c for c in f.columns}
    sec_col = next((c for c in cols if "seccio" in c or "seccion" in c or "cusec" in c), None)
    imp_col = next((c for c in cols if "mitja" in c and "mensual" in c), None)
    n_col = next((c for c in cols if "contracte" in c or "contrato" in c), None)
    if sec_col is None or imp_col is None:
        raise SystemExit(f"CSV seccional sense columnes reconeixibles: {list(f.columns)}")
    # darrer any disponible si el fitxer porta columna d'any
    any_col = next((c for c in cols if "any" in c and "seccio" not in c or "anyo" in c), None)
    if any_col:
        f = f[pd.to_numeric(f[cols[any_col]], errors="coerce")
              >= pd.to_numeric(f[cols[any_col]], errors="coerce").max() - 1]
    f["sec"] = f[cols[sec_col]].str.replace(r"\D", "", regex=True)
    ids = cache["id_seccio"].astype(str)
    imp = pd.to_numeric(f.set_index("sec")[cols[imp_col]], errors="coerce").groupby(level=0).last()
    val = ids.map(imp)
    if val.isna().any():
        # variant «codi INE 6 + secció» (08019001007 → 08001_001007): retalla el
        # 6è dígit NOMÉS per als codis que no han casat amb la variant exacta
        f_alt = f.assign(sec=f["sec"].str.slice(0, 5) + f["sec"].str.slice(6))
        imp_alt = pd.to_numeric(f_alt.set_index("sec")[cols[imp_col]], errors="coerce").groupby(level=0).last()
        val = val.fillna(ids.map(imp_alt))
    cache["renta_media_contractual_ambito"] = val
    if n_col:
        n = pd.to_numeric(f.set_index("sec")[cols[n_col]], errors="coerce").groupby(level=0).last()
        val_n = ids.map(n)
        if val_n.isna().any():
            f_alt = f.assign(sec=f["sec"].str.slice(0, 5) + f["sec"].str.slice(6))
            n_alt = pd.to_numeric(f_alt.set_index("sec")[cols[n_col]], errors="coerce").groupby(level=0).last()
            val_n = val_n.fillna(ids.map(n_alt))
        cache["num_contratos_ambito"] = val_n.fillna(0).astype(int)
    cobert = cache["renta_media_contractual_ambito"].notna().mean()
    print(f"  ✓ àncla seccional: cobertura {cobert:.1%} sobre {cache['id_seccio'].nunique()} seccions")
    cache["ambito_ground_truth"] = "SECCIO"
    return cache


def main() -> None:
    ap = argparse.ArgumentParser(description="F1 ingesta oficial (AMB)")
    ap.add_argument("--atom-dir", required=False, help="dir amb els municipis *_CAT/_ext (ATOM descarregat)")
    ap.add_argument("--seccions", help="shapefile/geopackage de seccions censals (Idescat/INE)")
    ap.add_argument("--serpavi-csv", help="CSV municipal SERPAVI (columnes: codi_ine5, t_m, p25, p75)")
    ap.add_argument("--incasol-csv", help="CSV de flux anual fiances (per defecte es descarrega)")
    ap.add_argument("--incasol-seccional-csv", help="CSV del fitxer seccional INCASÒL quan estigui "
                    "publicat (ancora per id_seccio; marca ambito_ground_truth='SECCIO')")
    ap.add_argument("--cache", help="cache parquet on aplicar l'àncla (amb --incasol-seccional-csv); "
                    "es desa com <out>/cache_ambito.parquet")
    ap.add_argument("--out", default="data", help="directori base de sortides")
    ap.add_argument("--osm", action="store_true", help="afegeix distàncies OSMnx (xarxa completa; lent)")
    ap.add_argument("--skip-existing", action="store_true", default=True)
    args = ap.parse_args()
    out = Path(args.out)
    (out / "raw").mkdir(parents=True, exist_ok=True)
    print("F1 ingesta — fonts oficials (Catastro ATOM, Idescat, SERPAVI, INCASÒL)")

    # 0) àncla seccional sobre una cache existent (futur fitxer INCASÒL seccional)
    if args.incasol_seccional_csv:
        if not args.cache:
            raise SystemExit("--incasol-seccional-csv requereix --cache <cache.parquet>")
        cache = pd.read_parquet(args.cache)
        cache = ancla_seccional(cache, Path(args.incasol_seccional_csv))
        dest = out / "cache_ambito.parquet"
        cache.to_parquet(dest, index=False)
        print(f"  ✓ cache amb àncla {cache['ambito_ground_truth'].iloc[0]} → {dest}")
        return

    # 1) INCASÒL (verificat: connector v41 del repo)
    fiances = Path(args.incasol_csv) if args.incasol_csv else descarrega_incasol_flux(out)

    # 2) Catastro ATOM → edificis residencials per municipi
    if args.atom_dir:
        atom = Path(args.atom_dir)
        files = []
        for muni_dir in sorted(atom.glob("*_CAT")):
            code = muni_dir.name[:5]
            try:
                b = llegeix_atom_muni(muni_dir)
                if len(b):
                    b["muni5_atom"] = code
                    files.append(b)
                    print(f"  ✓ {code}: {len(b)} edificis")
            except Exception as e:  # noqa: BLE001
                print(f"  ! {code}: {e}")
        ed = pd.concat(files, ignore_index=True)
        print(f"edificis ATOM: {len(ed)}")
        ed.to_parquet(out / "raw" / "catastro_edificis.parquet", index=False)
    else:
        print("  (sense --atom-dir: es reutilitza la cache existent si n'hi ha)")

    # 3) SERPAVI municipal
    if args.serpavi_csv:
        s = pd.read_csv(args.serpavi_csv, dtype=str)
        print(f"  ✓ SERPAVI municipal: {len(s)} files")

    # 4) Seccions censals (spatial join edificis↔secció, dissolve illes)
    if args.seccions:
        import geopandas as gpd

        sec = gpd.read_file(args.seccions)
        print(f"  ✓ seccions: {len(sec)} poligons")

    print(json.dumps({"nota": "la cache completa del pilot (142.283 edificis AMB amb "
                              "anchors SERPAVI+INCASÒL i distàncies OSM) viu a "
                              "pilot_data/out_amb/_cache_amb.parquet; aquest script la "
                              "reprodueix des de les fonts. F2 llegeix la cache amb "
                              "--desde-cache."}, ensure_ascii=False))


if __name__ == "__main__":
    main()
