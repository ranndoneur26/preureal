# Pipeline ETL Geoespacial + ML — estimación de renta por edificio e illa (AMB)

PreuReal · documento técnico consolidado · v66 · fecha: 2026-11-18
Artifacts de producción: `v1.0-2026-11` (validados) · reconstrucción reproducible: `v1.0-repro-2026-11`

---

## 1. Auditoría previa: por qué downscaling y qué es oficial

INCASÒL no publica datos de fianza a nivel de finca (protección de datos, obligación
legal). Por tanto, el precio contractual **por edificio nunca puede ser un dato
observado**: es una **estimación estadística** construida por *downscaling espacial*
de agregados oficiales. La arquitectura respeta tres fronteras:

| Nivel | Qué es | Fuente | Tratamiento |
|---|---|---|---|
| Municipal | **Observado** (ground truth) | INCASÒL fiances Socrata `qww9-bvhh` | renta media contractual mensual + nº contratos |
| Municipal | **Observado** (banda legal) | SERPAVI/MIVAU (índex referència) | p25 / T/m² / p75 |
| Edificio/Illa | **Estimado** | modelo PASO 3 | IC95% + calidad + procedencia siempre declarados |
| Entorno | **Auxiliar** | Catastro ATOM (hedónicas), OSMnx (servicios, sentinel 999 m) | nunca fuente de renta |

Regla de oro del producto (no negociable): **nunca se simula la referencia legal
SERPAVI N3 por parcela**; el rango por edificio es estadístico, no la referencia legal.

## 2. Metodología PASO 1–4 (con fórmulas)

### PASO 1 — ETL espacial
Catastro INSPIRE ATOM provincial (capas `Building` + `BuildingParts`, ETRS89/UTM31N,
`EPSG:25831`) → filtrado de uso Residencial → **spatial join** con secciones censales
(Idescat «bseccen» vigente, CUSEC) → `dissolve` por masa catastral para generar las
**illes** (`id_illa = <muni5>_<masa>`).

```
id_seccio = CUSEC(sección censal)      id_illa = muni5 + "_" + masa
```

### PASO 2 — Enriquecimiento
Por edificio: `num_viviendas`, `sup_media_m2`, `antiguedad` (ref. 2024),
`calidad_catastral` (0–1), `dist_metro_fgc_m` (OSMnx; sentinel 999 m si no hay
estación documentada). Por municipio: banda SERPAVI (`serpavi_p25`, `serpavi_t_m_municipal`,
`serpavi_p75`) y fiances INCASÒL (`renta_media_contractual_ambito`, `num_contratos_ambito`).

### PASO 3 — Downscaling (modelo híbrido)

**Hedónicas** (efectos pequeños centrados en 1):

```
hed_i = f_ant · f_cal · f_sup · f_metro

f_ant   = clamp(1 + 0.06·(45 − ant)/45, 0.92, 1.06)                     (parc medio ~45 años)
f_cal   = clamp(1 + 0.10·(cal − cal_mediana_muni), 0.90, 1.10)          (normalizado por muni)
f_sup   = clamp((sup/85)^(−0.25), 0.85, 1.25)                           (elasticidad −0,25)
f_metro = 1 − 0.045 si dist ≥ 999 m (sentinel);
          si no: clamp(1 + 0.035·log1p(600/d')/log1p(600/30), 0.955, 1.035)
```

**Residuo de manzana** (por ámbito — MUNICIPI hoy, SECCIÒ cuando INCASÒL publique
el fichero seccional):

```
r_A = INCASÒL_€/m²(A) − SERPAVI_mid(A)          con  INCASÒL_€/m² = fianza_media / sup_ref(A)

model_m2_i = SERPAVI_mid · hed_i + r_A · (hed_i / hed_illa)     si r_A ≥ 0   (reparto hedónico)
model_m2_i = SERPAVI_mid · hed_i + 0.5·r_A                      si r_A < 0   (corrección contenida)
```

**Fiabilidad del ámbito y pesos del blend:**

```
rel = clamp(log1p(min(n_contr, 20000)) / log1p(500), 0, 1)

w = clamp(100·rel^0.7 + 45·(1−rel)·(1−disp_n) − 55·disp_n, 1, 100)      (% INCASÒL)
    con disp_n = clamp(std_hed_intra_illa / 0.05, 0, 1)

renta_m2_i = w·INCASÒL_€/m² + (1−w)·model_m2_i          →  clip a banda SERPAVI (0,0% fuera)
```

**Incerteza (IC95% mecánico) y calidad:**

```
ic_model   = clamp(0.294·(1 + 7·disp_illa)·(1 + 0.30·[n<40])·(1 − 0.45·rel), 0.08, 0.42)
ic_incasol = clamp(0.165 − 0.045·rel, 0.108, 0.170)
ic_rel     = (1 − w)·ic_model + w·ic_incasol                      (media del componente)
IC95_edificio = renta_estimada · (1 ± ic_rel)

calidad = clamp(1 − 1.75·ic_rel, 0.30, 1)         grado: A > 0.75 · B > 0.55 · C > 0.35 · D ≤ 0.35
```

