# AUDITORIA_PREUREAL.md — Estado real del proyecto antes de la ampliación

| | |
|---|---|
| Proyecto | PreuReal — www.preureal.com (preus reals de lloguer a Catalunya) |
| Fecha de auditoría | 15 de noviembre de 2026 |
| Commit auditado | `a5b93e7` (rama `main`, versión documentada **v39** en `CHANGES.md`) |
| Alcance | Fase 1 del proyecto «Auditoría, integración y ampliación de datos públicos» |
| Método | Lectura íntegra del código (`src/`, `prisma/`, `scripts/`, `data/`), revisión de workflows y sondas HTTP a producción. No se ha modificado ningún archivo de código en esta fase. |
| Documentos hermanos | `CATALOGO_FUENTES_DATOS.md` · `ARQUITECTURA_DATOS.md` · `PLAN_IMPLEMENTACION.md` |
| Referencias previas | `docs/PROPUESTA-ampliacion-fuentes-oficiales.md` (10-11-2026), `INFORME_AUDITORIA_FUNCIONALIDADES.md`, `AUDIT.md`, `TASKS.md` |

---

## 1. Resumen ejecutivo

PreuReal está en una versión madura (v39): 947 municipios con histórico de alquiler 2005–2025 (Incasòl), edificios reales del ICGC con referencia catastral y año de construcción (Catastro), indicadores INE (IPVA + Atlas de renta), capa demográfica Idescat añadida en v39, informes PDF de pago único (4,99 / 6,99 / 7,99 €) y plataforma comercial completa (Stripe, auth con 2FA/passkeys, gating por plan).

**Conclusión central:** la arquitectura es reutilizable casi por completo para la ampliación. La v39 demostró de punta a punta el patrón que los nuevos bloques necesitarán: tablas genéricas (`DataSource` + `StatObservation`), importador con reintentos, cron de un paso con presupuesto de tiempo, registro de ejecuciones (`ImportRun`), capa de ficha con degradación elegante y cita de fuentes. Los 15 bloques solicitados **no existen hoy** (conectividad, transporte, equipamientos, riesgos, medio ambiente, energía, urbanismo, clima, tarifas…); ninguno debe construirse con arquitectura paralela.

**Restricciones físicas que condicionan todo el diseño** (documentadas en el propio código):

1. **Límite de 12 serverless functions del plan Hobby**: toda la API vive en un catch-all único (`src/app/api/[[...path]]/route.ts`). Cada endpoint nuevo debe registrarse en el dispatcher generado (`scripts/gen_api_dispatcher.py`); el build falla si una ruta `_impl` no está registrada (anti-drift en `scripts/check_repo.mjs`).
2. **`maxDuration = 60 s` por invocación**: los crons trabajan en pasos (patrón `nextDemografiaStep` con presupuesto interno de 40 s). Ninguna ingesta puede ser monolítica.
3. **Sin PostGIS**: PostgreSQL gestionado con geometrías como JSON en `String` (`Municipality.boundary`, `Building.polygonJson`) y coordenadas `Float` con índices. Las uniones espaciales de polígonos (inundabilidad) deberán resolverse **en la ingesta**, no en tiempo de consulta.
4. **CSP estricta**: `connect-src 'self'` — ningún dato de terceros se consume desde el navegador; todo pasa por la API propia.

---

## 2. Arquitectura actual

### 2.1 Stack (auditoría técnica)

