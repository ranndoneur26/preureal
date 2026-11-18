# Pipeline ETL Geoespacial + Machine Learning — renda de lloguer per EDIFICI i ILLA

PreuReal · Fases F1–F3 (producció) · base metodològica: encàrrec PASO 1–4 ·
versió de metodologia dels artefactes carregats a producció: **v1.0-2026-11**
(reconstrucció reproducible: `v1.0-repro-2026-11`).

## 1. Què fa aquest pipeline

Estima la **renda de lloguer mitjana (€/m²·mes i €/mes)** a nivell d'**edifici**
(`dim_building_rent_estimation`) i d'**illa (manzana)** (`geo_illes`) per a
l'**AMB complet**, fent **downscaling espacial** de dades oficials agregades:
com que INCASÒL no publica dades a nivell de finca (protecció de dades), el
model combina el nivell municipal/seccional amb variables hedòniques
edifici-a-edifici del Catastro.

```
f1_ingesta.py        → data/raw/ (Catastro ATOM · Idescat · SERPAVI · INCASÒL)
f2_modelo_amb.py     → dim_building_rent_estimation.{csv,parquet} + illes/seccions
                       + loso_seccional_detalle.csv + informe_f2.json
f3_carga_postgis.py  → esquema `geo` de la BD (3 taules, PostGIS-ready)
sql/001_...sql       → DDL PASO 4 de referència (producció)
```

Resultats validats (AMB, informe + reconstrucció):

| Mètrica | v1.0 (producció) | v1.0-repro |
|---|---|---|
| Edificis / illes / seccions | 142.283 / 11.633 / 1.983 | 142.283 / 11.633 / 1.983 |
| Renda m² mitjana | 10,039 €/m² | 10,138 €/m² |
| IC95 mitjà | 38,3 % | 38,7 % |
| Calidad mitjana | 0,657 | 0,662 |
| Fora de banda SERPAVI | 0,0 % | 0,0 % |
| **LOSO estabilitat seccional** | 1,62 % | 0,39 % |
| **LOMO RMSE ciego municipal** | 1,386 €/m² | 1,325 €/m² |
| Graus A/B/C/D | 23.962 / 96.890 / 21.404 / 27 | 12.678 / 124.673 / 4.411 / 521 |

## 2. Fonts oficials (totes verificables)

| Font | Ús | On |
|---|---|---|
| **Catastro (Ministerio)** — INSPIRE ATOM provincial, capes Building + BuildingParts (ETRS89/UTM31N) | geometries d'edifici, any de construcció, refcat 14 | https://www.catastro.minhap.es/web_inspeccion/Inspeccion.jsp (descàrrega; el CDN és lent des de molts entorns — el pilot va usar `scripts/cdp_download.mjs`) |
| **Catastro — fichero CAT (arquitectónico)** | ús Residencial, superfícies, codi de qualitat catastral, nº vivendes | mateix portal, descàrrega protegida (browser) |
| **IDESCAT** — seccions censals (re-seccionat vigent «bseccen») | spatial join edifici ↔ secció censal (CUSEC) | https://www.idescat.cat/pub/?id=aec&n=2500 |
| **SERPAVI (MIVAU)** — Índex de Referència de Preus de lloguer municipal | banda p25/p75 + T/m² per municipi (ancla «SERPAVI 2024 municipal») | https://serpavi.mivau.gob.es/ |
| **INCASÒL via Dades Obertes** — flux anual de fiances (Socrata `qww9-bvhh`) | ground truth municipal: renda contractual mensual + nº contractes | https://opendata.incasol.org/ (connector idempotent ja integrat al repo des de v41) |
| **OSM / OSMnx** (auxiliar, autoritzat) | VARIABLES D'ENTORN només: distància a metro/FGC, supermercats, zones verdes (sentinel 999 m). **Mai font de renda.** | https://www.openstreetmap.org (ODbL) |

## 3. Metodologia (PASO 1–4 de l'encàrrec)

- **PASO 1 (ETL espacial)**: Catastro edificis amb ús Residencial →
  spatial join amb seccions censals (CUSEC) → `dissolve` per massa per generar
  les **illes** (`<muni5>_<masa>`).
- **PASO 2 (enriquecimiento)**: per edifici — num_viviendas, sup_media_m2,
  antigüedad (ref. 2024), calidad_catastral, dist_metro_fgc_m (OSMnx, sentinel
  999); per municipi — banda SERPAVI (p25/T/p75) i fiances INCASÒL
  (renda contractual mensual + nº contractes, 2025 o 2024).
