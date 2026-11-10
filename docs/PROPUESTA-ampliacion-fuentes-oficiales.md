# PreuReal.cat — Ampliación de funcionalidades y fuentes de información oficial

> **Auditoría de la plataforma (Fase 1) y propuesta técnica de implementación**

| | |
|---|---|
| Plataforma | www.preureal.com / preureal.cat |
| Documento | Propuesta pendiente de validación |
| Fecha | 10 de noviembre de 2026 |

---

## 1. Resumen ejecutivo

Este documento responde al encargo de ampliar PreuReal.cat con nuevas fuentes de información pública y oficial. Contiene dos entregables: la auditoría técnica de la plataforma actual (Fase 1 del encargo) y la propuesta de implementación con el análisis de viabilidad de cada fuente. No se ha desarrollado todavía ninguna funcionalidad nueva: conforme al encargo, el desarrollo solo comenzará después de validar esta propuesta.

La auditoría concluye que la infraestructura actual es sólida y reutilizable casi por completo. La plataforma ya dispone de 947 municipios catalanes con histórico de alquiler desde 2005 (fianzas depositadas en Incasòl), edificios reales del ICGC, un registro interno de procedencia de datos, un sistema de planes con límites configurables, un contador mensual de uso por usuario y un generador de informes PDF. Los nuevos datos no necesitan una arquitectura paralela: necesitan una tabla genérica de observaciones estadísticas, dos importadores anuales y nuevos bloques de información en las fichas existentes.

El análisis de viabilidad aporta un hallazgo decisivo que condiciona el alcance: SERPAVI, el Sistema Estatal de Referencia del Precio del Alquiler del Ministerio de Vivienda, no publica hoy ficheros de datos abiertos ni ofrece una API documentada. Su consulta es interactiva (por referencia catastral o dirección) y la petición de apertura de sus datos en el portal datos.gob.es, presentada el 27 de agosto de 2026, sigue en estado «asignada» a 5 de noviembre de 2026, sin ficheros descargables. En cambio, las dos fuentes del INE —el Índice de Precios de Vivienda en Alquiler (IPVA, serie 2015-2024) y el Atlas de distribución de renta de los hogares (serie 2015-2024, publicada el 19 de octubre de 2026)— sí son integrables de inmediato y aportan la evolución histórica del alquiler y la renta necesaria para el indicador de esfuerzo económico.

Sobre esa base, la propuesta define: un modelo de datos no destructivo (cinco tablas nuevas, ninguna tabla existente alterada), cuatro nuevos indicadores calculados (posición frente a la referencia, diferencia territorial, evolución del índice y esfuerzo económico), el mapa exacto de dónde aparecerá cada dato en las vistas actuales, la separación gratuito/Premium con el nuevo argumento comercial, y el informe PDF Premium de ocho páginas con un límite de cinco descargas al mes por usuario. El plan de implementación se organiza en las siete fases del encargo, con despliegues incrementales y reversibles.

## 2. Auditoría de la plataforma actual (Fase 1)

### 2.1 Arquitectura y tecnologías

