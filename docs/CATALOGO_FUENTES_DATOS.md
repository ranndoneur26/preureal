# CATALOGO_FUENTES_DATOS.md — Inventario verificado de fuentes públicas para la ampliación

| | |
|---|---|
| Fecha | 15 de noviembre de 2026 |
| Método | Verificación en línea de cada fuente (apertura real de páginas oficiales y pruebas de API). Cada ficha indica **qué URL se abrió realmente** y qué se vio. |
| Clases de viabilidad | **A** acceso público, reutilización permitida e integración directa · **B** acceso público pero requiere transformación/procesamiento · **C** acceso condicionado, restricciones o información insuficiente · **D** no viable actualmente |
| Regla de oro | No se han inventado APIs, endpoints ni licencias. Donde no pudo verificarse, consta **NOT VERIFIED**. |

## Tabla resumen

| # | Fuente | Bloque | Clase | Cobertura | Unidad territorial |
|---|---|---|---|---|---|
| 1.1 | MTD/SETELECO — cobertura banda ancha (XLSX municipal) | Conectividad | **A** | España | Municipio (fija + móvil) |
| 1.2 | CNMCData — infraestructura móvil (CSV/JSON trimestral) | Conectividad | A* | España | Agregado nacional (sin utilidad territorial) |
| 1.3 | CNMC — visor de cobertura | Conectividad | C | España | Coordenada (tests de usuarios) |
| 2.1 | ATM/CGIM — portal dades obertes (GTFS integrado) | Transporte | **B** | Cataluña | Paradas/líneas (GTFS) |
| 2.2 | FGC — Dades Obertes (OpenDataSoft) + Socrata `5g2a-an2v` (estacions GTFS) | Transporte | B | Cataluña | Estaciones/líneas |
| 2.3 | Bus interurbà Generalitat (Socrata `bca2-b4i3`) | Transporte | B | Cataluña | Paradas/líneas/horarios |
| 2.4 | TMB — data.tmb.cat | Transporte | C | Barcelona | Paradas/líneas (API key NOT VERIFIED) |
| 2.5 | AMB Mobilitat / opendata.amb.cat | Transporte | C | Área metropolitana | Paradas (403 en la prueba) |
| 2.6 | Renfe — data.renfe.com (CKAN, 44 datasets) | Transporte | C | España | Estaciones/horarios (licencia no clara) |
| 3.1 | Establiments sanitaris autoritzats (Socrata `nrmq-ytje`) | Equipamientos | **A** | Cataluña | Establecimiento con lat/lon (incluye farmacias) |
| 3.2 | Directori de centres docents (Socrata `kvmv-ahh4`) | Equipamientos | **A** | Cataluña | Centro con coordenadas |
| 3.3 | Cens de biblioteques (Socrata `v366-9743`) | Equipamientos | B | Cataluña | Biblioteca sin coords → geocodificar |
| 3.4 | Equipaments de Catalunya (Socrata `8gmd-gz7i`) + culturals `48s6-82h2` | Equipamientos | **A** | Cataluña | Equipamiento con lat/lon (multicategoría) |
| 3.5 | Open Data BCN (equipamientos, bicing, paradas) | Equipamientos | C | Barcelona | 403 a clientes automatizados; datasets confirmados por búsqueda |
| 4.1 | ACA — visor de zonas inundables (LI10/LI100/LI500) | Riesgo inundación | B | Cataluña | Polígono (T10/T100/T500) |
| 4.2 | MITECO SNCZI — portal GIS + WMS + descargas | Riesgo inundación | B | España | Polígono por demarcación |
| 5.1 | Mapes estratègics de soroll de Catalunya | Ruido | C | Cataluña | Solo PDF/memorias; GIS NOT VERIFIED |
| 5.2 | OpenDataBCN — rasters mapa estratégico de ruido (GPKG Lden/Nit, CC BY 4.0) | Ruido | **A** | Barcelona | Raster/fachadas |
| 6.1 | XVPCA — calidad del aire (Socrata `tasf-thgu` horario, `qg74-87s9` diario) | Calidad del aire | **A** | Cataluña | Estación (punto) |
| 7.1 | ICAEN — certificados de eficiencia energética (Socrata `j6ii-t3w2`) | Energía | **A** | Cataluña | **Edificio con referencia catastral** |
| 8.1 | Zonas verdes Barcelona (`espais-verds-publics` CKAN) | Zonas verdes | A-/B | Barcelona | Espacio verde (formatos NOT VERIFIED) |
| 8.2 | MUCS ICGC (usos del suelo) | Zonas verdes | — | — | **NOT VERIFIED** (no localizado en icgc.cat) |
| 9.x | Accesibilidad (GTFS `wheelchair_accessible`, datos municipales) | Accesibilidad | B (condicionada) | Variable | Parada/estación/equipamiento |
| 10.1 | Idescat — API Indicadors (`geo=mun`, **`geo=sec` secciones censales**) | Demografía | **A** | Cataluña | Municipio y sección censal |
| 10.2 | INE — API JSON Tempus3 | Demografía | **A** | España | Tabla/serie (municipal ya integrada en v38) |
| 11.1 | MUC + RPUC + visor urbanístico (territori.gencat.cat) | Urbanismo | C | Cataluña | Visores existentes; descargas/WMS NOT VERIFIED |
| 12.1 | PRTR-España (prtr-es.es) | Riesgos industriales | D*/— | España | Sitio inaccesible en las pruebas |
| 13.1 | ACA — Observatori del preu de l'aigua (XLSX por municipio) | Suministros | **A** | Cataluña | Municipio |
| 14.1 | Meteocat — API XEMA (clave, 403 sin token verificado) | Clima | **A** | Cataluña | Estación meteorológica |
| 14.2 | AEMET OpenData (clave) + normales climatológicas | Clima | A / B | España | Estación |
| 15.1 | Estaciones de recarga eléctrica (Socrata `tb2m-m33b`) | Movilidad privada | **A** | Cataluña | Estación con lat/lon, kW, AC/DC |
| 15.2 | Aparcamiento público / zonas reguladas Cataluña | Movilidad privada | **D** | — | **Sin fuente centralizada**; solo FGC (`s88n-4t2p`) y fuentes locales |
| T.1 | Catastro INSPIRE — WFS `wfsCP.aspx` (CadastralParcel/Zoning), WMS, ATOM por municipio (2 veces/año), «uso libre y gratuito», «no descarga masiva» | Base cartográfica | **A** (puntual) / D (masiva) | España | Parcela/edificio/dirección |
| T.2 | ICGC — geocodificador (docs + Swagger) y visor de descargas (shp, dxf, csv, mbtiles…) | Base cartográfica | **A** | Cataluña | Dirección→coordenada; hojas/áreas |

