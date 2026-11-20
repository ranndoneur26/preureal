# Fase P1 — Panel «Datos y fuentes» en `#/admin`

Fecha: 2026-11-20 · v71 · Base: v70 (Fase P0 cerrada, Anexo B verificada en producción)

Implementación de la fase **«P1 · Panel»** del Plan de Mantenimiento de Bases de
Datos (Anexo C de `FASE_P0_IMPLEMENTACION.md` y capítulo 8 del Plan, mockups
figuras 3-4): la vista «Datos y fuentes» dentro del panel de administración
existente (`#/admin`, que ya incluye imports, audit y stats). Todo aditivo:
sin migraciones de BD, sin cambios en endpoints existentes, diseño, planes,
precios ni textos legales; `vercel.json`, `ci.yml` y el workflow
`mantenimiento.yml` intactos.

## 1. Alcance v1

| Pieza | Fichero | Qué aporta |
|---|---|---|
| Catálogo de fuentes + semáforo | `src/lib/datos-fuentes.ts` | 8 fuentes de la tabla 5 del Plan con institución, licencia, periodicidad, SLA, trazabilidad `ImportRun ↔ fuente` y cron vigente. Módulo puro testeable. |
| API del panel | `src/app/api/_impl/admin/datos-fuentes/route.ts` (ruta `/api/admin/datos-fuentes`, dispatcher regenerado) | GET estado + KPIs, GET `?informe=X` (JSON descargable), POST con las 9 acciones protegidas de la tabla 12. |
| UI | `src/components/views/AdminView.tsx` (pestaña «Dades i fonts») | Banner de alertas, KPIs globales, tarjeta por fuente (semáforo, frescura vs SLA, ficha técnica, asistente de 4 pasos, botones), modales de confirmación/firma/programación. |
| Tests | `tests/datos_fuentes.test.ts` (bun) | 15 casos: umbrales del semáforo, bloqueo de importación, firma C9/C10, trazabilidad sin cruces. |

## 2. Catálogo de fuentes (tabla 5 del Plan)

| code | Fuente | SLA (d) | Trazabilidad (`ImportRun.source` prefijos) | slug `auditoria_f0.py` |
|---|---|---|---|---|
| `INCASOL_EXCEL` | Incasòl — Excel municipals (lloguer mitjà + contractes) | 100 | `INCASOL_EXCEL`, `INCASOL_MUNICIPIS` | `incasol-excel` |
| `INCASOL_SOCRATA` | Incasòl — flux de fiances (Socrata qww9-bvhh) | 100 | `INCASOL_FIANZES`, `RENTAL_SHARE_CENS`, `RENTAL_SHARE_FLUX`, `INCASOL_SOCRATA` | `incasol-socrata` |
| `CATASTRO_ATOM` | Catastro INSPIRE ATOM (any de construcció) | 180 | `CADASTRE_DNP`, `CATASTRO` | `catastro` |
| `ICGC_SERVEI` | ICGC — tiles, geocodificador i descàrregues | 45* | `ICGC` | `generic` |
| `ZMRT_DOGC` | Generalitat ZMRT — resolucions TER (DOGC) | 180 | `ZMRT` | `zmrt` |
| `SERPAVI` | SERPAVI (MIVAU) — sèrie vigent de fiances/bonus | 730 | `RENTAL_SHARE_ADMIN`, `RENTAL_SHARE_VIGENTS` | `generic` |
| `IDESCAT_BSECCEN` | Idescat — bseccen i API Indicadors/Taules | 400* | `IDESCAT` | `generic` |
| `INE_TEMPUS3` | INE — Tempus3 (IPVA, Atlas ADRH, demografia) | 400* | `INE_` | `generic` |

(*) SLA propuestos: el Plan no los fija (tabla 13 solo define Incasòl 100 ·
Catastro 180 · SERPAVI 730 · ZMRT 180); el panel los marca como «proposat».
Las filas de `DataSource` se crean **solo si no existen** (create-only):
nunca sobreescribe el catálogo que ya usan `/api/provenance` ni los informes PDF.

## 3. Semáforo por fuente (tabla 11 del Plan)

Criterios medibles, colores exactos del Plan y mensaje siempre en texto
(mayores de accesibilidad del Plan: el color nunca va solo).

