# Plans Preureal — FASE 2 «Premium» — Informe de validación

> Ejecución de la FASE 2 del encargo «Planes Preureal (migración progresiva)», sobre la
> auditoría de la FASE 0 (`docs/PLANS_MIGRACIO_FASE0_AUDITORIA.md`) y la FASE 1
> (`docs/millora-plans-fase1.md`, ya en producción tras CI success `44134377160`).
>
> ## 6 INMUTABLES (referenciados explícitamente, tal como exige el encargo)
> 1. **Precios sin cambios** — 0 € / 8,99 €/mes / 24,99 €/mes; pago único 4,99/6,99/7,99 €.
>    La migración NO toca `priceEur` (verificado en vivo: `PREMIUM priceEur=8.99` antes y
>    después). Los defaults de código 7,99/19,99 (caducados y cosméticos, FASE 0 §1) se
>    alinean a 8,99/24,99 para que el fallback sea veraz — la BD sigue siendo la fuente.
> 2. **Solo fuentes oficiales** — Incasòl (fianzas), ICGC (cartografía), habitatge.gencat.cat,
>    IDESCAT (Padró), INE. El módulo normativo y las alertas NO añaden ninguna fuente nueva:
>    reutilizan `Municipality` (Incasòl) + `NORM_FACTS` de `analitza.ts` (DOGC, INE/IRAV,
>    SERPAVI/MIVAU — con las mismas resoluciones TER/3739/2026 y TER/3740/2026 publicadas).
>    Cada dato sale con su fuente y su período (principio de trazabilidad).
> 3. **Textos legales intactos** — «Comparació estadística, no és una taxació» (footer del
>    correo de alertas, literal), `ORIENTATION_DISCLAIMER` en la respuesta del módulo
>    normativo, nota SERPAVI («el rang amb validesa legal només el dóna SERPAVI»).
> 4. **Cuotas publicadas sin cambios** — Gratuït 3 consultes + comparador 2 (fila FREE
>    intacta, verificada); Premium 5 PDFs/mes (`pdfMonth: 5` fijado al valor publicado,
>    la BD tenía el tipo incorrecto `false` — cero cambio de comportamiento, el fallback
>    ya devolvía 5) + comparador 6; Pro 30 PDFs/mes + CSV + factura nominal (30 y CSV intactos).
>    Realineación APROBADA: `quotaMonth 7 → -1` (el bullet publicado dice «Consultes
>    il·limitades»; la BD quedaba por detrás — se alinea CON lo publicado, nunca al revés).
> 5. **Identidad de marca intacta** — nombres de plan (Gratuït / Premium / Pro·agents),
>    logo, paleta, catalán como idioma principal. Badges «Nou» con el mismo estilo FASE 1.
> 6. **Stripe intacto** — ni un identificador de precio, ni flujo de checkout, ni webhook.

## 1. Qué se ha entregado (4 puntos «Nou» de Premium; los 7 bullets publicados LITERALES)

