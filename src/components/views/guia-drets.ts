/**
 * v38.5 — Contingut dels dos acordeons legals de la Guia (#/guia),
 * col·locats entre «Fonts oficials» i «Informació bàsica de l'habitatge»:
 *
 *  1. «Drets i deures en un contracte de lloguer»: 4 desplegables (drets i
 *     deures de les persones llogateres i de les persones propietàries),
 *     orientat al lloguer d'habitatge habitual a Catalunya (LAU 29/1994 i
 *     normativa catalana vigent), amb nota legal i fonts oficials.
 *  2. «Desnonaments: drets i protecció de les persones llogateres»: qui pot
 *     tenir protecció, quan es pot suspendre el procediment i quan pot
 *     procedir la propietat, què no pot fer mai la propietat i què fer si
 *     arriba una notificació judicial.
 *
 * Tot és contingut orientatiu; mai no substitueix l'assessorament jurídic.
 */

export interface DretsSection {
  title: string;
  intro: string;
  bullets: readonly string[];
}

export interface GuideFont {
  t: string;
  u: string;
}

export interface DretsLocale {
  title: string;
  intro: string;
  sections: readonly DretsSection[];
  legalTitle: string;
  legalText: string;
  fontsLead: string;
  fonts: readonly GuideFont[];
}

export type DesBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: readonly string[] }
  | { type: "ol"; items: readonly string[] };

export interface DesSection {
  heading: string;
  blocks: readonly DesBlock[];
}

export interface DesnonamentLocale {
  title: string;
  intro: string;
  sections: readonly DesSection[];
  note: string;
  fonts: readonly GuideFont[];
}

