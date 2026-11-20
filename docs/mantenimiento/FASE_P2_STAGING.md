# Fase P2 — Staging permanente: puerta C11/C12 automatizada antes de producción

Fecha: 2026-11-20 · v72 · Base: v71 (Fase P1 «Panel Datos y fuentes» en producción)

Implementación del primer bloque de la fase **«P2 · Automatización total»** del
Plan de Mantenimiento (Anexo C de `FASE_P0_IMPLEMENTACION.md`): **staging
permanente** para el ciclo trimestral de Incasòl — la carga se ensaya en una
BD de staging y la puerta C11/C12 (hoy PENDIENTES sin staging) pasa a ejecutarse
de verdad, sin firma manual, ANTES de tocar producción.

La otra mitad de la P2 («90 días de operación con error rate ≤ 5 % y KPI-7 ≥
99 %») es operativa, no de código: el canario diario ya mide KPI-3 (error rate
90 d) y KPI-7 (sondas API) — ver §8.

Todo aditivo: **si `STAGING_DATABASE_URL` no está configurada, el flujo de v70
se mantiene intacto** (C11/C12 quedan PENDIENTES y el ciclo sigue como hasta
ahora: F0 GO → backup → update_all → canario).

## 1. Arquitectura

```
  GitHub Actions (workflow mantenimiento.yml, job trimestral)
  ─────────────────────────────────────────────────────────────
  Paso 1  auditoria_f0.py --descargar --db        → GO / NO-GO / GO-COND
  Paso 2  backup_pg.sh (producción)               → artifact .sql.gz
  Paso 2b staging_load.sh                         → MIGRACIONES + CARGA EN STAGING
           ├ npx prisma migrate deploy  (esquema idéntico)
           └ update_all.sh --no-download con DATABASE_URL=STAGING
  Paso 2c staging_diff.py  ← PUERTA C11/C12       → OK (sigue) / FALLA (detiene)
  Paso 3  update_all.sh --no-download             → CARGA EN PRODUCCIÓN
  Paso 4  canary_diario.py --digest               → canario post-carga
  Paso 5  email [PreuReal][ÉXITO] (indica si staging se ensayó o se omitió)
```

Staging es un **segundo proyecto Supabase** (región `eu-west-2`, misma que
producción): aislamiento real — una carga mala en staging no puede afectar a la
BD de producción, ni comparte disco ni credenciales.

## 2. La puerta C11/C12 (scripts/staging_diff.py)

Solo los ROJO cierran la puerta; AVISO y n-d pasan con mensaje en el email y el
informe JSON (`pipeline/qa/informes/staging_c11c12_*_OK|FALLA.json`, artifact
del job).

| Control | Criterio | Veredictos |
|---|---|---|
| C11.1 estructura staging vs prod | nº municipios igual (diferencia > 5 → ROJO) | VERDE / AVISO / ROJO |
| C11.2 completitud vs prod | staging pierde ≤ 50 con renta (más → ROJO; alguna pérdida → AVISO) | VERDE / AVISO / ROJO |
| C11.3 periodo sin regresión | periodo máx staging < prod → ROJO | VERDE / ROJO |
| C11.4 deltas de renta | mediana % de cambio > 15 % → AVISO (un año nuevo mueve la serie entera: informa, no bloquea) | VERDE / AVISO |
| C12.1 estructura | 947 municipios (baseline canario) | VERDE / ROJO |
| C12.2 completitud KPI-2 | ≥ 690 verde · 600-689 aviso · < 600 rojo | VERDE / AVISO / ROJO |
| C12.3 ZMRT vigentes | 302 = A 118 · B 131 · C 53 | VERDE / ROJO |
| C12.4 periodo máximo | no nulo | VERDE / ROJO |
| C12.5 rango plausible | renta €/mes en [100, 3000] (Barcelona ≈ 1.135; fuera ⇒ error de unidades: índice €/m² ≈ 11 o céntimos ≈ 83.000) | VERDE / ROJO |
| C12.6 geo.municipis | guarded: vacío en staging → «n-d» (el pipeline geo no forma parte del ciclo Incasòl) | VERDE / n-d / ROJO |

El script es puro para la clasificación (16 selftests offline, `--selftest`,
integrados en el job smoke → «5/5 selftests verdes») y nunca escribe en ninguna
de las dos BD (solo SELECT).

## 3. Carga de ensayo (scripts/staging_load.sh)

1. `npx prisma migrate deploy` contra staging (paridad de esquema; el esquema
   `geo` se crea vacío y queda guarded).
2. Copia los Excels ya descargados por la auditoría F0 (`/tmp/f0_descarga/`) y
   ejecuta **el mismo pipeline de producción** (`update_all.sh --no-download` →
   `prepare_data.py` → seed idempotente → verificación) con
   `DATABASE_URL=STAGING_DATABASE_URL`.

