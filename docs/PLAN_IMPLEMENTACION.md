# PLAN_IMPLEMENTACION.md — Fases, prioridades, dependencias y estimación de dificultad

| | |
|---|---|
| Fecha | 15 de noviembre de 2026 |
| Entrada | `AUDITORIA_PREUREAL.md` + `CATALOGO_FUENTES_DATOS.md` + `ARQUITECTURA_DATOS.md` |
| Regla del encargo | «No desarrolles las 15 categorías simultáneamente… la prioridad definitiva deberá ajustarse a la disponibilidad, licencia, granularidad y calidad de los datos». |

## 0. Ajustes de prioridad justificados por la auditoría

- **Eficiencia energética (ICAEN `j6ii-t3w2`)** estaba en Fase B del encargo; el catálogo la sitúa en **clase A con asociación directa por referencia catastral**. Propuesta: adelantarla como *quick win* de la Fase A (coste bajo, valor alto).
- **Zonas verdes** (Fase A del encargo) queda **condicionada al sprint G0** (MUCS/ICGC sin verificar; solo Barcelona confirmado). Se desarrolla con lo verificado y se amplía si G0 cierra la fuente catalana.
- **Aparcamiento público**: clase D para Cataluña — se reduce a estaciones de recarga (A) + aparcamientos FGC (B).
- El módulo demográfico v39 ya cubre el bloque 4.10 a nivel municipal; la sección censal (Idescat `geo=sec`) pasa a Fase C como decisión de producto pendiente.

## 1. Vista global

| Fase | Contenido | Estado de fuentes | Dificultad |
|---|---|---|---|
| **G0** | Sprint de verificación de licencias/formatos pendientes | 10 puntos abiertos del catálogo | S |
| **A (1ª entrega)** | 1. Conectividad municipal · 2. Transporte (GTFS) · 3. Equipamientos · 4. Zonas verdes (condicionada) · 5. Inundabilidad · 6. Energía (quick win) · 7. Recarga eléctrica | 4×A, 2×B, 1 condicionada | M–L |
| **B (2ª entrega)** | 8. Ruido (BCN GPKG + referencia PDF) · 9. Calidad del aire (XVPCA) · 10. Accesibilidad (GTFS) · 11. Aparcamiento FGC/BCN · 12. Clima local (Meteocat/AEMET) | A×3, B×2 | M |
| **C (3ª entrega)** | 13. Demografía seccional (Idescat `geo=sec`) · 14. Urbanismo (visores/enlaces + MUC si se verifica) · 15. Riesgos industriales (PRTR) · 16. Suministros (agua ya A; el resto sin fuente) | A×2, C×2, D×1 | M |

Dependencia dura: **G0 → A** (transporte y zonas verdes necesitan licencias/formatos confirmados). B y C pueden solaparse parcialmente con A por independencia de fuentes.

## 2. G0 — Sprint de verificación (1 sesión, sin código de producción)

Objetivos: cerrar los 10 pendientes del catálogo. Salida: actualización de `CATALOGO_FUENTES_DATOS.md` con clases definitivas y, si procede, alta de `DataSource` iniciales.
Criterio de éxito: para cada fuente → licencia conocida o marcada «no integrar», formato de descarga probado con una muestra real, y URL estable anotada.

## 3. FASE A — Primera entrega funcional

Objetivo del encargo: «una primera versión funcional que añada información útil a los edificios existentes».

### A1. Conectividad digital (M)
- Fuente: SETELECO XLSX municipal (A). Entidad: `StatObservation` (`CONEX_*`), nivel municipal.
- UI: bloque «Connectivitat» en ficha (fibra/móvil declarado **a nivel municipal**, con estado `ESTADISTICA_TERRITORIAL`); nunca «esta vivienda tiene fibra».
- PDF: párrafo + tabla de conectividad municipal en el capítulo de contexto.
- Tests: parser XLSX con fixture; degradación sin dato.

### A2. Transporte público (L)
- Fuentes: GTFS ATM/CGIM (B) + FGC `5g2a-an2v` (B) + bus interurbà `bca2-b4i3` (B).
- Entidades: `GeoPoint` (TRANSPORT_STOP con kind METRO/TREN/FGC/RODALIES/BUS; props: líneas, `wheelchair_accessible`) + `BuildingAssociation` (paradas más próximas por tipo con distancia lineal etiquetada).
- API: `/api/entorn/:building` (TRANSPORT). UI: bloque «Mobilitat» con paradas por tipo, distancia y líneas; capa de mapa activable.
- Ingesta: cron mensual por pasos (stops por operador en lotes ≤ 40 s).
- Tests: parser GTFS (fixtures), conteos por radio, gating.