export const GUIA_DRETS: { ca: DretsLocale; es: DretsLocale } = {
  ca: {
    title: "Drets i deures en un contracte de lloguer",
    intro:
      "El contingut està orientat al lloguer d'habitatge habitual a Catalunya, d'acord amb la Llei d'arrendaments urbans (LAU) i la normativa catalana vigent.",
    sections: [
      {
        title: "Drets de les persones llogateres",
        intro:
          "La persona llogatera té dret a gaudir de l'habitatge en condicions adequades d'habitabilitat, seguretat i privacitat durant tota la vigència del contracte.",
        bullets: [
          "Ús pacífic de l'habitatge: pot gaudir de l'immoble sense interferències injustificades per part de la propietat.",
          "Habitatge en bon estat: té dret que el propietari faci les reparacions necessàries per mantenir l'habitatge en condicions d'habitabilitat.",
          "Contracte transparent: ha de conèixer les condicions del lloguer, la renda, la durada, les despeses i les possibles actualitzacions.",
          "Justificants de pagament: pot demanar rebuts que acreditin els imports abonats i els conceptes corresponents.",
          "Privacitat: el propietari no pot accedir a l'habitatge sense el consentiment de la persona llogatera, excepte en els supòsits legalment previstos.",
          "Recuperació de la fiança: té dret a recuperar-la quan finalitzi el contracte, descomptant, si escau, els imports justificats per desperfectes o deutes.",
          "Finalització del contracte: pot desistir del contracte d'acord amb els terminis i les condicions establerts per la llei.",
        ],
      },
      {
        title: "Deures de les persones llogateres",
        intro:
          "La persona llogatera es compromet a fer un ús responsable de l'habitatge i a respectar les condicions acordades en el contracte.",
        bullets: [
          "Pagar el lloguer: abonar puntualment la renda mensual i les despeses que li corresponguin segons el contracte.",
          "Tenir cura de l'habitatge: conservar-lo en bon estat i fer-ne un ús adequat.",
          "Comunicar incidències: informar la propietat, al més aviat possible, de qualsevol avaria, desperfecte o reparació necessària.",
          "Assumir les petites reparacions: fer-se càrrec de les petites reparacions derivades del desgast per l'ús ordinari de l'habitatge.",
          "Respectar les normes de convivència: evitar activitats molestes, insalubres, nocives, perilloses o il·legals.",
          "No fer obres sense autorització: demanar el consentiment escrit de la propietat abans de fer modificacions que el requereixin.",
          "No sotsarrendar sense permís: no cedir ni sotsarrendar totalment o parcialment l'habitatge sense el consentiment escrit del propietari.",
          "Retornar l'habitatge: lliurar-lo en finalitzar el contracte en condicions adequades, tenint en compte el desgast derivat de l'ús habitual.",
        ],
      },
      {
        title: "Drets de les persones propietàries",
        intro:
          "La persona propietària té dret a rebre les contraprestacions pactades i a exigir que l'habitatge es conservi i s'utilitzi d'acord amb les condicions del contracte.",
        bullets: [
          "Cobrar la renda: rebre puntualment el pagament mensual del lloguer.",
          "Rebre la fiança: disposar de la garantia legal per cobrir possibles desperfectes imputables a la persona llogatera o obligacions pendents.",
          "Conservació de l'immoble: exigir que l'habitatge es mantingui en bon estat i que se'n faci un ús adequat.",
          "Reparació de danys: reclamar la reparació o compensació pels desperfectes causats per un ús negligent o indegut de l'habitatge.",
          "Actualització de la renda: aplicar les actualitzacions que corresponguin, sempre que estiguin previstes contractualment i respectin els límits legals vigents.",
          "Compliment del contracte: exigir que la persona llogatera respecti les condicions pactades.",
          "Rescissió del contracte: sol·licitar-ne la resolució quan es produeixin incompliments que constitueixin causa legal de finalització, com ara l'impagament, el sotsarrendament no autoritzat o els danys greus a l'habitatge.",
        ],
      },
      {
        title: "Deures de les persones propietàries",
        intro:
          "La persona propietària té la responsabilitat de garantir que l'habitatge es trobi en condicions adequades i de respectar els drets de la persona llogatera durant tota la relació contractual.",
        bullets: [
          "Garantir l'habitabilitat: lliurar l'habitatge en condicions adequades d'ús, seguretat i salubritat.",
          "Fer les reparacions necessàries: assumir les reparacions de conservació i les necessàries per mantenir l'habitatge habitable, excepte quan els desperfectes siguin imputables a la persona llogatera.",
          "Respectar la privacitat: no accedir a l'habitatge sense el consentiment de la persona llogatera, excepte en els supòsits legalment previstos.",
          "Formalitzar el contracte: facilitar un contracte amb les condicions legals i econòmiques corresponents.",
          "Lliurar la documentació obligatòria: proporcionar la cèdula d'habitabilitat i la informació i documentació energètica exigibles.",
          "Dipòsit de la fiança: dipositar la fiança legal a l'INCASÒL dins del termini establert per la normativa catalana.",
          "Justificar les despeses: acreditar els imports repercutits a la persona llogatera quan correspongui.",
          "Respectar les condicions del lloguer: no modificar unilateralment les condicions contractuals ni aplicar increments de renda fora dels supòsits permesos legalment.",
          "Retornar la fiança: retornar-la quan finalitzi el contracte, una vegada comprovades les obligacions pendents i l'estat de l'habitatge, amb les deduccions justificades que corresponguin.",
        ],
      },
    ],
    legalTitle: "Informació legal important",
    legalText:
      "Aquestes condicions són de caràcter general i poden variar segons el tipus de contracte, la data de signatura i la normativa aplicable. En els contractes d'habitatge habitual, la legislació estableix unes garanties mínimes que no es poden deixar sense efecte mitjançant pactes contraris a la llei.",
    fontsLead: "Per a més informació, es poden consultar les fonts oficials:",
    fonts: [
      { t: "Generalitat de Catalunya – Drets i obligacions de llogaters i propietaris", u: "https://habitatge.gencat.cat/ca/ambits/lloguer/drets-obligacions" },
      { t: "Generalitat de Catalunya – Contracte de lloguer", u: "https://habitatge.gencat.cat/ca/ambits/lloguer/contracte" },
      { t: "BOE – Llei d'arrendaments urbans (text consolidat)", u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-14703" },
    ],
  },
  es: {
    title: "Derechos y deberes en un contrato de alquiler",
    intro:
      "El contenido está orientado al alquiler de vivienda habitual en Cataluña, de acuerdo con la Ley de arrendamientos urbanos (LAU) y la normativa catalana vigente.",
    sections: [
      {
        title: "Derechos de las personas arrendatarias",
        intro:
          "La persona arrendataria tiene derecho a disfrutar de la vivienda en condiciones adecuadas de habitabilidad, seguridad y privacidad durante toda la vigencia del contrato.",
        bullets: [
          "Uso pacífico de la vivienda: puede disfrutar del inmueble sin interferencias injustificadas por parte de la propiedad.",
          "Vivienda en buen estado: tiene derecho a que el propietario haga las reparaciones necesarias para mantener la vivienda en condiciones de habitabilidad.",
          "Contrato transparente: debe conocer las condiciones del alquiler, la renta, la duración, los gastos y las posibles actualizaciones.",
          "Justificantes de pago: puede pedir recibos que acrediten los importes abonados y los conceptos correspondientes.",
          "Privacidad: el propietario no puede acceder a la vivienda sin el consentimiento de la persona arrendataria, excepto en los supuestos legalmente previstos.",
          "Recuperación de la fianza: tiene derecho a recuperarla cuando finalice el contrato, descontando, en su caso, los importes justificados por desperfectos o deudas.",
          "Finalización del contrato: puede desistir del contrato de acuerdo con los plazos y las condiciones establecidos por la ley.",
        ],
      },
      {
        title: "Deberes de las personas arrendatarias",
        intro:
          "La persona arrendataria se compromete a hacer un uso responsable de la vivienda y a respetar las condiciones acordadas en el contrato.",
        bullets: [
          "Pagar el alquiler: abonar puntualmente la renta mensual y los gastos que le correspondan según el contrato.",
          "Cuidar la vivienda: conservarla en buen estado y hacer de ella un uso adecuado.",
          "Comunicar incidencias: informar a la propiedad, lo antes posible, de cualquier avería, desperfecto o reparación necesaria.",
          "Asumir las pequeñas reparaciones: hacerse cargo de las pequeñas reparaciones derivadas del desgaste por el uso ordinario de la vivienda.",
          "Respetar las normas de convivencia: evitar actividades molestas, insalubres, nocivas, peligrosas o ilegales.",
          "No hacer obras sin autorización: pedir el consentimiento por escrito de la propiedad antes de hacer modificaciones que lo requieran.",
          "No subarrendar sin permiso: no ceder ni subarrendar total o parcialmente la vivienda sin el consentimiento por escrito del propietario.",
          "Devolver la vivienda: entregarla al finalizar el contrato en condiciones adecuadas, teniendo en cuenta el desgaste derivado del uso habitual.",
        ],
      },
      {
        title: "Derechos de las personas propietarias",
        intro:
          "La persona propietaria tiene derecho a recibir las contraprestaciones pactadas y a exigir que la vivienda se conserve y se utilice de acuerdo con las condiciones del contrato.",
        bullets: [
          "Cobrar la renta: recibir puntualmente el pago mensual del alquiler.",
          "Recibir la fianza: disponer de la garantía legal para cubrir posibles desperfectos imputables a la persona arrendataria u obligaciones pendientes.",
          "Conservación del inmueble: exigir que la vivienda se mantenga en buen estado y que se haga de ella un uso adecuado.",
          "Reparación de daños: reclamar la reparación o compensación por los desperfectos causados por un uso negligente o indebido de la vivienda.",
          "Actualización de la renta: aplicar las actualizaciones que correspondan, siempre que estén previstas contractualmente y respeten los límites legales vigentes.",
          "Cumplimiento del contrato: exigir que la persona arrendataria respete las condiciones pactadas.",
          "Rescisión del contrato: solicitar su resolución cuando se produzcan incumplimientos que constituyan causa legal de finalización, como el impago, el subarrendamiento no autorizado o los daños graves en la vivienda.",
        ],
      },
      {
        title: "Deberes de las personas propietarias",
        intro:
          "La persona propietaria tiene la responsabilidad de garantizar que la vivienda se encuentre en condiciones adecuadas y de respetar los derechos de la persona arrendataria durante toda la relación contractual.",
        bullets: [
          "Garantizar la habitabilidad: entregar la vivienda en condiciones adecuadas de uso, seguridad y salubridad.",
          "Hacer las reparaciones necesarias: asumir las reparaciones de conservación y las necesarias para mantener la vivienda habitable, excepto cuando los desperfectos sean imputables a la persona arrendataria.",
          "Respetar la privacidad: no acceder a la vivienda sin el consentimiento de la persona arrendataria, excepto en los supuestos legalmente previstos.",
          "Formalizar el contrato: facilitar un contrato con las condiciones legales y económicas correspondientes.",
          "Entregar la documentación obligatoria: proporcionar la cédula de habitabilidad y la información y documentación energética exigibles.",
          "Depósito de la fianza: depositar la fianza legal en el INCASÒL dentro del plazo establecido por la normativa catalana.",
          "Justificar los gastos: acreditar los importes repercutidos a la persona arrendataria cuando corresponda.",
          "Respetar las condiciones del alquiler: no modificar unilateralmente las condiciones contractuales ni aplicar incrementos de renta fuera de los supuestos permitidos legalmente.",
          "Devolver la fianza: devolverla cuando finalice el contrato, una vez comprobadas las obligaciones pendientes y el estado de la vivienda, con las deducciones justificadas que correspondan.",
        ],
      },
    ],
    legalTitle: "Información legal importante",
    legalText:
      "Estas condiciones son de carácter general y pueden variar según el tipo de contrato, la fecha de firma y la normativa aplicable. En los contratos de vivienda habitual, la legislación establece unas garantías mínimas que no se pueden dejar sin efecto mediante pactos contrarios a la ley.",
    fontsLead: "Para más información, se pueden consultar las fuentes oficiales:",
    fonts: [
      { t: "Generalitat de Catalunya – Drets i obligacions de llogaters i propietaris", u: "https://habitatge.gencat.cat/ca/ambits/lloguer/drets-obligacions" },
      { t: "Generalitat de Catalunya – Contracte de lloguer", u: "https://habitatge.gencat.cat/ca/ambits/lloguer/contracte" },
      { t: "BOE – Ley de arrendamientos urbanos (texto consolidado)", u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-14703" },
    ],
  },
} as const;

export const GUIA_DESNONAMENT: { ca: DesnonamentLocale; es: DesnonamentLocale } = {
  ca: {
    title: "Desnonaments: drets i protecció de les persones llogateres",
    intro:
      "La legislació espanyola estableix diferents mecanismes per protegir les persones llogateres davant d'un possible desnonament, especialment quan es troben en una situació de vulnerabilitat econòmica o social i no disposen d'una alternativa habitacional.",
    sections: [
      {
        heading: "Qui pot tenir protecció davant d'un desnonament?",
        blocks: [
          {
            type: "p",
            text: "La normativa preveu mesures especials de protecció per a les persones o unitats familiars que es troben en situacions com ara:",
          },
          {
            type: "ul",
            items: [
              "Persones o famílies amb ingressos econòmics insuficients per assumir el cost de l'habitatge.",
              "Famílies amb menors d'edat a càrrec.",
              "Unitats familiars monoparentals.",
              "Persones amb discapacitat o en situació de dependència.",
              "Persones majors de 65 anys en determinades circumstàncies.",
              "Víctimes de violència de gènere.",
              "Persones que, per la seva situació econòmica i social, no disposen d'una alternativa habitacional adequada.",
            ],
          },
          {
            type: "p",
            text: "La situació de vulnerabilitat s'ha d'acreditar i és valorada d'acord amb els criteris legals, els informes dels serveis socials i les circumstàncies de cada cas.",
          },
        ],
      },
      {
        heading: "Quan es pot suspendre un desnonament?",
        blocks: [
          {
            type: "p",
            text: "Quan una persona llogatera acredita una situació de vulnerabilitat econòmica i no disposa d'una alternativa habitacional, el procediment de desnonament pot quedar suspès judicialment en els supòsits previstos per la llei.",
          },
          {
            type: "p",
            text: "Aquesta protecció depèn, entre altres factors, de qui és el propietari de l'habitatge, de la seva situació econòmica i de si l'Administració ha ofert una alternativa habitacional adequada.",
          },
          {
            type: "p",
            text: "La normativa també preveu una protecció específica en els procediments per impagament del lloguer: quan es compleixen els requisits legals, l'Administració pot disposar de dos mesos per oferir una alternativa habitacional o assumir el pagament del deute i les costes corresponents. Si es compleixen les condicions d'aquesta mesura, el procediment finalitza i el contracte es manté vigent.",
          },
        ],
      },
      {
        heading: "Quan es pot desnonar una persona llogatera?",
        blocks: [
          {
            type: "p",
            text: "La propietat pot sol·licitar judicialment la finalització del contracte i la recuperació de l'habitatge quan es produeixen causes legalment justificades, com ara:",
          },
          {
            type: "ul",
            items: [
              "Impagament del lloguer o d'altres quantitats que correspongui pagar a la persona llogatera.",
              "Impagament de la fiança o de la seva actualització quan sigui exigible.",
              "Sotsarrendament o cessió de l'habitatge sense autorització.",
              "Danys intencionats a l'immoble o obres no autoritzades quan calgui el consentiment de la propietat.",
              "Realització d'activitats molestes, insalubres, perilloses o il·legals.",
              "Finalització del contracte quan s'han complert els terminis i requisits legals per recuperar l'habitatge.",
            ],
          },
          {
            type: "p",
            text: "Tot i això, si la persona llogatera es troba en situació de vulnerabilitat, pot tenir dret a les mesures de protecció o suspensió que estableixi la legislació vigent.",
          },
        ],
      },
      {
        heading: "La propietat pot fer fora directament una persona llogatera?",
        blocks: [
          {
            type: "p",
            text: "No. El propietari no pot canviar el pany, retirar les pertinences, tallar els subministraments ni obligar la persona llogatera a abandonar l'habitatge pel seu compte.",
          },
          {
            type: "p",
            text: "La recuperació de la possessió s'ha de fer seguint el procediment legal corresponent i, quan sigui necessari, mitjançant una resolució judicial i l'actuació de les autoritats competents.",
          },
        ],
      },
      {
        heading: "Què ha de fer una persona que rep una notificació de desnonament?",
        blocks: [
          {
            type: "p",
            text: "És important no ignorar cap notificació judicial i actuar al més aviat possible:",
          },
          {
            type: "ol",
            items: [
              "Contactar amb els serveis socials del municipi per acreditar la possible situació de vulnerabilitat.",
              "Sol·licitar assessorament jurídic i, si es compleixen els requisits, assistència jurídica gratuïta.",
              "Presentar davant del jutjat la documentació necessària per acreditar la situació personal, familiar i econòmica.",
              "Consultar les possibles ajudes al lloguer i les alternatives habitacionals disponibles.",
            ],
          },
          {
            type: "p",
            text: "La protecció davant d'un desnonament no és automàtica ni permanent: depèn de les circumstàncies de cada cas, dels requisits legals i de la resolució judicial corresponent.",
          },
        ],
      },
    ],
    note: "Contingut orientatiu sobre la legislació vigent (LAU, Llei d'enjudiciament civil i normativa catalana d'habitatge). La protecció depèn de les circumstàncies de cada cas: no substitueix l'assessorament jurídic.",
    fonts: [
      { t: "Generalitat de Catalunya – Estic en risc de perdre l'habitatge on visc", u: "https://web.gencat.cat/ca/ciutadania/habitatge/risc-perdre-habitatge" },
      { t: "BOE – Llei d'arrendaments urbans (text consolidat)", u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-14703" },
    ],
  },
  es: {
    title: "Desahucios: derechos y protección de las personas arrendatarias",
    intro:
      "La legislación española establece diferentes mecanismos para proteger a las personas arrendatarias frente a un posible desahucio, especialmente cuando se encuentran en una situación de vulnerabilidad económica o social y no disponen de una alternativa habitacional.",
    sections: [
      {
        heading: "¿Quién puede tener protección frente a un desahucio?",
        blocks: [
          {
            type: "p",
            text: "La normativa prevé medidas especiales de protección para las personas o unidades familiares que se encuentran en situaciones como:",
          },
          {
            type: "ul",
            items: [
              "Personas o familias con ingresos económicos insuficientes para asumir el coste de la vivienda.",
              "Familias con menores de edad a cargo.",
              "Unidades familiares monoparentales.",
              "Personas con discapacidad o en situación de dependencia.",
              "Personas mayores de 65 años en determinadas circunstancias.",
              "Víctimas de violencia de género.",
              "Personas que, por su situación económica y social, no disponen de una alternativa habitacional adecuada.",
            ],
          },
          {
            type: "p",
            text: "La situación de vulnerabilidad debe acreditarse y es valorada de acuerdo con los criterios legales, los informes de los servicios sociales y las circunstancias de cada caso.",
          },
        ],
      },
      {
        heading: "¿Cuándo se puede suspender un desahucio?",
        blocks: [
          {
            type: "p",
            text: "Cuando una persona arrendataria acredita una situación de vulnerabilidad económica y no dispone de una alternativa habitacional, el procedimiento de desahucio puede quedar suspendido judicialmente en los supuestos previstos por la ley.",
          },
          {
            type: "p",
            text: "Esta protección depende, entre otros factores, de quién sea el propietario de la vivienda, de su situación económica y de si la Administración ha ofrecido una alternativa habitacional adecuada.",
          },
          {
            type: "p",
            text: "La normativa también prevé una protección específica en los procedimientos por impago del alquiler: cuando se cumplen los requisitos legales, la Administración puede disponer de dos meses para ofrecer una alternativa habitacional o asumir el pago de la deuda y las costas correspondientes. Si se cumplen las condiciones de esta medida, el procedimiento finaliza y el contrato se mantiene vigente.",
          },
        ],
      },
      {
        heading: "¿Cuándo se puede desahuciar a una persona arrendataria?",
        blocks: [
          {
            type: "p",
            text: "La propiedad puede solicitar judicialmente la finalización del contrato y la recuperación de la vivienda cuando se producen causas legalmente justificadas, como:",
          },
          {
            type: "ul",
            items: [
              "Impago del alquiler o de otras cantidades que corresponda pagar a la persona arrendataria.",
              "Impago de la fianza o de su actualización cuando sea exigible.",
              "Subarrendamiento o cesión de la vivienda sin autorización.",
              "Daños intencionados al inmueble u obras no autorizadas cuando haga falta el consentimiento de la propiedad.",
              "Realización de actividades molestas, insalubres, peligrosas o ilegales.",
              "Finalización del contrato cuando se han cumplido los plazos y requisitos legales para recuperar la vivienda.",
            ],
          },
          {
            type: "p",
            text: "Aun así, si la persona arrendataria se encuentra en situación de vulnerabilidad, puede tener derecho a las medidas de protección o suspensión que establezca la legislación vigente.",
          },
        ],
      },
      {
        heading: "¿Puede la propiedad echar directamente a una persona arrendataria?",
        blocks: [
          {
            type: "p",
            text: "No. El propietario no puede cambiar la cerradura, retirar las pertenencias, cortar los suministros ni obligar a la persona arrendataria a abandonar la vivienda por su cuenta.",
          },
          {
            type: "p",
            text: "La recuperación de la posesión debe hacerse siguiendo el procedimiento legal correspondiente y, cuando sea necesario, mediante una resolución judicial y la actuación de las autoridades competentes.",
          },
        ],
      },
      {
        heading: "¿Qué debe hacer una persona que recibe una notificación de desahucio?",
        blocks: [
          {
            type: "p",
            text: "Es importante no ignorar ninguna notificación judicial y actuar lo antes posible:",
          },
          {
            type: "ol",
            items: [
              "Contactar con los servicios sociales del municipio para acreditar la posible situación de vulnerabilidad.",
              "Solicitar asesoramiento jurídico y, si se cumplen los requisitos, asistencia jurídica gratuita.",
              "Presentar ante el juzgado la documentación necesaria para acreditar la situación personal, familiar y económica.",
              "Consultar las posibles ayudas al alquiler y las alternativas habitacionales disponibles.",
            ],
          },
          {
            type: "p",
            text: "La protección frente a un desahucio no es automática ni permanente: depende de las circunstancias de cada caso, de los requisitos legales y de la resolución judicial correspondiente.",
          },
        ],
      },
    ],
    note: "Contenido orientativo sobre la legislación vigente (LAU, Ley de Enjuiciamiento Civil y normativa catalana de vivienda). La protección depende de las circunstancias de cada caso: no sustituye el asesoramiento jurídico.",
    fonts: [
      { t: "Generalitat de Catalunya – Estic en risc de perdre l'habitatge on visc", u: "https://web.gencat.cat/ca/ciutadania/habitatge/risc-perdre-habitatge" },
      { t: "BOE – Ley de arrendamientos urbanos (texto consolidado)", u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-14703" },
    ],
  },
} as const;
