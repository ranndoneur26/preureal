# INFORME — Auditoría de datos y propuesta técnica: nuevas funcionalidades de análisis y valoración

**Fecha:** 11-11-2026 · **Estado:** ⏸️ ESPERA DE VALIDACIÓN DEL PROPIETARIO — no se ha modificado ningún código ni estructura (auditoría solo lectura)
**Método:** auditoría real del seed importado a producción (`data/municipalities.json`, 947 municipios), del esquema Prisma completo, de los servicios existentes (`indicators*.ts`, `pdf-report.ts`, comparador, provenance, sistema de planes) y sondas HTTP de solo lectura contra producción (`www.preureal.com`).
**Alcance:** las 4 funcionalidades del encargo — F1 evolución temporal, F2 comparativa territorial, F3 esfuerzo de renta, F4 valoración de alquiler.

---

## 1. Resumen ejecutivo

| # | Funcionalidad | ¿Construible con los datos actuales? | Complejidad | Cambios de BD |
|---|---|---|---|---|
| F1 | Gráficos de evolución temporal | **SÍ — completa** (692 municipios con serie 2005–2025) | Media | **0 migraciones** |
| F2 | Comparativa territorial visual | **SÍ a nivel municipio / comarca / provincia**; sección censal y distrito **NO disponibles** (se omitirán con explicación) | Media | **0 migraciones** |
| F3 | Indicador de esfuerzo de renta | **SÍ — los datos ya se cruzan hoy** (el indicador ya existe como número; falta la visualización de termómetro + comparativa Catalunya) | **Pequeña** | **0 migraciones** |
| F4 | Valoración automática de renta | **SÍ — versión honesta v1** (horquilla territorial con confianza declarada); ajustes por superficie/habitaciones/estado **no calibrables hoy** (no se inventan coeficientes) | Media-Alta | **0 migraciones** |

**Conclusión:** las cuatro funcionalidades son viables **sin ninguna migración de base de datos**, reutilizando `Municipality.rentHistory`, `rentLatest`, `contractsLatest`, la tabla `StatObservation` (INE) y el sistema de flags `PlanSetting.features`. La limitación estructural clave es que **la fianza Incasòl se mide en €/mes por HABITATGE (no €/m²)** y no hay desagregación por sección censal/distrito en fuentes abiertas.

---

## 2. Auditoría de datos (qué existe realmente)

### 2.1 Incasòl — fiances por municipio (`Municipality`, 947 filas)

| Campo | Cobertura real | Contenido |
|---|---|---|
| `rentLatest` | **692/947 (73 %)** | €/mes, mitjana de fiances, último período disponible |
| `rentPeriod` | 692 | 544 municipios en «2025»; 148 en períodos anteriores (2016–2024) |
| `rentHistory` | **692** | JSON `{"2005": 550.2, …}` — **serie histórica real** |
| `rentPrevYear` | 610 | año anterior (tendencia inmediata) |
| `contractsLatest` | **944/947 (99 %)** | nº de contratos con fianza (proxy de tamaño de muestra) |
| `comarca` / `province` | 947/947 | 43 comarcas; Barcelona 311, Lleida 231, Girona 221, Tarragona 184 |
| `isTense` / `tenseList` | 947/947 | 171 zonas tensionadas (DOGC) |

**Calidad de la serie histórica (medida sobre las 692 series):**
- Rango global **2005–2025**; mediana **11 puntos** por municipio; máximo 21 (Barcelona).
- Cobertura por año: 2005: 81 munis → 2010: 191 → 2015: 512 → 2018: 559 → 2020: 557 → 2024: 552 → 2025: 544.
- **509 municipios tienen ≥4 de los últimos 5 años** (2021–2025) y **545 tienen ≥2 de 2023–2025** → la variación interanual reciente es calculable para la gran mayoría.
- **127 municipios tienen algún salto interanual >35 %** → muestra pequeña; el gráfico deberá mostrar el nº de contratos y avisar en estos casos.
- **Unidad: €/mes por habitatge (media de fiances). NO existe €/m² en la fuente** — esto condiciona F2 y F4 (ver §3).