PreuReal.cat es una aplicación Next.js 16 (React 19, TypeScript) desplegada en Vercel como funciones serverless, con base de datos PostgreSQL gestionada (Supabase) accedida mediante Prisma ORM 6. La interfaz es una única página con navegación por anclas hash (#/ para el mapa, \#/comparador, \#/panell, \#/preus, \#/admin, \#/avis-legal), lo que evita recargas y simplifica el despliegue. La capa visual usa Tailwind CSS 4 con componentes shadcn/ui; el mapa es Leaflet; las gráficas disponen de la librería Recharts 2.15 ya instalada (desde la v25 el comparador incluye gráfica); los PDF se generan con pdf-lib en el propio servidor.

Los servicios externos ya integrados son: Stripe (suscripciones recurrentes de Premium, 7,99 €/mes, y Pro-Agents, 19,99 €/mes, con webhook firmado e idempotencia por evento), Resend (correo transaccional con outbox y reintentos), ICGC (geometría de edificios y límites municipales), Catastro (año de construcción) y el repositorio oficial de municipios de la Generalitat. El pipeline de entrega está consolidado: los cambios se publican en GitHub y Vercel despliega automáticamente, con verificación posterior mediante sondas de las rutas de API.

### 2.2 Base de datos: tablas y relaciones

El esquema Prisma contiene las entidades del negocio inmobiliario y de la explotación comercial. Las tablas centrales de datos son Municipality (947 registros) y Building (edificios e islas reales del ICGC). A su alrededor, las tablas de operación cubren usuarios, suscripciones, telemetría y gobernanza de datos. La tabla siguiente resume el inventario completo y el papel que cada tabla puede jugar en la ampliación.

**Tabla 1. Inventario de tablas existentes y su relevancia para la ampliación**

| **Tabla (Prisma)**                 | **Contenido actual**                                                                                                                                                                                                                     | **Relevancia para la ampliación**                                                                       |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| Municipality                       | 947 municipios: código INE/Gencat, nombre, comarca, provincia, lat/lng, alquiler medio anual (rentLatest), período, año previo, histórico 2005-2025 (JSON), contratos de referencia, bandera de zona tensionada, límite GeoJSON cacheado | Base de la correspondencia territorial; se referencia por ineCode; NO se duplica ningún dato nuevo aquí |
| Building                           | Edificios/illas ICGC RTT: polígono, centroide, refcat, año de construcción (Catastro), media de renta por edificio (importación)                                                                                                         | Recibirá los indicadores contextuales (sección censal asignada en importación)                          |
| User / Subscription                | Usuarios con rol y plan; suscripciones Stripe con estados, períodos y caducidad automática                                                                                                                                               | Se reutiliza tal cual; el plan es la base del gating de las funciones nuevas                            |
| SubscriptionUsage                  | Contador mensual de uso por usuario y tipo (clave única userId+tipo+mes «YYYY-MM»); ya declara el tipo PDF_REPORT                                                                                                                        | Perfecto para el límite de 5 informes PDF/mes sin crear un contador nuevo                               |
| SearchLog / Event                  | Registro de consultas y de eventos de conversión (incluye PDF_DOWNLOADED)                                                                                                                                                                | Telemetría de los nuevos indicadores vistos y descargados                                               |
| PriceReport                        | Informes de precio de usuarios (crowdsourcing con moderación)                                                                                                                                                                            | No se toca; los datos declarativos nunca se mezclan con los oficiales                                   |
| Favorite / SavedComparison         | Preferidos y comparaciones guardadas                                                                                                                                                                                                     | Las comparaciones podrán referenciar territorios con indicadores nuevos                                 |
| ImportRun                          | Ejecuciones de importación (fuente, estado OK/PARTIAL/ERROR, filas creadas/actualizadas/omitidas)                                                                                                                                        | Se reutiliza como registro de cada importación de INE/SERPAVI/ayudas                                    |
| AuditLog                           | Auditoría de acciones administrativas                                                                                                                                                                                                    | Registrará la ejecución de importaciones y cambios de convocatorias                                     |
| PlanSetting                        | Límites y precios de los planes editables desde admin (JSON de características con caché de 30 s)                                                                                                                                        | Añadir flags nuevos (referencia oficial, esfuerzo, informes avanzados) sin migración                    |
| RateLimit / StripeEvent / EmailLog | Infraestructura de seguridad, idempotencia y correo                                                                                                                                                                                      | Se reutilizan; sin cambios                                                                              |

La conclusión estructural es clara: no hace falta reconstruir nada. Las únicas adiciones de esquema necesarias son de naturaleza estadística (catalogar fuentes y almacenar observaciones territoriales) y comercial (registro de informes PDF generados), y ambas se resuelven con tablas nuevas que se suman al esquema sin alterar las existentes.

### 2.3 Datos actuales y procesos de obtención

Los datos municipales se producen hoy con un pipeline reproducible: el script prepare_data.py descarga los municipios oficiales (dataset abierto de la Generalitat), los Excel públicos de alquileres por ámbitos geográficos de Incasòl (fianzas depositadas) y aplica las listas de municipios de las resoluciones de zonas tensionadas publicadas en el DOGC; su salida es data/municipalities.json, que alimenta la carga inicial (seed) y las actualizaciones. El histórico municipal cubre los años 2005 a 2025 con número de contratos de referencia, lo que permite calcular variaciones y dibujar tendencias sin fuentes adicionales.

Los edificios proceden de la API Territorial del ICGC (capa de construcciones RTT), se cachean en la base de datos y se enriquecen con el año de construcción del Catastro. Cada importación queda registrada en ImportRun (filas creadas, actualizadas u omitidas) y las acciones administrativas en AuditLog. Existe además un endpoint público de procedencia (/api/provenance) que documenta siete conjuntos de datos con fuente, licencia, unidad, ámbito, periodicidad, metodología y calidad estimada; la interfaz y los PDF ya lo citan. Este registro es la base natural sobre la que ampliar la trazabilidad de las fuentes nuevas.

### 2.4 Funcionalidades actuales por plan

**Tabla 2. Funcionalidades vigentes por plan (noviembre 2026)**

| **Funcionalidad**                                         | **Gratuito**         | **Premium (7,99 €/mes)** | **Pro-Agents (19,99 €/mes)** |
|-----------------------------------------------------------|----------------------|--------------------------|------------------------------|
| Mapa y búsqueda de edificios                              | Sí                   | Sí                       | Sí                           |
| Consultas detalladas de ficha                             | 3/mes                | Ilimitadas               | Ilimitadas                   |
| Comparador (municipios/edificios)                         | 2 entidades          | 6 entidades              | 6 entidades                  |
| Diferencias absolutas y % entre entidades + gráfica (v25) | Sí                   | Sí                       | Sí                           |
| Historial de consultas y favoritos                        | No                   | Sí                       | Sí                           |
| Comparaciones guardadas                                   | Sí (2/mes implícito) | Sí                       | Sí                           |
| Informe PDF de municipio (1 página)                       | No                   | Sí                       | Sí                           |
| Informe PDF de edificio                                   | No                   | No                       | Sí                           |
| Exportación CSV                                           | No                   | No                       | Sí                           |
| Resumen mensual de preferidos por correo                  | No                   | Opt-in                   | Opt-in                       |

Los límites y precios son configurables desde el panel de administración (PlanSetting) y el servidor aplica siempre el límite real, incluso cuando la interfaz lo suaviza; el comparador es un buen ejemplo: el máximo por plan vive en la configuración efectiva y la ruta /api/comparator lo valida del lado del servidor. Este mismo patrón se extenderá a las funciones nuevas, de modo que ninguna funcionalidad Premium dependa únicamente del cliente.

### 2.5 Registro, autenticación y suscripciones

La autenticación es propia: correo y contraseña (bcrypt), verificación de correo con token de un solo uso, sesiones JWT con versión de token para invalidación global, restablecimiento de contraseña y protección por límite de intentos. El plan efectivo se sincroniza con las suscripciones vigentes en cada petición relevante: expira automáticamente los períodos vencidos (incluido el modo de prueba de 30 días y los períodos de gracia de pago) y adopta el plan más alto de las suscripciones activas. Los flujos de compra pasan por Stripe Checkout con webhook verificado y deduplicación de eventos. Para la ampliación, este mecanismo se reutiliza sin cambios: las funciones nuevas se declaran como características de plan y el servidor las comprueba con el mismo mecanismo planAllows ya existente.

### 2.6 Fichas y páginas donde se muestran los datos

La vista principal es el mapa: al seleccionar un edificio se abre un panel de ficha con sus datos geométricos, año de construcción y, si existe importación, la media de renta de la illa; en plan gratuito esta información se presenta como avance con límite de consultas. La ficha municipal (datos de alquiler medio, período, variación y tendencia) alimenta el mapa, el comparador y los informes. El comparador (v25) admite de 2 a 6 entidades según el plan, muestra diferencias absolutas y porcentuales frente a la entidad más barata, media y mediana del conjunto, y una gráfica. El panel de usuario concentra historial, favoritos, comparaciones guardadas (con botón de carga directa al comparador) y el opt-in del resumen mensual. Todas las vistas son responsive y bilingües (catalán y español), condiciones que la ampliación debe conservar.

### 2.7 Sistema de informes PDF existente

Existe un generador de informes en /api/reports/pdf construido con pdf-lib: una página A4 con la identidad visual de PreuReal (cabecera oscura con acento naranja), el alquiler medio oficial del municipio con período y número de contratos, la variación frente al año anterior, el estado de zona tensionada con su resolución legal, un gráfico de barras del histórico reciente, y bloques de fuentes, metodología, limitaciones estadísticas y aviso legal. El informe de edificio (Pro) añade la media de la illa cuando existe importación. El acceso está controlado por plan y por límite de peticiones, y la descarga queda registrada como evento.

Este informe, sin embargo, es de resumen: no incluye los indicadores nuevos del encargo ni un control mensual de descargas. La propuesta lo conserva (sigue siendo el informe de edificio de Pro) y añade el informe Premium ampliado de ocho páginas descrito en el capítulo 5, que comparte constantes de marca y helpers con el actual para evitar duplicación.

### 2.8 Conclusiones de la auditoría

1.  La arquitectura soporta la ampliación sin cambios estructurales: serverless + PostgreSQL + Prisma es exactamente el patrón adecuado para datos estadísticos anuales de bajo volumen y alta lectura.

2.  El modelo de procedencia, el registro de importaciones y el contador mensual de uso ya existen: la trazabilidad y el límite de descargas del encargo tienen soporte nativo.

3.  No se sustituirá ni reconstruirá ninguna funcionalidad; las vistas actuales (mapa, ficha, comparador, panel) reciben los nuevos datos como bloques contextuales.

4.  Las carencias identificadas son tres: falta una tabla genérica para observaciones estadísticas territoriales, faltan los importadores de INE, y el informe PDF avanzado con límite mensual no existe todavía.

## 3. Viabilidad de las fuentes oficiales

Cada fuente se ha verificado contra su publicación oficial real (noviembre de 2026), comprobando formato, disponibilidad, desagregación territorial y condiciones de reutilización. Esta comprobación es la que evita supuestos falsos: el encargo exige no inventar APIs ni asumir automatizaciones imposibles, y la verificación ha modificado el alcance previsto en al menos un caso importante (SERPAVI).

<img src="docs/media/kvutc5_pl9bkofdqxo_8j.png" style="width:5.625in;height:2.6875in" />

Figura 1. Cobertura territorial real de cada fuente (estado 10-11-2026)

### 3.1 SERPAVI — Sistema Estatal de Referencia del Precio del Alquiler (MIVAU)

Qué es: la explotación estadística de fuentes tributarias (AEAT) que el Ministerio de Vivienda y Agenda Urbana publica como rango de precios de referencia del alquiler, con carácter orientativo; en las zonas de mercado tensionado declaradas al amparo de la Ley 12/2023, el valor superior del rango limita la renta de los nuevos contratos según la normativa vigente. La web oficial (serpavi.mivau.gob.es) permite buscar una vivienda por referencia catastral o dirección y devuelve el rango de referencia de su entorno; además el Ministerio publica anualmente una explotación estadística en formato de tablas, gráficos y mapas (la edición SERPAVI 2026 se publicó en marzo de 2026).

Disponibilidad real verificada: no existe una API pública documentada ni ficheros abiertos descargables de los rangos por municipio o zona. En el portal datos.gob.es consta una solicitud de datos (presentada el 27 de agosto de 2026, con cuatro firmantes y actualizada el 5 de noviembre de 2026) pidiendo exactamente eso —precio de referencia en €/m² por municipio y zona con código INE, histórico y diccionario— y sigue en estado «asignada», sin ficheros resultantes. La consulta por referencia catastral es interactiva y no procede automatizarla (el propio servicio no la ofrece para uso programático).

Integración propuesta: en dos niveles. Nivel 1 (inmediato): incorporar la publicación estadística anual (tablas de la explotación SERPAVI) como contexto territorial de referencia estatal, citando año y fuente, y enlazar el consultor oficial desde las fichas cuando el usuario quiera comprobar una vivienda concreta. Nivel 2 (condicionado): en cuanto el Ministerio publique ficheros abiertos —vigilancia trimestral automatizada del catálogo— se activa la integración completa P25/mediana/P75 por municipio y sección. No se promete en ningún caso lo que hoy no es técnicamente accesible: la funcionalidad de rangos por sección censal quedará marcada como dependiente de esa apertura.

### 3.2 INE — Índice de Precios de Vivienda en Alquiler (IPVA)

Qué es: una estadística experimental del INE, con base 2015, que mide la evolución anual de los precios de la vivienda alquilada como residencia habitual, construida a partir de la información declarada a efectos tributarios (IRPF, modelo 100). Su última nota de prensa (11 de mayo de 2026) sitúa la variación anual de 2024 en el 3,5 %. Desagrega por comunidad autónoma y provincia y, con cobertura parcial, por municipios y distritos; existen además distribuciones por características (por ejemplo, antigüedad del contrato) publicadas como conjuntos de datos.

Disponibilidad real verificada: tablas publicadas en INEbase y datasets en datos.gob.es; el INE ofrece servicios de datos (API Tempus3 y ficheros PC-Axis/CSV) para sus tablas, sin clave ni coste. Integración propuesta: importador anual que descarga las series de Catalunya, las cuatro provincias y (si la cobertura lo permite) municipios seleccionados, almacena cada observación con su período y fuente, y alimenta los gráficos de evolución. Advertencia metodológica que la interfaz debe reproducir siempre: el IPVA es un índice de evolución (variación porcentual), no un nivel de precio en euros; nunca debe presentarse como precio medio ni mezclarse con las medias de fianzas.

### 3.3 INE — Atlas de distribución de renta de los hogares

Qué es: la estadística experimental del INE que publica renta neta media por persona y por hogar con desagregación territorial fina: nacional, comunidades autónomas, provincias, municipios (con todos los indicadores para municipios de más de 2.000 habitantes) y secciones censales (más de 33.600 secciones en toda España). La serie 2015-2024 se publicó el 19 de octubre de 2026; a nivel nacional, la renta neta media por persona de 2024 alcanzó los 15.948 euros, un 6,1 % más que el año anterior.

Disponibilidad real verificada: resultados en INEbase por territorios y años, con ficheros descargables; sin API dedicada para el Atlas, pero con formatos reutilizables estables. Integración propuesta: importador anual municipal (renta por persona y por hogar de los 947 municipios catalanes) y, en una fase opcional posterior, de secciones censales de Catalunya para la comparativa fina. La variable se etiquetará siempre con su unidad exacta (renta neta media anual por persona / por hogar, año de referencia) para cumplir la exigencia del encargo de no presentar una renta media territorial como salario individual.

### 3.4 Agència de l'Habitatge de Catalunya — Registro de Fianzas (Incasòl)

Situación singular: PreuReal ya consume esta fuente como dato principal (las medias municipales de alquiler provienen de las fianzas depositadas en Incasòl), por lo que no hay nada nuevo que integrar en el plano estadístico. Lo que añade el encargo es la capa informativa: qué es el Registro de Fianzas, quién debe depositar y cuándo (un mes desde la firma, devengando el depósito a favor del arrendatario), qué garantías adicionales admite la ley —hasta dos mensualidades adicionales para garantías distintas de la fianza legal (artículo 36 de la Ley de Arrendamientos Urbanos)—, cómo puede el arrendatario comprobar el depósito y qué ocurre si no se deposita. No existe —y legalmente no corresponde— una API para consultar expedientes individuales de terceros; la propuesta se limita a la calculadora de fianza (una mensualidad del alquiler introducido) y a los enlaces al procedimiento oficial de consulta.

### 3.5 Ministerio de Derechos Sociales, Consumo y Agenda 2030 — cláusulas y gastos

La utilidad práctica para un inquilino se concentra en cuatro bloques normativos con fuente estatal: cláusulas potencialmente abusivas (ley general de consumidores y jurisprudencia consolidada), gastos de gestión inmobiliaria y de formalización del contrato, que la Ley 12/2023 atribuyó al arrendador cuando este actúe como profesional, límites legales a las garantías adicionales, y reglas de actualización anual de la renta (IPC, con las restricciones propias de las zonas tensionadas, cuyos porcentajes máximos publica cada año el Departament de Territori, Habitatge i Transició Ecològica). La integración es editorial: una guía estructurada en la web, con fecha de revisión y enlaces a la fuente oficial de cada afirmación, y una lista de comprobación de cláusulas antes de firmar. No requiere base de datos propia (se versiona con fecha de revisión registrada como importación editorial).

### 3.6 INJUVE — derechos de las personas inquilinas

El Instituto de la Juventud mantiene guías oficiales sobre derechos de arrendatarios, obligaciones de propietarios, condiciones de los contratos, gastos, garantías y procedimientos de reclamación. Su integración es idéntica a la del bloque anterior: contenidos de la guía contextualizados en la ficha (por ejemplo, junto a la calculadora de fianza) con atribución y enlace. Se tratará como un único módulo editorial de «guía del alquiler» junto al bloque 3.5, evitando duplicar contenidos de origen distinto sobre el mismo tema.

### 3.7 Generalitat y Estado — ayudas al alquiler

Panorama real (verificado en noviembre de 2026): el Bono Alquiler Joven estatal está integrado en el Plan Estatal de Vivienda 2026-2030 (regulado en el artículo 137 del Real Decreto 326/2026): aporta hasta 300 euros mensuales por vivienda habitual (200 si es habitación) a personas de 18 a 35 años con ingresos inferiores a tres veces el IPREM, y se gestiona por las comunidades autónomas, cada una con su convocatoria y plazos. En Catalunya, las ayudas al alquiler de la Agència de l'Habitatge (incluido el programa estatal y las convocatorias propias) se publican en su portal con requisitos y plazos.

Integración propuesta: una tabla de ayudas en la base de datos con estado (vigente / próxima / finalizada), requisitos resumidos, límites de edad e ingresos, plazos, enlace oficial y fecha de actualización editorial; mostrada como módulo de ayudas con filtrado simple por municipio y, si el usuario lo facilita voluntariamente, por edad e intervalo de renta (siempre con el aviso de que la información es orientativa y decide la convocatoria oficial). Las convocatorias finalizadas se conservan con su fecha, cumpliendo la exigencia de distinguir vigentes de finalizadas.

**Tabla 3. Resumen de viabilidad por fuente**

| **Fuente**                 | **Datos clave para PreuReal**                                             | **Disponibilidad real (10-11-2026)**                                                                          | **Vía de integración**                                                               | **Periodicidad de actualización**              |
|----------------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|------------------------------------------------|
| SERPAVI (MIVAU)            | Rangos de referencia P25/mediana/P75; €/m²                                | Consulta interactiva; publicación anual de tablas; SIN ficheros abiertos (solicitud en datos.gob.es asignada) | Nivel 1: contexto estatal + enlace al consultor. Nivel 2: condicionada a la apertura | Anual; vigilancia trimestral del catálogo      |
| INE · IPVA                 | Tasa anual y acumulada del índice (CCAA, provincia, municipios parciales) | Disponible (tablas INEbase y datasets; servicios de datos del INE)                                            | Importador anual automatizado                                                        | Anual (nota de prensa primavera)               |
| INE · Atlas de renta       | Renta neta media por persona y por hogar (municipio y sección)            | Disponible (serie 2015-2024 publicada 19-10-2026)                                                             | Importador anual automatizado                                                        | Anual (otoño)                                  |
| Incasòl · Fianzas          | Medias de alquiler (ya integradas)                                        | Ya integrada                                                                                                  | Solo capa informativa nueva (normativa y consulta)                                   | Anual con avances trimestrales (ya gestionado) |
| Derechos Sociales / INJUVE | Cláusulas, gastos, garantías, derechos                                    | Documentación oficial vigente                                                                                 | Guía editorial con fecha de revisión y fuentes                                       | Revisión editorial trimestral                  |
| Ayudas (Estado + Gencat)   | Bono Alquiler Joven y ayudas autonómicas                                  | Convocatorias vigentes publicadas (Plan Estatal 2026-2030, art. 137 RD 326/2026)                              | Tabla de ayudas con estado y enlaces                                                 | Según publicación; revisión trimestral         |

En síntesis: dos fuentes INE integrables de inmediato con importación anual automatizada, una capa legal-informativa de integración editorial sencilla, y SERPAVI en doble vía (contexto inmediato + integración completa cuando se abra el dato). Esta estructura garantiza que ninguna funcionalidad anunciada dependa de un acceso que hoy no existe.

## 4. Propuesta técnica: modelo de datos, indicadores e integración

### 4.1 Información nueva a incorporar

La información nueva se organiza en cinco familias, cada una con su fuente, su unidad y su período. Ninguna sustituye a los datos actuales: las medias de fianzas de Incasòl siguen siendo la medida del mercado real registrado, y las fuentes nuevas aportan el marco de referencia oficial, la evolución del mercado, la renta del territorio y la capa jurídica y de ayudas. La distinción entre precios de referencia oficiales y precios de oferta se mantendrá siempre visible en la interfaz y en los informes.

**Tabla 4. Familias de información nueva**

| **Familia**            | **Variables concretas**                                                                                                       | **Fuente**                                                                                                                          | **Unidad y período**                                       |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| Referencia oficial     | P25, mediana y P75 del precio de referencia; rango mensual orientativo; €/m²                                                  | SERPAVI (nivel estatal disponible; municipal/sección condicionado a apertura) + índex de referència de la Generalitat como consulta | €/mes y €/m²; año o trimestre de referencia                |
| Evolución del mercado  | Índice de precios en alquiler: tasa anual, variación acumulada desde la base                                                  | INE · IPVA (experimental, base 2015)                                                                                                | Índice (base 100) y %; anual                               |
| Renta del territorio   | Renta neta media por persona; renta neta media por hogar                                                                      | INE · Atlas de distribución de renta                                                                                                | €/año netos; año de referencia de la publicación           |
| Jurídica y contractual | Fianza legal y garantías adicionales; gastos de gestión; actualización de renta; cláusulas a revisar; derechos y obligaciones | LAU y Ley 12/2023; Departament de Territori; INJUVE; Consumo                                                                        | Contenido informativo con fecha de revisión                |
| Ayudas                 | Convocatorias estatales y autonómicas con requisitos, edad, límites de renta y plazos                                         | MIVAU (Bono Alquiler Joven) y Agència de l'Habitatge                                                                                | Estado vigente/próxima/finalizada + fecha de actualización |

### 4.2 Tablas y campos existentes que se reutilizan

El principio rector es que cada dato nuevo vive una sola vez en la base de datos. Las tablas existentes no cambian de significado ni de estructura (salvo índices de rendimiento si hicieran falta): Municipality y Building siguen siendo las entidades geográficas e inmobiliarias; los datos estadísticos nuevos no se copian en columnas nuevas de Municipality, sino que se relacionan por código territorial desde la tabla de observaciones. De este modo, añadir un indicador o un año nunca requiere migración de datos históricos.

1.  Municipality (ineCode, code, comarca, province): clave de correspondencia con todas las fuentes INE (código municipal de 5 dígitos) y con la publicación estadística de Incasòl; comarca y provincia ya presentes para la comparativa territorial.

2.  Building (centroidLat, centroidLng, municipalityCode): la asignación de sección censal se hará por cruce espacial del centroide en el momento de la importación (o como servicio puntual), sin alterar el modelo.

3.  ImportRun: cada importación de IPVA, Atlas, SERPAVI, ayudas o revisión editorial se registrará aquí con su fuente, estado y recuento de filas; la trazabilidad por fila apuntará a su ejecución.

4.  PlanSetting.features (JSON): se añaden los flags de las funciones nuevas (referencia oficial ampliada, comparativa territorial, histórico completo, esfuerzo, informes avanzados) sin migración y con los mismos controles de administración.

5.  SubscriptionUsage (tipo PDF_REPORT ya declarado): contador mensual del límite de cinco informes; su clave única por usuario, tipo y mes garantiza que el contador no se duplique.

6.  /api/provenance y AuditLog: el catálogo de procedencia se amplía con las fuentes nuevas y cada operación relevante queda auditada.

### 4.3 Nuevas tablas y relaciones

**Tabla 5. Tablas nuevas propuestas (migración incremental, no destructiva)**

| **Tabla**                                | **Campos principales**                                                                                                                                                                           | **Relaciones y notas**                                                                                                                                             |
|------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| DataSource                               | code (SERPAVI, INE_IPVA, INE_ATLAS, AYUDAS, LEGAL...), nombre, organismo, licencia, url oficial, periodicidad, unidad, metodología, notas                                                        | Catálogo único de fuentes; alimenta automáticamente la procedencia mostrada en UI y PDF                                                                            |
| StatObservation                          | sourceCode, indicatorCode, scope (CCAA/PROV/MUNI/COMARCA/DISTRICT/SECTION/NAT), geoCode, period, value, valueAux (p. ej. muestra), unit, publishedAt, extractedAt, runId, qualityFlag, sourceRef | Formato largo genérico: una fila por dato; clave única (source, indicador, ámbito, geocódigo, período) evita duplicados; se relaciona con Municipality vía ineCode |
| HousingAid                               | título, ámbito (estatal/autonómico), territorio, estado (VIGENTE/PROXIMA/FINALIZADA), requisitos, edad mín/máx, límite de renta, plazos, url oficial, fuente, updatedAt, nota editorial          | Módulo de ayudas; filtrado por municipio del contexto; conservación de convocatorias finalizadas                                                                   |
| PdfReportLog                             | userId, tipo de informe, entidad objetivo (municipio/edificio), dataVersion (JSON con períodos y fuentes usados), status (COMPLETED/FAILED), createdAt                                           | Registro de cada informe Premium; permite reconstruir qué versión de datos se usó                                                                                  |
| CensusSection (opcional, fase posterior) | code (SSCC INE), municipalityCode, districtCode, nombre, centroide o geometría                                                                                                                   | Solo si se activa la comparativa por sección censal; se rellena con la cartografía oficial y el cruce espacial en importación                                      |

Las migraciones Prisma serán versionadas e incrementales (como las cuatro existentes), aplicables con prisma migrate deploy en Vercel, y ninguna modificará tablas vigentes: si algún día se necesita un índice adicional en una tabla existente, se hará con una migración dedicada y revisada. El despliegue es reversible porque las tablas nuevas no son necesarias para las funciones actuales.

### 4.4 Nuevos indicadores calculables

Los indicadores son fórmulas explícitas sobre datos etiquetados; ninguna cifra que muestre la web quedará sin fuente, unidad y período. La regla de oro metodológica: los precios de referencia oficiales (SERPAVI / índex de referència) describen el entorno; las medias de fianzas describen el mercado registrado; el IPVA describe la evolución; el Atlas describe la renta. Cada bloque de la interfaz indicará cuál de los cuatro mundos está mostrando.

**Tabla 6. Indicadores nuevos y fórmulas**

| **Indicador**                                  | **Fórmula / cálculo**                                                                                                     | **Interpretación y avisos**                                                                                                                                                                                                                 |
|------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Posición frente a la mediana (POS_VS_MEDIAN)   | (precio del inmueble − mediana del entorno) / mediana × 100                                                               | ±% respecto a la mediana de referencia del entorno territorial; mostrado con flecha y color; nunca como valoración exacta                                                                                                                   |
| Banda de referencia (REF_BAND)                 | comparación del precio con \[P25, P75\] de la referencia oficial del entorno                                              | «Por debajo / dentro / por encima del rango de referencia oficial» con la fuente y el período; solo cuando exista dato territorial                                                                                                          |
| Diferencia territorial (TERR_DELTA)            | diferencia absoluta y % entre dos territorios (municipio vs comarca, provincia, Catalunya o el más barato del comparador) | Ya operativo entre entidades del comparador (v25); se extiende a comparaciones de un municipio con su comarca, provincia y Catalunya                                                                                                        |
| Evolución del mercado (IPVA_ANUAL / IPVA_ACUM) | tasa interanual del IPVA y variación acumulada desde 2015, para Catalunya, la provincia y el municipio si hay cobertura   | Es un índice, no un precio: siempre se mostrará como variación % con año de referencia                                                                                                                                                      |
| Esfuerzo económico (EFFORT)                    | (alquiler medio mensual del municipio × 12) / renta neta media anual por hogar × 100                                      | Porcentaje del salario-hogar medio del territorio que representaría el alquiler medio; es un indicador de contexto territorial, NO una medición de la capacidad del usuario; se etiquetará con la variable usada (renta por hogar) y su año |
| Esfuerzo por persona (EFFORT_PCAP)             | variante con renta neta media por persona, mostrada solo con etiqueta explícita                                           | Alternativa informativa; nunca se presentará como salario neto individual                                                                                                                                                                   |
| Ayudas relevantes (AID_MATCH)                  | filtrado de HousingAid por municipio, edad y renta si el usuario lo indica                                                | Resultado orientativo con enlace a la convocatoria oficial; no es una precalificación                                                                                                                                                       |

Ejemplo numérico real del cálculo de esfuerzo con datos actuales: si un municipio tiene un alquiler medio de 792,7 €/mes (caso de Cornellà de Llobregat, 2025) y la renta neta media por hogar del Atlas 2024 fuese de 45.000 €/año, el esfuerzo sería 792,7 × 12 / 45.000 = 21,1 %. La cifra se presentará como «un hogar con la renta media de este municipio destinaría alrededor del 21 % a un alquiler medio», con el año de cada dato y el aviso de que son medias territoriales.

### 4.5 Dónde se mostrará cada información

La integración respeta la navegación y el diseño actuales: no habrá sección nueva paralela ni panel externo. Cada dato aparece donde el usuario ya está mirando. La única vista nueva es una guía contextual (#/guia) que centraliza legal y ayudas porque son contenidos de lectura, y a la que se llega desde las fichas con enlaces contextuales (por ejemplo, junto al precio: «¿es razonable? mira la referencia oficial»; junto a la fianza: «calcula y revisa tus obligaciones»).

**Tabla 7. Mapa de integración en la web**

| **Dónde**                          | **Qué se añade**                                                                                                                                                                                                                          | **Gratuito / Premium**                                                           |
|------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| Ficha de edificio (panel del mapa) | Bloque «Referencia oficial»: banda P25/mediana/P75 del entorno cuando exista, posición del precio, % respecto a la mediana, indicador visual (barra con marcador); enlace al consultor SERPAVI/Gencat; micro-bloque de esfuerzo municipal | Mediana y % básicos para todos; banda completa y comparativa ampliada en Premium |
| Ficha / panel de municipio         | Evolución histórica (ya existente) + variación IPVA de Catalunya y provincia + renta media del municipio y esfuerzo con metodología visible                                                                                               | Tendencia municipal para todos; IPVA, renta y esfuerzo completos en Premium      |
| Comparador                         | Columnas nuevas: % respecto al más barato (ya v25), banda de referencia y esfuerzo de cada territorio; gráfica ampliable a 6 entidades                                                                                                    | 2 entidades gratis; 6 y columnas avanzadas en Premium/Pro                        |
| Panel de usuario                   | Contador de informes PDF del mes («te quedan X de 5»), acceso a la guía, estado de convocatorias guardadas                                                                                                                                | Contador visible en Premium/Pro                                                  |
| Guía \#/guia (nueva vista ligera)  | Derechos y obligaciones, fianza y garantías con calculadora, gastos, actualización de renta, checklist de cláusulas, ayudas vigentes por territorio con fechas y enlaces                                                                  | Gratuita completa (captación y SEO); los cálculos contextualizados Premium       |
| Informes PDF                       | El informe ampliado de 8 páginas (capítulo 5) con todos los indicadores                                                                                                                                                                   | Premium/Pro, máx. 5/mes                                                          |

### 4.6 Separación gratuito / Premium

**Tabla 8. Accesibilidad de las funciones nuevas por plan**

| **Función nueva**                                                                  | **Gratuito**                          | **Premium** | **Pro-Agents** |
|------------------------------------------------------------------------------------|---------------------------------------|-------------|----------------|
| Mediana municipal de referencia y tendencia básica                                 | Sí                                    | Sí          | Sí             |
| Guía legal, fianza (calculadora) y ayudas                                          | Sí                                    | Sí          | Sí             |
| Banda completa P25/mediana/P75 y posición del precio                               | Solo teaser (aviso de disponibilidad) | Sí          | Sí             |
| Comparativa territorial completa (sección/districto/municipio/provincia/Catalunya) | No                                    | Sí          | Sí             |
| Evolución IPVA completa y esfuerzo económico con metodología                       | No                                    | Sí          | Sí             |
| Informe PDF ampliado de 8 páginas                                                  | No                                    | Sí (5/mes)  | Sí (5/mes)     |
| Informe PDF de edificio                                                            | No                                    | No          | Sí             |
| Exportación CSV                                                                    | No                                    | No          | Sí             |

El reparto sigue la lógica comercial del encargo: lo gratuito capta (referencia básica, guía y ayudas son además el contenido con mayor demanda orgánica), y lo Premium convierte (el cruce de datos —referencia oficial, evolución, renta y esfuerzo— es exactamente el valor que un inquilino o un agente no encuentra en portales clasificados). Los flags de PlanSetting permitirán recalibrar qué es teaser gratuito sin despliegues nuevos.

### 4.7 Calidad, validación y transparencia

1.  Cada dato mostrado llevará fuente oficial, período, fecha de actualización, ámbito y unidad; el catálogo DataSource alimenta esa ficha de identidad en UI y PDF.

2.  Nunca se mezclarán en la misma cifra precios de referencia oficiales, medias de fianzas registradas ni precios declarados por usuarios; los bloques estarán separados y etiquetados.

3.  Cuando falte un dato territorial se mostrará «no disponible para este ámbito/período» de forma explícita; no se extrapolará ninguna media entre territorios distintos.

4.  Cada indicador incluirá su aviso de limitación (por ejemplo: el esfuerzo usa renta media por hogar del territorio y no mide la situación de un hogar concreto; el IPVA es experimental y mide variación, no nivel).

5.  Los importadores validan cada carga: recuentos esperados, comparación con el valor anterior (desvíos anómalos marcan la ejecución como PARTIAL), tipos y rangos; el resultado queda en ImportRun y la carga defectuosa no se publica.

6.  Atribución y licencias: INE (reutilización con atribución), MIVAU y Generalitat (aviso legal de reutilización); la atribución aparecerá en cada bloque de datos y en la página de fuentes de los PDF.

## 5. Informe PDF Premium: diseño y control de cinco descargas mensuales

### 5.1 Estructura del informe (8 páginas)

El informe ampliado se genera en el servidor con pdf-lib, reutilizando la identidad visual ya definida (paleta oscura con acento naranja, tipografía y estructura de bloques del informe actual) y siguiendo el guion del encargo. La generación es independiente de la visualización web: recoge datos de la base, etiqueta cada cifra con fuente y período, y produce un documento autocontenido optimizado para impresión y lectura digital.

1.  Página 1 — Portada y resumen ejecutivo: entidad (dirección o municipio), comarca y provincia, precio consultado si se ha introducido, banda de referencia con indicador de posición, y aviso legal.

2.  Página 2 — Horquilla de referencia: gráfico P25/mediana/P75 del entorno con el precio del inmueble superpuesto, en €/mes y €/m² cuando exista, con la fuente y el período.

3.  Página 3 — Comparativa territorial: mediana del municipio frente a comarca, provincia y Catalunya (y sección/distrito si hay correspondencia), con diferencias absolutas y porcentuales.

4.  Página 4 — Evolución histórica: serie del IPVA de Catalunya y provincia (gráfico), variación anual y acumulada, y evolución municipal de medias de fianzas cuando exista.

5.  Página 5 — Esfuerzo económico: renta de referencia (persona y hogar, con año), indicador de esfuerzo con su fórmula, comparativa territorial y explicación de metodología y limitaciones.

6.  Página 6 — Fianza y garantías: importe de una mensualidad según el alquiler introducido, límite legal de garantías adicionales, obligaciones de depósito e información del Registro de Fianzas con enlaces.

7.  Página 7 — Derechos y cláusulas: lista de comprobación antes de firmar (gastos, garantías, actualización de renta, cláusulas a vigilar) con la fuente normativa de cada punto.

8.  Página 8 — Ayudas y próximos pasos: convocatorias vigentes relevantes, requisitos generales, enlaces oficiales y bloque de fuentes utilizadas con fechas.

Cuando un dato territorial no esté disponible para la entidad elegida, la página correspondiente lo dirá de forma explícita («no disponible para este ámbito en el período X») en lugar de sustituirlo por aproximaciones: el informe no inventa ni extrapola, igual que la web.

### 5.2 Límite de cinco descargas al mes: control, idempotencia y registro

El límite se implementa en el servidor, nunca en el cliente, reutilizando el contador mensual existente (SubscriptionUsage con clave única por usuario, tipo y mes). El flujo de cada descarga: identificar al usuario autenticado y verificar su suscripción Premium vigente; leer el contador del mes natural en curso; si ya alcanza cinco, responder con el bloqueo y el número de descargas restantes; en caso contrario generar el PDF y, solo si la generación termina correctamente, incrementar el contador de forma atómica y registrar la fila correspondiente en PdfReportLog con usuario, entidad, versión de los datos (períodos y fuentes de cada indicador) y fecha. El reinicio es natural: la clave de mes cambia al empezar cada mes natural y no hay estados que restablecer.

1.  Comprobación y contador server-side con transacción: el incremento condicional (contador \< 5) evita superar el límite bajo peticiones concurrentes.

2.  Idempotencia frente a errores: si la generación del PDF falla, no se incrementa el contador y no se registra la descarga; el usuario reintenta sin penalización.

3.  Ventana de cortesía de 60 segundos por usuario y entidad: los reintentos inmediatos del navegador (GET duplicado) devuelven el mismo documento sin contar como nueva descarga.

4.  El usuario ve siempre cuántas descargas le quedan (en el panel y en la respuesta de la API), y cada informe incluye en su pie la fecha y la versión de los datos usados.

5.  Toda la información del informe sigue disponible en la web: el PDF es complementario, no sustituye la visualización (condición explícita del encargo).

## 6. Procesos automatizados de actualización

Cada fuente tiene su cadencia y su responsable de ejecución. Las importaciones son tareas del servidor (o scripts versionados ejecutados bajo demanda desde el panel de administración) que quedan registradas en ImportRun y AuditLog; ninguna actualización toca datos históricos: añade observaciones nuevas con su período. El objetivo operativo es que una actualización anual de IPVA o Atlas sea una operación de minutos, revisable y reversible.

**Tabla 9. Cadencia y mecanismo por fuente**

| **Fuente**                                  | **Cadencia**                  | **Mecanismo**                                                                                                               | **Salvaguardas**                                                                     |
|---------------------------------------------|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| INE · IPVA                                  | Anual                         | Importador que descarga las series oficiales (CCAA, provincias y municipios con cobertura) y crea las observaciones del año | Validación de recuentos y comparación con el año anterior; ejecución registrada      |
| INE · Atlas de renta                        | Anual (otoño)                 | Importador municipal de renta por persona y hogar; secciones censales opcional en fase posterior                            | Comprobación de cobertura de los 947 municipios; marca PARTIAL si faltan territorios |
| SERPAVI                                     | Anual + vigilancia trimestral | Revisión de la publicación estadística y del catálogo datos.gob.es; cuando existan ficheros, importador de rangos           | Cron semanal de vigilancia que notifica al administrador por correo si hay novedades |
| Ayudas y convocatorias                      | Según publicación             | Revisión editorial trimestral: alta/actualización de convocatorias, cambio de estado vigente/finalizada con fecha           | Cada cambio con fecha, autor y fuente; las finalizadas se conservan                  |
| Contenido legal (LAU, guías INJUVE/Consumo) | Revisión trimestral           | Actualización editorial de la guía con fecha de revisión registrada como importación editorial                              | Cita de la norma vigente en cada punto; revisión cuando cambie normativa             |

La correspondencia territorial se resuelve en la importación y no en tiempo de ejecución: los geocódigos de las fuentes INE se normalizan al código municipal ya presente en la base (ineCode de 5 dígitos y código Gencat de 6), las provincias y comarcas provienen de las propias tablas existentes, y la asignación de sección censal a edificios (si se activa) se hará por cruce espacial del centroide con la cartografía oficial, almacenando el resultado en la importación. Así se evitan mezclas de años y errores de correspondencia, y las consultas web leen solo de la base propia, sin llamadas externas en caliente.

## 7. Plan de implementación por fases y análisis de riesgos

### 7.1 Fases de desarrollo

**Tabla 10. Fases, entregables y tamaño estimado**

| **Fase**                                | **Entregables**                                                                                                                  | **Tamaño relativo** |
|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|---------------------|
| Fase 1 · Auditoría (completada)         | Este documento: arquitectura, datos, viabilidad de fuentes y propuesta                                                           | —                   |
| Fase 2 · Modelo de datos e importadores | Migraciones nuevas (DataSource, StatObservation, HousingAid, PdfReportLog), importadores IPVA y Atlas, ampliación de procedencia | Media               |
| Fase 3 · Indicadores                    | Servicio de cálculo (posición, banda, deltas, IPVA, esfuerzo) con pruebas unitarias sobre datos reales                           | Media               |
| Fase 4 · Integración web                | Bloques en ficha de edificio y municipio, ampliación del comparador, guía \#/guia con legal y ayudas; i18n ca/es y responsive    | Media-alta          |
| Fase 5 · Gating Premium                 | Flags nuevos en PlanSetting, controles server-side, diferenciación visual y teasers en gratuito                                  | Baja-media          |
| Fase 6 · Informe PDF ampliado           | PDF de 8 páginas, límite 5/mes con contador e idempotencia, contador visible en el panel                                         | Media               |
| Fase 7 · Validación                     | Verificación de calidad de datos contra fuentes, rendimiento, seguridad, UX y revisión final antes de anunciar funcionalidades   | Baja-media          |

Cada fase termina con despliegue a producción mediante el pipeline actual (commit a GitHub, despliegue automático en Vercel, verificación con sondas de API) y puede revertirse de forma independiente: las migraciones son aditivas, las funciones nuevas quedan tras flags de plan, y las vistas actuales no cambian de comportamiento hasta que el flag se activa. No se publicará ninguna funcionalidad nueva hasta que la calidad de los datos importados esté validada en la Fase 7, tal como exige el encargo.

### 7.2 Riesgos y mitigaciones

**Tabla 11. Riesgos identificados y mitigación**

| **Riesgo**                                                                          | **Impacto**                                                     | **Mitigación**                                                                                                                                                                                                    |
|-------------------------------------------------------------------------------------|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| SERPAVI no abre sus datos en ficheros (la solicitud en datos.gob.es sigue asignada) | Alto si se prometiera la banda por sección censal a corto plazo | La propuesta no la promete: nivel 1 (contexto estatal + consultor) inmediato; nivel 2 condicionado y vigilado trimestralmente; alternativa real: índex de referència de la Generalitat para Catalunya en consulta |
| Cobertura municipal incompleta del IPVA                                             | Medio                                                           | Se muestra únicamente la desagregación existente; el resto queda «no disponible» con la explicación; nunca se interpola                                                                                           |
| Correspondencia secciones censales imprecisa                                        | Medio (solo en la fase opcional)                                | Cruce espacial con cartografía oficial en importación, no en runtime; validación por municipio antes de publicar                                                                                                  |
| Interpretación errónea del esfuerzo económico                                       | Medio (reputacional)                                            | Etiquetado estricto de la variable (renta por hogar/persona y año), fórmula visible y avisos de que es un indicador territorial, no personal                                                                      |
| Actualizaciones anuales olvidadas                                                   | Bajo-medio                                                      | Cron de vigilancia semanal con aviso al administrador; ImportRun muestra la antigüedad de cada fuente; la UI muestra la fecha de cada dato                                                                        |
| Licencias y atribución                                                              | Bajo si se gestiona bien                                        | Atribución en cada bloque y en los PDF; catálogo DataSource con licencia por fuente; revisión del aviso legal                                                                                                     |
| Rendimiento en serverless                                                           | Bajo                                                            | Los datos se leen de la base propia (precargada); los gráficos se componen en el cliente; los PDF se generan bajo demanda con límite mensual que acota el coste                                                   |

### 7.3 Límites de la propuesta (qué no se hará)

1.  No se consultará de forma automatizada el rango SERPAVI de viviendas concretas (el servicio no ofrece API y su uso interactivo no está previsto para explotación programática).

2.  No se consultarán expedientes individuales del Registro de Fianzas: la integración es informativa y de calculadora, con enlaces al procedimiento oficial.

3.  No se publicará ningún dato por sección censal hasta disponer de la cartografía oficial importada y validada; el municipio es el nivel garantizado desde la Fase 2.

4.  No se creará ningún sistema de usuarios, pagos o informes paralelo: todo se apoya en el User, Subscription, PlanSetting y SubscriptionUsage existentes.

## 8. Conclusiones y siguientes pasos

Viabilidad global: alta. Dos de las fuentes del encargo (IPVA y Atlas de renta del INE) están disponibles, son reutilizables y cubren exactamente las funcionalidades 3 (evolución histórica) y 4 (esfuerzo económico); la capa jurídica y de ayudas (funcionalidades 5 y 6) es una integración editorial sencilla con gran valor percibido y coste de mantenimiento bajo; y la funcionalidad 1 (referencia oficial P25/mediana/P75 por inmueble) queda bien delimitada: contexto estatal y consultor oficial ahora, integración completa cuando SERPAVI abra sus datos, con vigilancia automatizada ya montada.

El argumento Premium sale reforzado con un esquema comprensible: gratis se ve la referencia básica y la guía completa; Premium desbloquea los cruces (banda completa, comparativa territorial, evolución con IPVA, esfuerzo económico) y los informes PDF de ocho páginas con límite de cinco al mes. Todo ello sobre la infraestructura existente, sin segundo sistema de usuarios ni de pagos, con migraciones aditivas y despliegues reversibles por el pipeline ya operativo.

Siguientes pasos propuestos: validar esta propuesta y, en caso de aprobación, iniciar la Fase 2 (modelo de datos e importadores INE), que es la única bloqueante del resto. Antes de empezar, conviene también confirmar que el flujo de suscripción con Stripe funciona en producción con pagos reales de prueba, punto que quedó pendiente de verificación en la última revisión.
