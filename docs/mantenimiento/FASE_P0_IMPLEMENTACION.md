# Fase P0 — Implementación del Plan de Mantenimiento de Bases de Datos

**PreuReal.com** · 2026-11-19 · Base: v69.3 (`c43b0b6`) · Estado de datos verificado en producción: **302 ZMRT (A 118 · B 131 · C 53) · 947 municipios · dim 142.283 · illes 11.633 · seccions 1.983 · agregats 1.945**

Este documento materializa la **Fase P0 · Garantía** del Plan de Mantenimiento (capítulo 10.1): la capa que hace la operación *fiable al ~100 %, casi diaria, máxima automatización y cero errores de importación*, con **auditoría previa obligatoria** antes de que ningún dato toque producción.

> **Principio de oro (Plan §1):** ningún dato alcanza producción sin auditoría previa. La puerta **go/no-go** de 12 controles es bloqueante.

**Contenido (los 5 entregables P0):**

| # | Entregable | Sección | Artefacto real en el repo |
|---|-----------|---------|---------------------------|
| 1 | 📅 CRON JOB SCHEDULE (expresiones exactas) | §1 | `.github/workflows/mantenimiento.yml` |
| 2 | 🧪 SCRIPT de validación de integridad (pseudo-código) | §2 | `pipeline/qa/auditoria_f0.py` · `scripts/canary_diario.py` |
| 3 | 📧 SISTEMA DE NOTIFICACIONES por email (plantillas HTML) | §3 | `pipeline/qa/notificaciones/` (5 plantillas + `envia_alerta.py`) |
| 4 | 📘 MANUAL DE PROCEDIMIENTOS paso a paso | §4 | este documento (P-01…P-08) |
| 5 | ✅ CHECKLIST de verificación previa/posterior | §5 | este documento (CHK-PRE/CHK-POST) |

**Criterio de cierre de la fase** (Plan, tabla de roadmap): una importación completa (Incasòl Excel) pasa **12/12 controles** y el canario diario queda programado con digest. El ensayo en staging completo (C11/C12) queda delimitado en P-04 y se ejecuta en la ventana de marzo según el calendario anual.

---

## 1. 📅 CRON JOB SCHEDULE — expresiones exactas

### 1.1 Convenciones

- **Entorno de ejecución:** GitHub Actions (repo público, secretos cifrados, sin servidor propio). Los cron de Actions corren en **UTC** con un *jitter* de 5-15 minutos: la hora exacta de arranque puede retrasarse; el diseño tolera ese desfase.
- **Desplazamiento de verano (DST):** una expresión UTC fija cambia la hora local entre CET (invierno) y CEST (verano). Se indica en cada fila. La tolerancia operativa es ±1 h.
- **Vercel Cron** (7 entradas ya existentes en `vercel.json`) corre en la plataforma en UTC y **no se modifica**. No hay solapamiento con los jobs nuevos.
- Regla de credenciales (Plan, tabla de riesgos): `DATABASE_URL` **solo como secreto del entorno**, jamás en el repo ni en logs.

### 1.2 Tabla maestra — jobs nuevos de la Fase P0 (GitHub Actions)

| Job | Frecuencia | Cron (UTC) | Hora local (CET / CEST) | Qué ejecuta | Fuente | Alerta asociada |
|-----|-----------|------------|-------------------------|-------------|--------|-----------------|
| `canario` | Diaria | `0 5 * * *` | 06:00 / 07:00 | `scripts/canary_diario.py --digest` — 4 sondas API + KPI-1/2/3/4/6 + conteos estructurales | `preureal.com` + BD (solo SELECT) | A1 · A2 · A4 · A5 · A8 |
| `dogc` quincenal | Quincenal (día 1 y 15) | `0 8 1,15 * *` | 09:00 / 09:00 | `scripts/dogc_watch.py` — diff de resoluciones TER contra la línea base vigente | DOGC + habitatge.gencat.cat | A3 (72 h) · A7 |
| `dogc` ventanas ⭐ | Diaria en abril y octubre | `0 8 * 4,10 *` | 09:00 / 09:00 | el mismo script, frecuencia diaria durante las ventanas editoriales ZMRT | DOGC + habitatge.gencat.cat | A3 (72 h) · A9 |
| `backup` | Semanal (domingo) | `0 3 * * 0` | 04:00 / 05:00 | `scripts/backup_pg.sh` (pg_dump gzip, retención 30 d) + digest semanal `canary_diario.py --semanal --digest` | BD | A6 (error rate 90 d) |
| `trimestral` ⭐ | Trimestral (día 1 ene/abr/jul/oct) | `0 3 1 1,4,7,10 *` | 04:00 / 04:00 | cadena completa: **F0 (12 controles con descarga oficial) → backup → `update_all.sh --no-download` → canario → email ÉXITO**; si F0 es NO-GO, se detiene y alerta CRÍTICA con producción intacta | Incasòl (habitatge.gencat.cat) | A2 · A5 · A7 · A10 |
| `smoke` | Manual (`workflow_dispatch`) | — | — | los 4 selftests (F0 · canario · DOGC · plantillas) | — | — |