### A3. Equipamientos (M)
- Fuentes: sanitaris `nrmq-ytje` (A, incluye farmacias), docents `kvmv-ahh4` (A), biblioteques `v366-9743` (B, geocodificar ICGC), equipaments `8gmd-gz7i` (A, tras confirmar Terms of Use en G0).
- Entidades: `GeoPoint` PUBLIC_FACILITY (kind CAP/HOSPITAL/FARMACIA/ESCOLA/BIBLIOTECA/ESPORT/CULTURA…) + asociaciones por radio 300/500/1000/2000.
- UI: bloque «Serveis» filtrable por categoría y distancia; capa de mapa.
- Tests: filtros, distancias, deduplicación entre fuentes.

### A4. Zonas verdes (S–M, condicionada a G0)
- Barcelona: `espais-verds-publics` (A-/B); Cataluña: MUCS si G0 lo cierra; si no, degradar a «sin información a nivel catalán, disponible en municipios que publican».
- Entidades: `GeoPoint` GREEN_SPACE (centroide) o `GeoPolygon` si hay geometrías pequeñas; asociación «distancia al espacio verde más próximo».

### A5. Inundabilidad (L)
- Fuentes: SNCZI descargas (B, formato a confirmar en G0) / capas ACA LI10/LI100/LI500 (B).
- Proceso: descarga → reproyección → intersección edificio/parcela ∩ zona → `BuildingAssociation` (INTERSECT, scenario T10/T100/T500) + `GeoPolygon` simplificado para capa de mapa.
- UI: bloque «Riscs» con escenario, fuente, fecha y aviso descriptivo (sin inferencia de «libre de riesgo»); capa de mapa por escenario.
- Tests: intersección con geometrías de muestra; textos ca/es; estados de ausencia de información.

### A6. Eficiencia energética — quick win (S–M)
- Fuente: ICAEN `j6ii-t3w2` (A). Asociación directa `refcat`.
- Entidades: `BuildingAssociation` (ENERGY_CERT: calificación consumo/emisiones, año, herramienta).
- UI: bloque «Eficiència» en ficha de edificio con estado «dato certificado» y fuente ICAEN+fecha; PDF (capítulo edificio).
- Limitación mostrada: cobertura parcial (solo edificios certificados); «sin información» explícito.

### A7. Estaciones de recarga (S)
- Fuente: `tb2m-m33b` (A). `GeoPoint` CHARGING_STATION (kW, AC/DC) + asociación por proximidad. Bloque «Mobilitat privada».

### Cierre de Fase A
- Sección «Serveis i qualitat de l'entorn» en la ficha con pestañas Conectividad/Mobilitat/Serveis/Riscs/Eficiència; capas de mapa activables (Leaflet `layerGroup` + control); capítulo PDF ampliado con fuentes y fechas por indicador.
- Validación en 5 contextos (Barcelona, metropolitano, ciudad mediana — Girona/Lleida, municipio pequeño, rural) + rendimiento (payloads, zoom gating) + suite completa verde.

## 4. FASE B — Segunda entrega

| Bloque | Fuente (clase) | Notas de implementación | Dificultad |
|---|---|---|---|
| Ruido | BCN GPKG (A, CC BY 4.0) + PDFs Generalitat (C, referencia) | Raster/fachadas → exposición territorial; solo BCN integrado, resto enlace a mapas oficiales | M |
| Calidad del aire | XVPCA `tasf-thgu`/`qg74-87s9` (A) | Estación más próxima + medias por periodo; nunca atribución a parcela | M |
| Accesibilidad | GTFS `wheelchair_accessible` (B condicionada) | Estaciones/paradas accesibles; equipamientos si la fuente municipal lo da | S |
| Aparcamiento | FGC `s88n-4t2p` (B) / BCN (C) | Solo lo disponible; sin dataset catalán centralizado (D) | S |
| Clima local | Meteocat XEMA (A, clave) + AEMET (A/B) | Normales climatológicas por estación próxima; contexto, no predicción | M |

## 5. FASE C — Tercera entrega

| Bloque | Fuente (clase) | Notas | Dificultad |
|---|---|---|---|
| Demografía seccional | Idescat `geo=sec` (A) | Decisión de producto previa (v38 la descartó); requiere asignación punto→sección offline | M |
| Urbanismo | MUC/RPUC (C) | Integración solo si G0/laboratorio posterior cierra descargas; mientras, enlaces a visores oficiales | M (si hay datos) / S (solo enlaces) |
| Riesgos industriales | PRTR (D provisional) | Reintento G0; sin evidencia oficial → no etiquetar | S (si hay fuente) |
| Suministros | ACA agua (A) ya en A; electricidad/gas | Sin dataset territorial identificado → «sin información disponible» | S |