\* A con la limitación indicada.

---

## 1. Conectividad digital

### 1.1 MTD/SETELECO — Cobertura de banda ancha (fiel al encargo: fuente prioritaria del Ministerio)
- **Organismo**: Ministerio para la Transformación Digital y Función Pública (SETELECO).
- **URL verificada**: `https://digital.gob.es/telecomunicaciones-infraestructuras-digitales/areas-interes/banda-ancha/informacion-cobertura` (abierta; texto SETELECO visto).
- **Formatos**: XLSX descargables («Cobertura Banda Ancha España 2021-2025» municipal/provincial/CCAA/nacional, 6,4 MB; serie 2013-2020 por Entidad Singular de Población) + mapas interactivos enlazados (no abiertos en la verificación).
- **Frecuencia**: recopilación **anual** (texto visto); mapas «a 30 de junio de 2024».
- **Cobertura**: toda España; **unidad: municipio** para el XLSX. Tecnologías incluidas: fija y móvil (3G/4G/5G aparecen en el visor).
- **Licencia**: no declarada en la página abierta.
- **Asociación a ref. catastral**: no (clave municipal).
- **Transformación**: filtrar filas de Cataluña; normalizar códigos INE.
- **Limitaciones**: granularidad municipal — **no presenta disponibilidad confirmada en una vivienda concreta**; sin API documentada en la página.
- **VERIFICACIÓN**: página abierta (200) con enlaces XLSX visibles.
- **Clase: A**.