### 1.3 Crontabs equivalentes para VPS (hora local Europe/Madrid)

Si algún día se ejecuta en un VPS propio (crontab con TZ local), las expresiones exactas equivalentes son:

```cron
# Canario diario + digest (06:00 Europe/Madrid, fijo)
0 6 * * *    DATABASE_URL="postgresql://..." bash /srv/preureal/scripts/canary_diario.sh >> /var/log/preureal_canary.log 2>&1

# Vigilancia DOGC: quincenal estándar + diaria en ventanas abril y octubre
0 9 1,15 * *  python3 /srv/preureal/scripts/dogc_watch.py >> /var/log/preureal_dogc.log 2>&1
0 9 * 4,10 *  python3 /srv/preureal/scripts/dogc_watch.py >> /var/log/preureal_dogc.log 2>&1

# Backup semanal + digest (domingo 04:00)
0 4 * * 0    DATABASE_URL="postgresql://..." bash /srv/preureal/scripts/backup_pg.sh /srv/backups >> /srv/backups/backup.log 2>&1

# Ciclo trimestral (ya documentado en el repo — update_all.sh)
0 4 1 1,4,7,10 *  DATABASE_URL="postgresql://..." bash /srv/preureal/scripts/update_all.sh >> /var/log/preureal_update.log 2>&1
```

### 1.4 Crontab de Vercel ya existente (contexto — NO tocar)

| Ruta | Cron (UTC) | Frecuencia | Papel |
|------|-----------|------------|-------|
| `/api/cron/alertes` | `15 3 * * *` | diaria | alertas de usuarios |
| `/api/cron/history-ttl` | `50 3 * * *` | diaria | purga de historial |
| `/api/cron/emails` | `0 4 * * *` | diaria | emails transaccionales |
| `/api/cron/demografia` | `0 5 * * *` | diaria | demografía INE/Idescat |
| `/api/cron/ine` | `0 5 1 3,6,9,12 *` | trimestral | import INE |
| `/api/cron/entorn` | `15 6 * * *` | diaria | variables de entorno |
| `/api/cron/rental-share` | `0 20 5 * *` | mensual (día 5) | peso del alquiler |

### 1.5 Fragmento YAML de los schedules (resumen)

```yaml
on:
  schedule:
    - cron: "0 5 * * *"          # canario diario
    - cron: "0 8 1,15 * *"       # DOGC quincenal
    - cron: "0 8 * 4,10 *"       # DOGC diario en ventanas abril/octubre
    - cron: "0 3 * * 0"          # backup + digest semanal (domingo)
    - cron: "0 3 1 1,4,7,10 *"   # ciclo trimestral Incasòl
  workflow_dispatch:
    inputs:
      job: { options: [canario, dogc, backup, trimestral, smoke] }
```

Cada job filtra su disparo con `if: github.event.schedule == '<expresión>'`, de modo que un solo workflow contiene toda la agenda sin ejecuciones cruzadas. Los informes quedan como **artifacts** (30 días; 90 días en el ciclo trimestral).

---

## 2. 🧪 SCRIPT DE VALIDACIÓN DE INTEGRIDAD (pseudo-código)

Dos piezas complementarias, ya implementadas y con selftests verdes:

| Pieza | Cuándo corre | Verifica | Salida |
|-------|-------------|----------|--------|
| `pipeline/qa/auditoria_f0.py` | **ANTES** de cada importación (auditoría previa) | los 12 controles C1-C12 del Plan | veredicto **GO / NO-GO / GO-CONDICIONAL** + informe JSON |
| `scripts/canary_diario.py` | **DESPUÉS** de cada actualización y a diario | sondas API + KPI-1/2/3/4/6 + conteos estructurales vs línea base v69.2 | digest + alertas A1-A10, exit 0/1 |

### 2.1 Pseudo-código del verificador post-actualización (contrato completo)

