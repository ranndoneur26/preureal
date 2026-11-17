# Revisió lingüística experta ca/es — BLOQUE E (2026-11-17)

Entregable del BLOQUE E del PROMPT MASTER. Referències normatives aplicades:
**DIEC2 / Optimot / TERMCAT / GIEC (IEC)** per a català i **RAE / NGLE /
Fundéu (es-ES)** per a castellà. Decisió terminològica del PROPIETARI
(obligatòria): **«estima/estimar» → «valora/valorar» a les dues llengües**,
«vivenda» → «habitatge» (ca) i «renta» → «renda» (ca).

**Criteri d'acceptació verificat** (barrida automatitzada sense comentaris,
`scripts/residus_linguistics.py`): **0 strings user-facing amb «vivenda»,
«renta» (ca) o arrel «estima-»**. Els identificadors de codi es conserven com
a noms tècnics (decisió documentada, zero trencaments): la ruta `/estima`, la
clau i18n `estima.*`, els tipus `EstimaInput`/`EstimaLevel`, el camp API
`estimation`, el paràmetre `source=estimat` i la tasca cron `estima:` del
rate limit.

---

## 1. Coherència legal del renombrado (regla 6)

El renombrat «estima → valora» podia contradir els disclaimers que deien
«no és una valoració del teu habitatge». **Redacció final coherent aplicada a
tots els punts on apareixia:**

| Context | ca | es |
|---|---|---|
| Disclaimer d'orientació global (`ORIENTATION_DISCLAIMER`, analitza.ts) | «Rang orientatiu calculat amb dades oficials: no és una taxació oficial ni una avaluació individualitzada de l'habitatge.» | «Rango orientativo calculado con datos oficiales: no es una tasación oficial ni una evaluación individualizada de la vivienda.» |
| Intro pestanya consulta (LandingView) | «...no és una taxació oficial; és una referència orientativa basada en dades oficials.» | «...no es una tasación oficial; es una referencia orientativa basada en datos oficiales.» |
| Enllaç creuat a la pestanya «Valora» | «...mai una taxació oficial.» | «...nunca una tasación oficial.» |
| Footer de tota la web (i18n footer.disclaimer) | «No és una taxació oficial d'un habitatge concret ni assessorament jurídic: les valoracions del producte són sempre rangs orientatius amb la font a la vista.» | «No es una tasación oficial de una vivienda concreta ni asesoramiento jurídico: las valoraciones del producto son siempre rangos orientativos con la fuente a la vista.» |
| Metodologia (N1+N2) | «El resultat és SEMPRE un RANG orientatiu: mai una taxació oficial ni una avaluació individualitzada.» | «El resultado es SIEMPRE un RANGO orientativo: nunca una tasación oficial ni una evaluación individualizada.» |

La paraula «valoració» NOMÉS apareix ara en afirmatiu (el nom del resultat
orientatiu del producte) i mai en negació; les negacions legals usen sempre
«taxació oficial» / «tasación oficial».

## 2. Tabla de correcciones (muestra de las 60+ aplicadas; cada una con su par ca/es)