**Banda SERPAVI por edificio** (v1.0, recuperada exacta):

```
mid = (p25 + p75)/2
renta_serpavi_inf = mid − 0.87·(mid − p25)        renta_serpavi_sup = mid + 0.73·(p75 − mid)
```

### Validación
- **LOSO** (leave-one-section-out): holdout por **secciones censales completas** en
  6 folds; estabilidad = |pred_fold − pred_full| / pred_full sobre la media seccional.
- **LOMO ciego municipal**: el municipio holdout se predice con el entorno (sus
  fiances y su residuo NO entran) → RMSE/MAE contra las fiances INCASÒL reales.

### PASO 4 — Esquema de salida (`dim_building_rent_estimation`, 24 columnas)
`id_edificio, id_illa, ref_catastral, id_seccio, num_viviendas, sup_media_m2,
antiguedad, anyo_construccion, renta_serpavi_inf, renta_serpavi_sup,
renta_media_contractual_ambito, num_contratos_ambito, ambito_ground_truth,
renta_estimada_edificio, renta_m2_mes, renta_ic95_edificio_inf, renta_ic95_edificio_sup,
calidad_estimacion, calidad_grado, procedencia, procedencia_pct_incasol,
fuera_rango_serpavi, anio_referencia, metodologia_version` — DDL de referencia en
`pipeline/sql/001_dim_building_rent_estimation.sql`.

## 3. Fuentes oficiales (enlaces verificables)

| Fuente | Uso | URL |
|---|---|---|
| Catastro (Ministerio) — INSPIRE ATOM provincial | geometrías de edificio, año construcción, refcat14 | https://www.catastro.minhap.es/web_inspeccion/Inspeccion.jsp |
| Catastro — fichero CAT/arquitectónico | uso Residencial, superficies, calidad catastral | mismo portal (descarga protegida, browser) |
| IDESCAT — secciones censales «bseccen» | spatial join edificio ↔ CUSEC | https://www.idescat.cat/pub/?id=aec&n=2500 |
| SERPAVI (MIVAU) — índice de referencia | banda p25/T/p75 municipal | https://serpavi.mivau.gob.es/ |
| INCASÒL Dades Obertes — fiances (Socrata `qww9-bvhh`) | ground truth municipal (€/mes + nº contratos) | https://opendata.incasol.org/ (connector v41 del repo) |
| OSMnx / OpenStreetMap | SOLO variables de entorno (metro/FGC, supermercados, zonas verdes) | https://www.openstreetmap.org (ODbL) |
| INE — cartografía secciones (alternativa) | si Idescat no cubriera un territorio | https://www.ine.es/ss/Satellite?c=Page&p=INESeccionCensal |

## 4. Validación (números)

| Métrica | v1.0 producción | v1.0-repro |
|---|---|---|
| Edificios / illes / secciones | 142.283 / 11.633 / 1.983 | 142.283 / 11.633 / 1.983 |
| Renta m² media | 10,039 €/m² | 10,138 €/m² |
| IC95 medio | 38,3 % | 38,7 % |
| Calidad media | 0,657 | 0,662 |
| Fuera de banda SERPAVI | 0,0 % | 0,0 % |
| LOSO estabilidad seccional | 1,62 % | 0,39 % |
| LOMO RMSE ciego municipal | 1,386 €/m² | 1,325 €/m² |

La distribución de grados A/B/C/D no es idéntica (la regla exacta de `w` es
irrecuperable — reconstruida por ajuste; documentado en `pipeline/README.md §6`).
Los artefactos de producción cargados siguen siendo los v1.0-2026-11 validados.

**QA del despliegue (2026-11-18):**
- Repro municipal tras refactor: byte-idéntico en todas las métricas del informe.
- Smoke seccional (`pipeline/qa/smoke_seccional.py`, fixture SINTÉTICO ±6%):
  ancla 100% cobertura · guard negativo correcto · f2 SECCIO 142.283/11.633/1.983
  con las 24 columnas exactas · 0% fuera de banda · LOMO municipal 1,865 €/m².
- Rehearsal PostGIS real 3.6.4 (`pipeline/qa/rehersal_postgis.py`):
  `postgis=true` · `geometry(MultiPolygon,4258)` · GIST · `ST_IsValid`
  11.633/11.633 (tras `make_valid` doble) · `ANALYZE` · 27–30 s.
- Invariancia DDL (`pipeline/qa/verifica_ddl.py`): 24 columnas/tipos + PK +
  índices IDÉNTICOS cargando MUNICIPI y SECCIO, con y sin PostGIS.