```
PROCEDIMIENTO valida_post_actualizacion(fuente, fichero_importado, entorno):
    # ═══ FASE 0 · PRECONDICIONES ═══
    DSN ← entorno.DATABASE_URL                    # NUNCA imprimir; enmascarar como host=… db=…
    BASELINE ← {municipios: 947, zmrt: {total: 302, A: 118, B: 131, C: 53},
                dim_min: 142.283, illes_min: 11.633, seccions_min: 1.983,
                agregats_min: 1.945, completitud_verde: 690}
    snapshot_pre ← volcado de conteos y hashes fila a fila de las tablas afectas
        (geo.municipis · seccions_censals · dades_lloguer_agregades · dim · illes)

    # ═══ FASE 1 · CONECTIVIDAD Y CATALOGO ═══
    conectar(DSN, timeout=20) → si falla: alerta(A7, MEDIA) · EXIT 1
    verificar PostGIS disponible y las 3 tablas geo presentes
        → si falta: NO-GO «ejecuta f3_produccio.sh antes»

    # ═══ FASE 2 · CONTROS POST-CARGA (C1-C12 invertidos a verificación) ═══
    # (cada control produce veredicto VERDE/ROJO + evidencia registrada)

    V1 conteos estructurales (A2 → CRÍTICA si difieren):
        SELECT count(*) FROM "Municipality"                  → DEBE = 947
        SELECT count(*) FROM "Municipality" WHERE "isTense"  → DEBE = 302
        SELECT tense_llista, count(*) FROM geo.municipis WHERE zmrt GROUP BY 1
            → DEBE ser {A: 118, B: 131, C: 53}                # protección v69
        SELECT count(*) FROM geo.dim_building_rent_estimation → ≥ 142.283 (solo-crecer)
        SELECT count(*) FROM geo.geo_illes                    → ≥ 11.633
        SELECT count(*) FROM geo.seccions_censals             → ≥ 1.983
        SELECT count(*) FROM geo.dades_lloguer_agregades      → ≥ 1.945
        // regla: tablas legales (ZMRT) exactas; tablas de hechos solo-crecer

    V2 validez geográfica (A4 → CRÍTICA, bloqueante):
        SELECT count(*) FROM geo.geo_illes    WHERE NOT ST_IsValid(geom) → DEBE = 0
        SELECT count(*) FROM geo.geo_seccions WHERE NOT ST_IsValid(geom) → DEBE = 0
        verificar PK id_edificio y índice GIST idx_illes_geom presentes

    V3 integridad fila a fila vs snapshot_pre (patrón v69.2):
        PARA CADA tabla afecta:
            filas_antes vs filas_ahora (conjunto de claves + valores)
            → las tablas NO objetivo DEBEN ser byte-a-byte idénticas
            → la tabla objetivo solo cambia en claves del período nuevo
        si hay mutación no explicada: NO-GO + restaurar snapshot_pre (rollback)

    V4 frescura y trazabilidad (A5 → MEDIA si SLA superado):
        PARA CADA fuente en ImportRun WHERE status IN ('OK','PARTIAL'):
            dias ← current_date − max("createdAt")::date
            si dias > SLA[fuente] (Incasòl 100 · Catastro 180 · …): alerta MEDIA A5
        registrar ImportRun de ESTA ejecución (source, status, rowsTotal,
            created/updated/skipped, error)  # KPI-3 y KPI-8 se calculan de aquí

    V5 rangos de negocio (C5 · A10):
        PARA CADA valor municipal nuevo:
            si valor ∉ [10, 3.000] €/mes → fila marcada
        si > 1 % de filas fuera de banda → ROJO
        desviación del agregado municipal medio vs período anterior:
            ≤ 10 % VERDE · 10-15 % aviso · > 15 % ROJO con revisión humana (firma)

    V6 coherencia ZMRT legal (C10 · A3):
        si la fuente es ZMRT (resolución DOGC):
            cruzar listado oficial ↔ data/municipalities.json (302 códigos)
            PROHIBIDO: modificar los 302 vigentes · duplicar códigos ·
                       cambiar tense_llista sin resolución que lo respalde
            tests bloqueantes zmrt_v69_ter2408.test.ts → 9 tests deben pasar

    V7 canarios de API (C12 · KPI-7):
        GET /api/health                 → 200
        GET /api/zones?muni=08019       → 200 · zmrt.llista == 'A'   # Barcelona
        GET /api/zones?muni=08227       → 200 · zmrt.llista == 'B'   # Sant Martí Sarroca
        GET /api/geo/illes              → 200 · payload no vacío
        3 fallos consecutivos → CRÍTICA A1 · 1-2 → MEDIA

    # ═══ FASE 3 · VEREDICTO Y CIERRE ═══
    SI algún V1/V2/V6 ROJO → nivel CRÍTICA · rollback según P-05 · EXIT 1
    SINO SI V5 desviación > 15 % → GO-CONDICIONAL · email con firma pendiente · EXIT 2
    SINO → email ÉXITO (diff creado/actualizado/omitido + canarios verde) · EXIT 0

    informe JSON ← {fuente, fecha, controles:[{id, veredicto, detalle, evidencia}],
                    veredicto, promocion_requiere, snapshot: {antes, después}}
```

### 2.2 Mapa pseudo-código ↔ implementación real