### 1.2 CNMCData — Infraestructura móvil
- **URLs verificadas**: `https://data.cnmc.es/telecomunicaciones-y-sector-audiovisual/conjuntos-de-datos/infraestructura-movil/indicadores`; visor `https://calidadtelecos.cnmc.gob.es/mapa-cobertura`.
- **Formatos**: CSV/JSON/XML/RDF + «API de datos»; frecuencia **trimestral** (indicada; 2022T3–2026T2).
- **Limitación clave**: agregados **nacionales** (líneas, estaciones base, tráfico) — no aporta granularidad territorial municipal. El visor es crowdsourced (tests de velocidad) y **no se verificó descarga**.
- **Clase**: A (datos) sin utilidad territorial; visor **C**.

**Conclusión del bloque**: para Cataluña, la fibra/4G/5G disponible públicamente hoy es **municipal** (SETELECO). La presentación en fichas debe ser: «cobertura declarada a nivel municipal, no disponibilidad confirmada en la vivienda». No se garantizan velocidades reales.

## 2. Transporte y movilidad

### 2.1 ATM/CGIM — Portal de dades obertes
- **URLs verificadas**: `https://t-mobilitat.cat/web/t-mobilitat/datos-abiertos/catalogo-de-datos` y `…/condicions-dades-obertes`.
- **Contenido**: catálogo que **integra toda la oferta de transporte público de Cataluña** (FGC, AMB, urbanos, interurbanos…) en **GTFS** y ficheros asociados (horarios, alteraciones, información geográfica).
- **Licencia**: **verificada** — reutilización libre o CC BY según dataset, con obligación de citar fuente y fecha de última actualización (Ley 37/2007, art. 17 Ley 19/2014).
- **Transformación**: descargar GTFS (zip) y extraer `stops.txt`/`routes.txt` (el zip concreto: NOT VERIFIED en la sesión).
- **Clase: B**.

### 2.2 FGC — Dades Obertes
- **URLs verificadas**: `https://dadesobertes.fgc.cat/pages/frontpage/` (portal OpenDataSoft, menús «Dades API», «Termes i condicions») + datasets en el catálogo Socrata de la Generalitat: **`5g2a-an2v`** «FGC – Estacions GTFS_stops» (upd 2025-10-27) y `snbn-kmkm` «FGC – Línies de la xarxa».
- **Licencia**: NOT VERIFIED (solo se vio el enlace de condiciones).
- **Clase: B**.

### 2.3 Bus interurbà de Catalunya
- **Dataset Socrata**: `bca2-b4i3` «Xarxa de transport per carretera: parades, línies i horaris dels autobusos interurbans de Catalunya» — metadatos vía `api/views` OK (200); la prueba de filas devolvió 403 (bloqueo puntual del entorno, no prueba de inexistencia).
- **Clase: B** (a re-verificar la lectura SODA antes de integrar).

### 2.4 TMB — data.tmb.cat
- El host **no resolvió DNS** desde el entorno de verificación (no prueba inexistencia); existe documentación para desarrolladores en tmb.cat (título+URL) y API key gratuita citada habitualmente: **NOT VERIFIED**.
- **Clase: C**.

### 2.5 AMB Mobilitat
- `https://www.ambmobilitat.cat/OpenData/` devolvió **403** (anti-bot); la documentación de la API REST de opendata.amb.cat sí se abrió (equipaments/search, datasets/search). GTFS AMB: NOT VERIFIED.
- **Clase: C**.

### 2.6 Renfe — data.renfe.com
- Portal CKAN abierto con 44 datasets («Estaciones. Listado completo», «Horarios cercanías», GTFS-RT cada 20/30 s). Pie «Renfe. Todos los derechos reservados» — reutilización **no clara**. GTFS estático de Rodalies Cataluña: NOT VERIFIED.
- **Clase: C** (estaciones: alternativa para puntos ferroviarios si la licencia se confirma).

**Conclusión del bloque**: el camino recomendado es **GTFS vía ATM/CGIM** (licencia verificada, cobertura Cataluña completa) + completar con Socrata FGC y bus interurbà. TMB/AMB/Renfe quedan para una segunda pasada con navegador real.