## 6. Estimación de dificultad (leyenda)

S = ≤ 1 día de trabajo · M = 2–4 días · L = 5–10 días · XL = > 10 días. Todas las fases incluyen: ingesta + tests con fixtures + UI ca/es + capa de mapa + documento de `REGISTRO_INTEGRACIONES.md` actualizado.

## 7. Criterios de aceptación (por fase)

1. Fuentes responden y quedan registradas (`DataSource`/`ImportRun`).
2. Datos importados con validación de coordenadas y conteos (`ImportRun` created/updated/skipped).
3. Asociaciones edificio↔entorno correctas en muestras de los 5 contextos.
4. Distancias y conteos verificados contra cálculo manual (muestreo).
5. Sin duplicados (claves únicas respetadas).
6. Filtros y capas de mapa funcionan; estado «sin información» correcto donde no hay dato.
7. Desktop y móvil (E2E Playwright) sin regresiones; rendimiento sin impacto en el mapa base.
8. Funcionalidades originales intactas: 85 tests bloqueantes + E2E + sondas de producción.
9. Atribuciones de licencias visibles (UI, PDF, metodología, `/api/provenance`).

## 8. Entregables de seguimiento (Fases restantes del encargo)

- `REGISTRO_INTEGRACIONES.md`: se crea al iniciar Fase A y se actualiza por bloque integrado.
- `LIMITACIONES_DATOS.md`: se consolida durante Fase A/B (partiendo de las limitaciones por ficha del catálogo).
- `TESTS_Y_VALIDACION.md`: informe por fase con resultados de las 5 ubicaciones de validación y rendimiento.

## 9. Riesgos de planificación

| Riesgo | Plan de contingencia |
|---|---|
| G0 no cierra licencia de GTFS/ATM | Fallback: Socrata FGC + bus interurbà (B) y estaciones Renfe (C, tras revisión legal); transporte parcial |
| SNCZI sin descarga usable | Capa vía WMS ACA (renderizado) + asociación por proximidad a cauces (ICGC) marcada como aproximación |
| MUCS inexistente/inaccesible | Zonas verdes solo municipal (BCN + municipios que publiquen); etiquetado claro |
| Timeout en intersecciones inundables | Geoproceso offline fuera de Vercel + ingesta por lotes |
| Fuente cambia de URL/estructura (ya ocurrió con ICGC) | `ImportRun` con error visible en `#/estat`; reanudación al día siguiente; última versión válida conservada |

## 10. Orden de ejecución propuesto (al validar este plan)

1. G0 (verificación, 1 sesión).
2. Migración con las 3 tablas nuevas + `DataSource` de Fase A + `REGISTRO_INTEGRACIONES.md`.
3. A6 energía (quick win) y A7 recarga (SODA simples) → primera integración visible end-to-end.
4. A3 equipamientos → A1 conectividad → A2 transporte → A5 inundabilidad → A4 zonas verdes.
5. Cierre de Fase A: sección de ficha unificada, capas, PDF, validación 5 contextos, `TESTS_Y_VALIDACION.md`.

---

## Estado de ejecución (15-11-2026)

- **G0 — COMPLETADO**: 17 verificaciones cerradas (tabla en CATALOGO_FUENTES_DATOS.md). Pendientes externas: alta TMB (registro propietario), GTFS agregado t-mobilitat (cola virtual), WAF AEMET.
- **FASE A — EN CURSO (v40)**: migración 3 tablas + importadores SODA (energía ICAEN on-demand, recarga, sanitarios, docentes por lotes, equipaments Cultura/Esports) + cron multi-paso + `GET /api/entorn/:id` + panel UI con radios 300/500/1000/2000 + 105 tests bloqueantes en verde. Detalle: REGISTRO_INTEGRACIONES.md y TESTS_Y_VALIDACION.md.
- **Fase A restante**: A1 conectividad (XLSX _DEF con guardas), A2 transporte (FGC/Renfe CC BY 4.0 + t-mobilitat RT), A4 zonas verdes (BCN GPKG; MUCS inexistente), A5 inundabilidad (SNCZI/ACA), capas de mapa activables y capítulo PDF.
- **Nota de despliegue**: añadir `tests/entorn.test.ts` a la línea bloqueante de `.github/workflows/ci.yml` (edición del propietario vía web, sin scope workflow del token).