| Bloque del pseudo-código | Implementación real | Auto-test |
|--------------------------|--------------------|-----------|
| V1 conteos estructurales (A2) | `scripts/canary_diario.py` → `kpis_bd()` · baseline `BASELINE` | `--selftest` (municipios 171 → CRÍTICA) |
| V2 validez geográfica (A4) | `canary_diario.py` (ST_IsValid illes+seccions) · `pipeline/qa/verifica_prod.py` (PK + GIST) | `--selftest` (3 inválidas → CRÍTICA) |
| V3 snapshot pre/post | patrón v69.2 (`scripts/zmrt_f4_verify.py` fuera de repo; guardas pre/post de F4) | verificado en producción v69.2 |
| V4 frescura (KPI-1) + ImportRun | `canary_diario.py` → SQL Plan §9.2 (tabla 21) | `--selftest` (104 d > SLA 100 → MEDIA) |
| V5 rangos y estabilidad (C5/C9) | `pipeline/qa/auditoria_f0.py` → C5/C9 con bandas [10, 3.000] y umbral 15 % | `--selftest` (outliers + desviación 8.726 % → ROJO) |
| V6 coherencia ZMRT (C10) | `auditoria_f0.py` C10 + `scripts/dogc_watch.py` + tests `tests/zmrt_v69_ter2408.test.ts` | `--selftest` (TER nueva → CRÍTICA A3) |
| V7 canarios API (C12) | `canary_diario.py` → `SONDAS` (health · 08019 A · 08227 B · geo/illes) | `--selftest` (3 fallos consecutivos → CRÍTICA) |
| Auditoría previa C1-C12 completa | `auditoria_f0.py` (descarga oficial con reintentos, SHA-256, esquema, cobertura, duplicidad, temporal, geográfico) | `--selftest` 13 checks |

**Comandos de uso inmediato:**

```bash
# Auditoría previa con descarga oficial (igual que el ciclo trimestral del cron)
python3 pipeline/qa/auditoria_f0.py --fuente incasol-excel --descargar --db

# Auditoría de un fichero local (contingencia cuando la fuente está caída)
python3 pipeline/qa/auditoria_f0.py --fuente incasol-excel --fichero /tmp/x.xlsx

# Verificación post-actualización completa (sondas + KPIs de BD)
DATABASE_URL=... python3 scripts/canary_diario.py --digest

# Verificación solo-API (sin BD) tras un deploy de Vercel
python3 scripts/canary_diario.py --sin-db
```

---

## 3. 📧 SISTEMA DE NOTIFICACIONES POR EMAIL

### 3.1 Arquitectura

- **Canal:** Resend (ya integrado en la plataforma — `src/lib/mail.ts`, `EmailLog`). Los scripts P0 lo invocan vía `pipeline/qa/notificaciones/envia_alerta.py` (HTTP API, cero dependencias nuevas).
- **Modo seco:** sin `RESEND_API_KEY` o sin `ALERT_EMAIL_TO`, el HTML renderizado se guarda en disco y se imprime — el job nunca falla por falta de credenciales, pero el digest del día registra la omisión.
- **Variables de entorno:** `RESEND_API_KEY` · `MAIL_FROM` (por defecto `PreuReal Datos <onboarding@resend.dev>`) · `ALERT_EMAIL_TO` · `SITE_URL`.
- **Ventana de silencio (falsos positivos en deploys):** el canario clasifica 1-2 fallos como MEDIA y solo escala a CRÍTICA con **3 consecutivos** (estado persistente en el cache del workflow) — la mitigación definida en la tabla de riesgos del Plan.

### 3.2 Matriz de alertas → plantilla y canal (Plan cap. 5, tabla 8)

| Código | Condición (medible) | Nivel | Plantilla | Canal |
|--------|--------------------|-------|-----------|-------|
| A1 | Canario falla 3 veces consecutivas en fuente núcleo | 🔴 CRÍTICA | `alerta_critica.html` | email inmediato |
| A2 | Conteo fuera de rango tras importar (≠ 947 / ≠ 302 ZMRT) | 🔴 CRÍTICA | `alerta_critica.html` | email inmediato + import ERROR |
| A3 | Resolución ZMRT nueva en el DOGC (ventana o fuera) | 🔴 CRÍTICA | `alerta_critica.html` | email inmediato · import < 72 h |
| A4 | ST_IsValid < 100 % tras carga | 🔴 CRÍTICA | `alerta_critica.html` | email inmediato |
| A5 | Frescura > SLA (Incasòl 100 d · Catastro 180 d · …) | 🟠 MEDIA | `alerta_media.html` | digest diario |
| A6 | Error rate importación > 10 % en 90 d | 🟠 MEDIA | `alerta_media.html` | digest semanal |
| A7 | Fuente oficial inaccesible (3 intentos con backoff) | 🟠 MEDIA | `alerta_media.html` | digest diario |
| A8 | Completitud municipal < 600 | 🟠 MEDIA | `alerta_media.html` | digest diario |
| A9 | 7 días antes de ventana ZMRT (1 abril / 1 octubre) | 🟠 MEDIA | `alerta_media.html` | aviso programado |
| A10 | Desviación estadística > 15 % del agregado | 🟠 MEDIA (firma) | `alerta_media.html` | digest + control C9 |
| A11 | Nueva edición ICGC/Idescat detectada | 🟢 BAJA | `alerta_baja.html` | digest mensual |
| A12 | Fuente del roadmap disponible (p. ej. fichero seccional Incasòl) | 🟢 BAJA | `alerta_baja.html` | digest mensual |
| — | Importación/ciclo trimestral completado | ✅ ÉXITO | `exito_import.html` | email de cierre |
| — | Resumen diario/semanal con KPIs | ℹ️ DIGEST | `digest_diario.html` | email programado |

