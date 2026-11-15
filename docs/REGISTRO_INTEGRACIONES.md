# REGISTRO_INTEGRACIONES.md — Datos y servicios efectivamente incorporados

Registro vivo de cada integración real (fuente, fecha, alcance, estado). Actualizado por commit.

| # | Fuente (dataset) | Bloque | Integrada el | Commit | Alcance efectivo | Estado |
|---|---|---|---|---|---|---|
| 1 | ICAEN — Certificats d'eficiència energètica d'edificis (`j6ii-t3w2`, 1.342.960 files) | Energía | 2026-11-15 | v40 | **Lookup on-demand por referencia catastral** al abrir la ficha de un edificio; resultado cacheado 30 días en `BuildingAssociation` (categoría ENERGY_CERT, método REFCAT). Verificación real: refcat `8761106DG6086S0001MG` → 1 certificado (consumo A, emisiones A). | **ACTIVA** (UI: bloque Eficiencia de la ficha) |
| 2 | ICAEN — Estacions de recàrrega EV (`tb2m-m33b`) | Movilidad privada | 2026-11-15 | v40 | **2.353 estaciones sembradas en producción** (ingesta íntegra idempotent, 7,8 s). | **ACTIVA Y VERIFICADA EN PRODUCCIÓN** |
| 3 | CatSalut — Establiments sanitaris autoritzats (`nrmq-ytje`) | Equipamientos (salud) | 2026-11-15 | v40 | **5.609 establecimientos sembrados en producción** (71 sin coordenadas → descartados, nunca inventados). | **ACTIVA Y VERIFICADA EN PRODUCCIÓN** |
| 4 | Educació — Directori de centres docents (`kvmv-ahh4`) | Equipamientos (educación) | 2026-11-15 | v40 | **Sembrado en producción: 16/16 lotes OK** — 5.428 centros del curso vigente (filtro `max(curs)`, dedup por `codi_centre`) → `GeoPoint` (EDUCACIO con niveles en props). | **ACTIVA Y VERIFICADA EN PRODUCCIÓN** |
| 5 | DGSD — Equipaments de Catalunya (`8gmd-gz7i`) | Equipamientos (cultura, deporte) | 2026-11-15 | v40 | **Sembrado en producción: 16/16 lotes OK** — 10.901 equipamientos Cultura/Esports → `GeoPoint` (CULTURA / ESPORT). 1.025 solo Barcelona ciudad. | **ACTIVA Y VERIFICADA EN PRODUCCIÓN** |
| 6 | Idescat — Cens 2021 «Habitatges principals per règim de tinença» (`taules/v2/censph/310/20419`) | Indicador % de alquiler (v41) | 2026-11-15 | v41 | **615 municipios + Cataluña** importados a `StatObservation` (CENS_MAIN_*, 3.080 obs; e2e local 6,9 s). Códigos MUN = `Municipality.code` (615/615 match verificado). Contraste cifras publicadas: Manresa 8.793/31.029 (28,34 %), Barcelona 208.467/671.178, Cataluña 692.285. | **ACTIVA Y VERIFICADA EN LOCAL** |
| 7 | Incasòl via Dades Obertes — flux anual de fiances (`qww9-bvhh`, filtro `gener-desembre` + `Municipi`) | Indicador % de alquiler (v41) | 2026-11-15 | v41 | **15.297 obs municipio-año (2007-2025), 0 skipped** (fallback ineCode documentado: 255 municipios del seed sin `ineCode` → derivación desde el código censal 6 dígitos). Solo REFERENCIA de mercado; nunca numerador. | **ACTIVA Y VERIFICADA EN LOCAL** |
| 8 | PreuReal — indicador compuesto «% estimado de alquiler sobre el parque residencial» (`PREUREAL_CALC_RENTAL_SHARE`) | Indicador % de alquiler (v41) | 2026-11-15 | v41 | 615 filas `CENS_REF_ONLY` en `RentalShareObservation` (numerador stock y denominador catastral sin fuente municipal abierta — verificado; conector `/api/admin/import-rental-share` preparado con dryRun). Piloto Manresa contrastado con fuentes originales por código independiente. | **ACTIVA (estado honesto: contraste censal)** |
| 9 | Conectores pendientes: Incasòl fiances VIGENTES (stock) + Catastro inmuebles uso residencial | Indicador % de alquiler (v41) | — | v41 | Verificado que NO existen publicaciones municipales abiertas (catálogo Socrata: solo flujo; saldo XLSX solo Cataluña; DNP/INE inaccesibles desde el entorno). Especificación y conector listos en `docs/INDICADOR_ALQUILER_PARQUE.md` §5. | **PREPARADO — esperando fuente** |

## Infraestructura añadida en v41 (indicador % de alquiler)

