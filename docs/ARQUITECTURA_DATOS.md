# ARQUITECTURA_DATOS.md — Modelo de datos y estrategia de asociación geográfica

| | |
|---|---|
| Fecha | 15 de noviembre de 2026 |
| Base | Auditoría `AUDITORIA_PREUREAL.md` (commit `a5b93e7`, v39) |
| Principio rector | **No destructiva**: no se altera ninguna tabla ni funcionalidad existente. Las 24 tablas actuales quedan intactas; la ampliación añade entidades nuevas y reutiliza los patrones ya probados en v39. |

---

## 1. Principios de diseño

1. **Reutilizar antes de crear**: `DataSource`, `StatObservation`, `ImportRun`, `AuditLog`, rate-limit PG, dispatcher de rutas y el patrón de cron de un paso ya resuelven gran parte del problema (v39 lo demostró con Idescat).
2. **Un identificador territorial por dato**: cada registro declara **a qué nivel territorial es válido** (edificio/parcela, municipio, sección censal, comarca, Cataluña). Jamás se presenta un dato municipal como dato de edificio.
3. **Trazabilidad obligatoria**: fuente, fecha de extracción, fecha del dato, periodo de validez, unidad de medida, nivel geográfico, método de asociación, licencia y estado.
4. **Degradación elegante**: ausencia de dato ≠ cero. «Sin información disponible» es un estado de primera clase (patrón `DemografiaPanel`).
5. **Ingesta fuera del request path**: ninguna consulta a fuentes externas durante una visita de usuario. La ficha solo lee de la BD propia.
6. **Geografía sin PostGIS (por ahora)**: puntos con `Float` + índices (igual que `Building`); polígonos preprocesados offline; intersecciones calculadas en la ingesta, no en runtime.
7. **Extensible**: incorporar una fuente nueva no debe modificar el modelo principal de edificios ni crear tablas por categoría cuando una tabla genérica basta.

---

## 2. Modelo geográfico: identificadores existentes y su uso

| Identificador | Dónde vive hoy | Se usa para asociar |
|---|---|---|
| `Municipality.code` (código censal 6 dígitos) + `ineCode` (5) | PK de `Municipality` | Estadísticas municipales (alquiler, INE, demografía v39, tarifas agua, cobertura SETELECO) |
| `Building.refcat` (+ `externalId` RTT ICGC) | `Building` | Certificados ICAEN (`j6ii-t3w2` trae `referencia_cadastral`), parcelas Catastro WFS |
| `Building.centroidLat/Lng` (índice compuesto) | `Building` | Asociación por proximidad (paradas, equipamientos, estaciones) y bbox |
| `Building.polygonJson` | `Building` | Intersección con zonas inundables (precalculada) |
| Coordenadas WGS84 de puntos externos | (nuevo) `GeoPoint.lat/lng` | Distancias y conteos por radio |
| Sección censal | **No existe hoy** | Fase C vía Idescat `geo=sec` (pendiente decisión de producto; ya disponible en la API) |

**Regla**: si el dato solo existe a nivel municipal (fibra, tarifas, ruido de infraestructuras), se asocia **por municipio** y se etiqueta así; no se fuerza asociación a edificio.

## 3. Métodos de asociación (con su implementación)

| Método | Cómo se implementa | Ejemplos |
|---|---|---|
| 1. Referencia catastral directa | Match de cadena `Building.refcat` ↔ campo de la fuente | Certificados ICAEN |
| 2. Coordenadas | `lat/lng` en `GeoPoint` + distancia haversine en consulta (o bbox + refinado) | Paradas, equipamientos, recarga |
| 3. Intersección de polígonos | **Offline en la ingesta** (script Python con geopandas/shapely o Node+turf): edificio/parcela ∩ polígono → resultado persistido | Zonas inundables T10/T100/T500 |
| 4. Proximidad | Radio configurable (300/500/1000/2000 m) sobre puntos, precalculado o calculado en lectura con índice | Conteo de servicios en radios |
| 5. Municipio | `municipalityCode` (código censal/INE normalizado) | Cobertura, tarifas, ruido infraestructuras |
| 6. Sección censal | Fase C: `secCode` de Idescat → asignado por punto-en-polígono offline | Estadísticas seccionales |

En cada dato asociado se guarda el **método** (`associationMethod`) y su **precisión** (p. ej. `MUNI`, `RADIUS_500`, `INTERSECT`, `REFCAT`).

## 4. Modelo de datos propuesto

### 4.1 Estadísticas territoriales → **sin tablas nuevas**

Indicadores municipales/seccionales numéricos (población, densidad, cobertura %, tarifa agua, contaminante medio, temperatura) → `DataSource` + `StatObservation` **tal cual**, con `variable` convencionalizada:

```
CONEX_FIBRA_PCT_MUNI · CONEX_4G_PCT_MUNI · CONEX_5G_PCT_MUNI
AIGUA_PREU_EUR_M3_MUNI
AIRE_NO2_MICROG_M3 · AIRE_PM10_ · AIRE_PM25_ · AIRE_O3_ (por estación y periodo)
CLIMA_TMEAN_C · CLIMA_TMAX_C · CLIMA_TMIN_C · CLIMA_PRECIP_MM (por estación y año)
```

### 4.2 Entidades puntuales → tabla nueva `GeoPoint` (1 tabla para todas las categorías)

```prisma
model GeoPoint {
  id               String   @id @default(cuid())
  category         String   // TRANSPORT_STOP | PUBLIC_FACILITY | CHARGING_STATION | AIR_STATION | CLIMATE_STATION | PARKING | GREEN_SPACE
  kind             String?  // subtipo: METRO|TREN|FGC|RODALIES|BUS|BICI · HOSPITAL|CAP|FARMACIA|ESCOLA|BIBLIOTECA|ESPORT|CULTURA ...
  externalId       String?  // GTFS stop_id, SODA id, etc.
  name             String
  municipalityCode String?  // código censal normalizado
  lat              Float
  lng              Float
  props            Json?    // líneas que pasan, accesibilidad (GTFS wheelchair), potencia kW, categoría fuente...
  datasetSourceCode String  // FK lógica a DataSource.code
  datasetVersion   String?  // fecha/versión del extracto
  fetchedAt        DateTime
  @@unique([datasetSourceCode, externalId])
  @@index([category, municipalityCode])
  @@index([lat, lng])
}
```

*Por qué una tabla genérica y no 6 tablas*: encaja con la restricción de la función única de Vercel (menos código), mantiene el patrón de las tablas-caché, y el `category` + `props JSON` cubre la variabilidad. Si un subgrupo necesitara columnas propias fuertes (p. ej. `TransportRoute`), se añade después de forma aislada — el esquema lo admite sin tocar `GeoPoint`.

### 4.3 Entidades poligonales → tabla nueva `GeoPolygon`

```prisma
model GeoPolygon {
  id               String   @id @default(cuid())
  category         String   // FLOOD_ZONE | NOISE_EXPOSURE | PLANNING_ZONE
  scenario         String?  // T10 | T100 | T500 (inundación) · LDEN | LNIGHT (ruido) · planeamiento
  hazardLevel      String?  // nivel de peligrosidad publicado, si existe
  municipalityCode String?  // municipio(s) afectados (denormalizado para filtrar)
  geometry         String   // GeoJSON simplificado [[lng,lat]...] (misma convención que Building.polygonJson)
  datasetSourceCode String
  datasetVersion   String?
  fetchedAt        DateTime
  @@index([category, municipalityCode])
}
```

Las geometrías se **simplifican en la ingesta** (p. ej. tolerancia Douglas-Peucker) para mantener payload y coste bajos; el dato de detalle queda referenciado a la fuente para «consultar la cartografía oficial».

### 4.4 Asociación edificio↔entorno → tabla nueva `BuildingAssociation` (capa precalculada)

```prisma
model BuildingAssociation {
  id                String   @id @default(cuid())
  buildingId        String
  category          String   // TRANSPORT | FACILITIES | FLOOD | GREEN | ENERGY_CERT | ...
  refKey            String   // p. ej. stop_id, facility id, geoPolygon id, certificado
  associationMethod String   // REFCAT | INTERSECT | RADIUS_300 | RADIUS_500 | MUNI ...
  value             Json?    // distancia m, líneas, escenario, calificación...
  datasetSourceCode String
  computedAt        DateTime
  @@unique([buildingId, category, refKey])
  @@index([buildingId, category])
}
```

Esto convierte la ficha en **lecturas indexadas sin geoproceso en runtime** y conserva la unidad territorial real de cada dato.

### 4.5 Certificados energéticos — vía `BuildingAssociation` + `StatObservation` no aplica

El certificado ICAEN es un dato **por edificio**: ingesta por match de `refcat` → fila en `BuildingAssociation` (category `ENERGY_CERT`, value = calificación consumo/emisiones, año, herramienta). El `Building.yearBuilt` existente no se toca.

### 4.6 Registro de sincronizaciones → **reutilizar `ImportRun`** (+ extensión mínima opcional)

`ImportRun` ya guarda source, estado OK/PARTIAL/ERROR, created/updated/skipped y error — cumple el requisito del encargo (última correcta, última intentada, registros nuevos/modificados, errores). La única carencia es «registros eliminados»: se registra en el campo `error`/observaciones del run o en una extensión futura (`deleted` opcional). **Histórico de versiones**: `datasetVersion` + `fetchedAt` por fila y el run; conservación de la última versión válida: los importadores no borran hasta que la carga nueva es correcta (comportamiento ya implementado en v39).

## 5. Trazabilidad por dato (cumplimiento Fase 7 del encargo)