### 3.3 Convención de asunto

```
[PreuReal][CRÍTICA] A3 · resolución ZMRT nueva en el DOGC: TER/4102/2026
[PreuReal][MEDIA]   A5 · Incasòl: frescura 104 d > SLA 100 d
[PreuReal][BAJA]    A12 · fichero seccional Incasòl disponible
[PreuReal][ÉXITO]   Ciclo trimestral Incasòl completado (F0 GO → canario verde)
[PreuReal][OK]      canario diario · 0 alerta(s) · 2026-11-19 05:04 UTC
```

### 3.4 Plantilla CRÍTICA (completa — `alerta_critica.html`)

Email-safe: 600 px, tablas, CSS inline, sin JavaScript, accesible con texto siempre junto al color. Las otras 4 plantillas comparten el mismo esqueleto cambiando color/tono del mensaje:

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ASUNTO}}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">{{ASUNTO}}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="width:600px;max-width:92%;background:#ffffff;border-radius:10px;
                    overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#B23B3B;padding:18px 28px;">   <!-- rojo del Plan -->
            <span style="color:#ffffff;font-size:13px;letter-spacing:1px;font-weight:bold;">
              PREUREAL · DATOS</span><br>
            <span style="color:#ffffff;font-size:22px;font-weight:bold;">
              &#9888; ALERTA {{NIVEL}}</span>
          </td>
        </tr>
        <tr><td style="padding:20px 28px 6px 28px;">
          <p style="margin:0;font-size:13px;color:#6b7280;">{{FECHA}} &middot; job {{JOB}}</p>
          <h1 style="margin:8px 0 14px;font-size:19px;color:#111827;">{{ASUNTO}}</h1>
        </td></tr>
        <tr><td style="padding:0 28px 8px 28px;font-size:14px;color:#374151;line-height:1.6;">
          {{CUERPO}}                                            <!-- tablas de evidencia -->
        </td></tr>
        <tr><td style="padding:10px 28px 4px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
            <tr><td style="padding:12px 16px;font-size:13px;color:#7f1d1d;line-height:1.5;">
              <b style="color:#B23B3B;">Acci&oacute;n requerida:</b> {{ACCIONES}}
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:18px 28px 8px 28px;">
          <a href="{{ENLACE}}" style="background:#B23B3B;color:#ffffff;text-decoration:none;
             font-size:14px;font-weight:bold;padding:12px 26px;border-radius:8px;
             display:inline-block;">Abrir panel de datos</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
```

### 3.5 Catálogo de plantillas

| Fichero | Nivel | Color | Disparada por | Contenido distintivo |
|---------|-------|-------|---------------|----------------------|
| `alerta_critica.html` | 🔴 CRÍTICA | rojo `#B23B3B` | canario (A1/A2/A4) · dogc (A3) · F0 NO-GO | «Acción requerida» + recordatorio de puerta 12/12 |
| `alerta_media.html` | 🟠 MEDIA | naranja `#B8860B` | A5/A6/A7/A8/A9/A10 | «Acción recomendada», no bloquea |
| `alerta_baja.html` | 🟢 BAJA | azul `#2563EB` | A11/A12 | «Para tu agenda», sin SLA |
| `exito_import.html` | ✅ ÉXITO | verde `#2E7D5B` | cierre del ciclo trimestral/import | diff creado/actualizado/omitido + rollback < 5 min disponible |
| `digest_diario.html` | ℹ️ DIGEST | neutro `#0F172A` | canario diario y semanal | tablas de sondas + KPIs + alertas con semáforo 🟢🟠🔴 |

### 3.6 Ejemplos de uso (los tres comandos que un script necesita)

```bash
# 1) Alerta CRÍTICA inmediata (la usa el workflow cuando F0 es NO-GO)
python3 pipeline/qa/notificaciones/envia_alerta.py --nivel CRITICA \
  --asunto "[PreuReal][CRÍTICA] F0 NO-GO — ciclo trimestral detenido" \
  --var 'CUERPO=<p>Control C6 ROJO: 3 claves duplicadas</p>' \
  --var 'ACCIONES=Revisar informe JSON; producción intacta' \
  --var 'ENLACE=https://preureal.com/#/admin'

# 2) Digest con tablas pre-renderizadas (lo usa canary_diario.py)
python3 scripts/canary_diario.py --digest     # envía automáticamente al terminar

# 3) Prueba en modo seco (sin credenciales): guarda el HTML y lo muestra
python3 pipeline/qa/notificaciones/envia_alerta.py --nivel MEDIA \
  --asunto "prueba" --dry-run
```

