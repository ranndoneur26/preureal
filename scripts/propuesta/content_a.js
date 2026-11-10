// Contenido — Parte A: Resumen ejecutivo, Auditoría (Fase 1) y Viabilidad de fuentes.
// Tipos: h1/h2/h3, p, bullets, numlist, table, img, note
module.exports = [

// ===================== 1. RESUMEN EJECUTIVO =====================
{ t: "h1", x: "1. Resumen ejecutivo" },
{ t: "p", x: "Este documento responde al encargo de ampliar PreuReal.cat con nuevas fuentes de información pública y oficial. Contiene dos entregables: la auditoría técnica de la plataforma actual (Fase 1 del encargo) y la propuesta de implementación con el análisis de viabilidad de cada fuente. No se ha desarrollado todavía ninguna funcionalidad nueva: conforme al encargo, el desarrollo solo comenzará después de validar esta propuesta." },
{ t: "p", x: "La auditoría concluye que la infraestructura actual es sólida y reutilizable casi por completo. La plataforma ya dispone de 947 municipios catalanes con histórico de alquiler desde 2005 (fianzas depositadas en Incasòl), edificios reales del ICGC, un registro interno de procedencia de datos, un sistema de planes con límites configurables, un contador mensual de uso por usuario y un generador de informes PDF. Los nuevos datos no necesitan una arquitectura paralela: necesitan una tabla genérica de observaciones estadísticas, dos importadores anuales y nuevos bloques de información en las fichas existentes." },
{ t: "p", x: "El análisis de viabilidad aporta un hallazgo decisivo que condiciona el alcance: SERPAVI, el Sistema Estatal de Referencia del Precio del Alquiler del Ministerio de Vivienda, no publica hoy ficheros de datos abiertos ni ofrece una API documentada. Su consulta es interactiva (por referencia catastral o dirección) y la petición de apertura de sus datos en el portal datos.gob.es, presentada el 27 de agosto de 2026, sigue en estado «asignada» a 5 de noviembre de 2026, sin ficheros descargables. En cambio, las dos fuentes del INE —el Índice de Precios de Vivienda en Alquiler (IPVA, serie 2015-2024) y el Atlas de distribución de renta de los hogares (serie 2015-2024, publicada el 19 de octubre de 2026)— sí son integrables de inmediato y aportan la evolución histórica del alquiler y la renta necesaria para el indicador de esfuerzo económico." },
{ t: "p", x: "Sobre esa base, la propuesta define: un modelo de datos no destructivo (cinco tablas nuevas, ninguna tabla existente alterada), cuatro nuevos indicadores calculados (posición frente a la referencia, diferencia territorial, evolución del índice y esfuerzo económico), el mapa exacto de dónde aparecerá cada dato en las vistas actuales, la separación gratuito/Premium con el nuevo argumento comercial, y el informe PDF Premium de ocho páginas con un límite de cinco descargas al mes por usuario. El plan de implementación se organiza en las siete fases del encargo, con despliegues incrementales y reversibles." },

// ===================== 2. AUDITORÍA =====================
{ t: "h1", x: "2. Auditoría de la plataforma actual (Fase 1)" },

{ t: "h2", x: "2.1 Arquitectura y tecnologías" },
{ t: "p", x: "PreuReal.cat es una aplicación Next.js 16 (React 19, TypeScript) desplegada en Vercel como funciones serverless, con base de datos PostgreSQL gestionada (Supabase) accedida mediante Prisma ORM 6. La interfaz es una única página con navegación por anclas hash (#/ para el mapa, #/comparador, #/panell, #/preus, #/admin, #/avis-legal), lo que evita recargas y simplifica el despliegue. La capa visual usa Tailwind CSS 4 con componentes shadcn/ui; el mapa es Leaflet; las gráficas disponen de la librería Recharts 2.15 ya instalada (desde la v25 el comparador incluye gráfica); los PDF se generan con pdf-lib en el propio servidor." },
{ t: "p", x: "Los servicios externos ya integrados son: Stripe (suscripciones recurrentes de Premium, 7,99 €/mes, y Pro-Agents, 19,99 €/mes, con webhook firmado e idempotencia por evento), Resend (correo transaccional con outbox y reintentos), ICGC (geometría de edificios y límites municipales), Catastro (año de construcción) y el repositorio oficial de municipios de la Generalitat. El pipeline de entrega está consolidado: los cambios se publican en GitHub y Vercel despliega automáticamente, con verificación posterior mediante sondas de las rutas de API." },

{ t: "h2", x: "2.2 Base de datos: tablas y relaciones" },
{ t: "p", x: "El esquema Prisma contiene las entidades del negocio inmobiliario y de la explotación comercial. Las tablas centrales de datos son Municipality (947 registros) y Building (edificios e islas reales del ICGC). A su alrededor, las tablas de operación cubren usuarios, suscripciones, telemetría y gobernanza de datos. La tabla siguiente resume el inventario completo y el papel que cada tabla puede jugar en la ampliación." },
{ t: "table", caption: "Tabla 1. Inventario de tablas existentes y su relevancia para la ampliación",
  header: ["Tabla (Prisma)", "Contenido actual", "Relevancia para la ampliación"],
  widths: [22, 40, 38],
  rows: [
    ["Municipality", "947 municipios: código INE/Gencat, nombre, comarca, provincia, lat/lng, alquiler medio anual (rentLatest), período, año previo, histórico 2005-2025 (JSON), contratos de referencia, bandera de zona tensionada, límite GeoJSON cacheado", "Base de la correspondencia territorial; se referencia por ineCode; NO se duplica ningún dato nuevo aquí"],
    ["Building", "Edificios/illas ICGC RTT: polígono, centroide, refcat, año de construcción (Catastro), media de renta por edificio (importación)", "Recibirá los indicadores contextuales (sección censal asignada en importación)"],
    ["User / Subscription", "Usuarios con rol y plan; suscripciones Stripe con estados, períodos y caducidad automática", "Se reutiliza tal cual; el plan es la base del gating de las funciones nuevas"],
    ["SubscriptionUsage", "Contador mensual de uso por usuario y tipo (clave única userId+tipo+mes «YYYY-MM»); ya declara el tipo PDF_REPORT", "Perfecto para el límite de 5 informes PDF/mes sin crear un contador nuevo"],
    ["SearchLog / Event", "Registro de consultas y de eventos de conversión (incluye PDF_DOWNLOADED)", "Telemetría de los nuevos indicadores vistos y descargados"],
    ["PriceReport", "Informes de precio de usuarios (crowdsourcing con moderación)", "No se toca; los datos declarativos nunca se mezclan con los oficiales"],
    ["Favorite / SavedComparison", "Preferidos y comparaciones guardadas", "Las comparaciones podrán referenciar territorios con indicadores nuevos"],
    ["ImportRun", "Ejecuciones de importación (fuente, estado OK/PARTIAL/ERROR, filas creadas/actualizadas/omitidas)", "Se reutiliza como registro de cada importación de INE/SERPAVI/ayudas"],
    ["AuditLog", "Auditoría de acciones administrativas", "Registrará la ejecución de importaciones y cambios de convocatorias"],
    ["PlanSetting", "Límites y precios de los planes editables desde admin (JSON de características con caché de 30 s)", "Añadir flags nuevos (referencia oficial, esfuerzo, informes avanzados) sin migración"],
    ["RateLimit / StripeEvent / EmailLog", "Infraestructura de seguridad, idempotencia y correo", "Se reutilizan; sin cambios"],
  ]
},
{ t: "p", x: "La conclusión estructural es clara: no hace falta reconstruir nada. Las únicas adiciones de esquema necesarias son de naturaleza estadística (catalogar fuentes y almacenar observaciones territoriales) y comercial (registro de informes PDF generados), y ambas se resuelven con tablas nuevas que se suman al esquema sin alterar las existentes." },

{ t: "h2", x: "2.3 Datos actuales y procesos de obtención" },
{ t: "p", x: "Los datos municipales se producen hoy con un pipeline reproducible: el script prepare_data.py descarga los municipios oficiales (dataset abierto de la Generalitat), los Excel públicos de alquileres por ámbitos geográficos de Incasòl (fianzas depositadas) y aplica las listas de municipios de las resoluciones de zonas tensionadas publicadas en el DOGC; su salida es data/municipalities.json, que alimenta la carga inicial (seed) y las actualizaciones. El histórico municipal cubre los años 2005 a 2025 con número de contratos de referencia, lo que permite calcular variaciones y dibujar tendencias sin fuentes adicionales." },
{ t: "p", x: "Los edificios proceden de la API Territorial del ICGC (capa de construcciones RTT), se cachean en la base de datos y se enriquecen con el año de construcción del Catastro. Cada importación queda registrada en ImportRun (filas creadas, actualizadas u omitidas) y las acciones administrativas en AuditLog. Existe además un endpoint público de procedencia (/api/provenance) que documenta siete conjuntos de datos con fuente, licencia, unidad, ámbito, periodicidad, metodología y calidad estimada; la interfaz y los PDF ya lo citan. Este registro es la base natural sobre la que ampliar la trazabilidad de las fuentes nuevas." },

{ t: "h2", x: "2.4 Funcionalidades actuales por plan" },
{ t: "table", caption: "Tabla 2. Funcionalidades vigentes por plan (noviembre 2026)",
  header: ["Funcionalidad", "Gratuito", "Premium (7,99 €/mes)", "Pro-Agents (19,99 €/mes)"],
  widths: [40, 20, 20, 20],
  rows: [
    ["Mapa y búsqueda de edificios", "Sí", "Sí", "Sí"],
    ["Consultas detalladas de ficha", "3/mes", "Ilimitadas", "Ilimitadas"],
    ["Comparador (municipios/edificios)", "2 entidades", "6 entidades", "6 entidades"],
    ["Diferencias absolutas y % entre entidades + gráfica (v25)", "Sí", "Sí", "Sí"],
    ["Historial de consultas y favoritos", "No", "Sí", "Sí"],
    ["Comparaciones guardadas", "Sí (2/mes implícito)", "Sí", "Sí"],
    ["Informe PDF de municipio (1 página)", "No", "Sí", "Sí"],
    ["Informe PDF de edificio", "No", "No", "Sí"],
    ["Exportación CSV", "No", "No", "Sí"],
    ["Resumen mensual de preferidos por correo", "No", "Opt-in", "Opt-in"],
  ]
},
{ t: "p", x: "Los límites y precios son configurables desde el panel de administración (PlanSetting) y el servidor aplica siempre el límite real, incluso cuando la interfaz lo suaviza; el comparador es un buen ejemplo: el máximo por plan vive en la configuración efectiva y la ruta /api/comparator lo valida del lado del servidor. Este mismo patrón se extenderá a las funciones nuevas, de modo que ninguna funcionalidad Premium dependa únicamente del cliente." },

{ t: "h2", x: "2.5 Registro, autenticación y suscripciones" },
{ t: "p", x: "La autenticación es propia: correo y contraseña (bcrypt), verificación de correo con token de un solo uso, sesiones JWT con versión de token para invalidación global, restablecimiento de contraseña y protección por límite de intentos. El plan efectivo se sincroniza con las suscripciones vigentes en cada petición relevante: expira automáticamente los períodos vencidos (incluido el modo de prueba de 30 días y los períodos de gracia de pago) y adopta el plan más alto de las suscripciones activas. Los flujos de compra pasan por Stripe Checkout con webhook verificado y deduplicación de eventos. Para la ampliación, este mecanismo se reutiliza sin cambios: las funciones nuevas se declaran como características de plan y el servidor las comprueba con el mismo mecanismo planAllows ya existente." },

{ t: "h2", x: "2.6 Fichas y páginas donde se muestran los datos" },
{ t: "p", x: "La vista principal es el mapa: al seleccionar un edificio se abre un panel de ficha con sus datos geométricos, año de construcción y, si existe importación, la media de renta de la illa; en plan gratuito esta información se presenta como avance con límite de consultas. La ficha municipal (datos de alquiler medio, período, variación y tendencia) alimenta el mapa, el comparador y los informes. El comparador (v25) admite de 2 a 6 entidades según el plan, muestra diferencias absolutas y porcentuales frente a la entidad más barata, media y mediana del conjunto, y una gráfica. El panel de usuario concentra historial, favoritos, comparaciones guardadas (con botón de carga directa al comparador) y el opt-in del resumen mensual. Todas las vistas son responsive y bilingües (catalán y español), condiciones que la ampliación debe conservar." },

{ t: "h2", x: "2.7 Sistema de informes PDF existente" },
{ t: "p", x: "Existe un generador de informes en /api/reports/pdf construido con pdf-lib: una página A4 con la identidad visual de PreuReal (cabecera oscura con acento naranja), el alquiler medio oficial del municipio con período y número de contratos, la variación frente al año anterior, el estado de zona tensionada con su resolución legal, un gráfico de barras del histórico reciente, y bloques de fuentes, metodología, limitaciones estadísticas y aviso legal. El informe de edificio (Pro) añade la media de la illa cuando existe importación. El acceso está controlado por plan y por límite de peticiones, y la descarga queda registrada como evento." },
{ t: "p", x: "Este informe, sin embargo, es de resumen: no incluye los indicadores nuevos del encargo ni un control mensual de descargas. La propuesta lo conserva (sigue siendo el informe de edificio de Pro) y añade el informe Premium ampliado de ocho páginas descrito en el capítulo 5, que comparte constantes de marca y helpers con el actual para evitar duplicación." },

{ t: "h2", x: "2.8 Conclusiones de la auditoría" },
{ t: "numlist", ref: "audit-concl", items: [
  "La arquitectura soporta la ampliación sin cambios estructurales: serverless + PostgreSQL + Prisma es exactamente el patrón adecuado para datos estadísticos anuales de bajo volumen y alta lectura.",
  "El modelo de procedencia, el registro de importaciones y el contador mensual de uso ya existen: la trazabilidad y el límite de descargas del encargo tienen soporte nativo.",
  "No se sustituirá ni reconstruirá ninguna funcionalidad; las vistas actuales (mapa, ficha, comparador, panel) reciben los nuevos datos como bloques contextuales.",
  "Las carencias identificadas son tres: falta una tabla genérica para observaciones estadísticas territoriales, faltan los importadores de INE, y el informe PDF avanzado con límite mensual no existe todavía.",
] },

// ===================== 3. VIABILIDAD DE FUENTES =====================
{ t: "h1", x: "3. Viabilidad de las fuentes oficiales" },
{ t: "p", x: "Cada fuente se ha verificado contra su publicación oficial real (noviembre de 2026), comprobando formato, disponibilidad, desagregación territorial y condiciones de reutilización. Esta comprobación es la que evita supuestos falsos: el encargo exige no inventar APIs ni asumir automatizaciones imposibles, y la verificación ha modificado el alcance previsto en al menos un caso importante (SERPAVI)." },

{ t: "img", file: "cobertura_fuentes.png", caption: "Figura 1. Cobertura territorial real de cada fuente (estado 10-11-2026)" },

{ t: "h2", x: "3.1 SERPAVI — Sistema Estatal de Referencia del Precio del Alquiler (MIVAU)" },
{ t: "p", x: "Qué es: la explotación estadística de fuentes tributarias (AEAT) que el Ministerio de Vivienda y Agenda Urbana publica como rango de precios de referencia del alquiler, con carácter orientativo; en las zonas de mercado tensionado declaradas al amparo de la Ley 12/2023, el valor superior del rango limita la renta de los nuevos contratos según la normativa vigente. La web oficial (serpavi.mivau.gob.es) permite buscar una vivienda por referencia catastral o dirección y devuelve el rango de referencia de su entorno; además el Ministerio publica anualmente una explotación estadística en formato de tablas, gráficos y mapas (la edición SERPAVI 2026 se publicó en marzo de 2026)." },
{ t: "p", x: "Disponibilidad real verificada: no existe una API pública documentada ni ficheros abiertos descargables de los rangos por municipio o zona. En el portal datos.gob.es consta una solicitud de datos (presentada el 27 de agosto de 2026, con cuatro firmantes y actualizada el 5 de noviembre de 2026) pidiendo exactamente eso —precio de referencia en €/m² por municipio y zona con código INE, histórico y diccionario— y sigue en estado «asignada», sin ficheros resultantes. La consulta por referencia catastral es interactiva y no procede automatizarla (el propio servicio no la ofrece para uso programático)." },
{ t: "p", x: "Integración propuesta: en dos niveles. Nivel 1 (inmediato): incorporar la publicación estadística anual (tablas de la explotación SERPAVI) como contexto territorial de referencia estatal, citando año y fuente, y enlazar el consultor oficial desde las fichas cuando el usuario quiera comprobar una vivienda concreta. Nivel 2 (condicionado): en cuanto el Ministerio publique ficheros abiertos —vigilancia trimestral automatizada del catálogo— se activa la integración completa P25/mediana/P75 por municipio y sección. No se promete en ningún caso lo que hoy no es técnicamente accesible: la funcionalidad de rangos por sección censal quedará marcada como dependiente de esa apertura." },

{ t: "h2", x: "3.2 INE — Índice de Precios de Vivienda en Alquiler (IPVA)" },
{ t: "p", x: "Qué es: una estadística experimental del INE, con base 2015, que mide la evolución anual de los precios de la vivienda alquilada como residencia habitual, construida a partir de la información declarada a efectos tributarios (IRPF, modelo 100). Su última nota de prensa (11 de mayo de 2026) sitúa la variación anual de 2024 en el 3,5 %. Desagrega por comunidad autónoma y provincia y, con cobertura parcial, por municipios y distritos; existen además distribuciones por características (por ejemplo, antigüedad del contrato) publicadas como conjuntos de datos." },
{ t: "p", x: "Disponibilidad real verificada: tablas publicadas en INEbase y datasets en datos.gob.es; el INE ofrece servicios de datos (API Tempus3 y ficheros PC-Axis/CSV) para sus tablas, sin clave ni coste. Integración propuesta: importador anual que descarga las series de Catalunya, las cuatro provincias y (si la cobertura lo permite) municipios seleccionados, almacena cada observación con su período y fuente, y alimenta los gráficos de evolución. Advertencia metodológica que la interfaz debe reproducir siempre: el IPVA es un índice de evolución (variación porcentual), no un nivel de precio en euros; nunca debe presentarse como precio medio ni mezclarse con las medias de fianzas." },

{ t: "h2", x: "3.3 INE — Atlas de distribución de renta de los hogares" },
{ t: "p", x: "Qué es: la estadística experimental del INE que publica renta neta media por persona y por hogar con desagregación territorial fina: nacional, comunidades autónomas, provincias, municipios (con todos los indicadores para municipios de más de 2.000 habitantes) y secciones censales (más de 33.600 secciones en toda España). La serie 2015-2024 se publicó el 19 de octubre de 2026; a nivel nacional, la renta neta media por persona de 2024 alcanzó los 15.948 euros, un 6,1 % más que el año anterior." },
{ t: "p", x: "Disponibilidad real verificada: resultados en INEbase por territorios y años, con ficheros descargables; sin API dedicada para el Atlas, pero con formatos reutilizables estables. Integración propuesta: importador anual municipal (renta por persona y por hogar de los 947 municipios catalanes) y, en una fase opcional posterior, de secciones censales de Catalunya para la comparativa fina. La variable se etiquetará siempre con su unidad exacta (renta neta media anual por persona / por hogar, año de referencia) para cumplir la exigencia del encargo de no presentar una renta media territorial como salario individual." },

{ t: "h2", x: "3.4 Agència de l'Habitatge de Catalunya — Registro de Fianzas (Incasòl)" },
{ t: "p", x: "Situación singular: PreuReal ya consume esta fuente como dato principal (las medias municipales de alquiler provienen de las fianzas depositadas en Incasòl), por lo que no hay nada nuevo que integrar en el plano estadístico. Lo que añade el encargo es la capa informativa: qué es el Registro de Fianzas, quién debe depositar y cuándo (un mes desde la firma, devengando el depósito a favor del arrendatario), qué garantías adicionales admite la ley —hasta dos mensualidades adicionales para garantías distintas de la fianza legal (artículo 36 de la Ley de Arrendamientos Urbanos)—, cómo puede el arrendatario comprobar el depósito y qué ocurre si no se deposita. No existe —y legalmente no corresponde— una API para consultar expedientes individuales de terceros; la propuesta se limita a la calculadora de fianza (una mensualidad del alquiler introducido) y a los enlaces al procedimiento oficial de consulta." },

{ t: "h2", x: "3.5 Ministerio de Derechos Sociales, Consumo y Agenda 2030 — cláusulas y gastos" },
{ t: "p", x: "La utilidad práctica para un inquilino se concentra en cuatro bloques normativos con fuente estatal: cláusulas potencialmente abusivas (ley general de consumidores y jurisprudencia consolidada), gastos de gestión inmobiliaria y de formalización del contrato, que la Ley 12/2023 atribuyó al arrendador cuando este actúe como profesional, límites legales a las garantías adicionales, y reglas de actualización anual de la renta (IPC, con las restricciones propias de las zonas tensionadas, cuyos porcentajes máximos publica cada año el Departament de Territori, Habitatge i Transició Ecològica). La integración es editorial: una guía estructurada en la web, con fecha de revisión y enlaces a la fuente oficial de cada afirmación, y una lista de comprobación de cláusulas antes de firmar. No requiere base de datos propia (se versiona con fecha de revisión registrada como importación editorial)." },

{ t: "h2", x: "3.6 INJUVE — derechos de las personas inquilinas" },
{ t: "p", x: "El Instituto de la Juventud mantiene guías oficiales sobre derechos de arrendatarios, obligaciones de propietarios, condiciones de los contratos, gastos, garantías y procedimientos de reclamación. Su integración es idéntica a la del bloque anterior: contenidos de la guía contextualizados en la ficha (por ejemplo, junto a la calculadora de fianza) con atribución y enlace. Se tratará como un único módulo editorial de «guía del alquiler» junto al bloque 3.5, evitando duplicar contenidos de origen distinto sobre el mismo tema." },

{ t: "h2", x: "3.7 Generalitat y Estado — ayudas al alquiler" },
{ t: "p", x: "Panorama real (verificado en noviembre de 2026): el Bono Alquiler Joven estatal está integrado en el Plan Estatal de Vivienda 2026-2030 (regulado en el artículo 137 del Real Decreto 326/2026): aporta hasta 300 euros mensuales por vivienda habitual (200 si es habitación) a personas de 18 a 35 años con ingresos inferiores a tres veces el IPREM, y se gestiona por las comunidades autónomas, cada una con su convocatoria y plazos. En Catalunya, las ayudas al alquiler de la Agència de l'Habitatge (incluido el programa estatal y las convocatorias propias) se publican en su portal con requisitos y plazos." },
{ t: "p", x: "Integración propuesta: una tabla de ayudas en la base de datos con estado (vigente / próxima / finalizada), requisitos resumidos, límites de edad e ingresos, plazos, enlace oficial y fecha de actualización editorial; mostrada como módulo de ayudas con filtrado simple por municipio y, si el usuario lo facilita voluntariamente, por edad e intervalo de renta (siempre con el aviso de que la información es orientativa y decide la convocatoria oficial). Las convocatorias finalizadas se conservan con su fecha, cumpliendo la exigencia de distinguir vigentes de finalizadas." },

{ t: "table", caption: "Tabla 3. Resumen de viabilidad por fuente",
  header: ["Fuente", "Datos clave para PreuReal", "Disponibilidad real (10-11-2026)", "Vía de integración", "Periodicidad de actualización"],
  widths: [16, 24, 24, 20, 16],
  rows: [
    ["SERPAVI (MIVAU)", "Rangos de referencia P25/mediana/P75; €/m²", "Consulta interactiva; publicación anual de tablas; SIN ficheros abiertos (solicitud en datos.gob.es asignada)", "Nivel 1: contexto estatal + enlace al consultor. Nivel 2: condicionada a la apertura", "Anual; vigilancia trimestral del catálogo"],
    ["INE · IPVA", "Tasa anual y acumulada del índice (CCAA, provincia, municipios parciales)", "Disponible (tablas INEbase y datasets; servicios de datos del INE)", "Importador anual automatizado", "Anual (nota de prensa primavera)"],
    ["INE · Atlas de renta", "Renta neta media por persona y por hogar (municipio y sección)", "Disponible (serie 2015-2024 publicada 19-10-2026)", "Importador anual automatizado", "Anual (otoño)"],
    ["Incasòl · Fianzas", "Medias de alquiler (ya integradas)", "Ya integrada", "Solo capa informativa nueva (normativa y consulta)", "Anual con avances trimestrales (ya gestionado)"],
    ["Derechos Sociales / INJUVE", "Cláusulas, gastos, garantías, derechos", "Documentación oficial vigente", "Guía editorial con fecha de revisión y fuentes", "Revisión editorial trimestral"],
    ["Ayudas (Estado + Gencat)", "Bono Alquiler Joven y ayudas autonómicas", "Convocatorias vigentes publicadas (Plan Estatal 2026-2030, art. 137 RD 326/2026)", "Tabla de ayudas con estado y enlaces", "Según publicación; revisión trimestral"],
  ]
},
{ t: "p", x: "En síntesis: dos fuentes INE integrables de inmediato con importación anual automatizada, una capa legal-informativa de integración editorial sencilla, y SERPAVI en doble vía (contexto inmediato + integración completa cuando se abra el dato). Esta estructura garantiza que ninguna funcionalidad anunciada dependa de un acceso que hoy no existe." },

];
