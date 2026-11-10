// Contenido — Parte B: Propuesta técnica, PDF Premium, procesos, fases y conclusiones.
module.exports = [

// ===================== 4. PROPUESTA TÉCNICA =====================
{ t: "h1", x: "4. Propuesta técnica: modelo de datos, indicadores e integración" },

{ t: "h2", x: "4.1 Información nueva a incorporar" },
{ t: "p", x: "La información nueva se organiza en cinco familias, cada una con su fuente, su unidad y su período. Ninguna sustituye a los datos actuales: las medias de fianzas de Incasòl siguen siendo la medida del mercado real registrado, y las fuentes nuevas aportan el marco de referencia oficial, la evolución del mercado, la renta del territorio y la capa jurídica y de ayudas. La distinción entre precios de referencia oficiales y precios de oferta se mantendrá siempre visible en la interfaz y en los informes." },
{ t: "table", caption: "Tabla 4. Familias de información nueva",
  header: ["Familia", "Variables concretas", "Fuente", "Unidad y período"],
  widths: [20, 34, 22, 24],
  rows: [
    ["Referencia oficial", "P25, mediana y P75 del precio de referencia; rango mensual orientativo; €/m²", "SERPAVI (nivel estatal disponible; municipal/sección condicionado a apertura) + índex de referència de la Generalitat como consulta", "€/mes y €/m²; año o trimestre de referencia"],
    ["Evolución del mercado", "Índice de precios en alquiler: tasa anual, variación acumulada desde la base", "INE · IPVA (experimental, base 2015)", "Índice (base 100) y %; anual"],
    ["Renta del territorio", "Renta neta media por persona; renta neta media por hogar", "INE · Atlas de distribución de renta", "€/año netos; año de referencia de la publicación"],
    ["Jurídica y contractual", "Fianza legal y garantías adicionales; gastos de gestión; actualización de renta; cláusulas a revisar; derechos y obligaciones", "LAU y Ley 12/2023; Departament de Territori; INJUVE; Consumo", "Contenido informativo con fecha de revisión"],
    ["Ayudas", "Convocatorias estatales y autonómicas con requisitos, edad, límites de renta y plazos", "MIVAU (Bono Alquiler Joven) y Agència de l'Habitatge", "Estado vigente/próxima/finalizada + fecha de actualización"],
  ]
},

{ t: "h2", x: "4.2 Tablas y campos existentes que se reutilizan" },
{ t: "p", x: "El principio rector es que cada dato nuevo vive una sola vez en la base de datos. Las tablas existentes no cambian de significado ni de estructura (salvo índices de rendimiento si hicieran falta): Municipality y Building siguen siendo las entidades geográficas e inmobiliarias; los datos estadísticos nuevos no se copian en columnas nuevas de Municipality, sino que se relacionan por código territorial desde la tabla de observaciones. De este modo, añadir un indicador o un año nunca requiere migración de datos históricos." },
{ t: "numlist", ref: "reuso", items: [
  "Municipality (ineCode, code, comarca, province): clave de correspondencia con todas las fuentes INE (código municipal de 5 dígitos) y con la publicación estadística de Incasòl; comarca y provincia ya presentes para la comparativa territorial.",
  "Building (centroidLat, centroidLng, municipalityCode): la asignación de sección censal se hará por cruce espacial del centroide en el momento de la importación (o como servicio puntual), sin alterar el modelo.",
  "ImportRun: cada importación de IPVA, Atlas, SERPAVI, ayudas o revisión editorial se registrará aquí con su fuente, estado y recuento de filas; la trazabilidad por fila apuntará a su ejecución.",
  "PlanSetting.features (JSON): se añaden los flags de las funciones nuevas (referencia oficial ampliada, comparativa territorial, histórico completo, esfuerzo, informes avanzados) sin migración y con los mismos controles de administración.",
  "SubscriptionUsage (tipo PDF_REPORT ya declarado): contador mensual del límite de cinco informes; su clave única por usuario, tipo y mes garantiza que el contador no se duplique.",
  "/api/provenance y AuditLog: el catálogo de procedencia se amplía con las fuentes nuevas y cada operación relevante queda auditada.",
] },

{ t: "h2", x: "4.3 Nuevas tablas y relaciones" },
{ t: "table", caption: "Tabla 5. Tablas nuevas propuestas (migración incremental, no destructiva)",
  header: ["Tabla", "Campos principales", "Relaciones y notas"],
  widths: [20, 44, 36],
  rows: [
    ["DataSource", "code (SERPAVI, INE_IPVA, INE_ATLAS, AYUDAS, LEGAL...), nombre, organismo, licencia, url oficial, periodicidad, unidad, metodología, notas", "Catálogo único de fuentes; alimenta automáticamente la procedencia mostrada en UI y PDF"],
    ["StatObservation", "sourceCode, indicatorCode, scope (CCAA/PROV/MUNI/COMARCA/DISTRICT/SECTION/NAT), geoCode, period, value, valueAux (p. ej. muestra), unit, publishedAt, extractedAt, runId, qualityFlag, sourceRef", "Formato largo genérico: una fila por dato; clave única (source, indicador, ámbito, geocódigo, período) evita duplicados; se relaciona con Municipality vía ineCode"],
    ["HousingAid", "título, ámbito (estatal/autonómico), territorio, estado (VIGENTE/PROXIMA/FINALIZADA), requisitos, edad mín/máx, límite de renta, plazos, url oficial, fuente, updatedAt, nota editorial", "Módulo de ayudas; filtrado por municipio del contexto; conservación de convocatorias finalizadas"],
    ["PdfReportLog", "userId, tipo de informe, entidad objetivo (municipio/edificio), dataVersion (JSON con períodos y fuentes usados), status (COMPLETED/FAILED), createdAt", "Registro de cada informe Premium; permite reconstruir qué versión de datos se usó"],
    ["CensusSection (opcional, fase posterior)", "code (SSCC INE), municipalityCode, districtCode, nombre, centroide o geometría", "Solo si se activa la comparativa por sección censal; se rellena con la cartografía oficial y el cruce espacial en importación"],
  ]
},
{ t: "p", x: "Las migraciones Prisma serán versionadas e incrementales (como las cuatro existentes), aplicables con prisma migrate deploy en Vercel, y ninguna modificará tablas vigentes: si algún día se necesita un índice adicional en una tabla existente, se hará con una migración dedicada y revisada. El despliegue es reversible porque las tablas nuevas no son necesarias para las funciones actuales." },

{ t: "h2", x: "4.4 Nuevos indicadores calculables" },
{ t: "p", x: "Los indicadores son fórmulas explícitas sobre datos etiquetados; ninguna cifra que muestre la web quedará sin fuente, unidad y período. La regla de oro metodológica: los precios de referencia oficiales (SERPAVI / índex de referència) describen el entorno; las medias de fianzas describen el mercado registrado; el IPVA describe la evolución; el Atlas describe la renta. Cada bloque de la interfaz indicará cuál de los cuatro mundos está mostrando." },
{ t: "table", caption: "Tabla 6. Indicadores nuevos y fórmulas",
  header: ["Indicador", "Fórmula / cálculo", "Interpretación y avisos"],
  widths: [22, 40, 38],
  rows: [
    ["Posición frente a la mediana (POS_VS_MEDIAN)", "(precio del inmueble − mediana del entorno) / mediana × 100", "±% respecto a la mediana de referencia del entorno territorial; mostrado con flecha y color; nunca como valoración exacta"],
    ["Banda de referencia (REF_BAND)", "comparación del precio con [P25, P75] de la referencia oficial del entorno", "«Por debajo / dentro / por encima del rango de referencia oficial» con la fuente y el período; solo cuando exista dato territorial"],
    ["Diferencia territorial (TERR_DELTA)", "diferencia absoluta y % entre dos territorios (municipio vs comarca, provincia, Catalunya o el más barato del comparador)", "Ya operativo entre entidades del comparador (v25); se extiende a comparaciones de un municipio con su comarca, provincia y Catalunya"],
    ["Evolución del mercado (IPVA_ANUAL / IPVA_ACUM)", "tasa interanual del IPVA y variación acumulada desde 2015, para Catalunya, la provincia y el municipio si hay cobertura", "Es un índice, no un precio: siempre se mostrará como variación % con año de referencia"],
    ["Esfuerzo económico (EFFORT)", "(alquiler medio mensual del municipio × 12) / renta neta media anual por hogar × 100", "Porcentaje del salario-hogar medio del territorio que representaría el alquiler medio; es un indicador de contexto territorial, NO una medición de la capacidad del usuario; se etiquetará con la variable usada (renta por hogar) y su año"],
    ["Esfuerzo por persona (EFFORT_PCAP)", "variante con renta neta media por persona, mostrada solo con etiqueta explícita", "Alternativa informativa; nunca se presentará como salario neto individual"],
    ["Ayudas relevantes (AID_MATCH)", "filtrado de HousingAid por municipio, edad y renta si el usuario lo indica", "Resultado orientativo con enlace a la convocatoria oficial; no es una precalificación"],
  ]
},
{ t: "p", x: "Ejemplo numérico real del cálculo de esfuerzo con datos actuales: si un municipio tiene un alquiler medio de 792,7 €/mes (caso de Cornellà de Llobregat, 2025) y la renta neta media por hogar del Atlas 2024 fuese de 45.000 €/año, el esfuerzo sería 792,7 × 12 / 45.000 = 21,1 %. La cifra se presentará como «un hogar con la renta media de este municipio destinaría alrededor del 21 % a un alquiler medio», con el año de cada dato y el aviso de que son medias territoriales." },

{ t: "h2", x: "4.5 Dónde se mostrará cada información" },
{ t: "p", x: "La integración respeta la navegación y el diseño actuales: no habrá sección nueva paralela ni panel externo. Cada dato aparece donde el usuario ya está mirando. La única vista nueva es una guía contextual (#/guia) que centraliza legal y ayudas porque son contenidos de lectura, y a la que se llega desde las fichas con enlaces contextuales (por ejemplo, junto al precio: «¿es razonable? mira la referencia oficial»; junto a la fianza: «calcula y revisa tus obligaciones»)." },
{ t: "table", caption: "Tabla 7. Mapa de integración en la web",
  header: ["Dónde", "Qué se añade", "Gratuito / Premium"],
  widths: [22, 52, 26],
  rows: [
    ["Ficha de edificio (panel del mapa)", "Bloque «Referencia oficial»: banda P25/mediana/P75 del entorno cuando exista, posición del precio, % respecto a la mediana, indicador visual (barra con marcador); enlace al consultor SERPAVI/Gencat; micro-bloque de esfuerzo municipal", "Mediana y % básicos para todos; banda completa y comparativa ampliada en Premium"],
    ["Ficha / panel de municipio", "Evolución histórica (ya existente) + variación IPVA de Catalunya y provincia + renta media del municipio y esfuerzo con metodología visible", "Tendencia municipal para todos; IPVA, renta y esfuerzo completos en Premium"],
    ["Comparador", "Columnas nuevas: % respecto al más barato (ya v25), banda de referencia y esfuerzo de cada territorio; gráfica ampliable a 6 entidades", "2 entidades gratis; 6 y columnas avanzadas en Premium/Pro"],
    ["Panel de usuario", "Contador de informes PDF del mes («te quedan X de 5»), acceso a la guía, estado de convocatorias guardadas", "Contador visible en Premium/Pro"],
    ["Guía #/guia (nueva vista ligera)", "Derechos y obligaciones, fianza y garantías con calculadora, gastos, actualización de renta, checklist de cláusulas, ayudas vigentes por territorio con fechas y enlaces", "Gratuita completa (captación y SEO); los cálculos contextualizados Premium"],
    ["Informes PDF", "El informe ampliado de 8 páginas (capítulo 5) con todos los indicadores", "Premium/Pro, máx. 5/mes"],
  ]
},

{ t: "h2", x: "4.6 Separación gratuito / Premium" },
{ t: "table", caption: "Tabla 8. Accesibilidad de las funciones nuevas por plan",
  header: ["Función nueva", "Gratuito", "Premium", "Pro-Agents"],
  widths: [40, 20, 20, 20],
  rows: [
    ["Mediana municipal de referencia y tendencia básica", "Sí", "Sí", "Sí"],
    ["Guía legal, fianza (calculadora) y ayudas", "Sí", "Sí", "Sí"],
    ["Banda completa P25/mediana/P75 y posición del precio", "Solo teaser (aviso de disponibilidad)", "Sí", "Sí"],
    ["Comparativa territorial completa (sección/districto/municipio/provincia/Catalunya)", "No", "Sí", "Sí"],
    ["Evolución IPVA completa y esfuerzo económico con metodología", "No", "Sí", "Sí"],
    ["Informe PDF ampliado de 8 páginas", "No", "Sí (5/mes)", "Sí (5/mes)"],
    ["Informe PDF de edificio", "No", "No", "Sí"],
    ["Exportación CSV", "No", "No", "Sí"],
  ]
},
{ t: "p", x: "El reparto sigue la lógica comercial del encargo: lo gratuito capta (referencia básica, guía y ayudas son además el contenido con mayor demanda orgánica), y lo Premium convierte (el cruce de datos —referencia oficial, evolución, renta y esfuerzo— es exactamente el valor que un inquilino o un agente no encuentra en portales clasificados). Los flags de PlanSetting permitirán recalibrar qué es teaser gratuito sin despliegues nuevos." },

{ t: "h2", x: "4.7 Calidad, validación y transparencia" },
{ t: "numlist", ref: "calidad", items: [
  "Cada dato mostrado llevará fuente oficial, período, fecha de actualización, ámbito y unidad; el catálogo DataSource alimenta esa ficha de identidad en UI y PDF.",
  "Nunca se mezclarán en la misma cifra precios de referencia oficiales, medias de fianzas registradas ni precios declarados por usuarios; los bloques estarán separados y etiquetados.",
  "Cuando falte un dato territorial se mostrará «no disponible para este ámbito/período» de forma explícita; no se extrapolará ninguna media entre territorios distintos.",
  "Cada indicador incluirá su aviso de limitación (por ejemplo: el esfuerzo usa renta media por hogar del territorio y no mide la situación de un hogar concreto; el IPVA es experimental y mide variación, no nivel).",
  "Los importadores validan cada carga: recuentos esperados, comparación con el valor anterior (desvíos anómalos marcan la ejecución como PARTIAL), tipos y rangos; el resultado queda en ImportRun y la carga defectuosa no se publica.",
  "Atribución y licencias: INE (reutilización con atribución), MIVAU y Generalitat (aviso legal de reutilización); la atribución aparecerá en cada bloque de datos y en la página de fuentes de los PDF.",
] },

// ===================== 5. INFORME PDF PREMIUM =====================
{ t: "h1", x: "5. Informe PDF Premium: diseño y control de cinco descargas mensuales" },

{ t: "h2", x: "5.1 Estructura del informe (8 páginas)" },
{ t: "p", x: "El informe ampliado se genera en el servidor con pdf-lib, reutilizando la identidad visual ya definida (paleta oscura con acento naranja, tipografía y estructura de bloques del informe actual) y siguiendo el guion del encargo. La generación es independiente de la visualización web: recoge datos de la base, etiqueta cada cifra con fuente y período, y produce un documento autocontenido optimizado para impresión y lectura digital." },
{ t: "numlist", ref: "pdf-pages", items: [
  "Página 1 — Portada y resumen ejecutivo: entidad (dirección o municipio), comarca y provincia, precio consultado si se ha introducido, banda de referencia con indicador de posición, y aviso legal.",
  "Página 2 — Horquilla de referencia: gráfico P25/mediana/P75 del entorno con el precio del inmueble superpuesto, en €/mes y €/m² cuando exista, con la fuente y el período.",
  "Página 3 — Comparativa territorial: mediana del municipio frente a comarca, provincia y Catalunya (y sección/distrito si hay correspondencia), con diferencias absolutas y porcentuales.",
  "Página 4 — Evolución histórica: serie del IPVA de Catalunya y provincia (gráfico), variación anual y acumulada, y evolución municipal de medias de fianzas cuando exista.",
  "Página 5 — Esfuerzo económico: renta de referencia (persona y hogar, con año), indicador de esfuerzo con su fórmula, comparativa territorial y explicación de metodología y limitaciones.",
  "Página 6 — Fianza y garantías: importe de una mensualidad según el alquiler introducido, límite legal de garantías adicionales, obligaciones de depósito e información del Registro de Fianzas con enlaces.",
  "Página 7 — Derechos y cláusulas: lista de comprobación antes de firmar (gastos, garantías, actualización de renta, cláusulas a vigilar) con la fuente normativa de cada punto.",
  "Página 8 — Ayudas y próximos pasos: convocatorias vigentes relevantes, requisitos generales, enlaces oficiales y bloque de fuentes utilizadas con fechas.",
] },
{ t: "p", x: "Cuando un dato territorial no esté disponible para la entidad elegida, la página correspondiente lo dirá de forma explícita («no disponible para este ámbito en el período X») en lugar de sustituirlo por aproximaciones: el informe no inventa ni extrapola, igual que la web." },

{ t: "h2", x: "5.2 Límite de cinco descargas al mes: control, idempotencia y registro" },
{ t: "p", x: "El límite se implementa en el servidor, nunca en el cliente, reutilizando el contador mensual existente (SubscriptionUsage con clave única por usuario, tipo y mes). El flujo de cada descarga: identificar al usuario autenticado y verificar su suscripción Premium vigente; leer el contador del mes natural en curso; si ya alcanza cinco, responder con el bloqueo y el número de descargas restantes; en caso contrario generar el PDF y, solo si la generación termina correctamente, incrementar el contador de forma atómica y registrar la fila correspondiente en PdfReportLog con usuario, entidad, versión de los datos (períodos y fuentes de cada indicador) y fecha. El reinicio es natural: la clave de mes cambia al empezar cada mes natural y no hay estados que restablecer." },
{ t: "numlist", ref: "pdf-ctl", items: [
  "Comprobación y contador server-side con transacción: el incremento condicional (contador < 5) evita superar el límite bajo peticiones concurrentes.",
  "Idempotencia frente a errores: si la generación del PDF falla, no se incrementa el contador y no se registra la descarga; el usuario reintenta sin penalización.",
  "Ventana de cortesía de 60 segundos por usuario y entidad: los reintentos inmediatos del navegador (GET duplicado) devuelven el mismo documento sin contar como nueva descarga.",
  "El usuario ve siempre cuántas descargas le quedan (en el panel y en la respuesta de la API), y cada informe incluye en su pie la fecha y la versión de los datos usados.",
  "Toda la información del informe sigue disponible en la web: el PDF es complementario, no sustituye la visualización (condición explícita del encargo).",
] },

// ===================== 6. PROCESOS DE ACTUALIZACIÓN =====================
{ t: "h1", x: "6. Procesos automatizados de actualización" },
{ t: "p", x: "Cada fuente tiene su cadencia y su responsable de ejecución. Las importaciones son tareas del servidor (o scripts versionados ejecutados bajo demanda desde el panel de administración) que quedan registradas en ImportRun y AuditLog; ninguna actualización toca datos históricos: añade observaciones nuevas con su período. El objetivo operativo es que una actualización anual de IPVA o Atlas sea una operación de minutos, revisable y reversible." },
{ t: "table", caption: "Tabla 9. Cadencia y mecanismo por fuente",
  header: ["Fuente", "Cadencia", "Mecanismo", "Salvaguardas"],
  widths: [22, 16, 34, 28],
  rows: [
    ["INE · IPVA", "Anual", "Importador que descarga las series oficiales (CCAA, provincias y municipios con cobertura) y crea las observaciones del año", "Validación de recuentos y comparación con el año anterior; ejecución registrada"],
    ["INE · Atlas de renta", "Anual (otoño)", "Importador municipal de renta por persona y hogar; secciones censales opcional en fase posterior", "Comprobación de cobertura de los 947 municipios; marca PARTIAL si faltan territorios"],
    ["SERPAVI", "Anual + vigilancia trimestral", "Revisión de la publicación estadística y del catálogo datos.gob.es; cuando existan ficheros, importador de rangos", "Cron semanal de vigilancia que notifica al administrador por correo si hay novedades"],
    ["Ayudas y convocatorias", "Según publicación", "Revisión editorial trimestral: alta/actualización de convocatorias, cambio de estado vigente/finalizada con fecha", "Cada cambio con fecha, autor y fuente; las finalizadas se conservan"],
    ["Contenido legal (LAU, guías INJUVE/Consumo)", "Revisión trimestral", "Actualización editorial de la guía con fecha de revisión registrada como importación editorial", "Cita de la norma vigente en cada punto; revisión cuando cambie normativa"],
  ]
},
{ t: "p", x: "La correspondencia territorial se resuelve en la importación y no en tiempo de ejecución: los geocódigos de las fuentes INE se normalizan al código municipal ya presente en la base (ineCode de 5 dígitos y código Gencat de 6), las provincias y comarcas provienen de las propias tablas existentes, y la asignación de sección censal a edificios (si se activa) se hará por cruce espacial del centroide con la cartografía oficial, almacenando el resultado en la importación. Así se evitan mezclas de años y errores de correspondencia, y las consultas web leen solo de la base propia, sin llamadas externas en caliente." },

// ===================== 7. FASES Y RIESGOS =====================
{ t: "h1", x: "7. Plan de implementación por fases y análisis de riesgos" },

{ t: "h2", x: "7.1 Fases de desarrollo" },
{ t: "table", caption: "Tabla 10. Fases, entregables y tamaño estimado",
  header: ["Fase", "Entregables", "Tamaño relativo"],
  widths: [30, 52, 18],
  rows: [
    ["Fase 1 · Auditoría (completada)", "Este documento: arquitectura, datos, viabilidad de fuentes y propuesta", "—"],
    ["Fase 2 · Modelo de datos e importadores", "Migraciones nuevas (DataSource, StatObservation, HousingAid, PdfReportLog), importadores IPVA y Atlas, ampliación de procedencia", "Media"],
    ["Fase 3 · Indicadores", "Servicio de cálculo (posición, banda, deltas, IPVA, esfuerzo) con pruebas unitarias sobre datos reales", "Media"],
    ["Fase 4 · Integración web", "Bloques en ficha de edificio y municipio, ampliación del comparador, guía #/guia con legal y ayudas; i18n ca/es y responsive", "Media-alta"],
    ["Fase 5 · Gating Premium", "Flags nuevos en PlanSetting, controles server-side, diferenciación visual y teasers en gratuito", "Baja-media"],
    ["Fase 6 · Informe PDF ampliado", "PDF de 8 páginas, límite 5/mes con contador e idempotencia, contador visible en el panel", "Media"],
    ["Fase 7 · Validación", "Verificación de calidad de datos contra fuentes, rendimiento, seguridad, UX y revisión final antes de anunciar funcionalidades", "Baja-media"],
  ]
},
{ t: "p", x: "Cada fase termina con despliegue a producción mediante el pipeline actual (commit a GitHub, despliegue automático en Vercel, verificación con sondas de API) y puede revertirse de forma independiente: las migraciones son aditivas, las funciones nuevas quedan tras flags de plan, y las vistas actuales no cambian de comportamiento hasta que el flag se activa. No se publicará ninguna funcionalidad nueva hasta que la calidad de los datos importados esté validada en la Fase 7, tal como exige el encargo." },

{ t: "h2", x: "7.2 Riesgos y mitigaciones" },
{ t: "table", caption: "Tabla 11. Riesgos identificados y mitigación",
  header: ["Riesgo", "Impacto", "Mitigación"],
  widths: [34, 14, 52],
  rows: [
    ["SERPAVI no abre sus datos en ficheros (la solicitud en datos.gob.es sigue asignada)", "Alto si se prometiera la banda por sección censal a corto plazo", "La propuesta no la promete: nivel 1 (contexto estatal + consultor) inmediato; nivel 2 condicionado y vigilado trimestralmente; alternativa real: índex de referència de la Generalitat para Catalunya en consulta"],
    ["Cobertura municipal incompleta del IPVA", "Medio", "Se muestra únicamente la desagregación existente; el resto queda «no disponible» con la explicación; nunca se interpola"],
    ["Correspondencia secciones censales imprecisa", "Medio (solo en la fase opcional)", "Cruce espacial con cartografía oficial en importación, no en runtime; validación por municipio antes de publicar"],
    ["Interpretación errónea del esfuerzo económico", "Medio (reputacional)", "Etiquetado estricto de la variable (renta por hogar/persona y año), fórmula visible y avisos de que es un indicador territorial, no personal"],
    ["Actualizaciones anuales olvidadas", "Bajo-medio", "Cron de vigilancia semanal con aviso al administrador; ImportRun muestra la antigüedad de cada fuente; la UI muestra la fecha de cada dato"],
    ["Licencias y atribución", "Bajo si se gestiona bien", "Atribución en cada bloque y en los PDF; catálogo DataSource con licencia por fuente; revisión del aviso legal"],
    ["Rendimiento en serverless", "Bajo", "Los datos se leen de la base propia (precargada); los gráficos se componen en el cliente; los PDF se generan bajo demanda con límite mensual que acota el coste"],
  ]
},

{ t: "h2", x: "7.3 Límites de la propuesta (qué no se hará)" },
{ t: "numlist", ref: "limites", items: [
  "No se consultará de forma automatizada el rango SERPAVI de viviendas concretas (el servicio no ofrece API y su uso interactivo no está previsto para explotación programática).",
  "No se consultarán expedientes individuales del Registro de Fianzas: la integración es informativa y de calculadora, con enlaces al procedimiento oficial.",
  "No se publicará ningún dato por sección censal hasta disponer de la cartografía oficial importada y validada; el municipio es el nivel garantizado desde la Fase 2.",
  "No se creará ningún sistema de usuarios, pagos o informes paralelo: todo se apoya en el User, Subscription, PlanSetting y SubscriptionUsage existentes.",
] },

// ===================== 8. CONCLUSIONES =====================
{ t: "h1", x: "8. Conclusiones y siguientes pasos" },
{ t: "p", x: "Viabilidad global: alta. Dos de las fuentes del encargo (IPVA y Atlas de renta del INE) están disponibles, son reutilizables y cubren exactamente las funcionalidades 3 (evolución histórica) y 4 (esfuerzo económico); la capa jurídica y de ayudas (funcionalidades 5 y 6) es una integración editorial sencilla con gran valor percibido y coste de mantenimiento bajo; y la funcionalidad 1 (referencia oficial P25/mediana/P75 por inmueble) queda bien delimitada: contexto estatal y consultor oficial ahora, integración completa cuando SERPAVI abra sus datos, con vigilancia automatizada ya montada." },
{ t: "p", x: "El argumento Premium sale reforzado con un esquema comprensible: gratis se ve la referencia básica y la guía completa; Premium desbloquea los cruces (banda completa, comparativa territorial, evolución con IPVA, esfuerzo económico) y los informes PDF de ocho páginas con límite de cinco al mes. Todo ello sobre la infraestructura existente, sin segundo sistema de usuarios ni de pagos, con migraciones aditivas y despliegues reversibles por el pipeline ya operativo." },
{ t: "p", x: "Siguientes pasos propuestos: validar esta propuesta y, en caso de aprobación, iniciar la Fase 2 (modelo de datos e importadores INE), que es la única bloqueante del resto. Antes de empezar, conviene también confirmar que el flujo de suscripción con Stripe funciona en producción con pagos reales de prueba, punto que quedó pendiente de verificación en la última revisión." },

];