---

## 4. 📘 MANUAL DE PROCEDIMIENTOS DEL ADMINISTRADOR

> Operación diaria esperada: **menos de 10 minutos** de trabajo humano (resultado definido en el Plan). Todo lo que no está en esta lista lo hace el cron de §1.

### P-01 · Rutina diaria (≤ 10 min)

| # | Acción | Dónde | Criterio de «OK» |
|---|--------|-------|------------------|
| 1 | Leer el digest del canario (email de las 06:00) | correo | digest verde → terminar; si hay 🟠/🔴 → pasos 2-4 |
| 2 | Abrir la tarjeta de la fuente afectada | `#/admin` | identificar condición (código de alerta en el asunto) |
| 3 | Ejecutar la acción prevista por la matriz §3.2 | terminal/panel | según código (A5 → importar; A7 → reintentar) |
| 4 | Confirmar en el digest del día siguiente que la alerta desapareció | correo | sin alerta recurrente |

### P-02 · Ciclo trimestral Incasòl (automatizado con verificación humana)

```
   cron 0 3 1 1,4,7,10 * (GitHub Actions, job «trimestral»)
        │
        ▼
 [1] F0 · descarga oficial + 12 controles ──NO-GO──▶ alerta CRÍTICA · PRODUCCIÓN INTACTA
        │ GO
        ▼
 [2] backup_pg.sh (artifact 30 d)
        ▼
 [3] update_all.sh --no-download (prepare_data + seed idempotente + verificación)
        ▼
 [4] canario post-carga (sondas + conteos 947/302/A118-B131-C53)
        ▼
 [5] email ÉXITO + artifact de informes (90 d)
        ▼
 [6] TÚ: leer el digest · verificar /api/zones?muni=08019 (índex Barcelona ≈ 11,595 €/m²)
```

| # | Paso | Comando / lugar | Tiempo |
|---|------|-----------------|--------|
| 1 | Verificar la ejecución del job | GitHub → Actions → «mantenimiento» | 2 min |
| 2 | Descargar artifact `trimestral-informes` y revisar el informe F0 | artifact JSON | 3 min |
| 3 | Verificación en vivo de canarios | `curl https://preureal.com/api/zones?muni=08019` | 1 min |
| 4 | Registrar la ejecución | `CHANGES.md` / `TASKS.md` si hubo delta | 2 min |

**Rollback** (si el canario post-carga sale rojo): restaurar el artifact `backup-pre-trimestral` con `gunzip -c backup.sql.gz | psql "$DATABASE_URL"` → reejecutar canario → objetivo **< 5 minutos** (verificado como procedimiento en el Plan §6.4).

### P-03 · Ventana ZMRT (abril y octubre) — resolución nueva en el DOGC

| # | Acción | Detalle |
|---|--------|---------|
| 1 | Vigilancia se activa sola | el cron `0 8 * 4,10 *` rastrea el DOGC diariamente; A9 avisa 7 días antes |
| 2 | Alerta A3 recibida | email CRÍTICA con las referencias TER nuevas detectadas |
| 3 | Verificar en fuente oficial | `habitatge.gencat.cat/ca/ambits/lloguer/zones-tensades/` + DOGC |
| 4 | **SLA: importar en < 72 h** con protocolo v69 | editar `TENSE_A/TENSE_B/TENSE_C` en `scripts/prepare_data.py` (son texto legal); actualizar `scripts/dogc_baseline.json` **después** de la carga |
| 5 | Ejecutar pipeline | `update_all.sh` + `f4_zones_buscador.py` con guardas pre/post (NO MODIFICAR los 302 vigentes · NO DUPLICAR) |
| 6 | Guardas bloqueantes | `tests/zmrt_v69_ter2408.test.ts` (9 tests) + verificación `/api/zones?muni=08019` (A) y `?muni=08227` (B) |
| 7 | Cierre | CHANGES/TASKS + commit + CI verde + email ÉXITO |

### P-04 · Auditoría previa manual de un fichero (cuando hay que importar fuera de ciclo)

| # | Acción | Comando |
|---|--------|---------|
| 1 | Descargar el fichero oficial a `/tmp` | navegador o `curl` |
| 2 | Ejecutar F0 con `--db` | `python3 pipeline/qa/auditoria_f0.py --fuente incasol-excel --fichero /tmp/f.xlsx --db` |
| 3 | Leer el veredicto | `GO` → continúa · `GO-CONDICIONAL` (C9/C10) → revisión humana y firma en el panel · `NO-GO` → **detener**, informe JSON tiene el control rojo |
| 4 | C11/C12 (staging) | cargar a `staging_<fuente>` y correr canarios de staging antes de promover (ventana de marzo según calendario anual) |
| 5 | Importar con backup previo | `bash scripts/backup_pg.sh /tmp/backups` → flujo de import del panel (`#/admin`) |
| 6 | Verificación post-carga | `python3 scripts/canary_diario.py --digest` + checklist §5 |

