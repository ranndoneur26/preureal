/**
 * v38.4 — Contingut de l'acordió «Informació bàsica de l'habitatge»
 * de la Guia (#/guia), col·locat després de «Fonts oficials».
 *
 * 8 blocs amb les preguntes que qualsevol persona que vol llogar es fa,
 * cada una amb RESPOSTA ACOTADA (no només la pregunta): límits legals
 * vigents (LAU 29/1994 amb la Llei 12/2023, Llei 13/2023 de la Generalitat,
 * ICAEN, INE, Incasòl), xifres orientatives marcades com a tals i referència
 * a les funcions pròpies de PreuReal (mapa, calculadora de la fiança).
 *
 * Tot és orientatiu i amb data de revisió a la vista; mai no substitueix
 * l'assessorament jurídic.
 */

export type Qa = readonly [question: string, answer: string];

export interface ViviendaBlock {
  title: string;
  qa: readonly Qa[];
}

export interface ViviendaLocale {
  title: string;
  intro: string;
  note: string;
  blocks: readonly ViviendaBlock[];
}

export const GUIA_VIVIENDA: { ca: ViviendaLocale; es: ViviendaLocale } = {
  ca: {
    title: "Informació bàsica de l'habitatge",
    intro:
      "Vuit blocs amb les preguntes que qualsevol persona que vulgui llogar es fa, amb resposta acotada: límits legals vigents a Catalunya, xifres orientatives i què comprovar a cada punt. Obre només el bloc que t'interessa.",
    note: "Respostes orientatives amb els límits legals vigents (LAU, Llei 13/2023 de la Generalitat, ICAEN, INE, Incasòl). No substitueix l'assessorament jurídic. Fonts i enllaços: vegeu «Fonts oficials».",
    blocks: [
      {
        title: "Dades essencials de l'habitatge",
        qa: [
          ["Preu mensual", "És la primera dada: compara'l amb la mitjana del municipi al mapa de PreuReal (gratuït). En zona tensada hi ha, a més, un màxim legal per als nous contractes."],
          ["Habitacions i banys", "Compte-les a la visita: un «doble dormitori» és sovint un menjador compartit. Pregunta si alguna habitació és interior (sense finestra)."],
          ["m² útils i construits", "Els útils són on vius; els construïts inclouen tabics i la part proporcional de zones comunes (10–20 % més). El Catastro registra els construïts: demana la referència i comprova-ho gratis a la seva seu electrònica."],
          ["Distribució", "Demana plànol (o fes-ne un de mà): mira quines habitacions donen al carrer (soroll) o a interior (silenci) i on queden cuina i banys respecte del menjador."],
          ["Planta i ascensor", "Mou el preu tant com els m²: la diferència entre un 1r sense ascensor i un 4t amb ascensor és significativa. Pregunta si l'ascensor té el manteniment al dia."],
          ["Estat de conservació", "Obre aixetes i armaris, mira sota el fregador i darrere dels mobles (les humitats s'amaguen allà). Si la finca té obres aprovades, pregunta per la derrama: les obres de conservació les paga el propietari."],
          ["Moblat o sense mobles", "Defineix-ho per escrit amb un inventari de mobles i electrodomèstics i el seu estat: és la millor protecció per recuperar la fiança sencera."],
          ["Disponibilitat per entrar", "Data exacta. Si et pressionen per pagar «avui mateix» sense visita ni contracte, és el patró típic d'estafa de pagament anticipat."],
          ["Antiguitat de l'edifici", "Es consulta gratis amb la referència catastral (seu electrònica del Catastro, any de construcció). Un edifici antic no és pitjor per si sol: mira conservació i certificat energètic."],
        ],
      },
      {
        title: "Fotografies, vídeo i estat real",
        qa: [
          ["Fotografies de totes les estances", "Si en falta una (bany, cuina), demana-la abans: allò que no surt a l'anunci sol tenir un motiu."],
          ["Vídeo o visita virtual", "Si no n'hi ha, demana una videotrucada en directe: comprova que aigua i llum funcionen i que no és un vídeo robat d'un altre anunci."],
          ["Façana i zones comunes", "El portal, l'ascensor i el terrat revelen el manteniment real de la finca. En edificis amb pati, pregunta qui l'usa i si hi ha derrames pendents."],
          ["Estat de la cuina i els banys", "Són les estances més cares de reformar: mira si hi ha fuites sota el fregadero, si l'aigua calenta arriba, les rajoles i l'extractor."],
          ["Qualitat dels acabats", "Toca-ho tot: pintura fresca pot tapar instal·lacions antigues. Un «reformat» amb els elèctrics originals no ho és."],
          ["Llum natural i orientació", "Visita a l'hora en què hi seràs realment. Sud = més hores de sol; nord = llum uniforme tot el dia; oest = calor de tarda."],
          ["Vistes des de les finestres", "Comprova que «vistes» no és «un pati de 3 m»: mira per la finestra i pregunta si hi ha construcció prevista davant."],
          ["Aprofitament de l'espai", "Passadissos, cantonades i armaris compten: un pis «gran» amb molts passadissos té menys m² útils. Porta cinta mètrica si tens dubtes."],
        ],
      },
      {
        title: "Ubicació i entorn",
        qa: [
          ["Adreça o zona", "Si no donen l'adreça exacta, demana-la com a mínim aproximada i comprova-la al mapa. Mai cap pagament abans de la visita."],
          ["Barri i entorn", "Visita de dia, de nit i a hora punta: parlar amb veïns és el millor sondeig de soroll i seguretat."],
          ["Distància al centre", "Compta més que els km: el temps real de trajecte amb transport públic fins a feina o facultat a primera hora."],
          ["Transport públic", "Comprova línies i freqüències reals (no «a 5 minuts de la parada»): l'ATM i Google Maps donen temps real."],
          ["Estacions de tren i bus", "Si viatges cada dia, mira Rodalies i línies interurbanes i cap on van: un lloguer més barat fora pot acabar sortint més car en abonaments i temps."],
          ["Supermercats i comerços", "Prova el «cercle de 10 minuts caminant»: supermercat, fleca, farmàcia i parada principal."],
          ["Escoles, CAP i farmàcies", "Localitza el CAP que correspon a l'adreça (CatSalut) i les escoles del barri si tens fills: decideix lloguers familiars."],
          ["Parcs i zones verdes", "Sonen bé a l'anunci: comprova de nit si són zona de festa. Una façana a parc suma silenci si no hi ha terrasses a sota."],
          ["Facilitat per aparcar", "Mira si és zona ORA/AREA (de pagament) o lliure i el preu d'una plaça al barri (≈50–200 €/mes a ciutat). Empadronat, pots optar a plaça de resident on existeixi."],
          ["Seguretat i tranquil·litat", "Millor indicador: visita de nit + comerç obert a les 22 h. Les dades oficials de delictes per districte són públiques si vols xifres."],
        ],
      },
      {
        title: "Preu i despeses addicionals",
        qa: [
          ["Preu mensual", "Fix, no «des de»: demana la renda exacta i què inclou (pàrquing, traster, comunitat). En zona tensada, l'excés sobre el màxim legal és nul."],
          ["Comunitat de veïns", "Per llei la paga el propietari (art. 20 LAU); només es poden traspasar a tu si el contracte ho pacta expressament i indica la durada."],
          ["IBI", "També del propietari per defecte (art. 20 LAU). Si l'anunci diu «IBI a càrrec de l'inquilí» sense clàusula al contracte, no t'aplica."],
          ["Subministraments (aigua, llum, gas)", "Pregunta titulars i si hi ha deutes: a la llum, el deute pot seguir el comptador. Demana factura mitjana d'hivern i d'estiu i canvia la titularitat el dia d'entrada."],
          ["Calefacció i aire", "El tipus ho canvia tot: gas natural o bomba de calor costen molt menys al mes que els radiadors elèctrics. Demana el kWh/m²·any del CEE."],
          ["Taxa de brossa", "Depèn de l'ordenança municipal i del pacte; en molts municipis catalans la paga l'ocupant. Demana si està al dia abans de signar."],
          ["Fiança", "Legal: 1 mes de renda (art. 36 LAU), que el propietari ha de dipositar a l'Incasòl. No és «l'últim mes»: és garantia, no lloguer."],
          ["Garanties addicionals", "Màxim 2 mensualitats addicionals en total per a habitatge habitual; si et demanen més, és il·legal. Fes la prova amb la calculadora de la fiança, més amunt en aquesta guia."],
          ["Honoraris d'agència", "Per regla general els paga el propietari a Catalunya (Llei 13/2023) i sempre que l'arrendador sigui empresa (art. 20 LAU). Si et cobren «el mes d'agència» sense servei contractat per tu, no és legal."],
          ["Total per entrar a viure", "Compta: 1 mes de fiança + fins a 2 de garantia + el primer mes = fins a 4 mensualitats exigibles d'un cop, més mudança i altes de subministraments (≈0–150 € segons companyia). Més de 4 mensualitats en un habitatge habitual: revisa-ho."],
        ],
      },
      {
        title: "Condicions del contracte",
        qa: [
          ["Duració", "Mínim 5 anys a petició teva (7 si l'arrendador és empresa): es prorroga any rere any fins a 10/11. Només pot ser per menys si tu ho demanes expressament (art. 9 LAU)."],
          ["Tipus de contracte", "«Vivienda habitual» = tots els drets de la LAU. «Temporal» només és legal amb una causa real i documentada (feina temporal, estudis, obra): és la clàusula que més drets et fa perdre."],
          ["Renovació", "Acabat el termini, la pròrroga és obligatòria per anys i automàtica; per acabar-ne necessites avisar amb un mínim de 30 dies naturals. En zona tensada, 3 anys més de pròrroga."],
          ["Actualització anual", "Revisa l'índex escrit al contracte (si no n'hi ha, el legal vigent de l'art. 18 LAU). Per als contractes en règim de zona tensada, l'INE publica l'Índex de Referencia de Arrendamiento (2,54 % interanual a setembre de 2026)."],
          ["Sortida anticipada", "Amb 6 mesos de contracte complits pots marxar avisant amb 30 dies; la compensació màxima és d'1 mensualitat per any que falti (art. 11 LAU)."],
          ["Mascotes", "La LAU no ho regula: la jurisprudència majoritària considera nul·les les prohibicions absolutes, però pacta-ho per escrit. Els danys causats serien descomptables de la fiança."],
          ["Empadronament", "És un dret: cap clàusula no el pot impedir i l'arrendador ha de facilitar la documentació. Sense padró perdes sanitat, escola i ajudes: no firmis si el bloquegen."],
          ["Normes de la comunitat", "Demana-les abans de signar (horaris, terrat, animals): poden prohibir coses que l'anunci no deia i formen part del teu dia a dia."],
          ["Reparacions", "Propietari: tot el que mantingui l'habitabilitat (aigua, teulada, calefacció central). Tu: les petites reparacions per l'ús diari (art. 21 LAU). Que consti al contracte."],
          ["Requisits econòmics", "És legal demanar nòmines, vida laboral o aval; no és legal discriminar per origen, família o situació personal (Llei 12/2023). Amb la garantia addicional ja cobreixen el risc: no acceptis condicions dobles."],
        ],
      },
      {
        title: "Eficiència energètica i confort",
        qa: [
          ["Certificat d'eficiència (CEE)", "Obligatori per llogar des de 2013, etiqueta A–G; a Catalunya es registra a l'ICAEN i val un màxim de 10 anys. El propietari ha de lliurar-te'l abans de firmar."],
          ["Consum estimat", "El kWh/m²·any de l'etiqueta permet estimar factures: la diferència entre un F/G i un B/C pot ser de centenars d'euros a l'hivern."],
          ["Tipus de calefacció", "Gas natural o bomba de calor ≪ elèctrica en factura mensual. Demana la mitjana de gener (hivern): és la dada que marca la factura real."],
          ["Aire acondicionat", "Si és bomba de calor refreda i escalfa; pregunta quan es va mantenir (filtres). En un interior sense instal·lació, afegir-ho no sempre és possible."],
          ["Finestres i aïllament", "Doble vidre amb cambra d'aire = menys soroll i factura. Passa la mà pels marcs a l'hivern: si notes corrent d'aire, ho notaràs cada mes."],
          ["Aïllament acústic", "Prova-ho a la visita: tanca i escolta el carrer, pregunta si hi ha hagut queixes de bar o obra i si la barana té vidre."],
          ["Orientació solar", "Sud = sol i llum; nord = fresca a l'estiu, fosca a l'hivern; oest = tardes calentes. Visita a l'hora en què hi seràs."],
          ["Ventilació i humitats", "Busca taques a sostres i cantonades, olor a tancat i finestres amb salnitre. La humitat persistent no s'arregla amb pintura."],
          ["Problemes estructurals", "Esquerdes diagonals sobre marcs, portes que no tanquen o terres bombats: pregunta si l'edifici té ITE al dia (obligatòria en edificis antics)."],
        ],
      },
      {
        title: "Característiques especials",
        qa: [
          ["Terrassa o balcó", "Suma qualitat de vida i preu: comprova si és d'ús privatiu (ha de constar al contracte) o comunitari, i si està coberta."],
          ["Plaça de pàrquing", "Si va amb el pis, ha de constar al contracte i al dipòsit d'Incasòl. A part, ≈50–200 €/mes a ciutat; demana si la plaça és fixa o rotativa."],
          ["Traster", "Igual que el pàrquing: en el contracte. Comprova accés, llum i humitat abans de valorar-lo."],
          ["Piscina comunitària", "Eleva la quota de comunitat (que per defecte paga el propietari, però pot pactar-se que la comparteixis). Pregunta l'import i la temporada."],
          ["Jardí i zona comunitària", "Pregunta horaris, manteniment i si hi ha derrames aprovades: les obres extraordinàries es pacten apart (art. 22 LAU)."],
          ["Accessibilitat (mobilitat reduïda)", "Ascensor des de la portalada, amplades de portes i bany usable amb cadira de rodes: comprova-ho en persona, cap anunci ho detalla bé."],
          ["Admissió de mascotes", "Pacta-ho per escrit (les prohibicions absolutes són nul·les per a la jurisprudència majoritària) i mira si hi ha parc caní a prop."],
          ["Espai per al teletreball", "Ubicació de l'espai (llum, soroll), prou endolls i cobertura real de fibra: comprova-la per adreça a la web de l'operadora."],
          ["Proximitat a la feina o la família", "Fes el trajecte real a hora punta: 20 minuts en mapa poden ser 50 amb trànsit i transbordaments."],
        ],
      },
      {
        title: "Seguretat i confiança",
        qa: [
          ["Qui és el propietari", "Compara el signatari amb la nota simple del Registre de la Propietat (≈10 €) o el certificat catastral. Si signa un gestor, demana l'apoderament."],
          ["L'habitatge està legalment disponible", "A Catalunya cal cèdula d'habitabilitat vigent per llogar. Si el «propietari» té excuses per no firmar ni fer visita, no paguis res."],
          ["Les fotos corresponen al pis real", "Si el pis no s'assembla o posen impediments a la visita, és l'estafa típica de pagament anticipat: mai transferències abans de veure i firmar."],
          ["Visitar la vivienda", "Sempre presencial (o videotrucada en directe si ets lluny): comprova que qui et mostra el pis té claus reals i pot obrir-ho tot."],
          ["Contracte legal", "La LAU obliga a formalitzar-lo per escrit (art. 1.2) i el propietari ha de dipositar la fiança a l'Incasòl. Sense contracte no tens pròrroga, desnonament protegit ni justificació del pagament."],
          ["Quina documentació et demanaran", "Normal: DNI/NIE, nòmines o prova d'ingressos, vida laboral i, si cal, aval. Desproporcionat: garants infinits, targetes o pagaments per apps de missatgeria."],
          ["Càrregues que afectin el lloguer", "La nota simple mostra hipoteca, embargos o inquilins anteriors. Una hipoteca no impedeix llogar, però convé saber-ho abans de firmar."],
          ["Coincidència anunci = contracte", "Compara preu, durada, garanties i mascotes clàusula per clàusula. Tot el que et prometin de paraula, posa-ho per escrit: sinó, no existeix."],
        ],
      },
    ],
  },
  es: {
    title: "Información básica de la vivienda",
    intro:
      "Ocho bloques con las preguntas que se hace —y debería hacerse— cualquier persona que quiera alquilar, con respuesta acotada: límites legales vigentes en Cataluña, cifras orientativas y qué comprobar en cada punto. Abre solo el bloque que te interese.",
    note: "Respuestas orientativas con los límites legales vigentes (LAU, Ley 13/2023 de la Generalitat, ICAEN, INE, Incasòl). No sustituye el asesoramiento jurídico. Fuentes y enlaces: vea «Fuentes oficiales».",
    blocks: [
      {
        title: "Datos esenciales de la vivienda",
        qa: [
          ["Precio mensual", "Es el primer dato: compáralo con la media del municipio en el mapa de PreuReal (gratuito). En zona tensionada existe además un máximo legal para los nuevos contratos."],
          ["Habitaciones y baños", "Cuéntalas en la visita: un «doble dormitorio» suele ser un salón compartido. Pregunta si alguna habitación es interior (sin ventana)."],
          ["m² útiles y construidos", "Los útiles son donde vives; los construidos incluyen tabiques y la parte proporcional de zonas comunes (10–20 % más). El Catastro registra los construidos: pide la referencia y compruébalo gratis en su sede electrónica."],
          ["Distribución", "Pide plano (o hazlo a mano): mira qué habitaciones dan a la calle (ruido) o a interior (silencio) y dónde quedan cocina y baños respecto al salón."],
          ["Planta y ascensor", "Mueve el precio tanto como los m²: la diferencia entre un 1º sin ascensor y un 4º con ascensor es significativa. Pregunta si el ascensor tiene el mantenimiento al día."],
          ["Estado de conservación", "Abre grifos y armarios, mira bajo el fregadero y detrás de los muebles (las humedades se esconden ahí). Si la finca tiene obras aprobadas, pregunta por la derrama: las obras de conservación las paga el propietario."],
          ["Amueblado o sin muebles", "Defínelo por escrito con un inventario de muebles y electrodomésticos y su estado: es la mejor protección para recuperar la fianza entera."],
          ["Disponibilidad para entrar", "Fecha exacta. Si te presionan para pagar «hoy mismo» sin visita ni contrato, es el patrón típico de estafa de pago anticipado."],
          ["Antigüedad del edificio", "Se consulta gratis con la referencia catastral (sede electrónica del Catastro, año de construcción). Un edificio antiguo no es peor por sí solo: mira conservación y certificado energético."],
        ],
      },
      {
        title: "Fotografías, vídeo y estado real",
        qa: [
          ["Fotografías de todas las estancias", "Si falta una (baño, cocina), pídela antes: lo que no sale en el anuncio suele tener un motivo."],
          ["Vídeo o visita virtual", "Si no lo hay, pide una videollamada en directo: comprueba que agua y luz funcionan y que no es un vídeo robado de otro anuncio."],
          ["Fachada y zonas comunes", "El portal, el ascensor y la azotea revelan el mantenimiento real de la finca. En edificios con patio, pregunta quién lo usa y si hay derramas pendientes."],
          ["Estado de la cocina y los baños", "Son las estancias más caras de reformar: mira si hay fugas bajo el fregadero, si el agua caliente llega, los azulejos y el extractor."],
          ["Calidad de los acabados", "Tócalo todo: una pintura fresca puede tapar instalaciones antiguas. Un «reformado» con la electricidad original no lo es."],
          ["Luz natural y orientación", "Visita a la hora en que estarás realmente. Sur = más horas de sol; norte = luz uniforme todo el día; oeste = calor de tarde."],
          ["Vistas desde las ventanas", "Comprueba que «vistas» no es «un patio de 3 m»: mira por la ventana y pregunta si hay construcción prevista enfrente."],
          ["Aprovechamiento del espacio", "Pasillos, esquinas y armarios cuentan: un piso «grande» con muchos pasillos tiene menos m² útiles. Lleva cinta métrica si tienes dudas."],
        ],
      },
      {
        title: "Ubicación y entorno",
        qa: [
          ["Dirección o zona", "Si no dan la dirección exacta, pídela al menos aproximada y compruébala en el mapa. Nunca ningún pago antes de la visita."],
          ["Barrio y entorno", "Visita de día, de noche y en hora punta: hablar con vecinos es el mejor sondeo de ruido y seguridad."],
          ["Distancia al centro", "Cuenta más que los km: el tiempo real de trayecto en transporte público hasta el trabajo o la facultad a primera hora."],
          ["Transporte público", "Comprueba líneas y frecuencias reales (no «a 5 minutos de la parada»): el ATM y Google Maps dan tiempo real."],
          ["Estaciones de tren y autobús", "Si viajas cada día, mira Rodalies y las líneas interurbanas y hacia dónde van: un alquiler más barato fuera puede salir más caro en abonos y tiempo."],
          ["Supermercados y comercios", "Haz la prueba del «círculo de 10 minutos andando»: supermercado, panadería, farmacia y parada principal."],
          ["Colegios, centros médicos y farmacias", "Localiza el CAP que corresponde a la dirección (CatSalut) y los colegios del barrio si tienes hijos: decide alquileres familiares."],
          ["Parques y zonas verdes", "Suena bien en el anuncio: comprueba de noche si son zona de fiesta. Una fachada a parque suma silencio si no hay terrazas debajo."],
          ["Facilidad para aparcar", "Mira si es zona ORA/AREA (de pago) o libre y el precio de una plaza en el barrio (≈50–200 €/mes en ciudad). Empadronado, puedes optar a plaza de residente donde exista."],
          ["Seguridad y tranquilidad", "Mejor indicador: visita de noche + comercio abierto a las 22 h. Los datos oficiales de delitos por distrito son públicos si quieres cifras."],
        ],
      },
      {
        title: "Precio y gastos adicionales",
        qa: [
          ["Precio mensual", "Fijo, no «desde»: pide la renta exacta y qué incluye (parking, trastero, comunidad). En zona tensionada, el exceso sobre el máximo legal es nulo."],
          ["Comunidad de vecinos", "Por ley la paga el propietario (art. 20 LAU); solo pueden trasladártela si el contrato lo pacta expresamente e indica la duración."],
          ["IBI", "También del propietario por defecto (art. 20 LAU). Si el anuncio dice «IBI a cargo del inquilino» sin cláusula en el contrato, no te aplica."],
          ["Suministros (agua, luz, gas)", "Pregunta titulares y si hay deudas: en la luz, la deuda puede seguir al contador. Pide factura media de invierno y de verano y cambia la titularidad el día de entrada."],
          ["Calefacción y aire", "El tipo lo cambia todo: gas natural o bomba de calor cuestan mucho menos al mes que los radiadores eléctricos. Pide el kWh/m²·año del CEE."],
          ["Tasa de basuras", "Depende de la ordenanza municipal y del pacto; en muchos municipios catalanes la paga el ocupante. Pide si está al día antes de firmar."],
          ["Fianza", "Legal: 1 mes de renta (art. 36 LAU), que el propietario debe depositar en el Incasòl. No es «el último mes»: es garantía, no alquiler."],
          ["Garantías adicionales", "Máximo 2 mensualidades adicionales en total para vivienda habitual; si te piden más, es ilegal. Haz la prueba con la calculadora de la fianza, más arriba en esta guía."],
          ["Honorarios de agencia", "Por regla general los paga el propietario en Cataluña (Ley 13/2023) y siempre que el arrendador sea empresa (art. 20 LAU). Si te cobran «el mes de agencia» sin servicio contratado por ti, no es legal."],
          ["Total para entrar a vivir", "Cuenta: 1 mes de fianza + hasta 2 de garantía + el primer mes = hasta 4 mensualidades exigibles de golpe, más mudanza y altas de suministros (≈0–150 € según compañía). Más de 4 mensualidades en una vivienda habitual: revísalo."],
        ],
      },
      {
        title: "Condiciones del alquiler",
        qa: [
          ["Duración", "Mínimo 5 años a petición tuya (7 si el arrendador es empresa): se prorroga año tras año hasta 10/11. Solo puede ser por menos si tú lo pides expresamente (art. 9 LAU)."],
          ["Tipo de contrato", "«Vivienda habitual» = todos los derechos de la LAU. «Temporal» solo es legal con una causa real y documentada (trabajo temporal, estudios, obra): es la cláusula que más derechos te hace perder."],
          ["Renovación", "Terminado el plazo, la prórroga es obligatoria por años y automática; para acabar necesitas avisar con un mínimo de 30 días naturales. En zona tensionada, 3 años más de prórroga."],
          ["Actualización anual", "Revisa el índice escrito en el contrato (si no lo hay, el legal vigente del art. 18 LAU). Para los contratos en régimen de zona tensionada, el INE publica el Índice de Referencia de Arrendamiento (2,54 % interanual en septiembre de 2026)."],
          ["Salida anticipada", "Con 6 meses de contrato cumplidos puedes irte avisando con 30 días; la compensación máxima es de 1 mensualidad por año que falte (art. 11 LAU)."],
          ["Mascotas", "La LAU no lo regula: la jurisprudencia mayoritaria considera nulas las prohibiciones absolutas, pero pacta por escrito. Los daños causados serían descontables de la fianza."],
          ["Empadronamiento", "Es un derecho: ninguna cláusula puede impedirlo y el arrendador debe facilitar la documentación. Sin padrón pierdes sanidad, escuela y ayudas: no firmes si lo bloquean."],
          ["Normas de la comunidad", "Pídelas antes de firmar (horarios, azotea, animales): pueden prohibir cosas que el anuncio no decía y forman parte de tu día a día."],
          ["Reparaciones", "Propietario: todo lo que mantenga la habitabilidad (agua, tejado, calefacción central). Tú: las pequeñas reparaciones por el uso diario (art. 21 LAU). Que conste en el contrato."],
          ["Requisitos económicos", "Es legal pedir nóminas, vida laboral o aval; no es legal discriminar por origen, familia o situación personal (Ley 12/2023). Con la garantía adicional ya cubren el riesgo: no aceptes condiciones dobles."],
        ],
      },
      {
        title: "Eficiencia energética y confort",
        qa: [
          ["Certificado de eficiencia (CEE)", "Obligatorio para alquilar desde 2013, etiqueta A–G; en Cataluña se registra en el ICAEN y vale un máximo de 10 años. El propietario debe entregártelo antes de firmar."],
          ["Consumo estimado", "El kWh/m²·año de la etiqueta permite estimar facturas: la diferencia entre un F/G y un B/C puede ser de cientos de euros en invierno."],
          ["Tipo de calefacción", "Gas natural o bomba de calor ≪ eléctrica en factura mensual. Pide la media de enero (invierno): es el dato que marca tu factura real."],
          ["Aire acondicionado", "Si es bomba de calor enfría y calienta; pregunta cuándo se mantuvo (filtros). En un interior sin instalación, añadirlo no siempre es posible."],
          ["Ventanas y aislamiento", "Doble vidrio con cámara de aire = menos ruido y factura. Pasa la mano por los marcos en invierno: si notas corriente de aire, lo notarás cada mes."],
          ["Aislamiento acústico", "Pruébalo en la visita: cierra y escucha la calle, pregunta si ha habido quejas de bar u obra y si la barandilla tiene vidrio."],
          ["Orientación solar", "Sur = sol y luz; norte = fresco en verano, oscuro en invierno; oeste = tardes calurosas. Visita a la hora en que estarás."],
          ["Ventilación y humedades", "Busca manchas en techos y esquinas, olor a cerrado y ventanas con salitre. La humedad persistente no se arregla con pintura."],
          ["Problemas estructurales", "Grietas diagonales sobre marcos, puertas que no cierran o suelos abombados: pregunta si el edificio tiene la ITE al día (obligatoria en edificios antiguos)."],
        ],
      },
      {
        title: "Características especiales",
        qa: [
          ["Terraza o balcón", "Suma calidad de vida y precio: comprueba si es de uso privativo (debe constar en el contrato) o comunitario, y si está cubierta."],
          ["Plaza de parking", "Si va con el piso, debe constar en el contrato y en el depósito de Incasòl. Aparte, ≈50–200 €/mes en ciudad; pide si la plaza es fija o rotativa."],
          ["Trastero", "Igual que el parking: en el contrato. Comprueba acceso, luz y humedad antes de valorarlo."],
          ["Piscina comunitaria", "Eleva la cuota de comunidad (que por defecto paga el propietario, pero puede pactarse que la repartas). Pregunta el importe y la temporada."],
          ["Jardín y zona comunitaria", "Pregunta horarios, mantenimiento y si hay derramas aprobadas: las obras extraordinarias se pactan aparte (art. 22 LAU)."],
          ["Accesibilidad (movilidad reducida)", "Ascensor desde el portal, anchuras de puertas y baño usable con silla de ruedas: compruébalo en persona, ningún anuncio lo detalla bien."],
          ["Admisión de mascotas", "Pacta por escrito (las prohibiciones absolutas son nulas para la jurisprudencia mayoritaria) y mira si hay parque canino cerca."],
          ["Espacio para teletrabajar", "Ubicación del espacio (luz, ruido), enchufes suficientes y cobertura real de fibra: compruébala por dirección en la web del operador."],
          ["Proximidad al trabajo o la familia", "Haz el trayecto real en hora punta: 20 minutos en el mapa pueden ser 50 con tráfico y transbordos."],
        ],
      },
      {
        title: "Seguridad y confianza",
        qa: [
          ["Quién es el propietario", "Compara el firmante con la nota simple del Registro de la Propiedad (≈10 €) o el certificado catastral. Si firma un gestor, pide el poder."],
          ["La vivienda está legalmente disponible", "En Cataluña se necesita cédula de habitabilidad vigente para alquilar. Si el «propietario» pone excusas para no firmar ni hacer visita, no pagues nada."],
          ["Las fotos corresponden al piso real", "Si el piso no se parece o ponen impedimentos a la visita, es la estafa típica de pago anticipado: nunca transferencias antes de ver y firmar."],
          ["Visitar la vivienda", "Siempre presencial (o videollamada en directo si estás lejos): comprueba que quien te enseña el piso tiene llaves reales y puede abrirlo todo."],
          ["Contrato legal", "La LAU obliga a formalizarlo por escrito (art. 1.2) y el propietario debe depositar la fianza en el Incasòl. Sin contrato no tienes prórroga, desahucio protegido ni justificación del pago."],
          ["Qué documentación te pedirán", "Normal: DNI/NIE, nóminas o prueba de ingresos, vida laboral y, si hace falta, aval. Desproporcionado: avales infinitos, tarjetas o pagos por apps de mensajería."],
          ["Cargas que afecten al alquiler", "La nota simple muestra hipoteca, embargos o inquilinos anteriores. Una hipoteca no impide alquilar, pero conviene saberlo antes de firmar."],
          ["Coincidencia anuncio = contrato", "Compara precio, duración, garantías y mascotas cláusula por cláusula. Todo lo que te prometan de palabra, ponlo por escrito: si no, no existe."],
        ],
      },
    ],
  },
} as const;