## 3. Equipamientos y servicios cercanos

### 3.1 Establiments sanitaris autoritzats a Catalunya (CatSalut)
- **Socrata**: `https://analisi.transparenciacatalunya.cat/resource/nrmq-ytje.json` (upd 2026-11-11). Muestra verificada: incluye **«Farmàcia»**; campos con **longitud/latitud**, municipio, comarca, región sanitaria, ABS.
- **Clase: A**. Cubre salud **y farmacias** en un solo dataset.

### 3.2 Directori de centres docents anual (Educació)
- **Socrata**: `kvmv-ahh4` (upd 2026-10-09). Muestra verificada con curs 2026/2027, **coordenades_geo_x/y + UTM**, código INE municipal de 5 dígitos, distrito.
- **Clase: A**. Cubre guarderías→universidades según tipología del centro.

### 3.3 Cens de biblioteques i centres patrimonials
- **Socrata**: `v366-9743` (upd 2026-09-17). Sin columnas de coordenadas (verificado en muestra) → **geocodificar dirección con ICGC**.
- **Clase: B**.

### 3.4 Equipaments de Catalunya (multicategoría)
- **Socrata**: `8gmd-gz7i` (upd 2026-11-14), descripción: integra equipamientos municipales, educativos, sociosanitarios, culturales, **instal·lacions esportives**, de transport…; con **longitud/latitud/utmx/utmy**, municipio y comarca (verificado). Complemento: «Equipaments culturals de Catalunya» `48s6-82h2`.
- **Licencia**: «See Terms of Use» en metadatos (a revisar antes de integrar).
- **Clase: A** (filtrando categorías) con licencia por confirmar.

### 3.5 Open Data BCN
- Portal con **403 a clientes automatizados**; datasets confirmados por búsqueda (título+URL): equipamientos de la administración, cultura/lleure, estaciones Bicing (información + estado). Cobertura: **solo Barcelona**.
- **Clase: C** (verificar condiciones con navegador real).

**Supermercados/mercats**: no se ha localizado catálogo oficial reutilizable para toda Cataluña (solo fuentes municipales). Sin fuente verificada → no integrar en Fase A; la categoría se deja para fuentes locales (C/D).

## 4. Riesgo de inundación

### 4.1 ACA — Visor de zones inundables
- **URL verificada**: `https://aca.gencat.cat/ca/plans-i-programes/gestio-del-risc-dinundacions/` (200); el visor enlazado usa capas **`AIGUA_LI10 / LI100 / LI500`** (periodos de retorno **T10/T100/T500**), tramos ARPSI y zonas de flujo preferente (ZFP).
- Descarga directa de shapefiles desde ACA: NOT VERIFIED en la página abierta.
- **Clase: B**.

### 4.2 MITECO — SNCZI (Sistema Nacional de Cartografía de Zonas Inundables)
- **URL verificada**: `https://www.miteco.gob.es/es/agua/temas/gestion-de-los-riesgos-de-inundacion/snczi.html` (200) — enlaza **«Acceso al servicio WMS»**, sección **«Descargas»** y portal `https://gis.miteco.gob.es/web/snczi/`. Cubre las demarcaciones que afectan Cataluña (cuencas internas y Ebro). Formatos concretos de descarga: NOT VERIFIED (portal JS).
- **Clase: B**.

**Conclusión del bloque**: hay datos oficiales con T10/T100/T500 (polígono); la vía de descarga definitiva (SNCZI/ACA) se cierra en el sprint de verificación G0. La ficha debe mostrar: intersección de la parcela/edificio con la zona, escenario, fuente ACA/SNCZI, fecha y escala; **nunca** «libre de riesgo» cuando no hay información.

## 5. Contaminación acústica

### 5.1 Mapes estratègics de soroll de Catalunya (territori.gencat.cat)
- **URL verificada**: `https://territori.gencat.cat/ca/03_infraestructures_i_mobilitat/mapes-estrategics-soroll-plans-accio/` (200). Todos los adjuntos detectados son **PDF** (memorias y planes de acción fase 2–4, 2022-2027; carreteras, metro, FGC). **Ningún enlace GIS descargable ni visor de datos** en esa página.
- **Clase: C** (publicar como documentación/referencia; no GIS integrable).