| Ubicación | Texto anterior | Texto nuevo (ca / es) | Motivo normativo |
|---|---|---|---|
| LandingView.tsx (pestaña + aria-label + CTA) | «Estima el lloguer del teu habitatge» / «Estima el alquiler de tu vivienda» | «Valora el lloguer del teu habitatge» / «Valora el alquiler de tu vivienda» | Decisión del propietario (obligatoria); «estimar» (ca) es castellanismo semántico para este uso — DIEC2: estimar = «fer un càlcul aproximat», pero el producte promet un rang, no un càlcul puntual |
| AppShell.tsx (nav desktop+mobile + footer) | «Estima» / «Estima el lloguer...» | «Valora» / «Valora el lloguer...» | Idem; término único en toda la web |
| AnalitzaForm.tsx:348 | ca «Adreça de la vivenda (opcional)» | ca «Adreça de l'habitatge (opcional)» / es «Dirección de la vivienda (opcional)» | «vivenda» es castellanismo en ca (DIEC2: habitatge); es correcto |
| AnalitzaForm.tsx:426 | ca «Renta del contracte anterior (€/mes)» | ca «Renda del contracte anterior (€/mes)» / es «Renta del contrato anterior (€/mes)» | ca: renda (DIEC2); es: renta correcta (RAE) — cada corrección con su par |
| analitza-html.ts (NORM_CHECK_LABELS ×7 + verdictNote ×2 + renta label) | ca «la renta d'un contracte nou», «límits de renta», «Renta del contracte anterior», «la vivenda típica» | ca «la renda...», «límits de renda», «Renda del contracte anterior», «l'habitatge típic» | «renda»/«habitatge» (DIEC2); es sin cambios |
| analitza.ts (ORIENTATION_DISCLAIMER + ANALITZA_LIMITATIONS) | «Estimació estadística orientativa...», «de la vivenda típica», «com a ESTIMACIÓ» | «Rang orientatiu calculat amb dades oficials...», «de l'habitatge típic», «com a APROXIMACIÓ» | Renombrado + coherencia legal; «aproximació» para marcas estadísticas |
| estima.ts (ESTIMA_LIMITATIONS + viability tractament) | «vivenda típica», «elasticitat renta-superfície», «una estimació estadística», «la renta de l'habitatge» | «l'habitatge típic», «elasticitat renda-superfície», «un càlcul estadístic», «la renda de l'habitatge» | DIEC2 (renda; habitatge); «càlcul» para el acto estadístico |
| EstimaView.tsx (h1 + intro + passos) | «Estima el lloguer...», «renta-superfície», «vivenda típica», «mai una estimació poc fiable» | «Valora el lloguer...», «renda-superfície», «l'habitatge típic», «mai cap càlcul poc fiable» | Renombrado + DIEC2 |
| EstimaIntro.tsx (badge, h3, nota, CTA) | «estimació progressiva», «L'estimació no demana...», «Obre l'estimador complet» | «valoració progressiva», «La valoració no demana...», «Obre el valorador complet» | Coherencia con «Valora»; sustantivo derivado uniforme |
| EstimaForm.tsx / EstimaReport.tsx | «calcular l'estimació», «l'estimació segueix sent N1», «Estimació orientativa per a un habitatge...», «Aquesta estimació NO substitueix», «No podem estimar amb garanties», «la vivenda introduïda» | «calcular la valoració» / «completar el càlcul», «el càlcul segueix sent N1», «Valoració orientativa...», «Aquest càlcul NO substitueix», «No podem valorar amb garanties», «l'habitatge introduït» | Uniformidad; «valoració orientativa» = resultado del producto |
| MetodologiaView.tsx (títulos + N1/N2 + fórmula + limitacions) | «Estimació del lloguer...», «L'estimador progressiu», «N1: renta estimada (m²)», «ESTIMACIÓ amb confiança BAIXA», ca «renta-superfície», es «cae con la mida» | «Valoració del lloguer...», «El valorador progressiu», «N1: renda orientativa (m²)» / es «renta orientativa», «APROXIMACIÓ...», ca «renda-superfície», es «cae con el tamaño» | Renombrado + corrección de interferencia ca→es («mida» no es español; Fundéu: tamaño) |
| RentalSharePanel / MetodologiaView / ComparadorView / lloguer/[slug] / rental-share.ts | «% estimat de lloguer sobre el parc residencial», «% estimado...», «marcada sempre com a estimació» | «% aproximat de lloguer sobre el parc residencial», «% aproximado...», «com a aproximació» | El indicador es una aproximación estadística propia (no una «estimación» prometida); término único |
| ValuationPanel.tsx (ROOMS notes + base label) | «superfície típica estimada», «la vivenda mitjana», «Fiança municipal (vivenda típica)» | «superfície típica orientativa», «l'habitatge mitjà», «Fiança municipal (habitatge típica)» — es con «vivienda» correcto | DIEC2 + término orientativo |
| MapView.tsx (tooltip + title) | «≈ Estimació per referència de comarca», «(estimació)» | «≈ Aproximació per referència de comarca», «(aproximació)» | Marcas de dato estadístico |
| AnalitzaReport.tsx (ref label + nota + CTA) | «ref. comarca (estimació)», «la vivenda TÍPICA», «Estima el lloguer...» | «ref. comarca (aproximació)», «l'habitatge TÍPIC», «Valora el lloguer...» | Coherencia global |
| i18n.ts (12 claves ca/es: feats, legend, surfaceTypicalRent, refComarcaLabel, historyRefNote, footer.disclaimer) | «€/m² estimat/estimado», «(estimació/estimación)», «Renda/Renta típica estimada», «No és una estimació de preu...» | «€/m² orientatiu/orientativo», «(aproximació/aproximación)», «típica orientativa», «No és una taxació oficial...» | Renombrado + fórmula legal del propietario |
| PDFs (pdf-report ×3, pdf-comparison ×2, pdf-valuation ca) | «Esforç econòmic estimat», «Altura estimada», «és una estimació del volum», «€/m² estimat/estimado», ca «elasticitat renta-superfície» | «aproximat», «aproximació», «€/m² aproximat/aproximado», ca «renda-superfície» | PDFs coherentes con la web |
| reports-shop.ts (descCa/descEs) | «€/m² estimat/estimado» | «€/m² orientatiu/orientativo» | Término de venta sin promesa de tasación |
| GuiaView.tsx (novaIntro/novaA/novaA_t/novaB) | ca «UNA vivenda concreta», «característiques de la vivenda», «(estimació estadística, mai una taxació)», «No és una valoració immobiliària formal» | ca «UN habitatge concret», «de l'habitatge», «(càlcul estadístic, mai una taxació oficial)», «No és una taxació oficial ni una avaluació immobiliària formal» + pares es | DIEC2 + coherencia legal |
| UsosView.tsx (alt + passos ca/es) | «Analitzador d'una vivenda concreta», «(estimació orientativa, mai taxació)» | «Analitzador d'un habitatge concret», «(referència orientativa, mai taxació)» + es | DIEC2 |
| LegalView.tsx (privacidad, punto 2) | «(consulta de preus i estimació)» | «(consulta de preus i valoració)» + es | Nombres de producto en texto legal |
| guia-vivienda.ts (ca/es tabla CEE) | ca «Consum estimat...permet estimar factures», es «Consumo estimado...permite estimar facturas» | «Consum aproximat...permet calcular les factures per aproximació» / «Consumo aproximado...permite calcular las facturas por aproximación» | Verb del propietario (estimar→valora no cabe aquí; «calcular por aproximación» evita el calco) |
| analitza/page.tsx (SEO) + estima/page.tsx (SEO) | «límits de renta», «no és una valoració de la vivenda», «Estima el lloguer...», «Estimació progressiva...» | «límits de renda», «no és una taxació oficial de l'habitatge», «Valora el lloguer del teu habitatge», «Valoració orientativa i gratuïta...» | Metadatos indexables coherentes con la decisión |
| i18n.ts admin.mrr (es) | «MRR (estimado)» (clave huérfana sin par ca) | ELIMINADA | Clave huérfana detectada por el barrido (v51 quitó su par ca); AdminView usa literales |

