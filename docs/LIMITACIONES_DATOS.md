# LIMITACIONES_DATOS.md — Limitaciones de precisión, disponibilidad y reutilización

Documento vivo. Cada limitación indica su origen y cómo se mitiga (o por qué no se mitiga).

## 1. Granularidad territorial (la más importante)

| Bloque | Granularidad real | Cómo se presenta | No se puede hacer |
|---|---|---|---|
| Certificados energéticos (ICAEN) | **Edificio** (ref. catastral) | «Certificado registrado» por edificio | Afirmar consumo real medido de una vivienda concreta |
| Equipamientos / recarga / (futuras paradas) | Punto (coordenada oficial) | Distancia **en línea recta** etiquetada | Distancias a pie reales (no hay red viaria procesada) |
| Cobertura banda ancha (SETELECO, futura A1) | **Municipio** | «Cobertura declarada a nivel municipal» | Presentar disponibilidad confirmada en una vivienda |
| Zonas inundables (futuras A5) | Polígono oficial (T10/T100/T500) | Intersección parcela/edificio + escenario | «Libre de riesgo» cuando no hay información |
| Ruido | Barcelona: raster GPKG; resto: PDFs | Exposición acústica **territorial** | Medición del interior del inmueble |
| Demografía v39 | Municipio (secciones censales vía Idescat API, fase C) | Estadística municipal etiquetada | Reconstrucción individual o inferencia causal |

Regla aplicada en UI y API: `associationMethod` (REFCAT / RADIUS_x / MUNI / INTERSECT) siempre visible en el dato; una estadística municipal nunca se presenta como dato del edificio.

## 2. Cobertura parcial

- **Certificados ICAEN**: solo edificios con certificado registrado (~1,34 M registros Cataluña, pero cobertura incompleta de parque antiguo). La ficha muestra «Sin información disponible» + nota de cobertura parcial. **Nunca se infiere una calificación desde el año de construcción** (encargo).
- **Equipamientos**: solo las fuentes oficiales integradas; supermercados/mercats municipales sin catálogo reutilizable para toda Cataluña (pendiente de fuentes locales). Bibliotecas fuera del catálogo específico (sin coordenadas) pero cubiertas por «Equipaments» (Cultura).
- **Transporte (pendiente A2)**: el GTFS agregado de t-mobilitat está tras cola virtual; paradas TMB requieren registro en developer.tmb.cat (licencia gratuita confirmada).

## 3. Precisión de distancias y conteos

- Distancias = **haversine** (línea recta). Un punto a 400 m en línea recta puede estar a 800 m andando. UI lo indica explícitamente.
- Radios estándar del encargo (300/500/1000/2000 m) implementados como selectores; conteos exactos sobre puntos dentro del bbox+radio.
- Bbox de lectura limitado a 5.000 puntos por consulta (seguridad de rendimiento en municipios densísimos; con las fuentes actuales no se alcanza).

## 4. Frescura y disponibilidad de fuentes

| Fuente | Ventana de frescor | Si cae |
|---|---|---|
| Recarga / sanitarios / docentes / equipaments | 60 días (reimportación completa por lotes) | El cron reintentará; las dades vigentes NO se borran |
| Certificados ICAEN | Caché 30 días por edificio (on-demand) | Degradación: bloque de energía «no disponible»; resto de la ficha funciona |
| (Fase B/C) XVPCA, Meteocat, SNCZI, MUC | A definir por fuente en su integración | Mismo patrón |

Las fuentes pueden cambiar de URL/estructura (ya ocurrió con digital.gob.es: el XLSX pasó de una URL a la variante `_DEF`). Mitigación: ImportRun con error visible, guardas de contenido (firma ZIP/XLSX) y re-verificación en cada refresco.

## 5. Licencias y atribución

- Datasets de la Generalitat (Socrata): licencia declarada «See Terms of Use» en metadatos; el marco general es la **Llicència oberta d'ús d'informació — Catalunya** (verificado en web.gencat.cat): reutilización permitida citando «Generalitat de Catalunya. [Departament]» + fecha de actualización, sin alterar el sentido de la información.
- **INE** (integrado en v38): cita exacta «Elaboración propia con datos extraídos del sitio web del INE: www.ine.es» + fecha de actualización.
- **Idescat**: «Font: Idescat» o «elaboració pròpia a partir de dades de l'Idescat» según haya tratamiento + fecha.
- **Open Data BCN**: CC BY 4.0 (verificado por dataset). **FGC/Renfe**: CC BY 4.0 (verificado por dataset/API). **TMB**: gratuita tras registro (pendiente de alta). **Catastro**: uso puntual permitido, descarga masiva prohibida (ATOM por municipio respetando cadencia).
- Atribución visible en la ficha (pie del panel), en `/api/provenance`, en `#/metodologia` y en los PDF.

## 6. Decisiones de producto documentadas

- La sección censal sigue **no integrada** (decisión v38) aunque Idescat ofrece `geo=sec`; revisable en Fase C.
- Zonas verdes sin fuente Cataluña completa (MUCS no existe como producto ICGC; verificado): la vía es MUC (clasificaciones urbanísticas, WFS/SHP confirmados) u OpenDataBCN.
- El precio real por edificio sigue pendiente del convenio Incasòl (fuera de este proyecto).