### 5.2 OpenDataBCN — Mapa estratégico de ruido de Barcelona
- **API CKAN verificada** (`package_search` / `package_show?id=rasters-mapa-estrategic-soroll`): recursos **GPKG** con indicadores **Lden / Dia / Vespre / Nit** por fuentes (tráfico viario, ferrocarriles, industria; mapa 2022). Otros: fachadas, población expuesta, red de monitorización.
- **Licencia**: **Creative Commons Attribution 4.0 declarada** (única licencia expresamente verificada en todo el catálogo de ruido).
- **Clase: A** (Barcelona únicamente).

**Conclusión del bloque**: GIS de ruido integrable hoy solo en Barcelona; para el resto, referencia documental. Presentación siempre como **exposición acústica territorial**, nunca como medición del interior del inmueble.

## 6. Calidad del aire

### 6.1 XVPCA — Xarxa de Vigilància i Previsió de la Contaminació Atmosfèrica
- **Datasets Socrata verificados** (catálogo `analisi.transparenciacatalunya.cat/api/catalog/v1`): **`tasf-thgu`** (datos **horarios** de contaminantes en puntos automáticos) y **`qg74-87s9`** (datos **diarios**, captadores manuales). SODA `/resource/*.json` operativo en el portal (probado).
- Cobertura: estaciones XVPCA de Cataluña (punto con coordenadas). Dataset de metadatos de estaciones: NOT VERIFIED (se resolverá con el propio `tasf-thgu` o consulta al catálogo en G0).
- **Clase: A**. NO2/PM10/PM2,5/O3 según variables del dataset (a confirmar códigos de contaminante en la ingesta).
- Presentación: estación más próxima + distancia, medias/tendencias por periodo, **sin atribuir la medición a una parcela**.

## 7. Eficiencia energética

### 7.1 ICAEN — Certificats d'eficiència energètica d'edificis ⭐ hallazgo clave
- **Dataset Socrata**: `https://analisi.transparenciacatalunya.cat/resource/j6ii-t3w2.json` (**probado con registros reales**, upd 2026-11-09). Página institucional: `https://icaen.gencat.cat/ca/lenergia/usos-de-lenergia/als-edificis/CEEC_CAT` (200, enlaza el buscador oficial de certificados).
- **Campos vistos en la muestra**: dirección, CP, población, comarca, **`referencia_cadastral`** (p. ej. `8761106DG6086S0001MG`), zona climática, m² catastrales, uso del edificio, **calificaciones de consumo y emisiones**, `emissions_de_co2`, renovables, herramienta de certificación (HULC), motivo de certificación.
- **Esto es dato abierto por edificio (con ref. catastral), no estadística agregada** → asociación directa por referencia catastral con el modelo `Building`.
- **Limitaciones**: licencia no declarada en los metadatos vistos (a confirmar); diferencia certificado/consumo real.
- **Clase: A**.

## 8. Zonas verdes y espacio público