- **PASO 3 (downscaling)**:
  1. `residuo_muni = INCASÒL €/m² − SERPAVI €/m²` (residuo de manzana municipal);
  2. `hed_i = f_ant · f_cal · f_sup · f_metro` (efectes petits, centrats a 1);
  3. `model_m2_i = SERPAVI_mid · hed_i + residuo_muni · (hed_i / hed_illa)`
     — el residuo es reparteix per illes via factor hedònic;
  4. blend INCASÒL/SERPAVI-OSM amb pes `w_i` (1–100%);
  5. `IC_rel = (1−w)·IC_model + w·IC_incasol` (regla mecànica recuperada
     exacta del v1.0: mitjana IC_model 0,294);
  6. **Calidad = clamp(1 − 1,75·IC_rel, 0,30, 1)** — regla EXACTA recuperada;
     graus A>0,75 / B>0,55 / C>0,35 / D≤0,35 (exactes);
  7. mai fora de banda SERPAVI (clip final; v1.0 i repro: 0,0%).
- **Validació**:
  - **LOSO** (leave-one-section-out): holdout per **seccions censals completes**
    en 6 folds; estabilitat de la predicció seccional vs model complet.
  - **LOMO ciego municipal**: el municipi holdout es prediu amb l'entorn (les
    seves fiances ni residuo NO entren) → RMSE/MAE contra INCASÒL.
- **PASO 4 (càrrega)**: `sql/001_dim_building_rent_estimation.sql` + f3 →
  esquema `geo` de producció.

## 4. Com executar

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# F1 — ingesta (idempotent; reutilitza ATOM descarregat amb --atom-dir)
python3 f1_ingesta.py --atom-dir <dir_amb_els_*_CAT> --out data

# F2 — model (des de cache o des de raw)
python3 f2_modelo_amb.py --desde-cache data/cache_amb.parquet --out out_amb

# F3 — càrrega PostGIS (idempotent, no toca cap taula del app)
python3 f3_carga_postgis.py --dim out_amb/dim_building_rent_estimation.parquet \
    --cache data/cache_amb.parquet --url "$DATABASE_URL"
```

## 5. Endpoints servits (F3)

- `GET /api/geo/illes?muni=08019` — públic: agregat per illa (renta m², calidad,
  n edificis, centroid). 503 `DATA_NOT_READY` si el pipeline no està carregat.
- `GET /api/geo/edifici?refcat=08001_000100300DF19C` — Premium/Pro (403
  `PLAN_REQUIRED` al Gratuït): estimació d'edifici amb IC95% i grau.
- Ambdues serveixen `nota` legal: «Comparació estadística, no és una taxació
  oficial» — mai una taxació.

## 6. Estat i limitacions honestes

- **Àmbit del ground truth: MUNICIPI.** El *fichero seccional* de fiances
  INCASÒL no té publicació municipal oberta (protecció de dades); el benchmark
  seccional SERPAVI (`bseccen2025`) queda pendent de traducció al CUSEC vigent.
  Quan hi hagi ground truth seccional, el PASO 3 puja de municipal a seccional
  sense canviar el DDL (`ambito_ground_truth` ja el documenta).
- **Reconstrucció v1.0-repro**: l'script original del pilot es va perdre amb el
  reciclatge de l'entorn; les constants es van recuperar per ajust estadístic
  sobre els artefactes validats (`scripts/recover_v1_constants*.py` fora del
  repo). Les regles EXACTES recuperades: `calidad = 1 − 1,75·IC_rel` (floor
  0,30), llindars de graus, descomposició mecànica de l'IC, banda per edifici
  (inf = mid − 0,87·(mid−p25); sup = mid + 0,73·(p75−mid)) i forma del blend.
  La regla exacta de `w` per edifici és irrecuperable: la reconstrucció usa una
  forma calibrada (fiabilitat municipal `rel^0,7` corregida per coherència
  hedònica local) que reprodueix els agregats v1.0 (IC 38,7% vs 38,3%; calidad
  0,662 vs 0,657; LOMO 1,325 vs 1,386) però NO la distribució exacta de graus.
  Els artefactes de producció (dim carregada) continuen essent els validats
  v1.0-2026-11 amb el seu LOSO/informe.
- **PostGIS**: el PG local del sandbox no porta l'extensió (les geometries es
  guarden com a WKT + lat/lon, mateix DDL conceptual); en producció
  (PostgreSQL gestionat amb PostGIS) el mateix script fa `ST_GeomFromText`
  automàticament via detecció `pg_available_extensions`.
- **N3 SERPAVI per parcel·la**: mai simulat (regla d'or del producte); el rang
  per edifici és estadístic (IC95%), no la referència legal SERPAVI.
