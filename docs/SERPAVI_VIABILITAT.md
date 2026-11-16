# Informe de viabilitat SERPAVI — classificació A/B/C de les variables (F0)

Data: 2026-11-16 · Fase: F0 (porta de viabilitat del redisseny de la Home)
Estat: **VIABLE amb degradació honesta** — implementat a F2 (N1) i F3 (N2), formalitzat a F4.
Document a la web d'usuari: `#/metodologia` (secció «Informe de viabilitat»).

## 1. Objectiu i àmbit

El redisseny del formulari de la Home afegeix dues funcions sobre la base estadística
ja existent (fiances Incasòl per municipi, 692/947 amb sèrie 2005–2025):

- **N1** «Estima el lloguer del teu habitatge»: fiança municipal oficial × escalat per
  superfície (elasticitat documentada 0,8), resultat SEMPRE en RANG orientatiu.
- **N2** ajustos per característiques del compte SERPAVI, amb coeficient documentat.
- **N3** rang per secció censal: només SERPAVI el pot calcular.

Aquest informe classifica cada variable del qüestionari oficial SERPAVI segons si té
**font pública verificable** per aplicar-la sense inventar res. És la «porta» que
legitima quines variables entren al producte.

## 2. Fonts autoritzades consultades

| Font | Ús | Referència |
| --- | --- | --- |
| Fiances de lloguer Incasòl (explotació habitatge.gencat.cat) | Base estadística N1 (€/mes vivenda típica ≈85 m², nº contractes) | https://incasol.gencat.cat/ |
| Metodologia del motor de valoració validat | Elasticitat superfície, multiplicadors estat, densitat habitacions | `src/lib/territorial.ts` (constants documentades al codi) |
| SERPAVI (MIVAU) | Única font del rang amb validesa legal per parcel·la; N3 mai simulat | https://serpavi.mivau.gob.es/ |
| Resolucions de zones tensades TER/3739/2026 i TER/3740/2026 (DOGC 19-10-2026) | Avís legal Llei 12/2023, LAU art. 17.2 en 171 municipis | https://dogc.gencat.cat/ |
| ICGC — edificis amb any de construcció (CC-BY 4.0) | Dada pública (clau B); sense coeficient publicat → no multiplica renta | https://www.icgc.cat/ (llicència CC-BY 4.0) |

Regles del projecte que regeixen aquest informe: **mai s'inventa un coeficient**; si
no hi ha font pública verificable, la variable no es demana ni s'aplica; el resultat
mai no és una xifra única de taxació; no es fa scraping de cap endpoint privat de
SERPAVI ni es simula cap consulta oficial.

## 3. Classificació A/B/C per variable

| Variable | Classe | Tractament a l'eina | Font del tractament |
| --- | --- | --- | --- |
| Superfície (m²) | **A** | APLICADA: fiança municipal × (m²/85)^0,8 | Elasticitat documentada (β 0,8; rang −0,10 a −0,25 en estudis hedònics de Barcelona i Berlín) |
| Estat de conservació | **A** | APLICADA: ×0,80 a reformar; ×1,00 bon estat; ×1,06 reformada; ×1,12 obra nova | Multiplicadors ancorats al salt de renta en reformar (Fotocasa 2021), validats al motor |
| Habitacions (densitat m²/hab) | **A** | APLICADA: factor de densitat limitat ±5%; «no ho sé» → continua N1 | Densitat de referència del parc (85 m² / 3 hab) amb exponents hedònics |
| Any de construcció | **B** | NO entra al càlcul: dada pública (ICGC CC-BY 4.0) però sense coeficient d'ajust publicat; ús informatiu a Analitza | ICGC edificis; serveis Cadastre com a recolzament |
| Ascensor | **C** | NO demanada NI aplicada | Sense coeficient publicat i cobertura pública no fiable |
| Aparcament | **C** | NO demanada NI aplicada | Sense coeficient publicat aplicable a la renta de l'habitatge |
| Amueblat | **C** | NO demanada NI aplicada | Sense font pública verificable ni coeficient publicat |
| Planta / àtic | **C** | NO demanada NI aplicada | Sense coeficient publicat; cartografia no cobreix la planta útil de manera fiable |
| Qualificació energètica | **C** | NO demanada NI aplicada | El registre oficial de certificats no publica coeficient d'ajust de renta |
| Piscina / zones comunitàries | **C** | NO demanada NI aplicada | Sense coeficient publicat; detecció no fiable amb fonts obertes |
| N3 — rang per secció censal | **C** | NO SIMULAT: botó oficial SERPAVI sempre; degradació «dades insuficients» mai amagada | SERPAVI (MIVAU): fonts tributàries no públiques en bloc |

## 4. Veredicte i decisions de disseny

- **Veredicte: VIABLE** per N1 i N2 amb les úniques variables classificades A.
- Les variables B i C **no es demanen** (regla d'or: no demanar dades que el càlcul
  no usa — demanar-les seria enganyós i recrearia la paradoxa de la sospita).
- **N3 no viable** amb dades públiques: l'eina degrada honestament («dades insuficients
  en aquesta zona» si no hi ha base suficient) i ofereix sempre la consulta oficial
  SERPAVI; mai mostra una estimació poc fiable en silenci ni simula el servei oficial.
- **Horquilla mesurada**: la dispersió surt del pool territorial real (comarca ≥5
  municipis amb dada; si no província ≥10; si no sèrie històrica municipal), saturada
  a ±30%; mai un percentil inventat.
- **RGPD**: sense auth, sense adreça, sense referència catastral; el registre anònim
  d'ús (Event) només guarda municipi, m² arrodonits, zona tensada i nivell real.
  Testat a nivell de ruta (tests/f4_qa.test.ts).
- **Freemium i Home intactes**: l'estima és gratuïta sense registre; el mapa, el
  comparador i el pla gratuït (3 consultes/mes) no canvien.

## 5. Riscos i mitigacions

| Risc | Mitigació implementada |
| --- | --- |
| Coeficient sense font → invenció | Regla d'or al codi + tests: les files B/C mai porten factor; només A es demana (tests/f4_qa.test.ts) |
| Usuari interpreta el rang com a taxació | Text fix de transparència sempre present (ca/es) + cap xifra única al cap de la tarjeta |
| Zona tensada: excés de límit legal | Avís Llei 12/2023, LAU art. 17.2 + botó SERPAVI quan `isTense` (Resolucions TER/3739/2026 i TER/3740/2026) |
| Municipal sense fiança publicada | Referència de comarca PONDERADA marcada ESTIMACIÓ, confiança BAIXA; si no hi ha mostra → degradació explícita |
| Persistència accidental de PII | Ruta sense camps personals (select auditable) + Event anònim; test RGPD de ruta en la suite bloquejant |

## 6. Traçabilitat de l'acceptació

- Tests: `tests/analitza.test.ts` (F2/F3, 53 tests al fitxer) + `tests/f4_qa.test.ts`
  (F4, 16 tests: RGPD de ruta, invariants del motor, guarda del informe de viabilitat
  i guarda del CI). Suite bloquejant: 10 fitxers, cap amb `continue-on-error`.
- Gates CI: check_repo (dispatcher), lint, typecheck, tests, auditoria de
  dependències, build de producció amb `DATABASE_URL` fictici.