- **OpenDataBCN**: dataset `espais-verds-publics` confirmado vía CKAN (también `deficit-proximitat-espai-verd`, `arbrat-parcs`); formatos/licencia por ficha: NOT VERIFIED. **Clase A-/B, solo Barcelona**.
- **MUCS (ICGC, Mapa d'usos del sòl)**: **NOT VERIFIED** — no apareció en las páginas de icgc.cat abiertas (contenido JS); pendiente G0. Si existe y permite download, sería la vía Cataluña completa.
- **Dataset de parques/jardines para toda Cataluña**: **no encontrado**. **Clase D provisional** — el bloque «zonas verdes» queda condicionado a G0 (MUCS/ICGC) o fuentes municipales.

## 9. Accesibilidad

- No se ha verificado ninguna fuente abierta consolidada de accesibilidad para Cataluña (rampas, itinerarios, ascensores de edificios). **Camino realista**: campo **`wheelchair_accessible` de GTFS** (estaciones/paradas) cuando se obtenga el GTFS del ATM — condicionado a G0; y datos municipales (BCN) donde existan.
- **Clase: B condicionada** (GTFS) / **D** para accesibilidad de edificios privados (no hay registro público).
- Regla del encargo aplicable: nunca afirmar que un edificio es accesible sin información específica de él.

## 10. Densidad de población y características del entorno

- **Idescat — API Indicadors**: docs verificadas (`https://www.idescat.cat/dev/api/indicadors/`, hub `/dev/api/` con APIs Indicadors/Emex/Pob/Taules). Niveles geográficos documentados incluidos **`geo=mun`** y **`geo=sec` (secciones censales)** y `geo=ac` (agrupaciones censales). Formatos xml/json/php (hub) — cobertura municipal ya integrada en v39 vía APIs Taules/Emex.
- **INE — API JSON Tempus3**: docs verificadas (`ine.es/dyngs/DataLab/manual.html?cid=45` → DAB cid=1099, OpenAPI/Swagger enlazado). La parte municipal (IPVA/Atlas) ya está integrada.
- **Secciones censales**: Idescat las ofrece explícitamente en la API Indicadors (**A**); la cartografía censal del INE: NOT VERIFIED en la sesión (páginas 404/bloqueo). La decisión de producto v38 («sin secciones censales») puede revisarse en Fase C con la API Idescat.
- **Clase: A** (municipio y sección vía Idescat).

## 11. Urbanismo y planeamiento

- **Servicios oficiales existentes (referenciados en páginas abiertas de territori.gencat.cat)**: «Mapa urbanístic de Catalunya (MUC)», «Registre de planejament urbanístic de Catalunya (RPUC)», «Visualització interactiva planejament urbanístic».
- **Datos abiertos/WMS descargables del planeamiento**: NOT VERIFIED (visores JS; rutas reorganizadas). MUCS como alternativa de usos del suelo: NOT VERIFIED.
- **Clase: C** — Fase C con verificación específica; mientras tanto, enlazar a los visores oficiales desde la ficha (sin integrar datos propios).

## 12. Riesgos ambientales y actividades molestas

- **PRTR-España** (`prtr-es.es`): sitio **inaccesible** en todas las rutas probadas (404/fallo de conexión). **NOT VERIFIED → D provisional**; reintento en G0.
- Alternativas a investigar en G0: registres ambientals de la Generalitat (IPPC) en el catálogo Socrata.
- Regla aplicable: **no etiquetar una zona como peligrosa/contaminada sin evidencia oficial**; solo distancias a instalaciones registradas oficialmente.

## 13. Consumo y costes de suministros

- **ACA — Observatori del preu de l'aigua**: página verificada `https://aca.gencat.cat/ca/laca/observatori-del-preu-de-laigua/Preu-per-municipis-i-evolucio/` (200) con **Excel directo** `Preus_per_municipi_ca.xlsx` («Llistat dels preus per municipi», abastament del nucli urbán; visor cartográfico asociado y ficha de estructura de tarifa).
- **Clase: A** (tabular el XLSX en la ingesta).
- Electricidad/gas agregados: no se identificó en esta sesión un dataset territorial municipal reutilizable (IDAE/INE quedan para G0/Fase C). **Sin fuente → no mostrar**.

## 14. Clima local

### 14.1 Meteocat — API XEMA
- **Docs verificadas**: `https://apidocs.meteocat.gencat.cat/` (200; «API REST de Dades Meteorològiques», secciones Plans i registre / Referència tècnica / Exemples).
- **Prueba real**: `https://api.meteo.cat/xema/v1/metadades/estacions` → **403 «Missing Authentication Token»**: endpoint vivo, **requiere API key**. Gratuidad del registro: habitual pero **NOT VERIFIED textualmente**.
- **Clase: A** (con registro). Estaciones con coordenadas; series históricas según endpoints (verificar en G0).

### 14.2 AEMET
- Portal OpenData verificado: `https://opendata.aemet.es/` → centro de descargas (200, sección «API Key»). Endpoints concretos: NOT VERIFIED en la página de inicio (estándar: observación y climatología con clave).
- **Normales climatológicas**: sección oficial abierta (`aemet.es/…/valoresclimatologicosnormales`, 200); mecanismo de descarga por estación: NOT VERIFIED. **Clase B**.
- **Clase: A** (API con clave) / B (normales).

## 15. Aparcamiento y movilidad privada

- **Estaciones de recarga eléctrica** ⭐: dataset Socrata **`tb2m-m33b`** «Estacions de recàrrega per a vehicle elèctric a Catalunya» (attribution ICAEN vista; upd 2026-11-14): **latitud/longitud, municipio, kW, tipo de conexión, acceso, AC/DC** (verificado en muestra). Complemento: `reqs-dsjt` «Sessions de càrrega». **Clase: A**.
- **Aparcamiento público / zonas reguladas**: **NO SE HA ENCONTRADO fuente oficial catalana centralizada**. Solo: FGC «Informació tècnica aparcaments» (`s88n-4t2p`, aparcamientos en estaciones FGC) y fuentes municipales (BCN, bloqueo 403). **Clase: D** para Cataluña; **B** para FGC.
- Bicing/estaciones de bicicleta pública: OpenDataBCN (C, Barcelona).

## T. Fuentes transversales de base (cartografía y catastro)

### T.1 Catastro — Servicios OGC e INSPIRE
- **Verificados con respuesta 200**: WMS `https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx` (título «Cartografia catastral») y **WFS INSPIRE** `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?SERVICE=WFS&REQUEST=GetCapabilities` (WFS 2.0.0, tipos **`cp:CadastralParcel`** y **`cp:CadastralZoning`**). Documentados además: WFS de direcciones (`wfsAD.aspx`) y edificios (`wfsBU.aspx`), WMS INSPIRE y **servicios ATOM de descarga por municipio** («Los datos se actualizan 2 veces al año»).
- **Condiciones vistas**: WMS «**uso libre y gratuito**… no está permitida la descarga masiva de porciones de cartografía»; descargas SHP/CAT vía Sede requieren aceptar la licencia de productos catastrales.
- **Clase: A** para consulta/descarga puntual por municipio/parcela; **D para explotación masiva** (respetar el límite).

### T.2 ICGC
- **Geocodificador**: docs verificadas (`https://eines.icgc.cat/geocodificador/api-docs/` Swagger; guía `openicgc.github.io/geocodificador-doc_en/documentacio/`: búsqueda por dirección, autocomplete, geocodificación inversa). Ya integrado como proxy en PreuReal. **Clase A**.
- **Descargas**: Visor de descarregues (`https://www.icgc.cat/ca/Eines-i-visors/Visors/Visor-de-descarregues`, 200): mapas topográficos, ortofotos, productos urbanos y LiDAR en **shp, dgn, dxf, tif, mrsid, mbtiles, laz, csv**… por hojas o áreas. Licencia por producto: a confirmar en G0 (ICGC publica CC-BY 4.0 habitualmente — atribución ya activa en los tiles).
- **Clase: A**.

---

## Pendientes de verificación (sprint G0 del plan)

1. Zip GTFS descargable del portal CGIM/ATM (y validación de `stops.txt`).
2. API key de TMB (`tmb.cat` desarrolladores) y condiciones Open Data BCN (403 anti-bot).
3. Portal SNCZI (`gis.miteco.gob.es/web/snczi/`) con navegador: formatos y demarcaciones de descarga.
4. MUCS/MUC ICGC y MUC/RPUC urbanismo: existencia y descargas reales.
5. Licencias: ICGC descargas, FGC, «Equipaments de Catalunya», ICAEN j6ii-t3w2, Meteocat (registro), Renfe.
6. PRTR-es (reintento) y registres ambientals Generalitat.
7. Dataset de metadatos de estaciones XVPCA y códigos de contaminantes.
8. Cita exacta INE («Elaboración propia…») para los PDF y licencia Idescat para atribución en fichas.
9. Condiciones de reutilización del XLSX SETELECO (si no constan, pedir confirmación a datos.gob.es).
10. Normales climatológicas AEMET (formato por estación).

---

## Resultats del sprint G0 (15-11-2026) — verificaciones cerradas

Verificación directa (metadata API SODA + pruebas de consulta real contra los datasets) y con navegador/headless por los agentes de verificación.

| # | Pendiente de G0 | Resultado | Impacto |
|---|---|---|---|
| 1 | Zip GTFS t-mobilitat | **Cola virtual** (303 → mant.t-mobilitat.cat, no responde a curl); GTFS-RT JSON/PB abiertos y funcionando | A2 usa FGC Huwise + Renfe + t-mobilitat RT; el GTFS agregado queda pendiente de navegador |
| 2 | MUCS ICGC | **No existe** como producto (verificado en buscador y catálogo icgc.cat) | Zonas verdes Cataluña vía MUC (clasificaciones urbanísticas) u OpenDataBCN |
| 3 | Urbanismo MUC/RPUC | **CONFIRMADO**: SHP `MUC_CLAS_SHP_ETRS89.zip` (HTTP 200, 59 MB) + WMS/WFS `sig.gencat.cat/ows/PLANEJAMENT` (GeoServer; exigen User-Agent de navegador) | Urbanismo pasa de C a **B** |
| 4 | TMB | Portal developer.tmb.cat: licencia **gratuita tras registro**; gtfs.zip requiere login (auth.tmb.cat) | Requiere alta del propietario (acción externa) |
| 5 | Open Data BCN | **CC BY 4.0 verificado por CKAN** para espais-verds-publics (GPKG), equipament-administracio (CSV/JSON), bicing (JSON + .7z); términos generales 403 | Integrable con atribución |
| 6 | FGC | **CC BY 4.0 verificado** en dataset `gtfs_zip` (API Huwise) | A2 |
| 7 | Renfe | «Estaciones. Listado completo» **CC BY 4.0** (CSV/XLSX); sin GTFS estático de Rodalies | A2 (estaciones Rodalies) |
| 8 | SETELECO | URL vigente: `..._DEF.xlsx` (200, XLSX 6,5 MB, **9 hojas** Municipio/Provincia/CCAA × %hogar/%viviendas); el CDN sirve HTML desde este sandbox | A1 con guardas de contenido |
| 9 | Catastro ATOM | **CONFIRMADO**: feed nacional → provincial (`/INSPIRE/CadastralParcels/08/ES.SDGC.CP.atom_08.xml`) → zip GML por municipio (`A.ES.SDGC.CP.08001.zip`) | Parcelas por municipio (fases posteriores) |
| 10 | Meteocat | Docs en **apidocs.meteocat.gencat.cat**: clave gratuita por trámite (7 días), x-api-key, CORS off (server-side), endpoint correcto `GET /xema/v1/estacions/metadades`; alternativa sin clave: SODA `nzvn-apee`/`yqwd-vj5e` | Fase B |
| 11 | AEMET | Key gratuita inmediata, caduca 90 días; endpoints bloqueados por WAF desde este entorno; normales por estación pendiente | Fase B (©AEMET siempre) |
| 12 | Idescat | Cita oficial verificada («Font: Idescat…» / «elaboració pròpia a partir de dades de l'Idescat») + condiciones de las APIs | Citas en fichas/PDF |
| 13 | INE | Texto de cita confirmado (cid=125): «Elaboración propia con datos extraídos del sitio web del INE: www.ine.es» + fecha | Citas en fichas/PDF |
| 14 | PRTR | Portal movido a **prtr-es.miteco.gob.es** (descargas y facility-level verificados) | Fase C |
| 15 | Instalaciones industriales Cataluña | Sin dataset IPPC en el portal; alternativa verificada: **EU-ETS** `hefh-b8uy` (emisiones GEH por instalación) | Fase C |
| 16 | XVPCA | Estaciones y contaminantes en el propio dataset (`tasf-thgu` con latitud/longitud por fila; SO2, NO2, NOX, O3, PM10, PM2.5, CO…) | Fase B sin dataset de metadatos adicional |
| 17 | Licencia Generalitat | **Llicència oberta d'ús d'informació — Catalunya** (web.gencat.cat/llicencies): citar organismo + fecha, no alterar el sentido | Marco de atribución de todos los datasets Socrata |