### 2.2 INE — `StatObservation` + `DataSource` (ya importados, Fase 2 del proyecto anterior)

| Variable | Niveles | Cobertura | Períodos |
|---|---|---|---|
| `RENTA_NETA_MEDIA_HOGAR` y `RENTA_NETA_MEDIA_PERSONA` | ESTATAL, CCAA, PROV, **MUNI** | **947/947 municipios** | **2015–2024** (Atlas ADRH, publicado 19-10-2026) |
| `IPVA_INDICE` y `IPVA_TASA_ANUAL` | ESTATAL, CCAA, PROV, MUNI | MUNI solo municipios >10.000 hab (~1.222 obs) | 2015–2024 |

- Los datos del Atlas ya se sirven hoy en producción vía `/api/indicators/muni/[code]` (gated 401 sin sesión) y el **esfuerzo de renta municipal ya se calcula** (`esforç econòmic`, canario de tests: 21,14 % Cornellà). F3 es por tanto **visualización + comparativa**, no un cálculo nuevo.
- **El Atlas INE también publica renda por secció censal** (no importada). Es una importación futura posible de forma aditiva (`StatObservation`, 0 cambios de estructura) — ver §3 Q4.

### 2.3 Nivel de edificio/illa (`Building`)

- El esquema ya soporta `avgRentEurMonth` + `sampleSize` (importación Incasòl por inmueble, «pendiente de autorización» según `/api/provenance`) y la banda [P25, P75] por edificio está implementada pero a `null` por diseño (espera del convenio Incasòl por inmueble). **La fuente por inmueble NO está activa hoy.**
- `Building` no tiene superficie, habitaciones ni estado de conservación → **no existe base de datos para calibrar ajustes por características**.

### 2.4 Crowdsourcing (`PriceReport`)

- Campos útiles para F4 ya existentes: `offerEurMonth`, `surfaceM2`, `rooms`, `contractType`, moderación `PENDING/ACCEPTED`. Volumen actual desconocido (probablemente bajo) → hoy no sostiene coeficientes; con umbral futuro (≥20 muestras ACCEPTED con superficie en un municipio) podría activarse un ajuste empírico documentado.

### 2.5 Sección censal y distrito

- **No hay ninguna fuente abierta de fianzas Incasòl por sección censal ni por distrito.** La plataforma no tiene ese dato ni puede obtenerlo sin nueva fuente oficial. En F2 se mostrarán solo los niveles con dato real, marcando claramente los no disponibles (requisito del propio encargo).
- Infraestructura de charts: **no hay ninguna librería de gráficos instalada** (solo Leaflet y pdf-lib). Recomendación: componentes SVG propios ligeros (identidad visual exacta, responsive, ~0 KB de dependencias).

---

## 3. Respuestas a las 10 preguntas del encargo

**1. ¿Qué datos históricos de Incasòl existen actualmente?**
692 municipios con serie anual 2005–2025 (`rentHistory`), mediana 11 puntos/municipio; 692 con precio vigente (`rentLatest` + período); 944 con nº de contratos. Detalle completo en §2.1.

**2. ¿Qué periodicidad y desagregación territorial tienen?**
Periodicidad **anual** (con avances trimestrales solo para grandes municipios; el campo admite «2026 I trim.»). Desagregación disponible: **municipio (947), comarca (43, 100 %), provincia (4, 100 %)** y niveles superiores del INE (CCAA/ESTATAL). NO disponible en fuentes abiertas: distrito, barrio, sección censal.

