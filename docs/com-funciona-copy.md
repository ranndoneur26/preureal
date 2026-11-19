# «Com funciona» — inventari funcional (C1) + copy final ca/es (C2) — 2026-11-17

Entregable del BLOQUE C del PROMPT MASTER. Dos parts:

1. **C1** — inventari funcional REAL del producte, extret del codi (mai de la
   home): què pot fer avui un usuari, amb evidència de fitxer.
2. **C2** — copy final en català i castellà, llest per entrar a `STRINGS`
   (`src/lib/i18n.ts`) amb les claus `howFull.*`, en llenguatge MOLT fàcil
   (frases ≤20 paraules, una acció per pas, cada terme tècnic explicat la
   primera vegada que surt), més la proposta d'implementació.

Filtre de claredat aplicat: «l'entendria una persona de 60 anys que mai no ha
usat un mapa online?». Cap frase amb jerga sense explicar.

---

## C1 — Inventari funcional real (des del codi)

| # | Funcionalitat | On | Què veu l'usuari | Evidència |
|---|---|---|---|---|
| 1 | Idioma ca/es | globus (AppShell) | canvi immediat; queda recordat (localStorage) i `<html lang>` sempre correcte | AppShell.tsx:37-85, v51 |
| 2 | Portada amb 2 eines | pestanyes «Consulta» / «Valora» | dues eines separades i etiquetades honestament | LandingView.tsx:82-101 |
| 3 | Mapa viu | /#/mapa i mini-mapa a la portada | Catalunya amb edificis reals ICGC colorets per la renta registrada (5 colors: verd<550 … vermell ≥1000 €/mes), zoom per carregar edificis (nivell 16+), lleuger (sense segrestar scroll) | MapView, LandingMap.tsx, guardes M1-M5 v49 |
| 4 | Fitxa d'edifici | clic a l'edifici | preu mitjà real registrat (o ≈ ref. de comarca), nº de contractes amb fiança, si el municipi és àrea tensada, referència catastral, any de construcció; detecció de nau industrial (sense estadística d'habitatges) | MapView.tsx (panel), i18n map.panel.*, verificat en viu amb /api/buildings |
| 5 | Zones tensades | capa + marca al municipi | 302 municipis amb preu regulat: 131 de la 2a tanda (TER/2408/2024, DOGC núm. 9196 de 3-7-2024) + 118 prorrogats de la 1a tanda (TER/3739/2026) + 53 nous (TER/3740/2026), DOGC 19-10-2026 | LandingView ÀREES TENSADES, i18n tense.* |
| 6 | Panells de la fitxa | mateixa fitxa | demografia (població, variacions, densitat, evolució — v50), parc de lloguer (rental share), serveis de l'entorn (EntornPanel) | DemografiaPanel.tsx, RentalSharePanel.tsx, EntornPanel.tsx (MapView:2029-2033) |
| 7 | Comparador d'anuncis | /#/analitza + portada compacta | intro dueix el preu de l'anunci → % sobre/baix la referència oficial; NOMÉS habitatge habitual (v48); informe en pantalla + PDF descarregable (v47) | AnalitzaForm/AnalitzaView, _impl/analitza, v47/v48 |
| 8 | Valorador N1/N2 | /#/estima + pestanya | municipi + m² (+ habitacions i estat si vols) → RANG orientatiu: base oficial Incasòl escalada per superfície (N1) + ajustos amb coeficient documentat (N2), horquilla per dispersió territorial mesurada, confiança i avisos d'habitabilitat | territorial.ts:310-490, EstimaView/ValuationPanel |
| 9 | Registre email-first | /registre → verificació | l'email és la primera casella; sense compte el panell de resultats NEIX BLOQUEJAT; pla Free 3 consultes detallades/mes aplicades al SERVIDOR | email-first.ts, _impl/analitza (gate), v46 |
| 10 | Pla Free / Premium / Pro | /#/preus | Free: mapa il·limitat, 3 consultes/mes, comparador 2 municipis; Premium 7,99 €/mes; Pro 19,99 €/mes; informes individuals de pagament únic; nota honesta de MODO PRUEBA si Stripe no està connectat | i18n plans.*, PricingView, stripe _impl |
| 11 | Comparador de municipis | /#/comparador | columnes de municipis costat a costat (2 Free / 6 Premium) | ComparadorView, plans feats |
| 12 | Anàlisi del mercat | /#/analisi | creuament de sèries amb preu de fiances; indicadors INE (IPVA, renta, esforç) Premium | AnalisiView, indicators |
| 13 | Hub SEO municipis | /lloguer + /lloguer/[slug] | 947 pàgines reals amb sèrie històrica i enllaç al mapa (v37/v41) | src/app/lloguer/** |
| 14 | Guia de drets | /#/guia | LAU, fiança i garanties amb calculadora, despeses, clàusules, ajudes vigents — gratis | GuiaView.tsx, guia-drets/vivienda.ts |
| 15 | Informes individuals | /#/preus → compra | PDF de 10 pàgines (comparació / mercat / edifici) sense subscripció | ReportsShopSection, reports_shop tests |
| 16 | Favorits + alertes | panel | guarda preferits i resum mensual opcional per correu | PanelView, alertsEnabled |
| 17 | Compte i seguretat | /#/panel | quota usada, pla, Stripe, TOTP 2FA, passkeys (WebAuthn), cancel·lació | PanelView, totp/auth _impl |
| 18 | Avís ciutadà | mapa | informar d'un pis en compartició/local/altre → /api/reports (dades reals, feature separada) | MapView selector (guarda M1 v48) |
| 19 | Transparència | /#/metodologia, /#/estat, provenance | fórmula documentada, fonts, estat de sondes en viu, llinatge de dades | MetodologiaView, EstatView, _impl/provenance |
| 20 | «Com funciona» curt | home | 3 passos (cerca municipi → edifici → compara) | LandingView COM FUNCIONA, i18n how.* |

**Conclusió C1:** la home només explica els passos 1-6 i 8; queden fora
l'estimador (7/11), els plans i quota (9-10), els informes (15), l'idioma (1),
l'avís ciutadà (18) i la transparència (19). El copy C2 cobreix TOT amb
divulgació progressiva sense allargar la home.

---

## C2 — Copy final ca/es (claus `howFull.*`, llest per a i18n)

> Convenció: les claus van a `STRINGS.ca.howFull` i `STRINGS.es.howFull`
> (simètriques). Els números de l'exemple són REALS: base de Manresa 585
> €/mes (títol SSR de preureal.com/lloguer/manresa consultat el 2026-11-17)
> i càlcul executat amb la funció real `computeValuation` (70 m², 3 hab,
> bon estat → 488,4 €/mes, rang 439,6-537,3; a reformar → 390,7, rang
> 351,7-429,8). Al copy s'arrodoneixen amb «≈» per llegibilitat.

### `howFull.nav` — entrada al menú
- ca: `Com funciona`
- es: `Cómo funciona`

### `howFull.intro` — subtítol de la pàgina
- ca: `Guia pas a pas. Una acció per pas. Cada terme tècnic s'explica amb paraules quotidianes.`
- es: `Guía paso a paso. Una acción por paso. Cada término técnico se explica con palabras cotidianas.`

### `howFull.necessites` — «Què necessites»
- ca t: `Què necessites`
- ca d: `Per veure el mapa i els preus: res, és gratis. Per les consultes detallades: el teu e-mail. No demanem targeta ni dades personals.`
- es t: `Qué necesitas`
- es d: `Para ver el mapa y los precios: nada, es gratis. Para las consultas detalladas: tu e-mail. No pedimos tarjeta ni datos personales.`

### `howFull.obtens` — «Què obtens»
- ca t: `Què obtens`
- ca d: `El preu mitjà real registrat de cada zona, si el preu hi està regulat, una comparació del teu anunci i un rang orientatiu per al teu pis. Cada xifra amb la seva font i el seu període.`
- es t: `Qué obtienes`
- es d: `El precio medio real registrado de cada zona, si el precio está regulado, una comparación de tu anuncio y un rango orientativo para tu piso. Cada cifra con su fuente y su período.`

### `howFull.passos` — 10 passos (cada un: `t` títol, `d` acció, `detall` més info)

1. ca t `Tria l'idioma` · ca d `Prem el botó del globus, a dalt. El web passa a català o a castellà.` · ca detall `L'elecció queda recordada al teu navegador. Mai no t'ho tornem a preguntar.`
  es t `Elige el idioma` · es d `Pulsa el botón del globo, arriba. La web pasa a catalán o a castellano.` · es detall `La elección queda guardada en tu navegador. No te lo volvemos a preguntar.`
2. ca t `Obre el mapa` · ca d `Prem «Obre el mapa gratis». Veuràs Catalunya plena de colors.` · ca detall `Cada color és un rang de preu real registrat. Encara no has de fer res més.`
  es t `Abre el mapa` · es d `Pulsa «Abre el mapa gratis». Verás Cataluña llena de colores.` · es detall `Cada color es un rango de precio real registrado. Aún no tienes que hacer nada más.`
3. ca t `Cerca el teu municipi` · ca d `Escriu el nom al cercador (p. ex. Manresa). El mapa hi salta sol.` · ca detall `Hi ha 947 municipis de Catalunya amb dades oficials. Si el teu no en té, ho dirà clar.`
  es t `Busca tu municipio` · es d `Escribe el nombre en el buscador (p. ej. Manresa). El mapa salta solo.` · es detall `Hay 947 municipios de Cataluña con datos oficiales. Si el tuyo no los tiene, lo dirá claro.`
4. ca t `Entén els colors` · ca d `Verd: més barat. Vermell: més car. La llegenda, a baix, mostra els euros de cada color.` · ca detall `Els colors venen de les fiances reals registrades, no d'estimacions.`
  es t `Entiende los colores` · es d `Verde: más barato. Rojo: más caro. La leyenda, abajo, muestra los euros de cada color.` · es detall `Los colores vienen de las fianzas reales registradas, no de estimaciones.`
5. ca t `Apropa't per veure edificis` · ca d `Fes zoom amb dos dits o la roda del ratolí. Al aproparte apareixen els edificis reals.` · ca detall `Cada edifici es pinta amb el seu propi preu mitjà. El zoom és lliure i gratis.`
  es t `Acércate para ver edificios` · es d `Haz zoom con dos dedos o la rueda del ratón. Al acercarte aparecen los edificios reales.` · es detall `Cada edificio se pinta con su propio precio medio. El zoom es libre y gratis.`
6. ca t `Toca un edifici` · ca d `Fes clic. S'obre una fitxa: preu mitjà real, nº de contractes, any de construcció i referència catastral.` · ca detall `«Referència catastral»: el codi oficial únic de l'edifici. «Contractes»: quantes fiances es van registrar.` — *primer ús de termes, explicats* ·
  es t `Toca un edificio` · es d `Haz clic. Se abre una ficha: precio medio real, nº de contratos, año de construcción y referencia catastral.` · es detall `«Referencia catastral»: el código oficial único del edificio. «Contratos»: cuántas fianzas se registraron.`
7. ca t `Mira l'entorn` · ca d `A la mateixa fitxa: demografia, parc de lloguer i serveis propers. Tot amb la font oficial a peu.` · ca detall `Si una dada oficial encara no existeix per al municipi, el panell ho diu: mai no s'inventa.`
  es t `Mira el entorno` · es d `En la misma ficha: demografía, parque de alquiler y servicios cercanos. Todo con la fuente oficial al pie.` · es detall `Si un dato oficial aún no existe para el municipio, el panel lo dice: nunca se inventa.`
8. ca t `Compara el teu anunci` · ca d `A la portada, pestanya «Consulta»: escriu el preu que t'ofereixen i la superfície. El sistema diu quin percentatge és per sobre o per sota del preu real del municipi.` · ca detall `Només cobreix habitatge habitual: és l'única modalitat amb dades oficials (fiances Incasòl).` — *primer ús de «fiances», explicat al glossari i aquí baix* ·
  es t `Compara tu anuncio` · es d `En la portada, pestaña «Consulta»: escribe el precio que te ofrecen y la superficie. El sistema dice qué porcentaje está por encima o por debajo del precio real del municipio.` · es detall `Solo cubre vivienda habitual: es la única modalidad con datos oficiales (fianzas Incasòl).`
9. ca t `Registra't per veure el detall` · ca d `Et demana només el teu e-mail. Amb el pla Free tens 3 consultes detallades cada mes, gratis.` · ca detall `La quota s'aplica al servidor: és idèntica per a tothom i no es pot saltar des del navegador. Sense publicitat ni tercers.`
  es t `Regístrate para ver el detalle` · es d `Solo pide tu e-mail. Con el plan Free tienes 3 consultas detalladas cada mes, gratis.` · es detall `El límite se aplica en el servidor: es igual para todos y no se puede saltar desde el navegador. Sin publicidad ni terceros.`
10. ca t `Baixa't l'informe` · ca d `Cada consulta genera un informe amb la comparació, la normativa de la zona i les fonts. El pots descarregar en PDF.` · ca detall `Si el municipi té el preu regulat, l'informe mostra els límits legals que apliquen.`
  es t `Descarga el informe` · es d `Cada consulta genera un informe con la comparación, la normativa de la zona y las fuentes. Puedes descargarlo en PDF.` · es detall `Si el municipio tiene el precio regulado, el informe muestra los límites legales que aplican.`
11. ca t `Valora el teu pis` · ca d `Pestanya «Valora»: municipi i m². Si vols, habitacions i estat de conservació. Retorna un RANG orientatiu, mai un preu únic.` · ca detall `«Estat de conservació»: com està el pis (a reformar, bé, reformat, obra nova). Cada ajust queda escrit a l'informe.`
  es t `Valora tu piso` · es d `Pestaña «Valora»: municipio y m². Si quieres, habitaciones y estado de conservación. Devuelve un RANGO orientativo, nunca un precio único.` · es detall `«Estado de conservación»: cómo está el piso (a reformar, bien, reformado, obra nueva). Cada ajuste queda escrito en el informe.`

*(Són 11 passos: 8 de mapa/comparació + registre + informe + valora. La home
manté la versió curta de 3 passos i afegeix el CTA a la guia completa.)*

### `howFull.exemple` — exemple numèric pas a pas (dades reals)
- ca t: `Un exemple amb xifres reals`
- ca d: `A Manresa, el preu mitjà registrat és 585 €/mes (fiances Incasòl, dada vigent publicada a preureal.com). Un anunci de 650 €/mes està un 11,1% per sobre.`
- ca d2: `El mateix pis: 70 m² i 3 habitacions en bon estat. La base 585 €/mes s'ajusta ×0,856 per la superfície i ×0,975 per la densitat d'habitacions: ≈488 €/mes, amb un rang de ≈440 a ≈537 €. A reformar: ×0,8 → ≈391 €/mes (rang ≈352-430). Cada factor queda escrit a l'informe.`
- es t: `Un ejemplo con cifras reales`
- es d: `En Manresa, el precio medio registrado es 585 €/mes (fianzas Incasòl, dato vigente publicado en preureal.com). Un anuncio de 650 €/mes está un 11,1% por encima.`
- es d2: `El mismo piso: 70 m² y 3 habitaciones en buen estado. La base de 585 €/mes se ajusta ×0,856 por la superficie y ×0,975 por la densidad de habitaciones: ≈488 €/mes, con un rango de ≈440 a ≈537 €. A reformar: ×0,8 → ≈391 €/mes (rango ≈352-430). Cada factor queda escrito en el informe.`

### `howFull.queNoEs` — «Què NO és»
- ca t: `Què NO és`
- ca d: `No és una tasació oficial. No és assessorament jurídic. No s'inventa cap dada: si un municipi no té mostra suficient, ho diu. Les dades arriben fins a 2025. Només cobreix habitatge habitual.`
- es t: `Qué NO es`
- es d: `No es una tasación oficial. No es asesoramiento jurídico. No se inventa ningún dato: si un municipio no tiene muestra suficiente, lo dice. Los datos llegan hasta 2025. Solo cubre vivienda habitual.`

### `howFull.limits` — límits del pla Free
- ca t: `Límits del pla Free`
- ca d: `Mapa, colors i preus: gratis i il·limitats sempre. Consultes detallades: 3 al mes. Comparador: fins a 2 municipis. L'1 de cada mes es tornen a obrir.`
- es t: `Límites del plan Free`
- es d: `Mapa, colores y precios: gratis e ilimitados siempre. Consultas detalladas: 3 al mes. Comparador: hasta 2 municipios. El día 1 de cada mes se vuelven a abrir.`

### `howFull.faq` — mini-FAQ (8 preguntes reals d'usuari)
1. ca q `D'on surten els preus?` a `De les fiances de lloguer que els propietaris registren a Incasòl, l'organisme oficial de la Generalitat. És la mateixa font que usa l'Administració per regular preus.` · es q `¿De dónde salen los precios?` a `De las fianzas de alquiler que los propietarios registran en Incasòl, el organismo oficial de la Generalitat. Es la misma fuente que usa la Administración para regular precios.`
2. ca q `Per què el meu edifici no apareix?` a `El mapa pinta edificis amb contractes registrats. Sense contractes, no hi ha color: no s'inventa. Les dades per illa de cases completa arribaran amb el conveni amb Incasòl.` · es q `¿Por qué no aparece mi edificio?` a `El mapa pinta edificios con contratos registrados. Sin contratos no hay color: no se inventa. Los datos por manzana completa llegarán con el convenio con Incasòl.`
3. ca q `Què és una zona tensada?` a `Un municipi on la Generalitat regula el preu dels nous contractes de lloguer: 171 ara mateix (Resolucions TER/3739/2026 i TER/3740/2026). El mapa el marca.` · es q `¿Qué es una zona tensionada?` a `Un municipio donde la Generalitat regula el precio de los nuevos contratos de alquiler: 171 ahora mismo (Resoluciones TER/3739/2026 y TER/3740/2026). El mapa lo marca.`
4. ca q `Per què demana el meu e-mail?` a `Per donar-te les 3 consultes detallades mensuals i evitar abusos. Cap publicitat: el web no carrega res de tercers.` · es q `¿Por qué pide mi e-mail?` a `Para darte las 3 consultas detalladas mensuales y evitar abusos. Nada de publicidad: la web no carga nada de terceros.`
5. ca q `I quan arribo a 3 consultes?` a `Es tanquen fins l'1 del mes següent. El mapa, els colors i els preus segueixen sent gratis sempre.` · es q `¿Y cuando llego a 3 consultas?` a `Se cierran hasta el día 1 del mes siguiente. El mapa, los colores y los precios siguen siendo gratis siempre.`
6. ca q `La valoració és una tasació?` a `No. És un rang orientatiu calculat amb dades oficials, amb els coeficients i les fonts a la vista. No és una taxació oficial: una tasació amb validesa legal la fa un servei homologat (SERPAVI).` · es q `¿La valoración es una tasación?` a `No. Es un rango orientativo calculado con datos oficiales, con los coeficientes y las fuentes a la vista. No es una tasación oficial: una tasación con validez legal la hace un servicio homologado (SERPAVI).`
7. ca q `Com sé de quin any són les dades?` a `Cada fitxa i cada informe mostren el seu període i el nombre de contractes. Mai no amaguem el període.` · es q `¿Cómo sé de qué año son los datos?` a `Cada ficha y cada informe muestran su período y el número de contratos. Nunca ocultamos el período.`
8. ca q `Puc informar d'un pis que no quadra?` a `Sí: al mapa pots enviar un avís anònim del preu que et demanen. Serveix per millorar la foto del mercat real.` · es q `¿Puedo avisar de un piso que no cuadra?` a `Sí: en el mapa puedes enviar un aviso anónimo del precio que te piden. Sirve para mejorar la foto del mercado real.`

### `howFull.glossari` — glossari final (terme → frase cotidiana)
1. ca `Fiances: els diners que inquilí i propietari dipositen oficialment en signar un contracte. El seu registre és la font dels preus.` · es `Fianzas: el dinero que inquilino y propietario depositan oficialmente al firmar el contrato. Su registro es la fuente de los precios.`
2. ca `Incasòl: l'organisme públic de la Generalitat on es registren les fiances.` · es `Incasòl: el organismo público de la Generalitat donde se registran las fianzas.`
3. ca `Àrea tensada: municipi on la Generalitat limita el preu dels nous lloguers.` · es `Zona tensionada: municipio donde la Generalitat limita el precio de los nuevos alquileres.`
4. ca `Referència catastral: el codi oficial que identifica un edifici únic.` · es `Referencia catastral: el código oficial que identifica un edificio único.`
5. ca `N1: el primer càlcul. La base oficial del municipi, ajustada als m² del pis.` · es `N1: el primer cálculo. La base oficial del municipio, ajustada a los m² del piso.`
6. ca `N2: els ajustos opcionals (estat, habitacions) amb el coeficient escrit a la vista.` · es `N2: los ajustes opcionales (estado, habitaciones) con el coeficiente escrito a la vista.`
7. ca `Coeficient: el multiplicador de cada ajust (p. ex. ×0,8 a reformar). Sempre visible.` · es `Coeficiente: el multiplicador de cada ajuste (p. ej. ×0,8 a reformar). Siempre visible.`
8. ca `Horquilla: el rang mínim-màxim al voltant del resultat central.` · es `Horquilla: el rango mínimo-máximo alrededor del resultado central.`
9. ca `ICGC: l'Institut Cartogràfic i Geològic de Catalunya, font del mapa.` · es `ICGC: el Instituto Cartográfico y Geológico de Cataluña, fuente del mapa.`
10. ca `Quota: quantes consultes detallades et queden aquest mes (3 al Free).` · es `Cuota: cuántas consultas detalladas te quedan este mes (3 en el Free).`

---

## Proposta d'implementació (sense executar en aquesta fase)

**Arquitectura** (segueix el patró del repo):
1. **Clau nova `howFull` a `src/lib/i18n.ts`** — copiar el bloc de dalt tal
   qual a `ca` i a `es` (simetria garantida; typecheck blinda els usos).
2. **`src/components/views/ComFuncionaView.tsx`** — acordeó accessible: cada
   pas és un botó amb `aria-expanded` + contingut plegable; resum visible
   (títol+acció) i detall en expandir (divulgació progressiva). Zero
   dependències noves. CTA final a /preus i al mapa.
3. **Ruta**: `navigate("/com-funciona")` a AppShell + pàgina SSR
   `src/app/com-funciona/page.tsx` (HashBridge, com /guia) + entrada al
   sitemap. Página indexable (és contingut SEO útil).
4. **Home**: mantenir la secció de 3 passos (versió curta) + botó
   «Veure la guia completa» → `/com-funciona` (mai allargar la home).
5. **Guards** (tests): vista muntada a AppShell, claus `howFull.*` ca/es
   presents i simètriques, 11 passos, FAQ ≥8, exemple amb la base real 585,
   «no és una tasació» present a les dues llengües.
6. **Esforç estimat**: M (vista ~300 línies + i18n ~120 claus + pàgina +
   guards + CHANGES).sense risc per mapa/quota/motor (només afegit).

**Criteris de llenguatge aplicats:** frases ≤20 paraules; un verb d'acció per
pas; termes tècnicss («fiances», «àrea tensada», «referència catastral»,
«coeficient», «N1/N2», «quota») explicats en la primera aparició + glossari
final; mai prometem tasació ni dades que no hi són (coherència legal, regla 6
del PROMPT MASTER).

---

## Implementació v59 (BLOQUE C executat — ajustos finals sobre el copy aprovat)

Implementat i aprovat pel propietari («aprueba Com funciona», 2026-11-17).
Codi: `src/lib/i18n.ts` (claus `howFull.*`, simètriques ca/es) +
`src/components/views/ComFuncionaView.tsx` (acordeó accessible) +
`src/app/com-funciona/page.tsx` (indexable) + sitemap + peu + CTA portada
(`t.how.more`) + guardes `tests/how_full_v59.test.ts`.

Ajustos finals aplicats en implementar (tots coherents amb el renombrado v56
i el glosario único de docs/linguistica.md):

1. **Terminologia v56**: el pas 11 passa de «Estima el teu pis» a
   «Valora el lloguer del teu habitatge» / «Valora el alquiler de tu vivienda»
   (frases exactes del propietari); «Pestanya «Valora»»; «Què NO és» diu
   «No és una taxació oficial» (ca normatiu; es «tasación oficial»);
   «estimacions» → «càlculs interns» al pas 4.
2. **ca normatiu**: «Al aproparte» → «En apropar-te» (pas 5);
   «Baixa't l'informe» → «Descarrega l'informe» (pas 10, DIEC2);
   «tasació» → «taxació» a tot el ca.
3. **«Què obtens» reescrit en frases curtes** (5 frases ≤8 paraules) per
   complir el filtre ≤20 paraules/frase.
4. **Exemple d2 reestructurat** en frases curtes: «La base de 585 €/mes
   s'ajusta per la superfície (×0,856) i per les habitacions (×0,975):
   ≈488 €/mes. El rang orientatiu: de ≈440 a ≈537 €/mes. A reformar: ×0,8 →
   ≈391 €/mes (rang ≈352–430).» — xifres verificades AVUI amb el motor real
   (`computeValuation`) i el títol SSR de producció
   preureal.com/lloguer/manresa (585 €/mes, 2026-11-17).
5. **Glossari i FAQ alineats amb el glosario único**: ítem 3 «Àrea de mercat
   residencial tensat» (ca) / «Área de mercado residencial tensionado» (es);
   FAQ 3 «Què és una àrea tensada?»; FAQ 8 «Puc informar d'un pis…» /
   «¿Puedo avisar de una vivienda…»; FAQ 6 amb la fórmula legal completa
   («No és una taxació oficial: una taxació amb validesa legal la fa un
   servei homologat (SERPAVI)»).
6. **Mesura objectiva del filtre de claredat**: 256 frases mesurades
   (ca+es), màxim 19 paraules/frase (guarda C3 del test, límit 20).