## 5. Accio ① — runbook de producción (desplegar v66)

```bash
export DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require"
python3 pipeline/f3_carga_postgis.py \
    --dim pilot_data/out_amb/dim_building_rent_estimation_amb.parquet \
    --cache pilot_data/out_amb/_cache_amb.parquet \
    --url "$DATABASE_URL" --out f3_carga_prod.json
```

Automático: detección `pg_available_extensions` + `CREATE EXTENSION postgis` ·
esquema `geo` (nunca toca tablas del app) · DROP+CREATE idempotente de las 3 tablas ·
PK `id_edificio` · índices `idx_dim_*`, `idx_illes_muni`, `idx_seccions_muni`, GIST
`idx_illes_geom` · `execute_values` (400 filas × 24 col = 9.600 params < 65.535) ·
`ST_GeomFromText(·,4258)` con `make_valid` · `ANALYZE`.

Verificación post-carga:

```sql
SELECT count(*), round(avg(renta_m2_mes),3) FROM geo.dim_building_rent_estimation;  -- 142283 · 10.039
SELECT count(*) FROM geo.geo_illes WHERE NOT ST_IsValid(geom);                       -- 0
```

Antes de la carga, `/api/geo/illes?muni=...` responde 503 `DATA_NOT_READY`; después,
200. Si el rol de Neon no puede `CREATE EXTENSION` (requiere owner/neon_superuser),
el script cae al fallback WKT (mismo DDL conceptual, sin consultas espaciales).
Tiempo estimado sobre WAN: 2–5 min.

## 6. Accio ② — subida municipal→seccional (sin tocar el DDL)

Cuando INCASÒL publique el fichero seccional:

```bash
python3 pipeline/f1_ingesta.py --incasol-seccional-csv <fitxer>.csv \
    --cache <cache.parquet> --out data                      # → data/cache_ambito.parquet
python3 pipeline/f2_modelo_amb.py --desde-cache data/cache_ambito.parquet \
    --ambito SECCIO --out out_amb_seccional
python3 pipeline/f3_carga_postgis.py --dim out_amb_seccional/dim_building_rent_estimation.parquet \
    --cache pilot_data/out_amb/_cache_amb.parquet --url "$DATABASE_URL"
```

- El DDL **no cambia**: `ambito_ground_truth` pasa de 'MUNICIPI' a 'SECCIO' como
  valor de fila; verificada la invariancia completa (columnas, tipos, PK, índices)
  con el mismo f3.
- Mecánica: residuo por sección = INCASÒL €/m² seccional − SERPAVI €/m² municipal
  (SERPAVI no existe a nivel seccional); blend `w` con nº contratos seccionales;
  banda SERPAVI y hedónicas intactas; LOMO municipal sigue validando contra fancias.
- Contrato del CSV seccional (detecta columnas por nombre): sección (CUSEC o INE-6+sección,
  normalizado con fallback), `*mitja*mensual*` (€/mes), `*contracte|contrato*` (nº),
  columna de año (filtra al último año). La cobertura se imprime en la ejecución.
- Calibración: con ámbitos más pequeños el IC se ensancha honestamente (smoke
  sintético: calidad media 0,41); recalibrar `IC_INCASOL`/`IC_MODEL_BASE` con el
  fichero real cuando llegue.

## 7. Limitaciones honestas

1. **Ground truth municipal hoy**: el fichero seccional de INCASÒL no tiene
   publicación abierta; el benchmark seccional SERPAVI (`bseccen2025`) queda
   pendiente de traducir al CUSEC vigente.
2. **Reconstrucción v1.0-repro**: los scripts originales del pilot se perdieron con
   el reciclaje del sandbox; las constantes se recuperaron por ajuste estadístico
   sobre los artefactos validados. La regla exacta de `w` es irrecuperable.
3. **Comparación estadística, no tasación**: todos los endpoints declaran la nota
   legal; nunca se presenta como tasación oficial ni como referencia SERPAVI N3.
4. **OSMnx**: solo variables de entorno con sentinel 999 m; nunca fuente de renta.

## 8. Inventario del pipeline

```
pipeline/
  f1_ingesta.py                    F1: ingesta oficial + ancla municipal/seccional
  f2_modelo_amb.py                 F2: PASO 3 downscaling (--ambito MUNICIPI|SECCIO)
  f3_carga_postgis.py              F3: carga PostGIS idempotente (PK+índices+GIST)
  sql/001_dim_building_rent_estimation.sql   DDL PASO 4 de referencia
  README.md                        fuentes, metodología, runbook §7, seccional §8
  qa/
    smoke_seccional.py             QA accio ②: fixture sintético + guard + invariancia
    verifica_ddl.py                QA accio ②: DDL municipal vs seccional idéntico
    rehersal_postgis.py            QA accio ①: ruta PostGIS real (4258, GIST, make_valid)
  requirements.txt
```
