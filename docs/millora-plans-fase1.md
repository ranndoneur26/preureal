# Plans Preureal — FASE 1 «Gratuït» — Informe de validación

> Ejecución de la FASE 1 del encargo «Planes Preureal (migración progresiva)», sobre la
> auditoría de la FASE 0 (`docs/PLANS_MIGRACIO_FASE0_AUDITORIA.md`).
> **Inmutables respetados**: ningún precio, fuente, texto legal, límite publicado ni nombre de
> plan se ha tocado. Todo lo nuevo es ADITIVO y va marcado con badge «Nou».
> **Cero regresiones verificadas** (mapa, registre, quota, comparador, motor, exports intactos).

## 1. Qué se ha entregado (4 puntos del encargo)

| Punto | Implementación | Ficheros |
| --- | --- | --- |
| **Nou** «Checklist pre-firma e informe imprimible bàsic (blocs A–D)» | Bullet nuevo del Gratuït (badge «Nou») con enlace inline «Obre l'eina Consulta» → `/analitza` (la herramienta que genera el informe imprimible A. Preu / B. Normativa / C. Serveis / D. Checklist) | `i18n.ts`, `PricingView.tsx` |
| **Nou** «Historial de consultes guardat 7 dies» | TTL REAL: `features.historialTtlDies` (FREE 7 · Premium 0 · Pro −1) + ventana aplicada **en el servidor** en `/api/history` + cron diario de purga RGPD `/api/cron/history-ttl` (solo FREE + DETAIL) + pestaña Historial desbloqueada en el Panel con nota «es guarda 7 dies» | `plans.ts`, `history/route.ts`, `cron/history-ttl/route.ts`, `vercel.json`, `PanelView.tsx` |
| **Nou** «Sense targeta: registre només amb e-mail» | Bullet explícito (el flujo ya era así; se publicita, como pide el encargo) | `i18n.ts` |
| **Modificar (con cuidado)** bullet «Fins a 3 consultes detallades cada mes» | Texto original conservado LITERALMENTE + subtexto añadido: «— inclou l'eina Consulta (A–D) i l'Anàlisi de mercat (4 gràfics)» | `i18n.ts` |

**Mecanismo anti-duplicación (FASE 0 §3)**: el TTL vive en `SearchLog` + política de features;
NO se crea la tabla `consultes_usuari` del §5 (duplicaría el historial existente). La quota
sigue en `SubscriptionUsage` (fuente atómica v31, sin tocar).

## 2. Migración SQL

`prisma/migrations/20261118120000_plans_fase1_historial_ttl/migration.sql` — idempotente,
**solo toca la fila FREE** de `PlanSetting` (merge JSON aditivo de `historialTtlDies:7`);
Premium y Pro intactos. Rollback invers documentado en el propio fichero.
Aplicada y verificada contra PostgreSQL local (`prisma migrate status` → aplicada).

## 3. Validación

### 3.1 Tests (bun, mismo patrón que el CI)
- `tests/plans_fase1.test.ts` — **20/20 verdes**: gate puro (`historialAccess`: FREE 7, Pro full,
  Premium-prod bloqueado intacto, TTL no finito/fracccionario), `historialCutoff` (exactitud de
  fecha), simetría ca/es, textos existentes literales (prefix exacto), **no-regresión estricta de
  Premium (7) y Pro (6) bullets**, cablejamiento API/cron/migración/UI y guardas lingüísticas
  (cero «vivenda», cero «estima»).
- **16 suites bloqueantes del CI ejecutadas una a una (igual que CI)**: **282 pass · 0 fail**
  (unit 22, totp 8, pdf_report 13, audit_v23 36, reports_shop 15, rental_share 26, analisi 12,
  analitza 53, funcionalitats 20, f4_qa 16, email_first 40, consulta_v47 5, form_contract_v48 10,
  home_premium_v49 11, map_kpi_v50 5, linguistica_v56 6).

### 3.2 Calidad
- `tsc --noEmit` ✓ · `eslint .` ✓ · `bun run build` (check_repo + prisma generate + migrate
  deploy + next build) ✓ — NOTA: hay que correr el build con la shell sin `DATABASE_URL`
  heredado (`unset DATABASE_URL`), porque el sandbox exporta un `file:` de otro proyecto que
  pisa el `.env` del repo (dotenv no sobrescribe variables existentes).

### 3.3 End-to-end real (dev local + PostgreSQL local, como el CI con BD)
- `POST /api/auth/login` PRO (admin@preureal.cat) → `GET /api/history` → **200 · `windowDies:null`**
  (full, sin límite — comportamiento Pro intacto).
- Registro FREE nuevo + verificación + 2 SearchLogs (uno de hace 30 días, uno fresco) →
  `GET /api/history` → **200 · `windowDies:7` · solo la fila fresca** (la de 30 días filtrada
  EN EL SERVIDOR).
- `GET /api/cron/history-ttl` → **`deleted:1`** (cutoff = ahora−7d); recontadas filas >7d: **0**
  (purga RGPD efectiva, idempotente).
- Premium con la configuración REAL de producción (`PlanSetting PREMIUM historial:false`,
  réplica insertada y luego eliminada) + suscripción vigente → `GET /api/history` →
  **403 `PLAN_REQUIRED`** (upsell intacto, como hoy).
- Navegador real (chromium headless): `/#/preus` renderiza los 3 bullets nuevos con badge
  «Nou» (×3), el enlace «Obre l'eina Consulta», los subtextos y Premium/Pro sin cambios;
  `/#/panell` con sesión FREE: pestaña Historial SIN candado, título «Historial de consultes»,
  nota de 7 días visible y la consulta fresca listada.

## 4. Puntos de la FASE 0 detectados (para decisión del propietario, NO aplicados)
- `PlanSetting` PREMIUM en producción: `quotaMonth:7` contradice el bullet publicado
  «Consultes il·limitades»; `pdfMonth:false` (tipo incorrecto, cae al 5 por fallback);
  `historial:false` y `evolucioTemporal:false`. SQL de realineación PROPUESTO en la
  auditoría (FASE 0 §4) — se aplicará solo con aprobación explícita (FASE 2 lo necesita
  para «Historial il·limitat» y «Valora il·limitat»).
- Textos i18n de fallback de precios (7,99/19,99) desactualizados vs BD (8,99/24,99):
  cosmético, la página muestra siempre la cifra de `/api/plans`; se propone actualizar los
  fallbacks en un commit aparte si el propietario lo quiere.

## 5. Criterios de DONE de la FASE 1
- [x] UI render (navegador real, ca) — badge «Nou», enlace a la herramienta Consulta
- [x] SQL migration idempotente aplicada (solo FREE)
- [x] Tests unitarios del TTL del historial (20/20) + 16 suites CI verdes (282)
- [x] End-to-end con BD real: ventana TTL en servidor, purga cron, 403 intacto
- [x] Cero regresiones: mapa, registre, quota, comparador, motor, exports, bullets existentes