| Componente | Archivos | Notas |
|---|---|---|
| Tabla `RentalShareObservation` | migración `20261115140000_rental_share` (aditiva) | Histórico del cálculo con `referenceKey`, validaciones, `dataStatus`, `warnings`, `methodologyVersion`; clave única (municipalityCode, referenceKey) |
| Componentes en `StatObservation` (tabla existente) | `src/lib/rental-share.ts` | 5 `DataSource` nuevos (cens, flux, vigentes-pendiente, parc-pendiente, calc derivado) |
| Parsers puros + calculadora con validaciones | `src/lib/rental-share-parse.ts` | Fixtures reales en `tests/fixtures/rental-share/` |
| Importadores idempotentes + recálculo set-based | `src/lib/rental-share.ts` | Ventana de sustitución por variable; recálculo 947 municipios |
| API pública + ranking | `_impl/rental-share`, `_impl/rental-share/ranking` (dispatcher regenerado: 89 rutas) | Rate limit, cache 1 h + SWR |
| Cron mensual `/api/cron/rental-share` (día 5, 20:00 UTC) | `_impl/cron/rental-share`, `vercel.json` | Cens + flux + recálculo; presupuesto 40 s |
| Conector admin `POST /api/admin/import-rental-share` | `_impl/admin/import-rental-share` | dryRun, validación estricta, ImportRun + AuditLog |
| UI: sección ficha SSR + panel mapa + comparador + metodología | `lloguer/[slug]/page.tsx`, `RentalSharePanel.tsx`, `ComparadorView.tsx`, `MetodologiaView.tsx` | Ca/es; degradación honesta; flujo siempre etiquetado |
| Tests | `tests/rental_share.test.ts` (26) | Suite bloqueante CI: 89 → **115 tests** (los 7 fallos locales son preexistentes de `main`, entorno sandbox sin CI) |

## Infraestructura añadida en v40 (habilita el resto de fases)

| Componente | Archivos | Notas |
|---|---|---|
| Tablas `GeoPoint` / `GeoPolygon` / `BuildingAssociation` | `prisma/schema.prisma`, migración `20261115120000_entorn_geo` | Aditivas; `BuildingAssociation` con FK a `Building` |
| Importador SODA con reintentos y trazabilidad | `src/lib/entorn-import.ts` | DataSource + ImportRun + AuditLog por fuente; sustitución idempotent por lote |
| Parsers puros + geo (haversine, bbox, radios 300/500/1000/2000) | `src/lib/entorn-parse.ts` | Testables con fixtures reales (`tests/fixtures/entorn/`) |
| Capa de lectura de ficha | `src/lib/entorn.ts` | Sin geoproceso en runtime; degradación elegante |
| API pública `GET /api/entorn/:id` | `_impl/entorn/[id]` (registrada en dispatcher) | Rate limit 30/min IP; cache 1 h + SWR 24 h |
| Cron `/api/cron/entorn` (diario 06:15 UTC, presupuesto 40 s multi-paso) | `_impl/cron/entorn`, `vercel.json` | Sembrado completo en 2-3 días de cron; ventana de frescor 60 días |
| UI «Serveis i qualitat de l'entorn» en la ficha | `src/components/views/EntornPanel.tsx` + MapView | Radios conmutables 300/500/1000/2000 m; ca/es; nunca inventa datos |
| Tests | `tests/entorn.test.ts` (16) | Suite bloqueante: 89 → **105 tests** |

## Pendiente de integrar (Fase A restante y siguientes)

- **Conectividad (A1)**: URL del XLSX SETELECO verificada en G0 (`..._DEF.xlsx`, 9 hojas «Municipio_%hogar / %viviendas»), pero el CDN de digital.gob.es sirve HTML desde este entorno — se integrará con guardas de contenido (firma ZIP) en la siguiente iteración.
- **Transporte (A2)**: GTFS FGC (CC BY 4.0 vía Huwise) + estaciones Renfe (CC BY 4.0) + GTFS agregado t-mobilitat (cola virtual pendiente de navegador real).
- **Inundabilidad (A5)**: SNCZI/ACA (T10/T100/T500) con geoproceso offline.
- **Zonas verdes (A4)**: OpenDataBCN `espais-verds-publics` (GPKG, CC BY 4.0) para Barcelona; MUCS no existe en ICGC (verificado).
- **Fase B/C**: ruido BCN (GPKG Lden/Nit), XVPCA (tasf-thgu con lat/lng por fila), Meteocat (clave gratuita por trámite), urbanismo MUC (WFS/SHP confirmados), PRTR-es.miteco.gob.es.

## Verificación end-to-end en producción (15-11-2026, post-deploy)

- Cron `/api/cron/entorn`: **sembrado completo en 6 invocaciones** (bucle multi-paso de 40 s); `done: true`.
- `GET /api/entorn/<id>` con 3 edificios reales del Eixample: contadores por radios 300/500/1000/2000 correctos por tipología (p. ej. FARMACIA 9/23/85/319; CULTURA 11/35/136/437; EDUCACIO 8/19/68/270; recàrrega 6 a 2 km).
- Flujo on-demand ICAEN con edificio con refcat (9628916DF2892H): consulta real al registro → 0 certificados → degradación honesta «Sense certificat localitzat… mai s'inventa» (coincide con consulta directa a la fuente).
- Incidencias corregidas en caliente durante el sembrado (lecciones → tests/regla): duplicados por curso en el directori docents (dedup + filtro `max(curs)`), límite de 65.535 parámetros de Postgres en createMany (tandas de 400) y `codi_centre` duplicados entre lotes con municipio distinto (upsert real: delete por externalId antes de insertar).