## 3. Glosario único ca↔es del producto (un solo término por concepto)

| Concepto | ca (normativo) | es (normativo) | Referencia |
|---|---|---|---|
| Vivienda / dwelling | **habitatge** (mai «vivenda») | vivienda | DIEC2 «habitatge» |
| Alquiler (contrato y mercado) | **lloguer** | alquiler | DIEC2 |
| Renta (importe del contrato) | **renda** (mai «renta» en ca) | renta | DIEC2 «renda»; RAE «renta» |
| Fianza | **fiança** | fianza | DIEC2 / RAE |
| Área de mercado residencial tensionado | **àrea de mercat residencial tensat** (abrev. «àrea tensada») | área de mercado residencial tensionado (abrev. «zona tensionada» como uso extendido) | Terminología oficial DOGC/TER |
| Superficie | **superfície** | superficie | DIEC2 |
| Referencia catastral | **referència catastral** | referencia catastral | — |
| Valorar (acción del producto) | **valora / valorar** (mai «estima/estimar») | valora / valorar | Decisión del propietario |
| Resultado orientativo del valorador | **valoració orientativa / rang orientatiu** | valoración orientativa / rango orientativo | Coherencia legal: nunca «tasación» |
| Negación legal | **taxació oficial** | tasación oficial | RAE/Fundéu: tasación = valoración oficial por perito |
| Cálculo estadístico (marcas de dato) | **aproximació / càlcul** (mai «estimació») | aproximación / cálculo | Término único |
| Herramienta | **el valorador** (mai «l'estimador») | el valorador | Derivado del verbo elegido |
| Coeficiente | **coeficient** | coeficiente | — |
| Horquilla / rango | **horquilla / rang** | horquilla / rango | — |
| Cuota (límite mensual) | **quota** | cuota | — |
| Indicador del parque | **% aproximat de lloguer sobre el parc residencial** | % aproximado de alquiler sobre el parque residencial | Un solo nombre en web/PDF/API docs |
| Plan gratuito | **Free** (nombre de plan, invariable en ca y es) | Free | Decisión: nombre de producto, no se traduce (coherente en plans.*, footer, FAQ) |
| Esfuerzo económico | **esforç econòmic** | esfuerzo económico | — |
| Gran tenedor | **gran tenedor** | gran tenedor | Terminología LAU |

## 4. Reglas de estilo verificadas (sin incidencias)

- Tratamiento uniforme **tu/tu** (mai vós/vos) en toda la web y emails.
- Apostrofación y pronombres febles revisados en ca (l'habitatge, d'Incasòl,
  l'e-mail, n'hi ha) — correctos tras la pasada.
- Cifras y unidades: «€/mes», «m²», «%» con espacio fino antes de % (ca) y sin
  espacio en es según uso vigente del producto — patrón ya uniforme.
- Mayúsculas: «Valora», «Consulta», «Free», «Incasòl», «ICGC» — coherentes.
- es-ES (no latinoamericano): «vosotros»/«ustedes» no aparecen; trato de tú.
- Falsos positivos conservados: «muntanya d'habitatges» en leyendas legítimas,
  URLs (habitatge.gencat.cat) y nombres propios (Agència de l'Habitatge).