| Campo exigido | Dónde |
|---|---|
| Fuente original | `DataSource` (`code`, `institution`) + `datasetSourceCode` en fila |
| Fecha de extracción | `fetchedAt` / `ImportRun.createdAt` |
| Fecha del dato | `datasetVersion` (periodo de referencia) y `period` en `StatObservation` |
| Periodo de validez | `DataSource.periodicity` + ventana de frescor del importador |
| Unidad de medida | `DataSource.unit` |
| Nivel geográfico | `StatObservation.geoLevel` / `associationMethod` en asociaciones |
| Método de obtención | Documentado en `DataSource.methodology` (ya existe) |
| Calidad/fiabilidad | Estados de presentación: `OFICIAL_DISPONIBLE`, `ESTADISTICA_TERRITORIAL`, `ESTIMADO`, `SIN_INFORMACION` |
| Licencia | `DataSource.license` + `/api/provenance` + página `#/metodologia` |
| Estado de actualización | `ImportRun` + `/api/health` + `#/estat` |

## 6. Ingesta y sistema de actualización (Fase 6 del encargo)

- **Patrón**: crons Vercel de **un paso** con presupuesto ≤ 40 s (plantilla `nextDemografiaStep`), reanudables al día siguiente, con reintentos 3× backoff y `ImportRun` por ejecución. Si una fuente cae, los datos vigentes no se tocan.
- **Cadencias** (ajustadas a la frecuencia real de publicación):

| Fuente | Cadencia | Vía |
|---|---|---|
| SETELECO cobertura (XLSX) | Anual | Descarga server-side + parser |
| GTFS ATM/FGC/bus interurbà | Mensual (publicaciones por operador) | Zip → parser stops/routes |
| Equipamientos (SODA nrmq/kvmv/8gmd/v366) | Semanal (SODA barato) | `$where=:updated_at>` incremental |
| Inundables (SNCZI/ACA) | Trimestral | Descarga shapefile → geoproceso offline → subida de asociaciones |
| Ruido BCN (GPKG) | Semestral | Descarga GPKG |
| XVPCA | Diaria (horario) o semanal (agregados) | SODA |
| ICAEN certificados | Mensual | SODA incremental por `updated_at` |
| Recarga eléctrica | Semanal | SODA |
| ACA tarifas agua | Anual | XLSX |
| Meteocat/AEMET | Diaria (observación) + anual (normales) | API con clave (nueva env, server-side) |
| Idescat secciones (Fase C) | Trimestral | API Indicadors `geo=sec` |

- **Geoproceso pesado** (intersecciones inundables, asignación seccional): script fuera de Vercel (local/CI manual) que produce JSON de asociaciones; ingesta por lotes vía endpoint admin/cron — nunca en runtime.
- **Registro**: cada fuente con su `DataSource` y sus `ImportRun`; errores visibles en `#/estat`.

## 7. APIs de servicio (cumplimiento Fases 5 y 8 del encargo)

Nuevos handlers en `src/app/api/_impl/**` **registrados en el dispatcher** (el build falla si no):

```
GET /api/entorn/:buildingIdOrRefcat?radius=300|500|1000|2000&cats=TRANSPORT,FACILITIES...
GET /api/entorn/muni/:code            (estadísticas municipales del entorno: cobertura, tarifas, clima)
GET /api/entorn/map/points?bbox=&cats=&zoom=    (capas del mapa, paginado, limit por categoría)
GET /api/entorn/map/polygons?bbox=&cats=FLOOD|NOISE|PLANNING  (solo zoom apto)
```

- Caché HTTP igual que demografía (`max-age=3600, stale-while-revalidate=86400`), rate-limit PG por IP, gating por plan cuando proceda (`indicators-gating`).
- **Las distancias en línea recta se etiquetan** («distància lineal, no itinerari a peu») hasta que exista red viaria procesable.
- Radios fijos 300/500/1000/2000 m; conteos precalculados para los 4 radios estándar, distancias exactas calculadas solo para los N más próximos.

## 8. Rendimiento y seguridad

- Índices ya definidos en el modelo (`category+municipalityCode`, `lat+lng`, `buildingId+category`).
- Carga por zoom: puntos solo a zoom ≥ 14, polígonos ≥ 12; límites de respuesta (≤ N puntos por categoría) y simplificación de geometrías.
- Claves de API externas (Meteocat, AEMET, TMB si aplica) → variables de entorno server-side; nada en el frontend (CSP lo impone).
- Licencias: atribución por fuente en UI (`provenance`), en PDF y en la página de metodología; descargas masivas prohibidas (Catastro) — ingesta por municipio y cadencia.
- RGPD: solo datos públicos agregados; ninguna medición individual.

## 9. Compatibilidad y no regresión

- Ningún modelo existente se altera; las 3 tablas nuevas (`GeoPoint`, `GeoPolygon`, `BuildingAssociation`) se añaden por migración independiente y reversible.
- Las funcionalidades actuales (mapa de precios, ficha, informes, shop, crons v39) no cambian de comportamiento; los bloques nuevos son aditivos.
- Suite de 85 tests bloqueantes + E2E como red de seguridad en cada fase.