### P-05 · Respuesta a alerta CRÍTICA (runbook de incidencia)

| # | Acción | Detalle |
|---|--------|---------|
| 1 | Identificar el código (A1-A4) | asunto del email + informe JSON del artifact |
| 2 | Escalarado Nivel 1 (0-15 min) | el observador ya reintentó con backoff; si se recuperó, la alerta se cierra sola |
| 3 | ¿Producción muestra datos erróneos? | SÍ → paso 4 · NO → diagnóstico (BD, despliegue, credenciales) |
| 4 | Rollback por tabla | `CREATE TABLE …_bak_<fecha>` previo existe → restaurar (rename/INSERT SELECT) → reverificar con `canary_diario.py` |
| 5 | Comunicar y documentar | AuditLog causa raíz; post-incidente 48 h: ajustar umbrales si procede |

### P-06 · Backups y prueba de restauración (drill mensual, día 8)

| # | Acción | Detalle |
|---|--------|---------|
| 1 | Verificar el backup semanal | artifact `backup-pg` del domingo (30 d de retención) |
| 2 | Drill de restauración | restaurar el dump en una BD de prueba (`pg_local.sh`) y contar: Municipality 947 · dim 142.283 · geo_illes 11.633 |
| 3 | Registrar el drill | una línea en `TASKS.md` (fecha + conteos) |

### P-07 · Rotación de credenciales (trimestral)

| # | Acción | Detalle |
|---|--------|---------|
| 1 | Rotar la contraseña de la BD en Supabase | Settings → Database → reset password |
| 2 | Actualizar el secreto de GitHub | Actions → Secrets → `DATABASE_URL` |
| 3 | Actualizar Vercel | Variables de entorno → `DATABASE_URL` → redeploy |
| 4 | Verificar | ejecutar `canario --sin-db` (sondas) y un `canary` completo con la URL nueva; **nunca pegar la URL en issues/chat** |

### P-08 · Incorporar una fuente nueva del roadmap (tabla 4 del Plan)

| # | Acción | Detalle |
|---|--------|---------|
| 1 | Alta en `DataSource` | code, institution, periodicity, license (modelo ya existente) |
| 2 | Auditoría F0 de la primera descarga | `--fuente generic --columnas …` con contrato explícito |
| 3 | Importación de ensayo | staging → diff 100 % explicado → promoción |
| 4 | Programar | añadir job/cron al workflow o al panel (P1) |

---

## 5. ✅ CHECKLISTS DE VERIFICACIÓN

### CHK-PRE — antes de CUALQUIER importación (universal)

| ☐ | Control | Cómo se verifica |
|---|---------|------------------|
| ☐ | Backup del estado anterior disponible | `backup_pg.sh` ejecutado / artifact `backup-pg` reciente |
| ☐ | Snapshot pre-carga guardado | conteos + hashes de las tablas objetivo (patrón v69.2) |
| ☐ | Descarga fresca de la fuente | `auditoria_f0.py --descargar` o fichero local con C2 verde |
| ☐ | **Auditoría F0 = GO (o firma humana en C9/C10)** | informe JSON `veredicto: GO` |
| ☐ | SHA-256 registrado y distinto al anterior | campo `ficheros[].sha256` del informe |
| ☐ | Período nuevo ≥ último importado | control C7 verde |
| ☐ | Cero municipios desconocidos y cero sintéticos 9999xx | C6 + C8 verdes |
| ☐ | Catálogo ZMRT estable (302 = A 118 · B 131 · C 53) | C10 verde / tests v69 |
| ☐ | Staging rehecho si C11/C12 aplican | dry-run + diff 100 % explicado |
| ☐ | Ventana horaria correcta | imports mayores fuera de horas punta (baja carga) |
| ☐ | `DATABASE_URL` del entorno correcto (producción, no local) | `--db` enmascara host/db en el informe — verificar visualmente |
| ☐ | CI verde en `main` antes de empezar | último run de `ci.yml` |

### CHK-POST — después de CUALQUIER importación (universal)

| ☐ | Control | Cómo se verifica |
|---|---------|------------------|
| ☐ | Conteos estructurales correctos | 947 municipios · 302 ZMRT (A 118 · B 131 · C 53) · dim ≥ 142.283 · illes ≥ 11.633 · seccions ≥ 1.983 · agregats ≥ 1.945 |
| ☐ | Geometrías 100 % válidas | ST_IsValid → 0 inválidas (A4 bloqueante) |
| ☐ | Tablas NO objetivo intactas fila a fila | diff vs snapshot pre (protección v69) |
| ☐ | ImportRun registrado (trazabilidad) | created/updated/skipped + status OK |
| ☐ | Canario API verde | `/api/health` · `/api/zones?muni=08019` (A) · `?muni=08227` (B) · `/api/geo/illes` |
| ☐ | Canario de Barcelona (canary estadístico) | índex ≈ 11,595 €/m² · 1.053 zonas · compliment ≈ 87,02 % |
| ☐ | Email ÉXITO enviado (o digest con estado OK) | plantilla `exito_import.html` |
| ☐ | CHANGES.md / TASKS.md actualizados | entrada con fuente, período y conteos |
| ☐ | Commit + push + CI verde | check-runs sin fallos |
| ☐ | Backup post-guardado identificado | para rollback < 5 min durante 72 h |