Rechaza `pgbouncer=` (misma regla del Anexo B: pooler de sesión `:5432`).

## 4. Puesta en marcha (una vez, propietario)

1. **Crear el proyecto de staging** en supabase.com → New project:
   - Name: `preureal-staging` · Region: **West EU (London) / eu-west-2**
     (la misma que producción) · contraseña de BD: generar y guardar.
2. **Copiar el DSN pooler** (Project Settings → Database → Connection string →
   URI, host `aws-0-eu-west-2.pooler.supabase.com:5432` — NO el de conexión
   directa `db.<ref>.supabase.co`, IPv6-only, causa P1001; sin `pgbouncer=true`).
   Formato: `postgresql://postgres.<ref>:<PW>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`
3. **Añadir el secreto en GitHub** (repo → Settings → Secrets and variables →
   Actions → New repository secret): Name `STAGING_DATABASE_URL`, valor el DSN
   con `tr -d '\n\r'` (sin salto de línea final). Vercel **no** necesita esta
   variable: staging solo lo usa el workflow.
4. **Estrenar sin riesgo**: Actions → mantenimiento → Run workflow → job
   `trimestral`. La primera pasada crea el esquema y carga los datos de ensayo;
   la puerta C11/C12 debe salir verde (mismos datos que producción).

## 5. Qué cambia y qué no

| Antes (v70) | Con staging (v72) |
|---|---|
| F0 GO → backup → carga directa en prod → canario | F0 GO → backup → **ensayo staging** → **puerta C11/C12** → carga en prod → canario |
| C11/C12 siempre PENDIENTES | C11/C12 ejecutados de verdad; informe JSON por pasada |
| La verificación post-carga descubre problemas **en producción** | Los problemas se descubren **en staging** (prod intacta, solo ensayo + backup) |
| GO-CONDICIONAL (C9/C10 rojo) exige firma humana | Sin cambio: la firma solo desbloquea el caso GO-CONDICIONAL (NO-GO sigue deteniendo el ciclo) |

## 6. Runbook P-09 — staging en FALLA

1. No hay urgencia: **producción está intacta** (el ciclo se detuvo en el Paso
   2c; solo hubo ensayo y backup previo).
2. Descargar el artifact `trimestral-informes` y abrir
   `staging_c11c12_*_FALLA.json` → campo `controles` → el ROJO y su detalle.
3. Causas típicas:
   - `C12.1/C12.2` staging vacío o a medias → la carga falló: revisar el log del
     Paso 2b (error de openpyxl/psycopg2 o de `prisma migrate deploy`).
   - `C12.5` fuera de rango → cambio de unidades en la fuente (Informe Incasòl):
     comparar con la ficha de la fuente en #/admin → «Dades i fonts».
   - `C12.3` ZMRT ≠ 302 → lista TENSE tocada sin querer: **no reimportar nada**;
     comprobar `prepare_data.py` (TENSE_A/B/C son texto legal, solo cambian con
     resolución DOGC nueva y verificación TER).
   - `C11.3` regresión de periodo → el Excel trae un periodo anterior: revisar
     habitatge.gencat.cat antes de promocionar.
4. Corregido el motivo → re-lanzar el job `trimestral` (Run workflow).

## 7. Coste y mantenimiento

- Staging = proyecto Supabase gratuito (tier Free): 947 municipios + edificios
  ocupan unos pocos MB. Pausarlo (Settings → General → Pause project) cuando no
  se use: el workflow lo reactiva en la siguiente pasada solo si está activo
  (si está pausado, la puerta C11/C12 devolverá FALLA «staging inaccesible» con
  producción intacta — reactivarlo a mano antes del ciclo trimestral).
- Sin coste de Vercel: staging no tiene despliegue propio (solo BD).

## 8. Segunda mitad de la P2 — 90 días de operación

Objetivo medible del Plan: **error rate ≤ 5 %** (KPI-3 del canario, ventana 90
días) y **KPI-7 ≥ 99 %** (sondas API verdes). No requiere código nuevo: el
canario diario ya acumula ambos en su estado (`scripts/.informes_canario/`) y
el digest semanal los incluye. Cierre de la fase: 90 días de histórico con los
dos KPIs en objetivo, revisado en el ciclo trimestral siguiente.

## 9. P2.2 (propuesto, pendiente)

- Sondas API contra un despliegue de staging (Vercel preview con
  `STAGING_DATABASE_URL`) para completar el C12 a nivel API (hoy: BD).
- Informe F0 JSON persistido en BD (hoy vive en `pipeline/qa/informes/`).
- Dispatch directo a GitHub Actions desde el panel «Dades i fonts».
- Edición de umbrales/cron por fuente desde el panel.