**3. ¿Podemos construir las cuatro funcionalidades con los datos actuales?**
Sí: F1 completa; F2 en los niveles municipio/comarca/provincia (omitiendo con explicación sección/distrito); F3 completa (datos ya cruzados hoy); F4 en versión honesta con horquilla territorial y nivel de confianza declarado. Las 4 con **0 migraciones**.

**4. ¿Qué datos adicionales del INE necesitamos?**
Para F3 v1: **ninguno** (renda neta mitjana per llar municipal 2015–2024 ya importada, 947/947). Opcional futuro: **Atlas por sección censal** (renda) para enriquecer F3 — importación aditiva vía `StatObservation`, viable pero con volumen mayor (~4.500 secciones de Catalunya). No se necesita nada más del INE para F1, F2 ni F4.

**5. ¿Qué metodología recomiendo para el esfuerzo de renta?**
La ya implementada y auditada: **Esfuerzo (%) = alquiler mensual medio municipal ÷ (renda neta mitjana per llar anual ÷ 12) × 100**, con las salvaguardas del encargo: usar siempre **renta por HOGAR** (nunca por persona), mostrar año de referencia de cada fuente, **advertir explícitamente cuando los años difieran** (lloguer 2025 vs renda 2024), presentar como aproximación estadística del territorio. Añadidos propuestos: termómetro visual, comparativa municipio vs Catalunya (misma fuente y metodología), y banda interpretativa orientativa (ej. <25 % baja, 25–40 % media, >40 % alta — rótulo textual, no alerta).

**6. ¿Qué metodología recomiendo para valorar una vivienda concreta?**
Modelo por capas, transparente y defendible (sin inventar coeficientes):
1. **Renta central** = `rentLatest` del municipio (mediana del mercado real registrado).
2. **Horquilla** = central ± dispersión **medida, no supuesta**: amplitud relativa (RIQ/mediana) calculada sobre los municipios de la **comarca el mismo año** (pool ≥5 municipios; si no, provincia; si no, volatilidad histórica del propio municipio). Resultado: mín / central / máx con la base estadística visible.
3. **Ajustes por superficie, habitaciones y estado**: los datos oficiales agregados **no permiten calibrarlos** (no hay €/m² por municipio ni características de inmuebles). Conforme al propio encargo («si los datos no permiten aplicar los ajustes, no inventar coeficientes»), v1 los muestra como **orientación cualitativa** y no los multiplica. Se activarán automáticamente (documentados) cuando exista base empírica: importación Incasòl por inmueble activada o ≥20 `PriceReport` ACCEPTED con superficie en el municipio.
4. **Nivel de confianza** Alta/Media/Baja con reglas explícitas: período ≥2024 y ≥100 contratos → Alta; ≥2020 y ≥30 → Media; resto → Baja. Se muestran nº de observaciones, período y fecha de actualización.
5. Descarga del resultado como PDF (ya existente) y comparación con la mediana municipal.

**7. ¿Qué tablas, campos o procesos habría que añadir?**
**V1: ninguno.** Todo sale de tablas existentes; los agregados de comarca/provincia se calculan al vuelo (947 filas, coste trivial) y la valoración se registra en `SubscriptionUsage` (tipo nuevo `VALUATION`) sin cambios de esquema. Futuro opcional: importación Atlas secciones censales (filas nuevas aditivas), activación de la importación por inmueble (pendiente de Incasòl), campo de elasticidad si algún día hay base empírica.