### CHK-FUENTE — variaciones por fuente

| Fuente | Extra en CHK-PRE | Extra en CHK-POST |
|--------|------------------|-------------------|
| 🏦 Incasòl Excel (trimestral/anual) | C4 cobertura ≥ 940 municipios · C7 período no regresivo · C9 desviación ≤ 15 % | completitud ≥ 690 (KPI-2) · purga 9999xx verificada |
| ⚖️ ZMRT / DOGC (ventanas abril/octubre) | baseline `dogc_baseline.json` aún con las 3 resoluciones vigentes · tests v69 en verde | conteo exacto por llista · `zmrt_font`/`zmrt_publicacio` per llista (B → DOGC 3-7-2024) · baseline actualizada DESPUÉS |
| 🏛️ Catastro ATOM (semestral) | zip provincial íntegro · códigos INE contra catálogo (C8) | dim solo-crecer · ST_IsValid 100 % · GIST presente |
| 🗺️ ICGC (servicio/tiles) | geocodificador responde 200 · tiles OK | mapas de la web sin regresión visual |
| 📊 INE / Idescat (anual) | contrato de columnas C3 · período anual correcto | coherencia con secciones 1.983 · KPI-2 sin caída |

### Registro de firma (plantilla)

```
Fecha: ________ · Fuente: ____________ · Fichero: ____________ (SHA-256 ______________)
Auditoría F0: [ ] GO 12/12    [ ] GO-CONDICIONAL (firma humana C9/C10: ____)
Backup pre: ____________________ · Import: [ ] OK  created____ updated____ skipped____
Canario post: [ ] verde · Canario BCN: índex ______ €/m² · zonas ______
Firma administrador: ____________________
```

---

## Anexo A — Ficheros incorporados por la Fase P0

| Fichero | Rol |
|---------|-----|
| `.github/workflows/mantenimiento.yml` | agenda completa de §1 (5 cron + manual) con guards de secretos |
| `pipeline/qa/auditoria_f0.py` | auditoría previa F0 — 12 controles C1-C12, informe JSON, selftest |
| `scripts/canary_diario.py` | canario diario — sondas + KPIs + clasificación A1-A10, selftest |
| `scripts/dogc_watch.py` + `scripts/dogc_baseline.json` | vigilancia DOGC (A3/A7/A9), línea base de las 3 resoluciones vigentes |
| `pipeline/qa/notificaciones/envia_alerta.py` | render + envío Resend, modo seco, selftest |
| `pipeline/qa/notificaciones/plantillas/*.html` | 5 plantillas (CRÍTICA · MEDIA · BAJA · ÉXITO · DIGEST) |
| `docs/mantenimiento/FASE_P0_IMPLEMENTACION.md` | este documento |
| `pipeline/qa/informes/` · `pipeline/qa/.estado_f0/` · `scripts/.informes_canario/` | informes y estado (fuera del repo, en `.gitignore`) |

## Anexo B — Puesta en marcha en 10 minutos (una sola vez)

| ☐ | Paso |
|---|------|
| ☐ | GitHub → repo → Settings → Secrets → `DATABASE_URL` (URL de Supabase con `?sslmode=require`; nunca `pgbouncer=true` en el pooler) |
| ☐ | Secrets → `RESEND_API_KEY` y `ALERT_EMAIL_TO` (sin ellos: modo seco, informes como artifacts) |
| ☐ | Variables (opcional) → `SITE_URL` si el dominio difiere de `https://preureal.com` |
| ☐ | Actions → «mantenimiento» → Run workflow → job `smoke` → verificar 4/4 selftests verdes |
| ☐ | Run workflow → job `canario` → verificar digest recibido con KPIs de producción |
| ☐ | Al día siguiente: comprobar que el canario diario corrió a las 06:00 CET (± jitter de Actions) |

## Anexo C — Criterio de cierre y qué queda para P1/P2

- **Cierre P0:** ciclo trimestral F0 GO verificado + canario diario en producción con digest + selftests verdes (ya ejecutados en el repo) + backups semanales programados.
- **P1 · Panel:** vista «Datos y fuentes» en `#/admin` (mockups figuras 3-4 del Plan): semáforo por fuente, botones Auditar/Importar/Verificar/Rollback/Informe/Pausar/Programar, firma humana de C9/C10 en pantalla.
- **P2 · Automatización total:** staging permanente (C11/C12 sin firma manual), 90 días de operación con error rate ≤ 5 % y KPI-7 ≥ 99 %.