| Punto | Implementación | Ficheros |
| --- | --- | --- |
| **Nou** «Valora v2 il·limitat: franja orientativa de renda per a habitatges concrets, sense quota mensual» | `features.valoracionsMonth: -1` (Premium, y Pro por «Tot el de Premium») — la ruta `/api/valuation` ya trataba −1 como ilimitado (v31: `limit >= 0`); verificado EN VIVO: 5/5 usos → sin 402, `quota {used, limit: -1}` | `plans.ts`, migración |
| **Nou** «Mòdul normatiu complet: índex de referència vigent, IRAV, gran tenedor i SERPAVI» | Nueva API `/api/normativa/[code]` (gating `normativaCompleta`) que CONSOLIDA datos existentes: fianza vigente (Incasòl o ref. comarca marcada ESTIMACIÓ), estado área tensada + resoluciones DOGC 19-10-2026, IRAV (INE, +2,54 % setiembre 2026), gran tenedor (LAU art. 2) y SERPAVI (RDL 29/2026, MIVAU), LAU art. 17.2/temporada art. 3, amiant 3-10-2026. UI: pestaña «Normativa» en el Panel (búsqueda de municipio con debounce, 5 bloques con fuente y período) | `normativa/[code]/route.ts`, `PanelView.tsx` |
| **Nou** «Alertes de preu i normativa per municipi (fonts oficials, revisió diària)» | Tabla `UserAlert` (§5 «alertes_usuari», decisión FASE 0: aquí, no en FASE 0), API CRUD `/api/alertes` (gating `alertes`, máx. 20 activas — higiene documentado), cron diario `/api/cron/alertes` (15 3 * * *, auth CRON_SECRET): PRICE (avanza rentPeriod Incasòl), TENSE (entra/sale DOGC), NORMATIVA (versión = hash de NORM_FACTS). Idempotencia vía `PriceAlertLog` (misma tabla que el flujo de favoritos v37/v60 → NUNCA doble aviso). Correo consolidado ca/es `alertaMail` con outbox durable + entrega en la misma pasada. UI: pestaña «Alertes» (búsqueda + chips de tipo + lista con última comprobación) | `schema.prisma`, migración, `alertes/route.ts`, `cron/alertes/route.ts`, `mail.ts`, `vercel.json`, `PanelView.tsx` |
| **Nou** «Historial de consultes il·limitat» | `historial: true` + `historialTtlDies: -1` en la BD de Premium (la FASE 1 ya implementó el gate puro `historialAccess` y el servidor `/api/history`; el cron de purga RGPD solo toca FREE — verificado: Free `windowDies:7`, Pro `null`, Premium ahora `null`) | migración, `plans.ts` |

**Anti-duplicación (FASE 0 §3)**: el historial sigue en `SearchLog` (no se crea `consultes_usuari`);
las alertas reutilizan `PriceAlertLog` para la idempotencia (no hay doble log); el módulo normativo
consolida `NORM_FACTS` + `Municipality` (no hay nuevo motor normativo); la UI usa las pestañas del
Panel existentes (mismo patrón v5 de lock + teaser, nunca lista vacía que confunda).

## 2. Migración SQL

`prisma/migrations/20261118130000_plans_fase2_premium/migration.sql` — idempotente (merge
jsonb ADDITIVO, patrón FASE 1), **solo toca las filas PREMIUM y PRO** de `PlanSetting`
(FREE jamás: verificado). Crea la tabla `UserAlert` (`CREATE TABLE IF NOT EXISTS`, índices
únicos y de consulta). Rollback inverso documentado en el propio fichero (incluido
`DROP TABLE "UserAlert"`). `plans.ts` lleva los mismos valores como default de código
para instalaciones sin fila BD.

## 3. Validación

### 3.1 Tests (bun, mismo patrón que el CI)
- `tests/plans_fase2.test.ts` — **26/26 verdes** (P1 defaults Premium/Pro/FREE con red lines,
  P2 i18n simétrico + guardas lingüísticas, P3 normativa gating/fuentes/legal, P4 alertes+cron
  gating/idempotencia/correo/programación, P5 migración+schema, P6 cablejamiento UI).
- `tests/plans_fase1.test.ts` — evolucionado JUSTIFICADAMENTE (la FASE 2 añade 4 bullets a
  Premium, previsto en el encargo): los 7 publicados siguen anclados LITERALMENTE (prefix
  exacto), Pro sigue en 6 sin `featsNou`. **25/25 verdes.**
- **16 suites bloqueantes del CI ejecutadas una a una (igual que CI)**: **0 fail**
  (unit 22, totp 8, pdf_report 13, audit_v23 36, reports_shop 15, rental_share 26, analisi 12,
  analitza 53, funcionalitats 20, f4_qa 16, email_first 40, consulta_v47 5, form_contract_v48 10,
  home_premium_v49 11, map_kpi_v50 5, linguistica_v56 6).