**8. ¿Cómo lo integraría sin alterar la plataforma actual?**
- **F1** en la fitxa del panel (`/#/panell`): el usuario Free conserva la mini-tabla actual de últimos 8 años (comportamiento actual intacto); Premium/Pro ven el gráfico de líneas interactivo completo (hover, % interanual, línea de referencia comarca/provincia). En el comparador: superposición multi-municipio para Premium/Pro.
- **F2** en la fitxa del municipio (gráfico de barras horizontales muni/comarca/prov con etiqueta de período por barra, más caro/más barato de la comarca, diferencias %).
- **F3** en la fitxa (termómetro + comparativa Catalunya) — ya está gated por el flag existente `indicadorsTerritorials`.
- **F4** como sección «Valoració» dentro del panel privado (sin ruta nueva), accesible desde la fitxa con el municipio precargado.
- Todo con el sistema vigente: flags nuevos `evolucioTemporal`, `comparativaTerritorial`, `valoracio` + cuota `valoracionsMonth` en `PlanSetting.features` (configurables desde `/#/admin` sin desplegar), gating **server-side** (los datos Premium nunca salen de la API a usuarios Free), i18n ca/es, gráficos SVG propios con la identidad actual.

**9. ¿Qué coste técnico y complejidad tiene cada funcionalidad?**

| Funcionalidad | Backend | Frontend | Tests | Complejidad |
|---|---|---|---|---|
| F3 esfuerzo (visual) | ampliar payload existente | termómetro SVG + textos | cálculo (ya tiene canario) | **S** (~½ jornada) |
| F1 evolución | agregados comarca/prov por año + endpoint | LineChart SVG interactivo + hover | series, huecos, interanual | **M** (1-2 jornadas) |
| F2 comparativa | mismo endpoint (payload compartido) | BarChart SVG + etiquetas | agregación, períodos mixtos | **M** (1-2 jornadas, comparte base con F1) |
| F4 valoración | POST /api/valuation + motor capas + cuota | formulario + tarjeta resultado | motor (central, banda, confianza, casos borde) | **M-Alta** (2-3 jornadas) |

Total estimado: **5–8 jornadas** de desarrollo incremental, con gates y pruebas en cada fase.

**10. ¿En qué orden recomiendo implementarlas?**
El de tu encargo funciona y lo propongo con un pequeño ajuste por retorno rápido: **F3 → F1 → F2 → F4**. F3 es la más pequeña (visualización de algo ya calculado) y permite validar el patrón de gráficos SVG con riesgo mínimo; después F1 (base de charts) que deja hecho el trabajo compartido de F2; F4 al final por ser la más compleja y sensible metodológicamente. Cada fase con sus gates y push a producción antes de la siguiente.

---

## 4. Reglas de calidad transversales (compromiso)

1. **No interpolar ni inventar valores**: los gráficos trazan solo puntos reales; huecos visibles y explicados.
2. **Período visible en cada cifra** (cada barra/lleva su «2025» o «2021» según el municipio).
3. **Muestras pequeñas señaladas**: salto >35 % interanual → mostrar nº de contratos y aviso.
4. **Unidad siempre explícita**: €/mes por habitatge (nunca presentarlo como €/m²).
5. **Trazabilidad**: cada gráfico enlaza con `/api/provenance` (fuente, licencia, metodología) — ya existente.
6. **Gating server-side**: comprobación de plan y flags en la API; el frontend nunca es la barrera.
7. **ca/es completo** y responsive móvil.

## 5. Decisiones que pido validar antes de desarrollar

1. **Unidad €/mes por habitatge** en todos los gráficos (la fuente no da €/m²) — ¿OK?
2. **F2 sin sección censal ni distrito** (se indican como «no disponible») — ¿OK, o quieres que estudie la importación del Atlas INE por secciones como fase futura?
3. **Agregación comarca/provincia = mediana de municipios con dato en el mismo año** — ¿OK con esta metodología?
4. **F4 v1 sin multiplicar superficie/estado** (orientación cualitativa + horquilla territorial con confianza) — ¿OK, o prefieres esperar a tener muestras de crowdsourcing antes de lanzarla?
5. **Cuota de valoraciones**: propuesta Premium 5/mes, Pro 30/mes (configurable desde admin) — ¿OK?
6. **Gráficos SVG propios** sin añadir librerías — ¿OK?

Con tu validación de estos 6 puntos, empiezo por la fase que decidas (recomendación: F3, luego F1).