| Capa | Tecnología | Evidencia |
|---|---|---|
| Frontend | Next.js `^16.1.1` (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS 4 | `package.json` |
| SPA | Única página con navegación por hash (`#/…`), 14 puentes `HashBridge` para SEO/404 | `src/components/AppShell.tsx`, `src/app/*/page.tsx` |
| Mapa | Leaflet 1.9.4 (import dinámico), tiles WMTS ICGC `topografic-gris` (MON3857NW, maxZoom 19) | `src/components/views/MapView.tsx` (2.046 líneas) |
| Gráficos | Componentes SVG propios sin dependencias (LineChart, BarChart) | `src/components/charts/` |
| PDF | pdf-lib, gráficos vectoriales dibujados con primitivas, función pura testable | `src/lib/pdf-report.ts`, `pdf-valuation.ts`, `pdf-comparison.ts` |
| Backend | API catch-all única con handlers en `src/app/api/_impl/**` (84 rutas registradas) | `src/app/api/[[...path]]/route.ts` |
| BD | PostgreSQL gestionado (Vercel) + Prisma 6.11.1, 24 modelos, 10 migraciones | `prisma/schema.prisma` |
| Auth | JWT HS256 (`jose`, cookie 30 d, `tokenVersion`), TOTP 2FA, passkeys WebAuthn, Google OAuth | `src/lib/auth.ts`, `totp.ts`, `webauthn.ts` |
| Pagos | Stripe Checkout (suscripción + pago único informes), webhook firmado con idempotencia | `src/lib/subscription.ts`, `src/app/stripe/webhook/route.ts` |
| Correo | Resend con outbox, reintentos e idempotencia; envíos en `after()` | `src/lib/mail.ts` |
| i18n | Diccionario propio `STRINGS {ca, es}` + ternarios inline; APIs y PDF localizan | `src/lib/i18n.ts` |
| Tests | Bun test (85 bloqueantes) + Playwright E2E (desktop+móvil) | `tests/`, `tests/e2e-ui/flows.spec.ts` |
| CI | GitHub Actions: anti-drift → lint → typecheck → 85 tests → audit → build | `.github/workflows/ci.yml` |
| Despliegue | Vercel (auto en push a main), `prisma migrate deploy` en cada build; build:selfhost Docker opcional | `vercel.json`, `package.json` |

### 2.2 Almacenamiento geográfico

- Coordenadas `Float` (`lat/lng`) con índices compuestos en `Municipality` y `Building`.
- Polígonos como **JSON en `String`** (`boundary` municipal, `polygonJson` de edificio) — no hay tipos espaciales ni PostGIS.
- Consultas espaciales existentes: **bbox** (edificios en vista, `GET /api/buildings?bbox`, rate-limit 60/min IP) y **distancia lineal en memoria** donde hace falta. No hay consultas de intersección ni red viaria.

### 2.3 Sistema de mapas y geocodificación

- Tiles únicamente ICGC (atribución ICGC CC-BY 4.0 + Incasòl). Sin tiles de terceros (CSP).
- Geocodificación: proxy a la API del geocodificador ICGC (`src/lib/geocode.ts`, `https://eines.icgc.cat/geocodificador/cerca`, caché en memoria TTL 1 h, máx. 1.000 entradas) + búsqueda directa por referencia catastral (`POST /api/lookup-refcat`).
- Capas actuales (3 `L.layerGroup`): edificios coloreados por precio municipal (zoom ≥ 16, bbox ≤ 400 ha), límite municipal y resalte de parcela.

---

## 3. Auditoría funcional

Leyenda: ✔ implementada y verificada en código; ◐ parcial; ✘ no existe.

| Funcionalidad | Estado | Fuente de datos | Precisión geo. | Actualización automática | Limitaciones conocidas |
|---|---|---|---|---|---|
| Mapa interactivo | ✔ | Tiles ICGC WMTS | Coordenada (zoom 19) | N/A (servicio continuo) | Sin clustering; edificios solo a zoom ≥ 16 |
| Consulta de precio de alquiler por municipio | ✔ | Incasòl/Gencat, fianzas por municipios (Excel oficiales) | Municipio (947) | **Manual** (`scripts/update_all.sh`, trimestral/anual recomendado) | 692/947 con serie propia; resto referencia comarcal (`COMARCA_REF`) |
| Histórico 2005–2025 y tendencia | ✔ | Incasòl (seed JSON) | Municipio | Manual | Fianzas ≠ precio de oferta; documentado en metodología |
| Contratos | ✔ | Incasòl | Municipio | Manual | — |
| Dato de alquiler por manzana/edificio | ◐ | Campo `Building.avgRentEurMonth` **sin importador activo** | Edificio/illa (polígono ICGC RTT) | No | Pendiente del convenio Incasòl; UI muestra «No disponible» |
| Referencias catastrales | ✔ | ICGC RTT (`refcat`) + búsqueda directa | Parcela/edificio | On-demand con caché BD 30 días | — |
| Año de construcción | ✔ | Catastro DNP (`CADASTRE_DNP`) | Edificio | On-demand con caché 30 días | Fuente registrada por dato |
| Fichas de edificios | ◐ | ICGC RTT + Catastro | Edificio | On-demand | La ficha vive dentro del panel del mapa; sin página propia |
| Búsqueda de direcciones | ✔ | Geocodificador ICGC (proxy) | Dirección → coordenada | Servicio continuo | Caché 1 h; sin geocodificación inversa expuesta |
| Filtros de búsqueda | ◐ | BD propia | Municipio | N/A | Búsqueda por texto; sin filtros por servicios/entorno (objeto de la ampliación) |
| Estadísticas municipales INE (IPVA, Atlas renta, esfuerzo) | ✔ | INE wstempus (cron trimestral) | Municipio | **Automática** (cron + ventana 20 días) | Sin sección censal (decisión documentada) |
| Capa demográfica (población, edades, hogares, extranjera, densidad) | ✔ | Idescat APIs Taules/Emex (cron diario por pasos) | Municipio | **Automática** (finestra frescor 6 meses) | 5 fuentes importadas en lotes; degradación «No disponible» |
| Regulación de precios (zonas tensadas) | ✔ | Texto legal TER/3739/2026 y TER/3740/2026 | Municipio | **Manual** (hardcodeado) | Requiere revisión cuando cambie el decreto |
| Ajudas al alquiler | ✔ | Catálogo editorial (`rental_aid_seed.json`) | Municipio/territorio | Manual (sincronización admin) | — |
| Valoraciones Premium | ✔ | Modelo propio (params m², renda) | Municipio + inputs usuario | N/A | Estimación, no dato oficial; así etiquetada |
| Comparador multi-municipio | ✔ | BD propia + demografía | Municipio | N/A | — |
| Informes PDF (gratuito/Premium y shop pago único) | ✔ | Todo lo anterior | Municipio | N/A | 9 páginas; gráficos vectoriales; precio por envs |
| Crowdsourcing de precios | ✔ | `PriceReport` con moderación | Dirección declarada | N/A | Nunca se mezcla con datos oficiales |
| Alertas y favoritos | ✔ | BD propia | Municipio/edificio | N/A | — |
| Export CSV / RGPD | ✔ | BD propia | — | N/A | — |
| i18n ca/es | ✔ | Diccionario + inline | — | N/A | Elementos dispersos en ternarios (mantenibilidad) |
| Responsive | ✔ | Playwright E2E móvil | — | N/A | — |
| Capas de mapa activables (servicios, riesgos…) | ✘ | — | — | — | **No existe**; objeto de la ampliación |
| Conectividad, transporte, equipamientos, zonas verdes, riesgos, aire, ruido, energía, urbanismo, clima, tarifas, secciones censales | ✘ | — | — | — | **No existe ninguno** (verificado con búsquedas en todo el repo) |

**Advertencia del encargo cumplida**: no se ha dado por implementada ninguna funcionalidad solo porque aparezca en la interfaz; cada fila se contrastó con código y datos.

---

## 4. Auditoría de datos: fuentes actuales

| Fuente | Organismo | Uso en PreuReal | Formato / acceso | Cobertura | Precisión | Licencia | Integración | Última actualización |
|---|---|---|---|---|---|---|---|---|
| Lloguers per àmbits geogràfics (fianzas) | Incasòl / Generalitat | Precio municipal, histórico, contratos | Excel oficial; URLs en `scripts/update_all.sh:29-32` | Cataluña | Municipio | Uso público Gencat (cita fuente) | Pipeline manual: `prepare_data.py` → `data/municipalities.json` → `seed.ts` | Última siembra manual (recomendada trimestral) |
| Catálogo de municipios | Generalitat (Socrata `analisi.transparenciacatalunya.cat`, dataset `9aju-tpwc`) | Altas de municipios (947) | SODA JSON | Cataluña | Municipio | Reutilización con cita | `scripts/prepare_data.py` | En cada `update_all.sh` |
| Cartografía y edificaciones ICGC (RTT) | ICGC | Polígonos de edificio/illa, límites municipales, tiles, geocoder | WMTS + API REST (`src/lib/icgc.ts`, `geocode.ts`) | Cataluña | Edificio / límite municipal | ICGC CC-BY 4.0 (tiles, atribución activa) | On-demand con caché BD 30 días y caché boundary persistente | Continua (servicio) |
| Catastro DNP | Ministerio de Hacienda | Año de construcción | API OVC (`src/lib/catastro.ts`) | España | Edificio | «Uso no masivo» declarado por la sede | On-demand con caché 30 días | Continua (servicio) |
| IPVA + Atlas de distribución de renta | INE | Indicadores oficiales de la ficha | API wstempus JSON (`src/lib/ine-import.ts`) | España (munis 947) | Municipio | Cita obligatoria INE | Cron trimestral (`/api/cron/ine`) + import admin | Automática |
| Demografía (5 conjuntos) | Idescat | Población, edades, nacionalidad, hogares, superficie/densidad | APIs Taules v2 + Emex JSON (`src/lib/idescat-import.ts`) | Cataluña | Municipio | Condiciones de uso de las APIs Idescat | Cron diario por pasos (`/api/cron/demografia`) | Automática (finestra 6 meses) |
| Áreas de mercado de alquiler tensionadas | Generalitat (TER/3739/2026, TER/3740/2026) | Badge regulación | Texto legal transcrito | Cataluña | Municipio | Boletín oficial | Hardcodeado en `scripts/prepare_data.py` | Manual al cambiar el decreto |
| Ajudes al lloguer | Editorial propia | Catálogo de ayudas | JSON seed | Cataluña | Territorio | — | `seed.ts` + sincronización admin | Manual |

---

## 5. Problemas detectados

1. **Actualización Incasòl manual**: la fuente principal (precios) no tiene cron; depende de `scripts/update_all.sh` ejecutado a mano. Riesgo de desfase si no hay nadie que lo lance. *(P1 — ya conocido en TASKS.md)*
2. **Áreas tensadas hardcodeadas** como texto legal: correcto mientras no haya dataset oficial descargable, pero requiere vigilancia manual de cambios normativos.
3. **Precio por edificio sin dato real** (`avgRentEurMonth` vacío hasta convenio Incasòl): la UI ya degrada correctamente; la ampliación no debe prometer dato por vivienda donde solo hay municipio.
4. **13 avisos ESLint preexistentes** (react-compiler) en MapView/ComparadorView/PanelView/use-user-plan — no bloquean, ya documentados.
5. **2 tests fallando en la suite no bloqueante** `funcionalitats.test.ts` (documentados, `continue-on-error`).
6. **README con tabla de versiones desactualizada** (cita hasta v38; estamos en v39) y `docs/PROPUESTA…` menciona Recharts que ya no está en `package.json` (los gráficos son SVG propios). Mantenimiento de docs pendiente.
7. **Secciones censales descartadas** en v38 por decisión de producto (`src/lib/indicators.ts:447`): relevante porque Idescat sí las ofrece (`geo=sec`) — puede revisarse en Fase C.
8. **Mapa sin capas conmutables**: añadir capas nuevas al `MapView` actual requiere cuidado (archivo de 2.046 líneas, sin sistema de capas) — ver `ARQUITECTURA_DATOS.md` §7.
9. **Verificaciones operativas pendientes del ciclo anterior** (fuera del alcance de esta auditoría de código): prueba end-to-end de compra en producción tras el fix v38.10 (`1716bdc`), y confirmación del webhook Stripe «Escuchando: 7 eventos» (el caso `payment_intent.succeeded` está en código; el destino remoto quedó en 6 eventos en la última comprobación).

---

## 6. Componentes reutilizables para la ampliación

| Componente | Archivos | Por qué sirve |
|---|---|---|
| Patrón «tabla-caché estadística» sin migración destructiva | `DataSource` + `StatObservation` + `ImportRun` + `AuditLog` | La v39 integró Idescat de punta a punta sin tocar modelos existentes: es la plantilla para indicadores municipales/seccionales nuevos |
| Clientes HTTP oficiales con retry/timeout/UA | `src/lib/idescat-import.ts`, `ine-import.ts`, `icgc.ts`, `catastro.ts`, `geocode.ts` | Copiar el patrón `fetchTaules` (3 intentos con backoff) para nuevos proveedores |
| Parsers puros con fixtures | `idescat-parse.ts`, `ine-parse.ts`, `tests/fixtures/` | Testabilidad sin llamadas de red |
| Cron de un paso con presupuesto | `src/app/api/_impl/cron/demografia/route.ts` (40 s de presupuesto sobre 60 s de límite) | Plantilla para la ingesta de cada fuente nueva, con reanudación al día siguiente |
| Degradación elegante y cita de fuentes | `DemografiaPanel.tsx` («Dato no disponible», fuente+fecha por indicador) | Modelo de UX para todos los bloques nuevos |
| Gating por plan server-side | `indicators-gating.ts`, `planAllows`, `SubscriptionUsage` | Control FREE/Premium de capas nuevas sin migración |
| Generador de PDF puro con capítulos | `pdf-report.ts` + `report-data.ts` | Añadir capítulos de entorno sin tocar el flujo de compras |
| Provenance pública | `/api/provenance` + `#/metodologia` | Alta de licencia/periodicidad de cada fuente nueva |
| Dispatcher + anti-drift | `scripts/gen_api_dispatcher.py`, `check_repo.mjs` | Todo endpoint nuevo se registra aquí (el build falla si no) |
| Rate-limit PG compartido | `src/lib/rate-limit.ts` | Protección de las rutas nuevas |
| Diccionario bilingüe | `src/lib/i18n.ts` | Textos ca/es de las capas nuevas |

---

## 7. Limitaciones técnicas (condiciones de frontera de la ampliación)

1. **Una sola serverless function** para toda la API (Hobby): el coste por request crece con el bundle; las capas nuevas deben mantenerse ligeras y lazy.
2. **Timeout 60 s**: nada de ingestas ni intersecciones espaciales en caliente; todo se precálcula en ingesta por lotes.
3. **Sin PostGIS**: intersecciones polígono↔polígono fuera de la BD (scripts offline con geopandas/shapely o equivalente Node), resultado persistido como asociaciones.
4. **CSP `connect-src 'self'`**: los servicios externos (SODA, GTFS, SNCZI, Meteocat…) solo se consultan server-side.
5. **Distancias**: no hay red viaria cargada; las distancias serán en línea recta (etiquetadas como tales) hasta que se decida lo contrario.
6. **Grupos de datos con geometrías grandes** (zonas inundables): simplificación de geometría y carga bajo demanda obligatorias.
7. **Plan Hobby de Vercel**: crons limitados a horarios fijos; presupuestos de tiempo en cada paso.

---

## 8. Propuesta de arquitectura futura (resumen; detalle en ARQUITECTURA_DATOS.md)

- **Estadísticas territoriales** (municipio/sección) → tablas genéricas existentes (`DataSource`/`StatObservation`), sin modelos nuevos.
- **Entidades puntuales** (paradas, equipamientos, estaciones de recarga, estaciones de medición) → tabla única `GeoPoint` con `category` + `props JSON` + índices (category, municipalityCode) y (lat, lng).
- **Entidades poligonales** (zonas inundables, ruido, planeamiento) → tabla única `GeoPolygon` con geometría simplificada y asociaciones precalculadas.
- **Asociación edificio↔entorno** → tabla de resultados `BuildingAssociation` (método de asociación + precisión guardados por dato).
- **Trazabilidad** → cada fila conserva fuente, fecha de extracción, fecha del dato, nivel territorial, método de asociación y licencia (vía `DataSource` + metadatos).
- **Ingesta** → crons de un paso (patrón v39) + scripts offline para geoproceso; conservación de la última versión válida.
- **UI** → panel «Serveis i qualitat de l'entorn» en la ficha, con pestañas y capas de mapa activables; PDF con capítulo nuevo.

---

## 9. Riesgos de integración

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Granularidad municipal presentada como dato de edificio (fibra, cobertura) | Alta si no se controla | Credibilidad/legal | Etiquetado por nivel territorial en UI/PDF; estados «dato oficial disponible / estadístico territorial / estimado / sin información» |
| R2 | Servicios externos caídos o bloqueados (403 a clientes no navegador, DNS) | Media | Datos incompletos | Caché de última versión válida; crons reanudables; `/api/health` + `#/estat` |
| R3 | Licencias sin confirmar en varias fuentes (TMB, Renfe, OpenDataBCN, Meteocat) | Media | Legal | Sprint de verificación previo (G0 en el plan); no integrar hasta confirmar |
| R4 | Timeout Vercel en ingestas grandes (GTFS, polígonos) | Alta | Ingesta fallida | Pasos de un solo lote con presupuesto; procesos offline fuera de Vercel cuando excedan 60 s |
| R5 | Bundle/cold start crece y penaliza la función única | Media | Rendimiento general | Importaciones dinámicas, respuesta compacta, caché HTTP (`max-age`/SWR) |
| R6 | Datos de riesgo interpretados como «vivienda segura/insegura» | Media | Legal/ético | Presentación descriptiva, sin inferencia, con fuente y fecha; avisos explícitos |
| R7 | Regresión en funcionalidades existentes | Baja (si se disciplina) | Alto | Tests bloqueantes (85), E2E, dispatcher anti-drift, despliegues incrementales |
| R8 | Fuente oficial cambia de URL/estructura (ya ocurrió con `icgc.cat/ca/Descarregues`) | Alta | Ingesta rota | Versión del dataset en `DataSource`, alerta en `ImportRun`, autodiagnóstico del cron |

---

## 10. Conclusión de la Fase 1

El sistema es ampliable sin reconstrucción: el coste real está en la **ingesta de fuentes** (verificación de licencias y formatos) y en el **rendimiento geográfico**, no en la arquitectura. Se recomienda validar `CATALOGO_FUENTES_DATOS.md`, `ARQUITECTURA_DATOS.md` y `PLAN_IMPLEMENTACION.md` antes de introducir cualquier cambio estructural, conforme al encargo.