| Estado | Color | Criterio de activación |
|---|---|---|
| Vigente | `#2E7D5B` | Frescura ≤ SLA · sin incidentes (una fuente sin importaciones registradas se muestra Vigente y honesta: «Cap importació OK registrada encara») |
| Aviso | `#B8860B` | Frescura > SLA (≤ SLA+25 %) · control C9/C10 pendiente de firma (GO-CONDICIONAL) · última auditoría F0 NO-GO |
| Crítico | `#B23B3B` | Frescura > SLA+25 % · última ejecución ERROR |
| Pausada | `#8A93A1` | `DataSource.active=false` (siempre gana; el gris evita parecer averiada) |

## 4. Acciones y protecciones (tabla 12 del Plan)

Todas las acciones son POST en `/api/admin/datos-fuentes` con `requireAdmin`
y registro en `AuditLog` (`DATOS_*`). El panel es el **tablero de estado y
trazabilidad**: la ejecución real (descarga, auditoría F0, staging→prod,
restauración) sigue en el pipeline (`auditoria_f0.py`, `update_all.sh`,
`backup_pg.sh`, `canary_diario.py`) y en el workflow de mantenimiento.

| Botón | Acción | Protección | Registro |
|---|---|---|---|
| Auditar | Modal con el comando exacto + registrar solicitud (`ImportRun` AUDIT) y después el veredicto F0 | ninguna (lectura) | `DATOS_AUDIT_START` + `DATOS_F0_AUDIT` |
| Importar | Registra la solicitud con el procedimiento (backup → update_all → canario) | F0 12/12 (GO) o firma humana posterior de C9/C10 (GO-CONDICIONAL); confirmación escrita «IMPORTAR <fuente>»; 409 `F0_BLOQUEJAT` | `DATOS_IMPORT_SOLICIT` |
| + Resultado | Registra el resultado real de la ejecución | estado OK/PARTIAL/ERROR | `ImportRun` + `DATOS_IMPORT_RESULT` |
| Verificar | Verificación en vivo: `SELECT 1` + conteos (947 munis · ≥690 con serie · ZMRT 302 desde `geo.municipis`, guarded) | ninguna | `DATOS_VERIFICAR` |
| Rollback | Registra la solicitud de restauración del backup | confirmación escrita «ROLLBACK <fuente>» | `DATOS_ROLLBACK_SOLICIT` |
| Informe | Descarga JSON de trazabilidad (30 runs + 30 registros) | ninguna (solo admin) | — |
| Pausar / Activar | `DataSource.active` false/true | motivo obligatorio al pausar | `DATOS_FONT_PAUSE` / `DATOS_FONT_ACTIVATE` |
| Firmar revisión humana | Firma C9/C10 del GO-CONDICIONAL (desbloquea Importar) | motivo obligatorio + correo del admin | `DATOS_F0_FIRMA` |
| Auditar todo | Registra la solicitud de auditoría de todas las fuentes activas | — | `DATOS_AUDIT_START` por fuente |
| Programar | Muestra el cron vigente por fuente + enlace al workflow | solo lectura | — |

GO 11/12 no desbloquea nunca; NO-GO no se arregla con firma.

## 5. KPIs del panel (tabla 13 del Plan)

- **KPI-1 Frescura media**: media de días desde la última import OK por fuente (solo fuentes con import registrada).
- **KPI-2 Completitud**: municipios con serie / 947 (verde ≥ 690).
- **KPI-3 Error rate 90 d**: ERROR+PARTIAL / total en 90 días.
- **Canario API**: estado `/api/health`.
- **ZMRT vigentes**: `SELECT count(*) FROM geo.municipis WHERE zmrt` (302 esperados; guarded → n/d si la capa no es accesible).
- **Banner de alertas**: fuentes en Aviso/Crítico, ordenadas por gravedad, con mensaje exacto.

## 6. Qué queda para P1.2 (propuesto)

- Dispatch directo a GitHub Actions desde el panel (token en Vercel) para auditar/importar sin salir de la pestaña.
- Informe F0 JSON completo persistido en BD (hoy vive en `pipeline/qa/informes/`, fuera del repo).
- Edición de umbrales/cron por fuente desde el panel (hoy: visualización + enlace al workflow).