- Repo guard (drift del dispatcher: **101 rutas**, con `/api/normativa/:code`,
  `/api/alertes`, `/api/cron/alertes`), `tsc --noEmit`, `eslint .`, `npm audit` (0
  vulnerabilidades high+) y `next build` de producción: OK.

### 3.2 End-to-end REAL con PostgreSQL local (mismo método que la FASE 1)
- Estado PRE-FASE-2 realista insertado (Premium `quotaMonth 7`, `historial:false`,
  `pdfMonth:false`, `valoracionsMonth:5`, `evolucioTemporal:false`) → migración aplicada:
  Premium `quotaMonth -1`, `pdfMonth 5`, historial ilimitado, Valora ilimitado, flags nuevos;
  Pro hereda flags y conserva 30 PDFs/CSV; **FREE byte a byte intacto**; **2ª pasada de la
  migración = mismo estado** (idempotencia probada). `scripts/e2e_plans_fase2.ts`.
- `/api/plans`: sirve los valores nuevos (Premium 8,99 € / −1 / flags; Free intacto).
- `/api/normativa/080193`: anon **401** · Free **403 PLAN_REQUIRED** · Premium **200**
  (Barcelona 1.134,6 €/mes 2025, área tensada true, IRAV 2,54 %, disclaimer legal).
- `/api/alertes`: Free **403** · POST premium 200 (Girona) · POST duplicado → 1 fila
  (upsert) · tipus inválido → 400 con lista válida · DELETE propio 200 · DELETE ajeno → 403.
- `/api/cron/alertes`: 1ª pasada **ancla** (baselinesSet, 0 avisos), 2ª pasada 0 (idempotente);
  simulado avance de período oficial (Girona 816→838 €, 2025→2026) → `priceEntries: 1`,
  correo en outbox con idempotencyKey diaria, asunto y cuerpo verificados (contiene «Girona»,
  «838 €/mes», «2025 → 2026», footer «no és una taxació»); repetición el mismo día → 0.
  **Fila UserAlert de un FREE omitida por el cron y NO borrada** (pausa no destructiva).
- `/api/valuation` Premium con `usageCount 5/5` → **sin 402** (`quota {used, limit: -1}`);
  Free → 403 intacto. `/api/history`: Free `windowDies 7` (FASE 1 intacta), Pro `null`.
- Navegador real: `/#/preus` con **7 badges «Nou»** (3 Free + 4 Premium) y bullets de
  Free/Pro intactos; Panel Premium: pestaña «Alertes» (búsqueda Manresa → añadir → lista con
  chip «Preu oficial (Incasòl)» y última comprobación) y pestaña «Normativa» (Barcelona con
  los 5 bloques + SERPAVI + DOGC + disclaimer); Panel Free: upsell «Les alertes són del pla
  Premium» con candau (nunca lista vacía).

## 4. Métricas para FASE 4 (se registran desde hoy)

- `VALUATION_PAYWALL` ya existía para el muro de Valora; el nuevo flujo de alertas crea
  eventos naturales de conversión vía `/preus` (enlace inline del bullet). Los objetivos del
  encargo (Free→Premium 3–5 %, Premium→Pro ≥10 % en 6 meses, churn Pro <2 %/mes) se miden
  con los dashboards de admin existentes (funnel 30 días), sin ningún código nuevo.

## 5. Notas de operación

- Cron `/api/cron/alertes` a las **03:15 UTC** (antes del resumen de e-mails de las 04:00 y
  de la purga TTL de las 03:50); sin `CRON_SECRET` configurado queda rate-limited (mismo
  patrón que el resto de crons). El proveedor sandbox solo «loguea» (visible en el panel
  admin); con RESEND entregan y reintenta el outbox compartido.
- Las alertas de favoritos v37 (favoritos con umbral %) siguen funcionando SIN cambios; el
  dedup por `(userId, entityKey, kind, period)` garantiza que ningún usuario reciba dos
  correos por el mismo hecho oficial aunque tenga ambos mecanismos activos.
