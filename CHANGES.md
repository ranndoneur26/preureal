# CHANGES — PreuReal.cat v0.7.0 (Fase 1: registre i autenticació)

Data: 2026-11-03 · Base: v0.5.0 (v9) + alineació d'arquitectura + Fase 1 completa

## v71.0 — Fase P1 del pla de manteniment de dades: panell «Dades i fonts» a #/admin — 2026-11-20

Implementació de la fase «P1 · Panell» del pla de manteniment (Anexo C de
`docs/mantenimiento/FASE_P0_IMPLEMENTACION.md` + capítol 8 i mockups figuras
3-4 del pla): el tauler que fa visible l'operació de dades — en cinc segons
s'hi veu quina font necessita acció — amb el semàforo de la taula 11, els
botons protegits de la taula 12 i la firma humana de C9/C10 en pantalla.
Tot additiu: cap migració de BD (l'estat viu a ImportRun + AuditLog +
DataSource.active), cap canvi d'endpoints existents, disseny, plans, preus
ni textos legals; vercel.json, ci.yml i el workflow de manteniment intactes.

- **Catàleg de fonts** (`src/lib/datos-fuentes.ts`): les 8 fonts de la taula 5
  del pla (Incasòl Excel · Incasòl Socrata qww9-bvhh · Catastro INSPIRE ATOM ·
  ICGC tiles/geocodificador · Generalitat ZMRT DOGC · SERPAVI MIVAU · Idescat
  bseccen · INE Tempus3) amb institució, llicència, periodicitat, SLA (taula
  13: Incasòl 100 · Catastro 180 · SERPAVI 730 · ZMRT 180 d; els que el pla no
  fixa, marcats «proposats»), traçabilitat ImportRun ↔ font per prefixes
  (INCASOL_*, RENTAL_SHARE_*, CADASTRE_DNP, ICGC_*, ZMRT*, IDESCAT_*, INE_*)
  i cadència vigent (mantenimiento.yml + vercel.json). Mòdul pur + semàforo
  `calcEstatFont` amb els criteris exactes de la taula 11 (Vigent/Aviso/
  Crític/Pausada, llindars SLA i SLA+25 %, ERROR, C9/C10 sense firma, NO-GO)
  i `importacioDesbloquejada` (GO 12/12, o firma humana posterior si
  GO-CONDICIONAL; NO-GO mai).
- **API `/api/admin/datos-fuentes`** (`src/app/api/_impl/admin/datos-fuentes/`
  + dispatcher regenerat 105 rutes, check_repo verd): GET estat (semàforo per
  font + KPIs globals: frescura mitjana KPI-1 · completitud KPI-2 · error rate
  90 d KPI-3 · canari API · ZMRT 302 des de geo.municipis guarded · banner
  d'alertes ordenat per gravetat), GET `?informe=X` (JSON descarregable de
  traçabilitat: 30 ImportRuns + 30 registres d'auditoria) i POST amb les 9
  accions de la taula 12: auditar_iniciar (ImportRun AUDIT) · auditar_registrar
  (GO exigeix 12/12) · firma_f0 · importar (confirma escrita + porta F0, 409
  si bloquejat) · importar_registrar (ImportRun OK/PARTIAL/ERROR) · verificar
  (SELECT 1 + conteos 947/690/302 en viu) · rollback (confirma escrita) ·
  pausar (motiu obligatori → DataSource.active=false) · activar. Tota acció
  escriu AuditLog (DATOS_*) amb l'actor. Alta create-only de les fonts a
  DataSource (mai sobreescriu files existents).
- **UI «Dades i fonts»** a `#/admin` (nova pestanya, mockups figuras 3-4):
  banner d'alertes amb text sempre acompanyant el color, fila de KPIs
  globals, targeta per font amb semàforo (colors exactes del pla), barra de
  frescura vs SLA, fitxa tècnica, última import/auditoria/verificació,
  assistent de 4 passos (Descàrrega → Auditoria F0 → Importar → Verificar),
  botons Auditar/Importar/Verificar/Rollback/Informe/+Resultat/Pausar·Activar/
  Firmar, «Auditar tot» i modal «Programar» amb el cron vigent i enllaç al
  workflow. CA/ES bilingüe com la resta del panell.
- **Tests** (`tests/datos_fuentes.test.ts`, bun, afegit al bucle bloquejant del
  CI): 16 casos — llindars del
  semàforo (38/104/125/126 d sobre SLA 100), ERROR, GO-COND amb i sense firma,
  NO-GO, Pausada dominant, sense imports, bloqueig d'importació (GO 11/12 vs
  12/12, firma posterior, NO-GO) i traçabilitat sense creuaments entre fonts.
- **Doc** (`docs/mantenimiento/FASE_P1_PANEL.md`): abast v1, mapeig de
  traçabilitat, criteris del semàforo, proteccions i què queda per a P1.2
  (dispatch a Actions, informe F0 complet en BD, edició de cron al panell).
- TASKS.md: secció Fase P1 + tancament de l'ítem Anexo B (secretos GitHub +
  smoke + canario fets pel propietari el 2026-11-20).

## v70.0 — Fase P0 del pla de manteniment de dades: auditoria prèvia F0 (12 controls) + canari diari + vigilància DOGC + alertes email + cron — 2026-11-19

Implementació de la fase «P0 · Garantia» del pla de manteniment
(`docs/mantenimiento/FASE_P0_IMPLEMENTACION.md`, materialització executable del pla):
capa que fa l'operació de dades fiable, diària i automatitzada amb **auditoria
prèvia obligatòria** (cap dada toca producció sense la porta go/no-go 12/12).
Tot additiu — zero canvis d'endpoints, disseny, plans, preus (0/8,99/24,99),
textos legals ni red lines; vercel.json i el workflow ci.yml intactes.

- **Auditoria prèvia F0** (`pipeline/qa/auditoria_f0.py`): els 12 controls C1-C12
  del pla (salut de la font amb 3 intents+backoff, SHA-256 vs anterior, esquema,
  cobertura ≥ 940, rangs/outliers >1 %, duplicitat + sintètiques 9999xx,
  temporal sense regressió, geogràfic contra el catàleg 947 del repo,
  estabilitat >15 % = firma humana, coherència ZMRT 302 = A 118+B 131+C 53,
  dry-run staging i canari post-staging quan hi ha `--staging-url`).
  Veredicte GO / NO-GO / GO-CONDICIONAL + informe JSON
  (`pipeline/qa/informes/`, gitignore) — selftest 13/13 verd (fixture bo → GO,
  fixture amb errors plantats → NO-GO amb C5/C6/C8/C9 vermells).
- **Canari diari** (`scripts/canary_diario.py`): 4 sondes API (health · zones
  08019 llista A · zones 08227 llista B · geo/illes) + KPI-1 frescura per font
  (ImportRun) · KPI-2 completitud ≥ 690 · KPI-3 error rate 90 d · KPI-4
  ST_IsValid = 0 · KPI-6 cobertura — amb baseline v69.2 (947 · 302 ·
  A 118 · B 131 · C 53 · dim ≥ 142.283). Escalat A1: 1-2 fallos → MEDIA,
  3 consecutius → CRÍTICA (estat persistit). Selftest 9/9 verd.
- **Vigilància DOGC** (`scripts/dogc_watch.py` + `scripts/dogc_baseline.json`):
  diff de resolucions TER contra les 3 vigents (TER/3739/2026 + TER/2408/2024 +
  TER/3740/2026) → CRÍTICA A3 (import < 72 h, protocol v69) si n'apareix una de
  nova, MEDIA si una vigent desapareix, MEDIA A7 si les fonts cauen. Selftest 6/6 verd.
- **Notificacions email** (`pipeline/qa/notificaciones/`): `envia_alerta.py`
  (render {{VARS}} + Resend, mode sec sense credencials — mai no fa caure el job)
  i 5 plantilles email-safe 600px amb la paleta del pla: CRÍTICA rojo #B23B3B ·
  MEDIA naranja #B8860B · BAJA blau #2563EB · ÈXIT verd #2E7D5B · DIGEST neutre
  #0F172A. Selftest 16/16 verd (colors del pla, email-safe, placeholders).
- **Cron** (`.github/workflows/mantenimiento.yml`, 5 entrades UTC amb conversió
  CET/CEST documentada): canari diari `0 5 * * *` · DOGC quincenal
  `0 8 1,15 * *` · DOGC diari a les ventanes `0 8 * 4,10 *` · backup+digest
  semanal `0 3 * * 0` (backup_pg.sh artifact 30 d) · cicle trimestral
  `0 3 1 1,4,7,10 *` = **F0 GO → backup → update_all.sh → canari → email ÈXIT**
  (NO-GO atura tot amb producció intacta). Cada job filtra el seu
  `github.event.schedule`; guards de secrets (mai al repo); job smoke manual amb
  els 4 selftests. Els 7 crons de Vercel no es toquen.
- **Manual i checklists** (`docs/mantenimiento/FASE_P0_IMPLEMENTACION.md`):
  pseudo-codificació completa del verificador post-actualització (mapa
  pseudo-codi ↔ implementació real), manual de procediments P-01..P-08
  (rutina diaria ≤ 10 min, cicle trimestral, finestra ZMRT 72 h, auditoria
  manual, runbook CRÍTICA amb rollback < 5 min, drills, rotació de
  credencials, fonts noves) i checklists pre/post universals + per font amb
  full de firma.

## v69.2 — Capa geo en producció alineada amb l'auditoria v69: geo.municipis amb 302 ZMRT per llista — 2026-11-19

Pendent del propietari marcat a v69 tancat: `pipeline/f4_zones_buscador.py` reexecutat
amb la DATABASE_URL contra Supabase (PostGIS 3.3.7). Zero canvis de codi, textos ni
endpoints — només l'estat de la capa geo de la BD.

- **`geo.municipis`**: 947 files · **302 ZMRT = A 118 + B 131 + C 53**, amb font i
  publicació PER LLISTA: B → «Resolució TER/2408/2024 (Generalitat)» · «DOGC 3-7-2024»;
  A/C → mateixa cadena combinada i «DOGC 19-10-2026» de sempre. La migració
  `20261119100000_zmrt_ter2408_2024_131` ja estava aplicada pel build de Vercel
  (Municipality: 302 tensats des de la sessió v69).
- **Guardes d'integritat pre/post** (snapshot complet de les 3 taules geo abans i
  després): els 171 A/C intactes byte-a-byte (conjunt de muni5 + tots els valors),
  B 131/131 exactament igual a `data/municipalities.json` (codis únics, cap creuament),
  `dades_lloguer_agregades` 1.945 i `seccions_censals` 1.983 idèntiques fila a fila,
  illes 11.633 i dim 142.283 intocables. Protocol v69 (NO MODIFICAR / NO DUPLICAR) verificat.
- **Verificació en viu**: `/api/zones?muni=08019` → 200 (Barcelona, llista A, índex
  11,595 €/m², 1.053 zones) i `/api/zones?muni=08227` → 200 (Sant Martí Sarroca,
  **llista B, publicació DOGC 3-7-2024**, cobertura FORA_ABAST_PILOT honesta);
  `/api/normativa` segueix gated Premium (401 anònim, correcte).

## v69 — Auditoria ZMRT: els 131 municipis de TER/2408/2024 (2a tanda) entren a la BD — total vigent 302 — 2026-11-19

Auditoria legal íntegra demanada pel propietari («tinc la certesa que falten municipis").
Resultat: la BD tenia 171 municipis ZMRT i en faltaven **131** — els de la Resolució
TER/2408/2024, d'1 de juliol (DOGC núm. 9196, de 3-7-2024; vigència efectiva
10-10-2024), que el repo tenia per «caducats» per un error d'anàlisi: la 2a tanda
CONTINUA VIGENT sense canvis a la revisió 2026 (verificat contra
habitatge.gencat.cat i el paquet 2026: 302 municipis = 118 prorrogats 1a tanda +
131 de TER/2408/2024 + 53 nous). Zero col·lisions per codi INE amb els 171
existents (protocol: NO MODIFICAR els 171, NO DUPLICAR).

- **Dades**: `data/municipalities.json` i `src/data/municipalities.json` (+131
  municipis isTense=true, tenseList='B'; 302 = 118 A + 131 B + 53 C; aplicació
  idempotent amb asserció de protecció, els 171 intactes).
- **Migració additiva** `20261119100000_zmrt_ter2408_2024_131`: UPDATE idempotent
  (IS DISTINCT FROM) només sobre els 131 codis del delta; cap codi A/C dins
  (guardat per test M1).
- **Llista B als textos**: NORM_FACTS.tenseResolutions amb les 3 resolucions;
  nova `tensePublicacio(llista)` (A/C → DOGC 19-10-2026 · B → DOGC 3-7-2024)
  usada per /api/zones i /api/normativa — abans «DOGC 19-10-2026» era hardcoded
  i hauria estat FALS per als municipis B; PDF informe/valoració, HTML d'anàlisi,
  i18n CA/ES (171→302 amb desglossament per tandes), provenance (font/unitat/
  àmbit), docs i DDL comments.
- **Bug corregit dins l'auditoria**: pdf-report mapava un municipi B a «C —
  TER/3740/2026» (fals): ara A/B/C amb la data DOGC de la seva llista.
- **Pipeline**: `prepare_data.py` amb TENSE_B (131 noms oficials DOGC) + cadena
  legal completa al comentari (TER/800/2024 → TER/2408/2024 → paquet 2026) +
  alias defensius (Castell-Platja d'Aro, Calonge); `f4_zones_buscador.py` escriu
  zmrt_font/zmrt_publicacio PER LLISTA (mai una font falsa a geo.municipis).
- **Tests**: nova guarda bloquejant `zmrt_v69_ter2408` (9 tests: recomptes
  302/118/131/53, identitat de les 2 còpies, cap creuament A/B/C, mostres B per
  INE — Ràpita 43136, Esquirol 08254, Vielha 25243, Castell d'Aro 17048,
  Sant Martí Sarroca 08227, Vilanova del Vallès 08902 —, migració sense cap codi A/C, NORM_FACTS,
  tensePublicacio, texts 302 sense restes de «171») + Z9 (/api/zones per a un
  municipi B: publicacio DOGC 3-7-2024, FORA_ABAST_PILOT honest) + mock/fixture
  evolucionats + plans_fase2 evolucionat JUSTIFICADAMENT (la ruta ja no conté la
  data literal: ara va per llista amb tensePublicacio). Suite bloquejant CI amb
  19 fitxers: 0 fail; tsc + eslint + check_repo + next build nets.
- **Pendent (capa geo, propietari)**: reexecutar `pipeline/f4_zones_buscador.py`
  amb la DATABASE_URL perquè geo.municipis reflecteixi les llistes A/B/C (la
  targeta ZMRT de /api/zones llegeix Municipality, que el desplegament
  corregeix via migració).

## v68.1 — Fix de producció F3/F4 (primera càrrega real a la BD de l'app) — 2026-11-19

Primera càrrega de producció REAL (BD de l'app amb PostGIS 3.3.7) — dos bugs de
robustesa caçats en viu i corregits; càrrega final 100 % verda i API servint
dades reals:

- **f3 (illes)** — la columna és `geometry(MultiPolygon,4258)` però el
  make_valid/buffer(0) de shapely pot produir WKT POLYGON singular segons la
  versió: PostGIS rebutjava la INSERT («Geometry type (Polygon) does not match
  column type»). Fix: `ST_Multi(ST_CollectionExtract(ST_GeomFromText(·,4258),3))`
  — robust amb qualsevol shapely/PostGIS.
- **f3 (illes + seccions, rendiment)** — les 11.633 INSERT fila a fila
  (~65 ms/round-trip sobre pooler WAN) superen el timeout de producció
  (~13 min): passa a `execute_values` per tandes de 400 (~30 sentències),
  mateix patró que la dim (lliçó v41 estesa a illes/seccions).
- **f4 (seccions shp)** — mateix tractament ST_Multi preventiu (el dissolve de
  bseccen pot produir POLYGON singular); geometria additiva, mai bloqueja.
- **Resultat producció** — dim 142.283 files · 10,039 €/m² · illes 11.633
  ST_IsValid 11.633/11.633 · seccions 1.983 · municipis 947 (171 ZMRT, llista
  A/C DOGC 19-10-2026) · seccions_censals 1.983 (totes amb centroide) ·
  agregats 1.945 (any 2025, QUOTA_EDIFICIS_ESTIMADA) — en viu:
  `GET /api/zones?muni=08019` → 200 (Barcelona ZMRT llista A, índex 1.134,6
  €/mes = 11,595 €/m², 1.053 zones ordenades per compliment DESC 87,02→…) i
  `GET /api/geo/illes?muni=08019` → 200. Cobertura honesta: dades de zones per
  als 27 municipis del pilot AMB; resta FORA_ABAST_PILOT fins a l'execució
  plena F1/F2 o el fitxer seccional d'INCASÒL.

## v68 — El menú només ofereix «Consulta» — 2026-11-19

Decisió del propietari: «consulta ràpida sembla una ampliació de consulta» —
es treu «Consulta ràpida» del menú i es deixa només «Consulta» (l'eina completa
/analitza amb mapa ICGC). Canvi de navegació mínim:

- **`AppShell`** — s'eliminen les 3 entrades de navegació cap a `/consulta`
  (desktop, mòbil i peu). La **ruta `/consulta` continua viva**
  (`view === "/consulta" && <ConsultaView />`) com a destí directe: la pàgina
  `ConsultaView` no canvia ni una línia. Els CTA del buscador invers no es
  toquen: «Verificar un edifici concret en aquesta zona» segueix apuntant a
  `/#/analitza?muni=` (mai a /consulta).
- **`i18n` CA/ES** — clau `nav.consultaRapida` retirada (sense cap ús restant).
- **Guardes** — `zones_buscador.test.ts` U7 evolucionada JUSTIFICADAMENT: ara
  ancla l'estat v68 (ruta viva, menú SENSE l'entrada, «Consulta» → /analitza,
  clau i18n retirada). Suite completa 215 pass / 10 fail IDÈNTICA al baseline
  git stash de v67 (les 10 són fallades d'entorn preexistents documentades a
  v59-v67) — zero regressions; tsc + eslint + check_repo nets.

## v67 — Buscador invers (portada) + pàgina pròpia «Consulta el preu real registrat» — 2026-11-19

Encàrrec: buscador invers a la home que trobi zones (seccions censals) on el
preu real compleix l'índex de referència, movent el mòdul «Consulta el preu
real registrat» a una pàgina pròpia amb entrada de menú adient. Tot additiu:
cap endpoint, flux, preu ni text legal existent canvia.

- **UI (nou component `src/components/buscador/BuscadorInvers.tsx`)** —
  autocompletat de municipis de Catalunya (`/api/municipalities`, debounce 250
  ms, xips ZMRT/No tensionat per suggeriment), **targeta d'estat ZMRT** amb
  colors semàfor (vermell `bg-embersoft` ZMRT + llista A/C DOGC 19-10-2026;
  verd `bg-mintsoft` no tensionat) i índex de referència vigent €/mes +
  €/m²·mes, **taula ordenable** (`aria-sort`) per secció censal: preu mitjà
  real €/m², índex €/m² i **Índex de Compliment** (% contractes ≤ índex) amb
  semàfor verd (preu ≤ índex) / vermell (preu > índex), paginació de 50, filtre
  «Mostrar només municipis no tensionats» (switch `aria-checked`: filtra
  suggeriments i oculta honestament les zones d'un municipi ZMRT), CTA per
  fila «Verificar edifici» i CTA destacat «Verificar un edifici concret en
  aquesta zona» → `/#/analitza?muni=<codi6>&mn=<nom>` amb **municipi prefilat**
  (prop additiu `initialMunicipi` a `AnalitzaForm`, parseig `?muni=`/`?mn=`
  validat a `AnalitzaView`) — tanca el cercle invers→directe. Notes RGPD
  (agregació secció censal) i ESTIMACIÓ sempre visibles; estats
  DATA_NOT_READY/FORA_ABAST honestos (mai dades inventades).
- **Portada i navegació** — `LandingView`: la pestanya 1 de la targeta passa a
  ser el buscador invers (pestanya «Valora el lloguer del teu habitatge»
  intacta); el mòdul de consulta es mou 1:1 a la **pàgina nova `/#/consulta`**
  (`ConsultaView`, amb teaser creuat cap a estima i enllaç a l'eina completa
  /analitza); `AppShell` afegeix la ruta + entrada de menú «Consulta ràpida»
  (desktop, mòbil i peu, `t.nav.consultaRapida` CA/ES). Guardes v47/v56
  evolucionades JUSTIFICADAMENT amb el mòdul mogut (mateixos textos, nova
  ubicació).
- **Backend (DDL additiu `pipeline/sql/002_zones_buscador_invers.sql`)** — tres
  taules noves a l'esquema `geo`: `geo.municipis` (ZMRT DOGC + cobertura),
  `geo.seccions_censals` (CUSEC + geometria `MultiPolygon,4258` Idescat
  bseccen + WKT fallback sense PostGIS + GIST) i `geo.dades_lloguer_agregades`
  (preu_real_mitja_eur_m2, index_referencia_eur_m2, percentatge_compliment,
  nivell_dada SECCIONAL|MUNICIPAL, compliment_metode CONTRACTES_REALS|
  QUOTA_EDIFICIS_ESTIMADA, traçabilitat font) amb índex
  `(muni5, percentatge_compliment DESC NULLS LAST)`. RGPD: agregació mínima =
  secció censal (mai edifici/vivenda), higiene ≥5 edificis, geometria mai al
  payload.
- **Loader `pipeline/f4_zones_buscador.py`** — idempotent (DROP+CREATE de només
  les 3 taules), llegeix fonts JA presents a la BD (fiances Incasòl de
  `Municipality` + dim/illes/seccions del F3), fórmules documentades (m² mitjà
  ponderat per vivendes; índex €/m² = fiança oficial ÷ m² mitjà; % compliment
  per secció), `--seccions-shp` opcional per a la geometria bseccen, URL mai
  impresa (només host/db), ANALYZE final. Executat end-to-end al PG local amb
  PostGIS 3.6.4: 947 municipis (27 coberts AMB) · 1.983 seccions · 1.945
  agregats (any 2025); verificació real BCN: índex 11,595 €/m² ≈ àncora F2.
- **API `GET /api/zones?muni=` (NOVA, 104a ruta del dispatcher)** — públic
  agregat, rate limit 30/min IP, cache 10 min + SWR 24 h, ORDER BY compliment
  DESC NULLS LAST, zmrt DOGC + indexReferencia (mateixa lògica que normativa:
  Incasòl o ref. comarca ESTIMACIÓ), cobertura PILOT_AMB / FORA_ABAST_PILOT
  honesta, 503 DATA_NOT_READY, mai geometria al payload. Dispatcher
  regenerat (`gen_api_dispatcher.py`) sense drift (check_repo verd).
- **Tests** — +20 (`tests/zones_buscador.test.ts`: API Z1–Z8, DDL D1–D3, loader
  L1–L2, UI U1–U7). Suite completa: 211→229 verds, ZERO regressions noves
  (10 falles preexistents d'entorn documentades v59–v64, baseline verificat
  amb git stash: 12→10). tsc + eslint 0 errors.
- **Docs** — `docs/buscador-invers.md` (esquema, fórmules, contracte API,
  RGPD, runbook, limitacions honestes).

## v66 — Pipeline ETL Geoespacial + ML en producció (F1–F3 del full de ruta) — 2026-11-18

Encàrrec: «avanza con la FASE 2 y luego con los pasos naturales F1 (ATOM de
Catastro + SERPAVI CSV en producción), F2 (fichero seccional INCASÒL → LOSO +
AMB completo) y F3 (carga PostGIS + endpoint)». La FASE 2 (Premium) ja era a
v65; aquesta versió posa el pipeline geoespacial (downscaling
seccional→edifici/illa) en producció, sense tocar cap endpoint, disseny ni
funcionalitat existents.

- **`pipeline/` (NOU, additiu)** — reproducció F1–F3: `f1_ingesta.py` (ingesta
  oficial idempotent: Catastro INSPIRE ATOM provincial + seccions censals
  Idescat «bseccen» + SERPAVI municipal MIVAU + flux anual fiances Incasòl
  Socrata `qww9-bvhh` + OSMnx només com a variables d'entorn, sentinel 999 m),
  `f2_modelo_amb.py` (model PASO 3: residuo de manzana municipal repartit per
  factor hedònic, blend INCASÒL/SERPAVI-OSM amb pes w, IC95 mecànic,
  `calidad = clamp(1 − 1,75·IC_rel, 0,30, 1)` i graus A/B/C/D — regles
  EXACTES recuperades del v1.0 per ajust estadístic sobre els artefactes
  validats; LOSO per seccions censals completes en 6 folds + LOMO ciego
  municipal), `f3_carga_postgis.py` (càrrega idempotent de 3 taules al esquema
  `geo`: dim_building_rent_estimation 142.283 files + geo_illes 11.633 amb
  geometria ETRS89 + geo_seccions 1.983; detecció automàtica de PostGIS amb
  fallback WKT+lat/lon documentat; tandes de 400, lliçó v41),
  `sql/001_dim_building_rent_estimation.sql` (DDL PASO 4 complet del encàrrec:
  les 15 columnes exigides + IC95 + calidad_grado + procedencia + metodologia_version)
  i `README.md` (fonts oficials amb URL, metodologia, validació, limitacions).
- **Validació de la reconstrucció** (contra l'informe v1.0 del pilot AMB):
  mateixes 142.283 edificis / 11.633 illes / 1.983 seccions; IC mitjà 38,7% vs
  38,3%; calidad mitjana 0,662 vs 0,657; 0,0% fora de banda SERPAVI (igual);
  LOSO estabilitat seccional 0,39% (v1.0: 1,62%); LOMO RMSE ciego municipal
  1,325 €/m² (v1.0: 1,386). Distribució de graus NO idèntica (la regla exacta
  de w per edifici és irrecuperable; documentat honestament al README §6):
  els artefactes de PRODUCCIÓ continuen essent els v1.0-2026-11 validats.
- **F3 — endpoints NOUS (aditius, dispatcher 101→103 rutes)**:
  `GET /api/geo/illes?muni=` (públic, agregat per illa amb renta_m2, calidad,
  n edificis, centroid; cache 10 min + SWR; rate limit 30/min IP) i
  `GET /api/geo/edifici?refcat=` (Premium/Pro — 401 anònim, 403
  PLAN_REQUIRED al Gratuït; estimació amb IC95% + grau + procedencia).
  Ambdues amb degradació honesta **503 DATA_NOT_READY** si el pipeline encara
  no està carregat a la BD (mai es inventa cobertura) i nota legal sempre:
  «Comparació estadística, no és una taxació oficial».
- **Càrrega verificada end-to-end amb PG local**: dim_building_rent_estimation
  142.283 files (mitjana 10,039 €/m² verificada per SQL), geo_illes 11.633
  (11633 amb geometria), geo_seccions 1.983; indexos id_illa/id_seccio/
  refcat/muni + GIST en producció. E2E real amb servidor: `/api/geo/illes?
  muni=08019` → 200 amb 2.000 illes reals de Barcelona (renta_m2 9,88–12,28),
  `/api/geo/edifici` → 401 anònim correcte.
- **Tests**: +9 (tests/geo.test.ts, patró mock.module): validació muni/refcat,
  gating per pla, nota legal obligatòria, DATA_NOT_READY, 404 fora d'abast
  (mai inventat), SQL contra geo.*. tsc + eslint 0 errors; la resta de la
  suite manté els mateixos fallos preexistents d'entorn documentats a v59–v64.

## v59 — Auditoria integral (IX): BLOQUE C — «Com funciona» complet implementat — 2026-11-17

Implementació del C1+C2 **aprovat pel propietari** («aprueba Com funciona»).
La portada manté els 3 passos curts; la guia COMPLETA viu a una pàgina nova,
indexable, en llenguatge molt fàcil (frases ≤20 paraules, una acció per pas,
cada terme tècnic explicat la primera vegada + glossari). Alineada amb el
renombrado v56 («valora», «taxació oficial» ca, «habitatge», «renda»).

- **Claus i18n `howFull.*`** (ca/es simètriques, guardes): 11 passos amb
  `t`/`d`/`detall` (idioma → mapa → municipi → colors → edificis → fitxa →
  entorn → comparar anunci → registre/quota → informe → valorador N1/N2),
  «Què necessites»/«Què obtens», exemple amb XIFRES REALS verificades avui
  (Manresa 585 €/mes, títol SSR de producció; computeValuation 70 m²/3 hab →
  ≈488 €/mes, rang ≈440–537; a reformar ≈391), «Què NO és», límits del pla
  Free, mini-FAQ de 8 i glossari de 10 termes.
- **Vista `ComFuncionaView`** (acordeó accessible: `aria-expanded`,
  `aria-controls`, panells `role="region"`; zero dependències noves) muntada
  a AppShell a `#/com-funciona`; pàgina SSR **`/com-funciona`** indexable
  (HashBridge, com /guia) + entrada al sitemap (priority 0.8).
- **Punts d'entrada**: CTA «Veure la guia completa pas a pas» a la portada
  (clau nova `how.more`, la home NO s'allarga) + primer enllaç del peu
  («Producte»). El contingut és gratuït: cap paywall.
- **Guardes noves `tests/how_full_v59.test.ts`** (7 tests): simetria ca/es
  estructural, 11 passos/FAQ≥8/glossari 10, filtre de claredat MESURAT (256
  frases ca+es, màxim 19 paraules/frase, límit 20), termes prohibits fora
  («vivenda», arrel «estima»), negació legal «taxació oficial»/«tasación
  oficial» per llengua, exemple coherent amb el motor (650/585 = +11,1 %;
  488,4/585 ≈ 0,856×0,975 ±0,002), cablejament complet i NO-regressions
  (quota server-side `gateDetailedQuery`, illa de cases intacta, 3 passos de
  la portada intactes).
- **Docs**: `docs/com-funciona-copy.md` + secció «Implementació v59» (ajustos
  finals del copy aprovat: pas 5 ca normatiu «En apropar-te», pas 10
  «Descarrega l'informe», «Què obtens» en frases curtes, glossari/FAQ amb el
  glosari únic de `docs/linguistica.md`).
- **Verificació en viu** (standalone + navegador): /com-funciona 200 amb
  title SEO, sitemap.xml serveix l'entrada, acordeó funciona, canvi ca/es
  immediat, CTA de la portada navega a #/com-funciona, peu amb «Com funciona»,
  mòbil (iPhone 14) correcte, 0 errors de consola.

## v56 — Auditoria integral (VI): BLOQUE E — revisió lingüística experta ca/es amb la decisió terminològica del propietari — 2026-11-17

Decisió OBLIGATÒRIA del propietari aplicada a tot el producte: **«estima/
estimar» → «valora/valorar» a AMBDUES llengües** (ca: «Valora el lloguer del
teu habitatge»; es: «Valora el alquiler de tu vivienda»), i a català
**«vivenda» → «habitatge»** i **«renta» → «renda»** (en castellà «renta» i
«vivienda» són correctes: cada correcció amb el seu par). Taula completa de
correccions (~60+ parells ca/es) + glosari únic del producte:
**`docs/linguistica.md`** (entregable 3 del PROMPT MASTER).

- **Coherència legal reformulada (regla 6):** els disclaimers que deien
  «no és una valoració del teu habitatge» passen a la fórmula del propietari
  — ca «no és una taxació oficial; és un rang orientatiu basat en dades
  oficials» / es «no es una tasación oficial; es un rango orientativo basado
  en datos oficiales» — a ORIENTATION_DISCLAIMER, intro de la portada,
  footer, metodologia, PDFs i SEO. La paraula «valoració» només apareix ara
  en afirmatiu (nom del resultat orientatiu); les negacions legals sempre
  «taxació oficial»/«tasación oficial».
- **Renombrat coherent en 25 fitxers** (pestaña de la portada, nav i footer,
  h1/h3, badges, CTA, formularis, informes en pantalla, 3 generadors de PDF,
  textos legals, metades SEO de /estima i /analitza, FAQ, metodologia,
  limitacions del motor, fonts citades i alt texts). Sustantius derivats
  uniformes: «el valorador» (mai «estimador»), «valoració orientativa»,
  «aproximació» per a les marques estadístiques, «càlcul» per a l'operació.
- **Indicador v41 renombrat** a UI/SEO/provenance: «% aproximat de lloguer
  sobre el parc residencial» / «% aproximado de alquiler sobre el parque
  residencial» (RentalSharePanel ×2, MetodologiaView, ComparadorView,
  /lloguer/[slug] ×2, rental-share.ts fonts+metodologia).
- **Criteri d'acceptació verificat:** barrida automatitzada sense comentaris
  (`scripts/residus_linguistics.py`) = **0 strings user-facing amb
  «vivenda», «renta» (ca) o arrel «estima-»**. Els identificadors de codi es
  conserven com a noms tècnics documentats (ruta `/estima`, clau i18n
  `estima.*`, tipus `EstimaInput`, camp API `estimation`, paràmetre
  `source=estimat`): zero trencaments de URLs/SEO/API.
- **Extra del barrida:** clau i18n es `admin.mrr` huérfana (el seu par ca va
  sortir a v51) eliminada; es «cae con la mida» (interferència del català)
  → «cae con el tamaño»; ca «mai s'estima la part que falta» (idescat) →
  «mai s'interpol·la».
- **docs/com-funciona-copy.md** actualitzat a la terminologia nova (pas 11
  «Valora el teu pis», FAQ 6 reformulada, inventari C1) — llest per a la
  implementació pendent d'aprovació. **AUDITORIA.md §J-0** actualitzat amb la
  decisió del propietari.
- **Guardes (+6, `tests/linguistica_v56.test.ts` al bucle CI):** E1 cap
  «vivenda»; E2 cap «renta» ca (es intacte); E3 «Valora» a ca/es i mai
  «Estima el lloguer»; E4 disclaimers «taxació oficial» a les dues llengües
  i mai «no és una valoració del teu habitatge»; E5 marques «aproximació» i
  fórmula «renda orientativa»; E6 no-regressions (motor VAL_BETA,
  gateDetailedQuery, illa de cases). Suite: **16 fitxers · 298 tests verdes**;
  tsc + build de producció OK; mapa/quota/comparador/motor intactes.

## v55 — Auditoria integral (V): matriz de fuentes de transporte VERIFICADA (GTFS agregado T-mobilitat) — 2026-11-17

Entregable del BLOQUE D demanat pel propietari (matriz amb peticions reals
ANTES de tocar el mapa). **Cap canvi de codi, cap cambio destructiu** — el
mapa i l'EntornPanel queden intactes; la integració queda pendent d'aprovació:

- **`docs/fuentes-transport-matrix.md`** (NOU): matriz completa de fonts amb
  verificació real. El GTFS AGREGAT de T-mobilitat (portal oficial + NAP
  MIMTRANS fichero 2060/2059 + MobilityDatabase 2826/2832) s'ha descarregat
  i analitzat COMPLETAMENT: ZIP 94 MB, **41.449 parades, 2.453 rutes,
  208.004 serveis, 198 operadors** (TMB, FGC, Rodalies-Renfe, AMB,
  interurbans Generalitat, EMT Tarragona, bus urbà de Lleida/Manresa/Vic/
  Girona/Figueres/Reus…), modos bus/tren/metro/tram/funicular, llicència
  «Autorización según la ley 37/2007», freqüència DIÀRIA (fitxa oficial
  «Oferta planificada de transport completa», àmbit Cataluña).
- **Cobertura real mesurada** (`scripts/gtfs_analisi.py` ×
  `src/data/municipalities.json`): **899/947 municipis amb parada a ≤1 km
  del centre i 919/947 a ≤2 km**; Vall d'Aran 9/9; Sort 110 m; Puigcerdà
  tren+bus; 28 municipis rurals petits sense parada a ≤2 km (documentats per
  a la degradació elegant). Proves del criteri d'acceptació superades:
  Barcelona, Girona, Lleida, Tarragona + rural (Sort).
- Fonts per operador verificades amb peticions reals: TMB 401 (cal clau),
  FGC Opendatasoft amb payload real (305 estacions), TRAM canal `/GTFS/`
  buit («There aren't any GTFS files generated.»), Renfe GTFS estàtic
  Cercanías 15,6 MB actualitzat avui + GTFS-RT viu, AMB TIMEOUT 2× (NO
  VERIFICAT), Overpass OSM amb payload real rural (17 parades Vall d'Aran),
  MobilityDatabase mirall 404. Conclusió: fonts per operador redundants per
  a l'estàtic (ja dins l'agregat); valor només per al temps real (T3).
- **Proposta MVP detallada pendent d'aprovació**: ingest setmanal del GTFS
  simplificat via NAP (ApiKey gratuïta server-side), JSON compacte ~3 MB,
  API `/api/entorn/transport` per radi 500-1000 m, capa Leaflet activable
  amb icones per modo + atribucions, indicador a «Serveis i qualitat de
  l'entorn», degradació elegant als 28 municipis sense cobertura.
- **`docs/gtfs-investigacio-transport.md`**: nota de segona ronda + enllaç.
- **`AUDITORIA.md` §L**: actualitzat amb els resultats verificats.
- **`docs/gtfs-cobertura-analisi.json`**: evidència completa (12 KB).
- **`scripts/gtfs_analisi.py`** + **`scripts/cdp_download.mjs`**: scripts
  d'anàlisi reproducibles (documentats al mateix doc).

## v54 — Auditoria integral (IV): AUDITORIA.md + copy «Com funciona» (C1/C2) + investigació GTFS — 2026-11-17

Documents d'entrega del PROMPT MASTER (cap canvi de codi):

- **`AUDITORIA.md`**: auditoria completa amb hallazgos P0/P1/P2 i evidència
  reproducible. Veredicte: **P0=0, P1=0 obertes** (3 trobades i tancades al
  moment a v51/v52), **P2=16** accions. Verificat EN VIU: TLS 1.3 + HSTS
  preload, CSP completa, XCTO/XFO/RP/PP, brotli (40,3 kB → 9,4 kB), API amb
  405/401 `REGISTRAT_PRIMER` reals, preflight creuat sense ACAO, 0 trackers,
  quota server-side, llicències permissives, `/estat` amb sondes viu. Inclou
  la matriu final de codi mort i el pla d'acció prioritzat.
- **`docs/com-funciona-copy.md`**: C1 inventari funcional REAL (20
  funcionalitats amb evidència de fitxer — la home només explicava 6-8) +
  C2 copy final ca/es amb claus `howFull.*`: què necessites, què obtens, 11
  passos amb una acció per pas, exemple numèric amb dades REALS (base
  Manresa 585 €/mes verificada a producció; càlcul executat amb la funció
  real `computeValuation`: 70 m²/3 hab bon estat → 488,4 €/mes, rang
  439,6-537,3; a reformar → 390,7), «què NO és», límits del Free, mini-FAQ
  (8) i glossari (10). Proposta d'implementació (ComFuncionaView acordeó
  accessible + /com-funciona + sitemap + guards) — PENDENT d'aprovació.
- **`docs/gtfs-investigacio-transport.md`**: fonts de transport provades amb
  peticions reals. Catàleg Socrata gencat VERIFICAT (FGC GTFS-RT ×3, parades
  d'autobús interurbà, estat Rodalies; llicència «See Terms of Use») però el
  payload NO és accessible per API oberta («non-tabular», adjunts buits);
  TMB 401 sense clau; AMB timeout (NO VERIFICAT). Integració per fases T1-T3
  (EntornPanel → GTFS estàtic → RT) PENDENT d'aprovació; claus sempre
  server-side; segona ronda proposta: OSM Overpass (ODbL, sense clau).

## v53 — Auditoria integral (III): darrers exports morts confirmats — 2026-11-17

Matriu de codi mort completada: `DemoBlock<T>` (demografia.ts) i
`EMAIL_FIRST_QUOTA_NOTE` (email-first.ts) tenien 0 referències en producció,
tests i scripts → eliminats. En canvi, `clearEmailFirstDraft()` (mai
invocada) NO s'elimina: la seva morta existència documenta una decisió de
producte pendent (els esborranys sessionStorage del flux email-first potser
mai no es netegen — P2 a l'auditoria amb proposta).

## v52 — Auditoria integral (II): patch de seguretat de Next — 2026-11-17

**Vulnerabilitat moderada tancada:** `npm audit` reportava next 16.3.0–16.4.4
«Information disclosure across root params when a 'use cache' function is
called through unstable_cache()» (via `unstable_cache`). FixAvailable →
upgrade 16.4.3 → **16.4.6** (patch dins del mateix minor, API sense canvis):
`npm audit --omit=dev` = **0 vulnerabilitats**. Verificat amb typecheck,
suite (unit/audit_v23/email_first/f4_qa/home_premium_v49) i build de
producció. El gate de CI (bloqueja high+) no l'hauria atrapat: el fix era
barat i evita quedar exposats.

## v51 — Auditoria integral (I): neteja de codi mort i correccions editorial/SEO/a11y — 2026-11-17

**Codi mort eliminat** (matriu completa d'evidència a `AUDITORIA.md`):
- `tailwind.config.ts` arrel: Tailwind v4 (`@import "tailwindcss"` + `@theme` a
  globals.css) l'ignora per complet i el seu `content` apuntava a `./pages` i
  `./components`, rutes que no existeixen (hauria de ser `./src/...`). 0
  referències en src/tests/scripts/configs.
- Claus i18n huérfanes (definides, mai usades; typecheck com a xarxa):
  `brand` (ca i es), `admin.mrr`, `admin.reports`, `admin.usersTable.actions`,
  `map.title`, `map.panel.trend` i `plans.stripeOff` (només existia a es).
- La feature DORMIDA «illa de cases» (conveni Incasòl) queda EXPLÍCITAMENT
  exclosa de qualsevol neteja, igual que els 31 exports amb ús només a tests.

**Bug editorial corregit:** el paràgraf de zones tensades (`t.tense.desc`)
apareixia DOS vegades dins la mateixa secció de la portada (columna del títol
i targeta dels 118/53). Ara un de sol; guarda H1 evita la regressió.

**SEO:** els títols de /estima, /analitza, /lloguer, /lloguer/[slug] (×3) ja
acabaven en «| Preureal» i el template del layout hi afegia un SEGON
«| Preureal» (ex.: «Consulta el preu real registrat | Preureal | Preureal») —
eliminat el sufix redundant dels pages. «Faq» passa a «Preguntes freqüents».
El bloc `alternates.languages` ca/es apuntava AMBDUES llengües a la mateixa
URL (el lloc és bilingüe amb canvi d'idioma client): eliminat a layout,
/lloguer i /lloguer/[slug] — queda el canonical; l'idioma el declara
`<html lang>` dinàmic i el JSON-LD `inLanguage`.

**Accessibilitat:** l'idioma restaurat del localStorage o del navegador a
l'inici també actualitza `<html lang>` (fins ara només el toggle manual).

**Doc rot:** EstatView apuntava a `src/data/incidents.ts` (no existeix); el
historial és en línia en el mateix fitxer.

**Guards:** +2 a home_premium_v49 (H1 paràgraf únic, H2 config mort absent) —
suite bloquejant en 15 fitxers, 292 tests.

## v50 — El panell demogràfic del mapa: una xifra sota l'altra i requadres grans — 2026-11-17

**El problema (captura d'usuari, Barcelona):** a la fitxa municipal del
/mapa, el bloc «Contexte demogràfic i territorial» posava les 4 xifres KPI
(Població, Variació 5 anys, Variació 10 anys, Densitat) en una FILA de 4
columnes (`grid-cols-2 sm:grid-cols-4`) dins d'una columna lateral estreta:
les xifres llargues (p. ex. 1.731.649 habitants o 16.904 hab/km²) desbordaven
el requadre i se solapaven amb el KPI veí — il·legible.

**El fix (literal, el que demanà l'usuari):** una xifra SOTA l'altra (mai al
costat) i requadres més grans.
- El grid de KPIs passa a `grid-cols-1`: cada xifra ocupa TOTA l'amplada de la
  fitxa, amb el seu període sota («1 de gener 2025», «+27.607 hab.», km²) —
  mai més en fila de 4 ni 2+2; a més, cap altre layout de columnes no queda
  al panell (guarda D1).
- Requadre Kpi més generós: `px-3.5 py-2.5` (abans `px-3 py-2`) i el detall
  separat del valor amb `mt-0.5`; la jerarquia tipogràfica es manté (xifra
  protagonista en `text-lg font-black`).

**No canvia:** títol del bloc, badges de tendència/edats/estrangers/llars,
gràfics d'evolució i d'edats, detall opcional («Més detall»), fonts IDESCAT i
el muntatge des de MapView — tot intacte. La fitxa municipal és l'únic lloc on
es usa DemografiaPanel (MapView), cap altra vista no és afectada.

**Tests:** +5 guardes noves (`tests/map_kpi_v50.test.ts`, a la suite
bloquejant: D1 grid d'una columna i cap `grid-cols-2/3/4` al panell, D2
requadre gran amb detall separat, D3 les 4 xifres amb i18n ca/es intactes,
D4 resta del panell intacta, D5 DemografiaPanel continua muntat al /mapa).

## v49 — Redisseny premium de la portada: mini-mapa viu al hero + etiqueta fixa de contracte — 2026-11-17

**Redisseny del hero (segons la maqueta):** el bloc de text del hero queda
AMUNT de la columna esquerra (graella `items-start`, mai centrada contra el
formulari) i ABAIX hi torna el MAPA VIU, més petit: nou component
`LandingMap.tsx` amb els mateixos edificis ICGC colrats per la renta real
registrada (fiances Incasòl) que el /mapa — mateixa font (`/api/buildings`),
mateixa escala de color exacta (5 colors, llindars 550/700/850/1000 €/mes),
mateixa base cartogràfica ICGC amb atribució. Lleuger per propòsit: sense
controls de zoom, `scrollWheelZoom: false` (mai segresta el scroll), una càrrega
d'edificis per vista amb recàrrega al moveend, tooltips amb la renta real
(≈ €/mes) i clic a un edifici → deep link `/mapa?edifici=...` (v24) amb CTA
«Obre el mapa complet». El formulari (columna dreta) guanya una ombra més
profunda (shadow-2xl) per donar-li presència premium.

**Etiqueta FIXA de contracte (demanda explícita):** el formulari de consulta
mostra ara «Tipus de contracte: Habitatge habitual / Vivienda habitual» com a
camp FIX visible i NO interactiu (amb «fixat/fijo» i l'explicació honesta:
única modalitat amb dades oficials aplicables — fiances Incasòl). Continua
SENSE selector: el servidor fixa HABITATGE (v48), el body no envia
`contractType` i l'esborrany llegat es saneja igual.

**Robustesa:** `map.remove()` al desmuntar (mai «Map container is already
initialized» en tornar a la portada); servei d'edificis no disponible → queda
el mapa base ICGC sense cridar errors. Els textos del hero venen d'i18n i no
es toquen; l'enllaç creuat consulta → estima (v47) queda intacte.

**Tests:** +8 guardes noves (`tests/home_premium_v49.test.ts`, a la suite
bloquejant: LandingMap muntat al hero, text amunt amb items-start, endpoint i
escala de color EXACTA compartida amb el /mapa, scroll mai segrestat, cleanup,
deep link + CTA al mapa complet, llegenda i18n, etiqueta fixa visible ca/es i
no interactiva) + actualització de les guardes v48 (F1: el que mai pot tornar
és el SELECTOR — l'etiqueta fixa de v49 és legítima; ara també prohibeix
`<select`/`<option` al formulari).

## v48 — El formulari de consulta només analitza «Vivienda habitual» — 2026-11-17

**Decisió de producte (dades honestes):** el selector «Tipus de contracte» del
formulari de consulta (Home compacta i /analitza completa) oferia 3 opcions
(Vivienda habitual / Temporada / Habitación –compartir piso–), però les dades
oficials aplicables — la referència registrada de fiances Incasòl — només
cobreixen l'habitatge habitual: oferir les altres dues suggeria un càlcul que
no existeix. El selector desapareix del formulari (amb una sola opció vàlida no
hi ha res a triar) i l'assumpció queda documentada on és visible: l'informe
continua mostrant «Tipus de contracte: Habitatge habitual» a cada consulta.

**Bloqueig REAL al servidor:** la whitelist de `/api/analitza` passa de
`["HABITATGE", "TEMPORADA", "HABITACIO"]` a `["HABITATGE"]` — qualsevol valor
llegat (esborranys sessionStorage anteriors a v48, clients vells) es COACCIONA
a HABITATGE pel sanejament existent: mai 400, mai crash, i la lectura normativa
pren sempre el camí d'habitatge habitual (mai el camí TEMPORADA_FORA_LIMIT).
El formulari, a més, neteja els esborranys antics: el `contractType` llegat mai
es restaura ni s'envia. El motor normatiu manté les branques TEMPORADA/HABITACIO
per robustesa defensiva (tests existents a analitza.test.ts, intactes).

**No canvia:** l'avís ciutadà del mapa manté el SEU selector de tipus de
contracte (Habitatge / Habitatge compartit / Local comercial / Altres) —
classifica el report que l'usuari envia a /api/reports, dades reals de
ciutadans sense relació amb la referència Incasòl. /estima no tenia cap
selector de contracte. Mapa, freemium i rendiment intactes.

**Tests:** +10 guardes (`tests/form_contract_v48.test.ts`, a la suite
bloquejant): el selector i les 2 opcions sense dades mai tornen al formulari
(avalua codi sense comentaris, línia + blocs JSX), el body no envia
`contractType`, l'esborrany llegat es saneja, la whitelist és exactament
`["HABITATGE"]`, i 4 tests de comportament real de la ruta amb harness mínim:
TEMPORADA / HABITACIO / absent / HABITATGE → sempre HABITATGE a la sortida, i
LIMIT_RENTA_ART172 pren el detall NO_TENSAT_LLIURE (mai TEMPORADA_FORA_LIMIT).

## v47 — Fix de la descàrrega PDF de l'informe + enllaç consulta → estima — 2026-11-16

**Fix (bug real):** el botó «Descarrega l'informe (PDF)» de l'Informe d'anàlisi
del lloguer era MUT: `window.open("", "_blank", "noopener,noreferrer")` retorna
`null` als navegadors moderns (el flag `noopener` no retorna referència), de
manera que l'informe mai no s'escrivia a la finestra nova i l'error s'empassava
en silenci dins un `catch {}`. Ara la impressió es fa amb un iframe ocult fora
de pantalla (fiable a tots els navegadors, també Safari/iOS, i invisible per als
bloquejadors de pop-ups); el marc s'elimina 60 s després, mai abans que
l'usuari tanqui el diàleg d'impressió.

**Enllaç creuat consulta → estima:** la secció «consulta» de la portada ara té
una targeta clara amb CTA cap a «Estima el lloguer del teu habitatge», amb un
text resumit i amb redacció pròpia (base oficial de fiances Incasòl escalada per
superfície N1 + ajustos opcionals amb coeficient documentat N2; mai una taxació)
— mai una còpia del text llarg que viu a la pestanya estima. L'informe complet
(«Informe d'anàlisi del lloguer») també afegeix el CTA a /estima al peu, al
costat de «Torna al mapa» i «Anar al comparador».

**Tests:** +5 guardes (`tests/consulta_v47.test.ts`, a la suite bloquejant): el
patró trencat no pot tornar (mai `noopener` al window.open; iframe +
`win.print()` + fora de pantalla + `frame.remove()`), CTA present a la portada i
a l'informe complet, i el text del teaser ha de ser resumit i propi (les 3
frases exactes del text llarg de «estima» no poden aparèixer a la portada, que
el manté intacte a la secció seva).

## v46 — Registre obligatori amb e-mail primer al formulari de la Home — 2026-11-16

Els formularis de la Home («Consulta el preu real registrat» i «Estima el lloguer
del teu habitatge») passen a un flux EMAIL-FIRST amb registre obligatori, amb el
bloqueig REAL al servidor (mai només visual). El mapa, la seva consulta de preus
registrats i el freemium existents no canvien.

**Taula de decisió completa (cap cas sense definir):**
- E-mail buit o invàlid → error inline exacte «Introdueix un e-mail vàlid.» (focus
  al camp); no s'envia res.
- Registrat + sessió (mateix e-mail) → desbloqueja i executa; la consulta COMPUTA
  dins la quota del pla (3 detallades/mes al Free), aplicada PER USER_ID al
  servidor amb la mateixa font atòmica v23 que /api/lookup.
- Registrat + sense sessió → magic link d'un sol ús (15 min): «Ja tens compte.
  T'hem enviat un enllaç per entrar-hi.»; en tornar, l'esborrany es restaura i la
  consulta s'executa sola (l'usuari no torna a escriure res).
- NO registrat → «Registra't primer» + redirecció immediata al registre del pla
  Free amb ?pla=free&email=&return= (e-mail precarregat a la primera casella del
  registre; `return` només rutes internes de l'allowlist — mai open redirect).
- Registrat + quota exhaurida → el servidor respon 402 QUOTA_EXCEEDED i el client
  mostra el missatge existent del límit del pla Free (mateix contracte que el mapa).

**Backend (nou):**
- `POST /api/email-status` — públic, rate-limit 5 req/min/IP, resposta MÍNIMA
  `{ registered: boolean }` (mai noms ni pla: anti-enumeració).
- `POST /api/auth/magic-link` + `GET/POST /api/auth/magic-link/consume` — tokens
  de 192 bits amb NOMÉS el HASH a la BD (taula nova MagicToken + migració), un
  sol ús ATÒMIC (update condicionat used:false), caducitat 15 min, un enllaç nou
  anul·la els pendents anteriors, comptes inactius mai reben correu i la resposta
  és `{ sent: true }` SEMPRE (anti-enumeració). GET mai muta (P1.2: redirigeix a
  /#/entrada-link i la SPA fa el POST).
- `src/lib/consulta-gate.ts` — `gateDetailedQuery()`: sense sessió →
  **401 `{ code: "REGISTRAT_PRIMER" }` sense llegir el body ni tocar la BD**;
  amb sessió → consumeDetailQuery per user_id; quota exhaurida → 402.
  Aplicat a `POST /api/analitza` i `POST /api/estima` (els registres detallats
  de consulta dels formularis, recomanat per l'encàrrec: compten dins la quota).

**Frontend:**
- El camp «El teu e-mail *» és la PRIMERA casella d'AnalitzaForm i EstimaForm
  (compact i full) i del formulari de registre (AuthView: e-mail → nom →
  contrasenya). Amb sessió queda precarregat i de només lectura amb
  «Canvia d'usuari» (tanca la sessió).
- Panell de resultats NEIX BLOQUEJAT sense compte: «Registra't primer» + «Crea un
  compte Free gratuït per veure els resultats. Sense targeta · 3 consultes
  detallades al mes.» + CTA «Registra't gratis» (LandingView ambdues pestanyes,
  AnalitzaView, EstimaView, EstimaIntro). aria-live="polite" i focus al camp en
  error (accessibilitat).
- Esborrany del formulari a sessionStorage (clau pr_analitza_prefill històrica i
  nova pr_estima_prefill) desat ABANS de qualsevol crida: error de xarxa o registre
  mai no perden el que l'usuari havia escrit; doble enviament idempotent (guard
  inflight). En tornar del registre/magic link, la portada obre la pestanya del
  formulari origen, restaura l'esborrany i executa la consulta automàticament.
- Textos actualitzats (mai falsos): «Gratuït i sense registre» → «Gratuït amb
  registre Free»; «Cap dada personal» eliminat (l'e-mail HO ÉS): política de
  privacitat ampliada (seccions 2 i 3: e-mail dels formularis, esborrany a
  sessionStorage, consentiment art. 6.1.a RGPD) i consentiment explícit amb
  finalitat al registre.
- `HashBridge` ara transmet la query (?email=&return=&pla=free) dins del hash.

**RGPD / seguretat:** l'e-mail només identifica el compte i aplica la quota al
servidor; mai arriba al body de /api/analitza ni /api/estima, mai s'associa al
Event d'ús (que continua anònim: municipi/m²/tensada/nivell), mai a analytics; el
desat només al sessionStorage del navegador.

**Tests nous — `tests/email_first.test.ts` (38 tests, a la suite bloquejant):**
taula de decisió completa; anti-enumeració dels dos endpoints nous; bloqueig real
401 sense cap lectura de BD a ambdues rutes; quota per user_id i 402; magic link
(hash-only, un sol ús atòmic, caducitat, inactius, returnTo revalidat, anul·lació
d'anteriors, GET sense mutació); rutes internes segures; guardes de font
(e-mail primera casella als 3 formularis, textos falsos eliminats, panell bloquejat
present). `f4_qa.test.ts` s'adaptat (mock del gate amb usuari vàlid per continuar
exercint el cos real de la ruta) i la seva guarda del CI ara exigeix email_first.

**CI:** `email_first` afegit al bucle bloquejant (un procés bun per fitxer).

## F4 — QA integral del redisseny de la Home (tests + metodologia + porta F0) — 2026-11-16

Tancament formal del redisseny del formulari de la Home (F1 → F4): qualitat mesurada,
transparència auditable i cap via d'entrada de regressions en silenci.

**Tests nous — `tests/f4_qa.test.ts` (16 tests, ara a la suite bloquejant):**
- RGPD a nivell de RUTA (patró audit_v23: mocks de next/server, db, rate-limit,
  security, indicators-data): `POST /api/estima` mai fa eco d'adreça, referència
  catastral, correu ni notes enviats; el registre anònim d'ús (Event) només conté
  municipi, m² arrodonits, zona tensada i nivell real; el `select` de la consulta
  BD és exactament el llistat de dades estadístiques (auditable); 429 i 404/400 no
  escriuen res; el contracte de transparència (text fix ca/es, SERPAVI, fonts,
  limitacions) viatja sempre a la resposta.
- Invariants del motor N1/N2 en bateria de casos (6 superfícies × 4 habitacions ×
  5 estats): rang positiu i ordenat, nivell real mai inflat (N2 ⟺ ajust de
  característica aplicat), base traçada intacta, determinisme i €/m² decreixent
  (elasticitat 0,8 < 1).
- Guarda del informe de viabilitat A/B/C: 11 variables, ids únics, només les 3
  classe A es demanen i s'apliquen, el N3 és C i mai simulat (SERPAVI oficial).
- Guarda del CI: els 10 fitxers de tests corren BLOQUEJANTS un a un i cap pas corre amb
  `continue-on-error`.

**CI (`.github/workflows/ci.yml`):** els 10 fitxers de tests passen a BLOQUEJANTS en
un procés bun PER FITXER (bucle amb `set -e`: el primer fallo bloca) — s'elimina el
`continue-on-error` dels tests de funcionalitats i el comentari dels 2 fallos
preexistents (ja corregits amb els commits F2/F3 del motor). Motiu: detectat al CI
un flake real — bun 1.4.x executa els fitxers en ordre NO determinista dins del
mateix procés i els `mock.module` globals d'un fitxer (p. ex. audit_v23 sobre
`@/lib/security`) poden re-vincular mòduls que unit.test.ts comprova REALS si li
toca correr després; aïllant cada fitxer al seu propi procés el resultat és
determinista i cap mock no pot travar a cap altre fitxer.

**Pàgina metodologia (`#/metodologia`):** dues seccions noves —
- «Informe de viabilitat — classificació A/B/C de les variables» (renderitzat des de
  `ESTIMA_VIABILITY` a `src/lib/estima.ts`): veredicte, llegenda i les 11 variables
  del qüestionari oficial SERPAVI amb tractament i font, més l'enllaç oficial MIVAU.
- «Qualitat i verificació (QA)»: què valida el CI, els tres nivells de test de
  l'estimador i els documents d'auditoria del repositori.

**Documentació:** `docs/SERPAVI_VIABILITAT.md` — informe formal de viabilitat (la
«porta» F0 que legitima N1/N2 i el N3 com a no viable amb dades públiques): fonts
autoritzades, classificació A/B/C per variable, veredicte, riscos/mitigacions i
traçabilitat d'acceptació. TASKS.md actualitzat (ítem de tests v38.3 resolt).

Sense canvis a Landing, preus, mapa ni cap flux existent: F4 només afegeix tests,
documentació i transparència.

## v44 — «Analitza el teu futur lloguer»: analitzador d'una vivenda concreta (funcionalitat principal) — 2026-11-15

Nova funcionalitat destacada i gratuïta (sense registre) que evoluciona Preureal d0027
estadístiques a una eina de decisió: la persona introdueix la vivenda que vol alquilar
i obté un informe transparent abans de signar.

**Nova API pública (sense auth, rate limit 20/min):**
- `POST /api/analitza` — informe complet: A) preu (€/m² derivat de l'anunci,
  referència Incasòl municipal o referència de comarca marcada ESTIMACIÓ,
  desviació %, veredicte per llindars explícits −25/−5/+5/+15, valoració per
  característiques reutilitzant `computeValuation` (ajustos hedònics v2),
  evolució anual, 5 municipis propers amb dada oficial), B) normativa per
  ESTATS (mai legalitat): zona tensada (Resolucions TER/3739/2026 + TER/3740/2026,
  DOGC 19-10-2026 via `Municipality.isTense`), límit art. 17.2 segons tipus de
  contracte i renta anterior, gran tenedor + SERPAVI (calculadora MIVAU),
  actualització anual IRAV (INE, +2,54 % set. 2026), D) checklist abans de
  signar (9 punts amb font legal). Sanejament estricte d'entrada; registre
  anònim d'ús (Event) sense cap dada personal.
- `POST /api/analitza/serveis` — secció C ubicació: serveis propers (transport,
  salut, educació, compra, zones verdes) via Overpass/OpenStreetMap (ODbL,
  gratuït), distàncies en línia recta marcades com a aproximades, cau memòria
  6 h per quadrícula ~110 m, timeout 20 s i degradació elegant (mai s'inventen
  serveis). Soroll/aire/inundació/fibra: pendents amb fonts oficials
  identificades (mapa soroll, XVPCA, SINCRO/ICGC) — no s'inventen valors.
- Dispatcher regenerat: 92 rutes (90 + 2).

**Frontend (bilingüe ca/es, responsive):**
- `src/components/analitza/AnalitzaForm.tsx` — formulari compartit (variant
  compacta a la portada i completa a #/analitza amb mapa ICGC Leaflet reutilitzat
  per marcar el punt exacte); adreça amb Geocodificador oficial ICGC (omple
  municipi + coordenades), municipi amb cerca BD local, camps avançats plegats.
- `src/components/analitza/AnalitzaReport.tsx` — informe amb els 4 blocs,
  checklist marcable (localStorage, només booleans) i descàrrega: HTML
  autocontingut generat per `src/lib/analitza-html.ts` (imprimible a PDF des de
  qualsevol navegador, també mòbil, sense dependències noves).
- Portada: el gràfic estàtic «Dreta de l'Eixample · Barcelona» (MiniGrid) és
  substituït pel formulari de l'analitzador (funcionalitat principal); la
  persona surt de la portada sabent si el preu de l'anunci està per sobre o
  per sota de la referència. CTA «informe complet» → `#/analitza` amb prefill
  (sessionStorage, s'executa automàticament).
- Nova vista `#/analitza` + ruta `/analitza` (metadata indexable) + sitemap +
  navegació (header, menú mòbil, footer) amb `nav.analitza`.
- Lint nadiu next 16: setState en efectes diferit amb `await Promise.resolve()`
  i ajusts d'estat durant el render (patrons MapView).

**Idioma (ca)** — errades corregides a l'entrada v43 ja desplegada: el text
«% censal alquiler» → «% censal de lloguer» (es: «% censal de alquiler»); en
aquesta versió també es fixa la font de zones tensades a la portada
(«Resolucions TER/800/2024 i TER/2408/2024» → «TER/3739/2026 i TER/3740/2026,
DOGC 19-10-2026», coherent amb el text de zones tensades).

**Proves:** `tests/analitza.test.ts` — 19 tests (€/m² derivat, veredicte per
llindars, estats normatius segons tipus/renta/zona, haversine, parser Overpass
amb dedup i ways amb center, informe HTML bilingüe sense placeholders amb
escape XSS). tsc net; eslint net; build de producció OK; 174+1848 expect OK
(els 7 fallos locals preexistents per env documentats no canvien). El CI
necessita afegir el fitxer de test (pedaç `ci.analitza.patch` — el token no té
scope workflow).

**Costs:** 0 € (fonts ja integrades + Overpass/OpenStreetMap gratuït; cap API de
pagament ni servei nou activat).

## v43 — Auditoria: correcció lingüística (ca) + eliminació de codi mort — 2026-11-15

Auditoria integral (codi mort + idioma) amb aquestes accions:

**Idioma (català)** — ~45 correccions de text visible en ca (i 5 en es):
- Castellanismes eliminats del text català: «alquiler» → «lloguer», «viviendas
  principales» → «vivendes principals», «vigentes» → «vigents», «horquilla» →
  «franja», «renta» → «renda», «inmuebles» → «immobles», «alquilades» →
  «llogades», «stock» → «estoc», «Catastro» → «Cadastre» (text corrent; el nom
  institucional «Direcció General del Catastro» es manté), «Embudo» → «Embut»,
  «MODO PRUEBA» → «MODE DE PROVA», «suscripción de prueba» → «subscripció de
  prova», «gastos» → «despeses», «Desfase» → «Desfasament».
- Ortografia: «gratüits» → «gratuïts», «juridic» → «jurídic», «recursus» →
  «recursos», «agresiva» → «agressiva», «Obrés» → «Obres», «al teu bústia» →
  «a la teva bústia», «als illes» → «a les illes», «seperat» → «separat»,
  «obtén» → «obté» (imperatiu normatiu), interrogant espanyola «¿» eliminada.
- Sintaxi: «Sap si et cobra de més…» → «Descobreix si et cobren de més…» (hero
  i OG), «en quant per cent» → «en quin percentatge» (×2), «Cliqui» (vostè) →
  «Fes clic» (tu, coherència de registre), «mercat de boquí» → «termòmetre del
  mercat», «(normalment segons)» → «(normalment en segons)» (×2).
- Bug bilingüe al correu de resum de preferits: «vs any anterior» s'enviava
  també als correus en espanyol → ara «vs año anterior» amb locale.
- Bug de traducció a Metodologia: la clau del mapa de principis tenia el typo
  «seperat» i no coincidia mai amb l'API → els usuaris es veien el text ca.
- Coherència de dades: «informe PDF de 8 pàgines» → «9 pàgines» (UI, guia,
  onboarding; el PDF real en té 9).

**Codi mort eliminat** (verificat amb cerca exhaustiva de referències):
- `src/lib/observability.ts` (123 línies, 0 usos), exports mai cridats
  `catastroConfigured`, `jsonStatSources`, `ENTORNT_SOURCES`, `IDESCAT_SOURCES`,
  `IdescatScope`.
- 18 claus i18n mortes (ca+es): hero.ctaSecondary, plans.stripeOff,
  plans.informes.loginCta/errValidation, map.noDataMun/yearUnavailable/
  tenseBadge/notTense/estimate/surfaces/compareBtn/refComarcaOf/
  legendRefComarca, legal.completar, common.save/cancel/close/ok.
- Model Prisma `GeoPolygon` (taula creada i mai llegida/escrita) + migració
  `20261115153000_drop_geo_polygon` (DROP TABLE IF EXISTS).
- devDep `@types/bcryptjs` (stub deprecated; bcryptjs 3 porta tipus propis).
- Arrel: `Caddyfile`, `components.json` (shadcn sense components ui/),
  `public/logo.svg` (0 referències), artefactes del pla de negoci a `data/`
  (plan_cover, plan_cuerpo, charts, adrh_table_ids).
- `scripts/archive/` sencer (54 fitxers, 864 KB) llevat de
  `migrate_sqlite_to_pg.py`, mogut a `scripts/` (el citen DEPLOY.md i
  docker-compose). Scripts one-off de fases acabades: fase2_/fase3_/fase4/
  fase5_*, audit_*, test_auth_fase1, db_check.local, empaquetat ZIP v24
  (make_zip/smoke/upload), fetch_superficie_seed, test_demografia_local,
  test_site_url, dev_keepalive, scripts/propuesta/.
- Docs històrics superats moguts a `docs/archive/` (AUDIT, AUDITORIA_FASE1,
  COM_APPLICAR_*, INFORME_*, PROJECT_CONTEXT) i `docs/ci-workflow.yml`
  (còpia desactualitzada del CI) eliminat. Referències actualitzades a
  README, TASKS i docker-compose.

Validació: tsc net, 127 tests bloquejants en verd, check_repo OK,
dispatcher sense drift.

## v41.1 — Fix del cron rental-share: recàlcul per lots + maxDuration al dispatcher — 2026-11-15

Síntoma en producció: la primera execució de `/api/cron/rental-share` (sembrat inicial
de la sèrie) penjava >100s, Vercel la matava i el client rebia només el fragment `"…"`
del cos d'error de plataforma; el recàlcul només arribava a ~20 dels 947 municipis.
Dos defectes d'origen:

1. **`maxDuration` no exportat on cal**: el route segment config només té efecte si
   s'exporta des de `src/app/api/[[...path]]/route.ts` (la funció única), no des dels
   `_impl`. La v41 l'exportava només a l'impl → Vercel aplicava el límit per defecte.
   Ara el generador (`scripts/gen_api_dispatcher.py`) l'emeteix (`export const
   maxDuration = 60;`) i el dispatcher s'ha regenerat (90 rutes, sense més canvis).
2. **947 upserts consecutius** a `recalcRentalShare` (1 consulta per municipi)
   superaven qualsevol límit raonable. Ara: lectura set-based (com abans) +
   **escriptura per lots** — 1 `deleteMany` de les claus del període actual +
   `createMany` per tandes de 400. Mateix resultat final que l'upsert per
   `(municipalityCode, referenceKey)`: les files d'altres referenceKey (historial)
   no es toquen. Delete+create no és atòmic però és idempotent (una mort a mig
   camí es repara sola a la següent execució).

Validat en local: typecheck + guardia de dispatcher OK; tests v41/v42 38/38; la
suite bloquejant antiga dóna els mateixos 7 fallos d'entorn local amb i sense el
canvi (verda a Actions). Desplegat el fix, el cron del dia 5 i la invocació manual
acaben el sembrat en una sola execució.

## v42 — Eina «Anàlisi del mercat residencial» (creuament de sèries) — 2026-11-15

Encàrrec: una herramienta de análisis del mercado residencial mucho más completa que
una web convencional de consulta de precios, cruzando el precio medio real del
alquiler, la evolución de los contratos y el crecimiento demográfico. Vista `#/analisi`
(nueva entrada en la navegación), API pública y calculadora pura testable.

### Qué cruza (solo series oficiales ya integradas)
- **Preu mitjà real del lloguer**: sèrie 2005-2025 de fiances Incasòl
  (`Municipality.rentHistory`) + referència de comarca (línia discontínua).
- **Evolució de contractes**: flux anual de contractes amb fiança depositada
  2007-2025 (ingesta v41, SODA `qww9-bvhh`); degradació honesta a punt únic
  (`contractsLatest`) mentre el cron mensual no hagi sembrat la sèrie completa.
- **Creixement demogràfic**: Padró continu IDESCAT (`POB_TOTAL`, v39) amb
  variacions a 5 i 10 anys i referència de Catalunya.
- **Contrast censal**: % de viviendas principales en alquiler (Cens 2021, v41).

### Métricas derivadas (aproximaciones etiquetadas, nunca presentadas como exactas)
- **Volum de mercat registrat aproximat** per any: mediana mensual × 12 ×
  contractes de l'any (€/any) — sèrie gràfica + lectura anual.
- **Dinamisme**: contractes amb fiança per cada 1.000 habitants (creuament any
  exacte; població mai interpolada).
- **Creixements creuats**: renda 10 anys vs població 10 anys (divergència
  descriptiva, mai causal).
- **Lectures automàtiques** bilingües (ca/es) generades amb les xifres reals i
  amb el seu any de referència; sense dada → sense lectura (mai inventat).

### Arquitectura
- **Calculadora pura** `src/lib/analisi-calc.ts` (parseRentHistory defensiu,
  growthPct amb base disponible anterior, buildCrossover any-a-any,
  buildInterpretacio) — 12 tests nous (`tests/analisi.test.ts`).
- **Assemblador servidor** `src/lib/analisi.ts` (reusa `getRentalShareDetail`
  v41 + consultes directes del Padró) + **API pública**
  `GET /api/analisi/muni/:code?lang=` (cache 1 h + SWR; dispatcher: 90 rutes).
- **Vista client** `AnalisiView.tsx`: cercador amb debounce (API
  `/api/municipalities`), xips d'exemple, KPIs, 4 gràfics (renda+comarca,
  contractes, població, volum), lectures i **comparativa de fins a 4 municipis**
  amb 9 indicadors per fila.
- Pàgina `/analisi` (HashBridge → `#/analisi`, noindex com el comparador) i
  entrades al header, nav mòbil i footer; nota metodològica a `#/metodologia`.
- E2E local (BD real): Manresa — renda 21 punts (+69,5% en 10 anys), contractes
  19 punts (−11,3% en 5), població +8,5% en 10 anys, volum ~10,3 M€/any (2025),
  18,13 contractes/1.000 hab, cens 28,34%; Catalunya 8.146.265 hab (2025).

## v41 — Indicador «% estimat d'alquiler sobre el parc residencial» — 2026-11-15

Encàrrec específic: incorporar el porcentaje de viviendas en alquiler sobre el parque
residencial (numerador: fiances VIGENTES Incasòl; denominador: parque residencial
catastral; contraste censal INE 2021 via Idescat). Diseño completo y limitaciones:
`docs/INDICADOR_ALQUILER_PARQUE.md`. Migración aditiva: 0 taules existents tocats.

### Verificación de fuentes (HTTP real, 2026-11-15)
- **Numerador (fiances vigentes, stock)**: NO existe publicació municipal oberta
  (el dataset municipal `qww9-bvhh` és FLUX per definició oficial; el saldo net és
  XLSX només Catalunya). Per l'encàrrec, el flux NO substitueix el stock → conector
  administratiu preparat + fonts registrades com a pendents (mai inventades).
- **Denominador (parc catastral)**: DNP/INE inaccessibles des de l'entorn de treball
  → conector preparat, descàrrega pendent de verificació.
- **Contraste censal VERIFICAT**: Idescat Taules v2 `censph/310/20419` (Cens 2021,
  viviendas principals per règim de tinença): 615 municipis + Catalunya, códigos MUN
  idénticos a `Municipality.code` (615/615 match). Contraste con cifras publicadas OK
  (Manresa 8.793/31.029; Barcelona 208.467/671.178; Cataluña 692.285).
- **Flujo anual VERIFICAT**: SODA `qww9-bvhh` (periode `gener-desembre`, nivell
  municipi) → 15.297 obs 2007-2025 amb 0 skipped (fallback `ineCode` documentat:
  255 municipis del seed sense `ineCode`; el codi censal 6 dígits sempre comença
  pel codi INE de 5).

### Modelo de datos y lógica
- **Migración `20261115140000_rental_share` (aditiva)**: tabla `RentalShareObservation`
  — histórico del cálculo con `referenceKey` (`C:2021` | `N:período|D:año`),
  componentes, fuentes, `methodologyVersion`, `dataStatus` (9 estados), `warnings`
  JSON y `runId`; clave única `(municipalityCode, referenceKey)`; una publicación
  nueva crea fila nueva (histórico nunca sobrescrito).
- **Componentes en `StatObservation`** (tabla general existente, encargo §4) con 5
  `DataSource` nuevos (cens censal, flux trimestral, vigents PENDIENTE, parc
  PENDIENTE, calc derivado) — visibles en `/api/provenance`.
- **Calculadora `computeRentalShare`** (pura): 13 validaciones obligatorias del
  encargo §5 — sin cálculo si falta componente, denominador 0, negativos o
  municipios distintos; % > 100 → revisión sin publicación; desfase temporal →
  `TIMING_MISMATCH` visible; componentes ausentes nunca se sustituyen por ceros.
- **Conector admin `POST /api/admin/import-rental-share`** (dryRun + validación
  estricta + ImportRun + AuditLog) para alimentar numerador/denominador cuando
  existan datos oficiales.

### API, automatización y UI
- **API pública** `GET /api/rental-share?muni=:code` (detalle + historial + serie
  de flujo + metodología, cache 1 h) y `GET /api/rental-share/ranking`
  (ordenación censal/estimada para identificar los municipios con más peso del
  alquiler). Dispatcher regenerado: 89 rutas.
- **Cron mensual** `/api/cron/rental-share` (día 5, 20:00 UTC, presupuesto 40 s):
  cens + flux + recálculo de los 947 municipios, idempotente.
- **UI (ca/es)**: sección SSR «Parc d'habitatges i mercat del lloguer» en la ficha
  `/lloguer/[slug]` (bloque estimado o «sense informació suficient» + referencia
  censal oficial con Cataluña + tabla de flujo etiquetada + fuentes), panel cliente
  `RentalSharePanel` en el mapa, chips en el comparador (cens/estimat/flux) y
  apartado de metodología en `#/metodologia` con el texto del encargo.
- **Tests**: `tests/rental_share.test.ts` (26 tests con fixtures reales) añadidos a
  la suite bloqueante de CI (89 → 115). E2E local completo (migración + seed 947 +
  ingesta viva + recálculo + consultas: 6,9 s) y piloto Manresa con código
  independiente contrastando las fuentes originales en vivo.

## v40 — Bloc «Serveis i qualitat de l'entorn» (Fase A, 1a integració) — 2026-11-15

Encàrrec: «auditoría, integración y ampliación de datos públicos». Fase 1-2 (auditoria
+ catàleg verificat) a v39.1; aquí la primera integració FUNCIONAL mantenint intactes
totes les funcionalitats existents (migració aditiva, 0 taules alterades).

### v40.1 — Ingesta + API + UI de l'entorn de l'edifici
- **3 TAULES NOVES (migració `20261115120000_entorn_geo`, aditiva)**: `GeoPoint`
  (punts oficials: category+kind+props, índexs category/municipalityCode i
  lat/lng), `GeoPolygon` (polígons oficials simplificats, per fases futures) i
  `BuildingAssociation` (associacions precalculades edifici↔entorn amb MÈTODE
  d'associació al costat del resultat: REFCAT/RADIUS_x/MUNI/INTERSECT).
- **FONT ESTRELLA — ICAEN certificats d'eficiència energètica per EDIFICI**
  (dataset `j6ii-t3w2`, 1,34 M registres): lookup ON-DEMAND per referència
  catastral quan s'obre la fitxa, cachejat 30 dies a BuildingAssociation
  (mateix patró que ICGC/Catastro). Qualificacions consum/emissions, kWh/m²,
  kgCO₂/m², ús i motiu. Verificat amb refcat real (consum A / emissions A).
- **4 FONTS PUNTUALS SODA** (portal Generalitat, llicència oberta d'ús
  d'informació — Catalunya): estacions de recàrrega EV (tb2m-m33b, 2.353),
  establiments sanitaris autoritzats (nrmq-ytje, 5.680, inclou farmàcies),
  directori de centres docents (kvmv-ahh4, 38.108, per lots de 60 municipis) i
  Equipaments de Catalunya amb filtre Cultura/Esports (8gmd-gz7i, 1.025 files
  només BCN). Cada fila amb coordenades vàlides; les invàlides es descarten
  (mai s'inventen). Traçabilitat completa: DataSource + ImportRun + AuditLog.
- **CRON `/api/cron/entorn`** (diari 06:15 UTC, `vercel.json`): bucle multi-pas
  amb pressupost de 40 s sobre el límit de 60 s de Vercel; substitució
  idempotent per lot; si una font cau no esborra res i reintent l'endemà;
  finestra de frescor de 60 dies.
- **API `GET /api/entorn/:id`** (pública, registrada al dispatcher):
  certificats per refcat + punts propers (bbox 2000 m + haversine), grups per
  tipologia amb els més propers i COMPTES per els radios del encàrrec
  (300/500/1000/2000 m). Rate limit 30/min per IP; Cache-Control 1 h +
  stale-while-revalidate 24 h (patrò demografia). Erreus tipificats
  (BUILDING_NOT_FOUND / ENTORNT_ERROR) i degradació per bloc.
- **UI — bloc «Serveis i qualitat de l'entorn»** a la fitxa d'edifici
  (`EntornPanel.tsx` sota el bloc demogràfic): selector de radios
  300/500/1000/2000 m, eficiència amb xips de qualificació A-G, mobilitat
  (parades + recàrrega) i serveis per tipologia, «Sense informació disponible»
  explícit quan no hi ha dada, distàncies SEMPRE etiquetades com a línia recta,
  fonts+llicència al peu (ca/es).
- **Fiabilitat de la ingesta**: SoQL comprovat contra els datasets reals
  (descoberts i corregits: columna municipal sense zero inicial a 8gmd/tb2m,
  `starts_with`+`IN`, `$order=:id`); mapa dual de codis municipals
  (ineCode/censal/sense zero) per resoldre el lligam amb Municipality.
- **TESTS**: `tests/entorn.test.ts` (16, fixtures REALS a
  `tests/fixtures/entorn/`) → suite bloqueant **89 → 105 tests**, 0 fail;
  typecheck net; eslint 0 nous; `npm audit` 0 vulnerabilitats; build OK.
  Pendent: afegir el fitxer a la línia bloqueant de ci.yml (edició web del
  propietari).
- **Docs del encàrrec completats**: docs/REGISTRO_INTEGRACIONES.md (5
  integracions reals amb estat), docs/LIMITACIONES_DATOS.md,
  docs/TESTS_Y_VALIDACION.md, catàleg + pla actualitzats amb els resultats del
  sprint G0 (17 verificaciones: MUC/WFS confirmat, MUCS inexistent, TMB
  gratuita amb registre, BCN/FGC/Renfe CC BY 4.0, SETELECO `_DEF.xlsx` 9
  fulles, Catastro ATOM per municipi, PRTR mogut a miteco, XVPCA amb
  coordenades…).
- **Pendent Fase A**: A1 conectivitat (XLSX amb guardes), A2 transporte
  (FGC/Renfe/t-mobilitat), A4 zonas verdes (BCN), A5 inundabilidad
  (SNCZI/ACA), capas de mapa activables i capítulo PDF.

### v39.1 — Documentació del projecte d'ampliació de dades públiques (Fases 1-2, sense canvis de codi)
- **docs/AUDITORIA_PREUREAL.md**: auditoria funcional/tècnica/dades del projecte al
  commit `a5b93e7` (v39): inventari de 84 rutes API + 24 models Prisma, mapa Leaflet
  amb tiles ICGC, fonts actuals (Incasòl, ICGC, Catastro, INE, Idescat), restriccions
  físiques (1 serverless function, maxDuration 60 s, sense PostGIS, CSP
  `connect-src 'self'`), components reutilitzables (patró v39
  DataSource/StatObservation/ImportRun/cron d'un pas), problemes detectats i 8 riscos
  d'integració amb mitigacions.
- **docs/CATALOGO_FUENTES_DATOS.md**: inventari verificat en línia de ~30 fonts
  públiques (cada fitxa indica quina URL s'ha obert de debò; «NOT VERIFIED» on no
  s'ha pogut). Classes de viabilitat A-D. Hallazgos clau: ICAEN certificats
  d'eficiència energètica **per edifici amb referència catastral** (SODA `j6ii-t3w2`),
  equipaments sanitaris/docents amb coordenades (A), XVPCA (A), tarifes d'aigua ACA
  per municipi en XLSX directe (A), GTFS integrat ATM/CGIM amb llicència verificada
  (B), zones inundables T10/T100/T500 (ACA/SNCZI, B), ruido BCN GPKG CC BY 4.0 (A),
  aparcament públic català sense font centralitzada (D). 10 pendents de verificació
  per al sprint G0.
- **docs/ARQUITECTURA_DATOS.md**: model de dades no destructiu (0 taules alterades;
  3 taules noves: GeoPoint, GeoPolygon, BuildingAssociation), 6 mètodes d'associació
  geogràfica amb implementació, traçabilitat per dada, cadències d'ingesta per font,
  APIs de servei noves registrables al dispatcher i mesures de rendiment/seguretat.
- **docs/PLAN_IMPLEMENTACION.md**: pla per fases (G0 verificació → Fase A → B → C)
  amb ajustos justificats per l'auditoria (energia ICAEN adelantada com a quick win;
  zones verdes condicionades a G0; aparcament reduït), estimacions S/M/L, criteris
  d'acceptació i ordre d'execució proposat.

## v38 — Transparència pública, design system, dark mode i CI — 2026-11-12

Encàrrec: «revisa todos estos puntos e implementa las mejoras» (transparència
de contingut, UX/UI i arquitectura/calitat). Tres commits: v38.1 contingut,
v38.2 UX, v38.3 infra.

### v38.1 — Transparència i contingut públic
- **RUTES REALS sense 404**: /preus, /mapa, /comparador, /guia, /faq,
  /metodologia, /estat, /usos, /avis-legal, /privacitat, /cookies, /entrada,
  /registre, /design — 14 pàgines pont (`HashBridge`) que redirigeixen a
  l'equivalent hash sense afegir historial (anar a www.preureal.com/preus ja
  NO dóna 404).
- **Pàgina Fonts i metodologia** (`#/metodologia`): consumeix l'API pública
  `/api/provenance` (que existia des de Fase 9 però cap UI la mostrava):
  10 datasets amb font/llicència/unitat/àmbit/periodicitat/metodologia,
  badge de qualitat, principis, cicle d'actualització i 7 LIMITACIONS
  conegudes explicades; últimes importacions INE amb data real.
- **Pàgina d'estat del servei** (`#/estat`): sondes en directe contra
  `/api/health` (BD+latència, ICGC, Cadastre, Stripe, correu, Google),
  actualització de dades (municipis amb dada + última importació INE),
  historial d'incidències (l'incident real del PDF/WinAnsi) i auto-refresc
  cada 60 s. Sense dades inventades ni uptime % fictici.
- **Casos d'ús** (`#/usos`): 3 perfils (inquilí, agent, periodista) amb
  captures REALS de producció (`public/usos/*.jpg`, capturades amb navegador
  real); explícitament sense testimonis inventats.
- **Consentiment de cookies GRANULAR**: categories tècniques/analítica/
  màrqueting amb interruptors, panell «Configura», «Només les necessàries»,
  recordatori des del peu («Gestiona les cookies», event
  `pr:open-cookie-settings`) i API exportable `getConsent()`. Compatibilitat
  amb el banner antic (accepted/rejected).
- **Legals LSSI/RGPD completats** sense inventar dades: titular i responsable
  amb contacte real (admin@preureal.cat) i proveïdors (Vercel, BD, Stripe,
  Resend); política de cookies reescrita amb les categories del nou banner.
- **Domini canònic**: `src/middleware.ts` amb 301 de preureal.com (apex) i
  preureal.cat → www.preureal.com; previews Vercel/localhost intactes
  (WebAuthn en depèn).
- **robots.ts dinàmic** (substitueix public/robots.txt amb URL hardcodejada).
- Footer de 4 columnes (Producte / Recursos i transparència / Legal) amb
  /preus, /faq, metodologia, estat i usos.
- Marca unificada: comentaris i headers de codi «PreuReal.cat» → «Preureal»
  (18 fitxers); el correu admin@preureal.cat es manté (és real).

### v38.2 — UX/UI
- **DARK MODE REAL**: 52 colors hardcodejats → tokens CSS amb valor clar i
  fosc (1.258 substitucions en 24 fitxers). Nova paleta fosca de marca
  (verd-pinya profund, accent ember intacte). Toggle al header
  (`ThemeToggle`), anti-FOUC a layout.tsx i `prefers-color-scheme` per
  defecte. Leaflet, popups i scrollbars adaptats al fosc.
- **Pàgina de design system** (`#/design`): paleta amb ús de cada token,
  escala tipogràfica, escala d'espaiat i galeria de components (botons,
  badges, input, skeleton, targeta elevable).
- **Skeletons** al panell del mapa (shimmer CSS `.pr-skeleton`) en lloc de
  spinner: es veu l'estructura que arribarà.
- **Bottom sheet mòbil amb gestos**: nansa sticky amb swipe cap avall per
  tancar (>80 px), fons fosc tappable i animació d'entrada
  (`pr-sheet-anim`/`pr-backdrop-anim`).
- **Checklist d'onboarding persistent** (`FirstRunChecklist`): explora el
  mapa → compara 2 municipis → descarrega un informe PDF; tracking a
  localStorage (`lib/steps.ts` + event `pr:steps-changed`), completat per
  visites reals (MapView, ComparadorView, descàrrega PDF).
- **Microinteraccions**: transició d'entrada de vista (`pr-view`), targetes
  elevables (`pr-lift`), transicions de tema suaus.
- **Performance**: CSS de Leaflet fora del bundle JS (ara via `@import` de
  Tailwind); `bg-white` → `bg-card` perquè les targetes siguin temàtiques.

### v38.3 — Arquitectura i qualitat
- **Anti-drift del dispatcher**: `check_repo.mjs §6` falla el build si una
  ruta `_impl` no està a la TABLE del dispatcher (abans: 404 silenciosos).
- **CI (GitHub Actions)**: pipeline completo en `docs/ci-workflow.yml` (lint +
  typecheck + guardia de repo/drift + tests bun bloquejants + audit prod +
  build amb DATABASE_URL fictici). No s'ha pogut commitejar a
  `.github/workflows/` perquè el token actual no té scope `workflow` (regla:
  no canviar-lo); activar-lo és copiar 1 fitxer (instruccions al README).
  Mentrestant el check anti-drift ja bloqueja cada deploy de Vercel via build.
  Scripts nous: `test`, `test:e2e`, `typecheck`, `audit`.
- **Observabilitat**: `lib/observability.ts` — request-ID (capçalera
  X-Request-ID), access log JSON per petició i captura d'errors a Sentry via
  Envelope API SENSE SDK (només cal `SENTRY_DSN`; sense ell, no canvia res).
- **CSP completa en producció** (default-src 'self', frame-src Stripe,
  object-src 'none', upgrade-insecure-requests) + X-Frame-Options; en dev es
  manté la mínima per HMR.
- **Playwright E2E** (`tests/e2e-ui/flows.spec.ts`): landing→preus, mapa
  Leaflet amb cerca, ponts de ruta, metodologia/estat, legal des del peu,
  fitxa SEO de Barcelona i validació de registre; projectes desktop+mòbil.
- **Backups**: `scripts/backup_pg.sh` (dump comprimit, retenció 30 dies,
  verificació de mida, comanda de restore provada) + documentació a README.
- **Deps**: `@types/qrcode` a devDependencies; prisma/@prisma/client fixats a
  6.11.1 (fuera del rango vulnerable de deepmerge-ts via @prisma/config —
  `npm audit --omit=dev` ara net, 0 vulnerabilitats).

Operativa post-deploy: cap migració (cap canvi d'esquema). Opcional: definir
`SENTRY_DSN` a Vercel per activar l'enviament d'errors a Sentry.

### v38.4 — Guia: acordió «Informació bàsica de l'habitatge»
- Nou acordió a `#/guia` just després de «Fonts oficials» (sol·licitud
  explícita): 8 blocs desplegables amb les preguntes que qualsevol persona que
  vol llogar es fa (dades essencials, fotos i estat real, ubicació i entorn,
  preu i despeses, condicions del contracte, eficiència i confort,
  característiques especials, seguretat i confiança).
- Cada punt FORMULAT + RESPOSTA ACOTADA verificada amb fonts oficials: fiança
  1 mes + màx. 2 de garanties (art. 36 LAU), durada i pròrrogues 10/11 anys i
  +3 en zona tensada (art. 9-10 LAU), sortida anticipada (art. 11),
  comunitat/IBI al propietari (art. 20), reparacions (art. 21), honoraris
  d'agència (Llei 13/2023 + art. 20 LAU), CEE obligatori 10 anys (ICAEN),
  Índex de Referencia de Arrendamiento de l'INE (2,54 % interanual set-2026),
  empadronament com a dret, nul·litat de les prohibicions absolutes de
  mascotes (jurisprudència majoritària) i «total per entrar» ≤ 4 mensualitats.
- Enllaç amb el producte: referència de preu al mapa (gratuït), marca de zona
  tensada i calculadora de fiança de la pròpia guia. Bilingüe ca/es i només
  tokens de disseny (compatible amb dark mode v38.2). Fitxer de contingut
  nou: `src/components/views/guia-vivienda.ts`; la vista només afegeix
  l'acordió (estat `openBlock`, chevron, `aria-expanded`).
- Sense migració ni canvis d'API.

### v38.5 — Guia: acordeons «Drets i deures en un contracte de lloguer» i «Desnonaments»
- Dos acordeons nous a `#/guia`, col·locats entre «Fonts oficials» i
  «Informació bàsica de l'habitatge» (encàrrec explícit, contenidors
  legals DAMUNT de l'acordió v38.4):
  1. **Drets i deures en un contracte de lloguer**: introducció orientada a
     l'habitatge habitual (LAU + normativa catalana) + 4 desplegables amb el
     patró v38.4 (badge numerat, chevron, `aria-expanded`): «Drets de les
     persones llogateres», «Deures de les persones llogateres», «Drets de les
     persones propietàries» i «Deures de les persones propietàries», amb
     nota «Informació legal important» (garanties mínimes irrenunciables) i
     fonts oficials (Gencat drets i obligacions, Gencat contracte, BOE LAU).
  2. **Desnonaments: drets i protecció de les persones llogateres**: qui pot
     tenir protecció (vulnerabilitat econòmica, menors, monoparentals,
     discapacitat/dependència, +65, violència de gènere, sense alternativa),
     quan es pot suspendre (inclosa la mesura de 2 mesos per impagament amb
     alternativa o pagament del deute per part de l'Administració), quan es
     pot desnonar legalment, que la propietat NO pot fer mai (canvi de pany,
     tall de subministraments) i els 4 passos davant d'una notificació
     judicial; amb enllaç a Gencat «Estic en risc de perdre l'habitatge on
     visc».
- Contingut nou a `src/components/views/guia-drets.ts` (GUIA_DRETS +
  GUIA_DESNONAMENT, bilingüe ca/es, blocs tipats p|ul|ol per als
  desnonaments); la vista només afegeix els dos Cards (icones Scale i Gavel,
  mateixos tokens de disseny i dark mode v38.2).
- Sense migració ni canvis d'API.

### v38.6 — «Estàs pagant de més?»: m² amb efecte real + informes de la comunitat visibles
Encàrrec: «la introducció dels m2 no afecta al preu… "Informe el preu que
t'ofereixen" tampoc veig quina funció té si ho ha de validar l'administrador».

- **Els m² ara ajusten la comparació** (mateix model que la valoració v2,
  constants documentades VAL_REF_M2=85 / VAL_BETA_SUPERFICIE=0,8 de
  `territorial.ts`): renda(m²) = base × (m²/85)^0,8 sobre l'habitatge típic.
  Amb superfície, el TITULAR és el delta ajustat («+X% per sobre del típic
  per a aquesta superfície (≈Y €/mes)»), amb la mitjana municipal (≈85 m²) i
  l'€/m²·mes de l'oferta com a secundàries; sense renda però amb m² es mostra
  «Renda típica estimada per a aquesta superfície»; nota de transparència amb
  la fórmula i passarel·la a «Valoració orientativa» (Premium). La base
  també accepta ref. de comarca (255 municipis sense sèrie), i per a naus no
  s'aplica el model d'habitatges.
- **Veredicte accionable**: desviació > +15% → consell de negociació (+ màxim
  legal IRL i nul·litat de l'excés si el municipi ÉS zona tensada);
  < −15% → avís de comprovar per què és tan barat (mai pagaments abans de
  veure i signar).
- **Els informes ciutadans ara serveixen per a alguna cosa**: nou endpoint
  PÚBLIC i anònim `GET /api/reports/summary?mun=CODE` (dispatcher 76 rutes):
  mediana d'ofertes + n dels últims 12 mesos (HABITATGE, no REJECTED),
  PRIVACITAT n >= 3 per evitar reidentificació, sense edificis ni notes ni
  res personal. La fitxa mostra «Ofertes de la comunitat (12 mesos): n
  informes anònims · mediana ≈X €/mes · no verificat» (o invés a
  contribuir si encara n'hi ha pocs) i es refresca just després d'enviar el
  propi informe.
- **Formulari d'informe honest**: botó «Comparteix el preu que t'han ofert
  (anònim)» amb nota clara (es publica agregat, sense verificar, ningú no
  valida el preu, sense dades personals); eliminat el camp de renda
  DUPLICAT del formulari (usa el camp principal); validació client amb
  missatge propi.
- **Tests**: arreglats els 2 tests de computeValuation que estaven desfasats
  de la v2 (esperaven central sense ajustos hedònics): ara asserten el model
  v2 documentat (superfície β=0,8, OBRA_NOVA ×1,12, densitat clampada ±5%).
  tests/funcionalitats.test.ts torna a 20/20 (total 83 pass, 0 fail) i el
  `continue-on-error` del CI torna a ser innecessari.
- Sense migració; una ruta pública nova de només lectura.

### v38.7 — Comparador: ofertes de la comunitat per municipi
Pas natural de v38.6: la mediana comunitària ara també al comparador.
- **Refactor**: la lògica d'agregació viu a `src/lib/reports-summary.ts`
  (getCommunitySummary: 12 mesos, HABITATGE, no REJECTED, medianes només
  n >= 3); `GET /api/reports/summary` queda com a wrapper fi — mateix
  comportament garantit a les dues rutes per construcció.
- **POST /api/comparator**: cada resultat MUNI porta `community: { n, median,
  medianEurM2 }` (null per a BUILDING: la comunitat no pot identificar
  edificis concrets de manera fiable). Màxim 6 consultes indexades extra.
- **UI** (`ComparadorView`): xip a cada tarjeta de municipi — «comunitat:
  ≈X €/mes · n informes · no verificat» — i nota de peu ampliada explicant
  la font (preus enviats des de la fitxa del mapa) i el llindar de privadesa
  (mínim 3 informes). Bilingüe inline com la resta de la vista.
- Sense migració ni canvis de contracte trencadors (camp afegit).

### v39 — Capa «Contexte demogràfic i territorial» (IDESCAT) — 2026-11-14

Encàrrec: ampliar PreuReal amb una capa de dades demogràfiques i territorials
oficials per als 947 municipis, integrada a les fitxes, als informes PDF i al
comparador, sense alterar el càlcul del mercat de lloguer ni inventar dades.

**Fonts integrades (totes oficials, verificades amb peticions reals):**
- IDESCAT API Taules v2 (`api.idescat.cat/taules/v2`): pmh/446/477 (població
  per sexe, sèries 1998-2025), pmh/9548/10494 (edats quinquennals 2000-2022),
  pmh/680/690 (nacionalitat), censph/7952/8018 (llars per cens 1991-2021),
  censph/17317/20806 (indicadors de llars del cens 2021).
- IDESCAT «El municipi en xifres» (emex): superfície, densitat oficial i grans
  grups d'edat vigents amb tripletta [municipi, comarca, Catalunya]; seed local
  `idescat_superficie_seed.json` amb els 947 municipis descarregats de l'API.
- Llicència: Llicència Oberta d'Ús d'Informació — Catalunya (citació de font).
- Els codis MUN de l'API són els mateixos codis censals de 6 dígits que
  `Municipality.code`: correspondència exacta dels 947 municipis, sense
  matching per nom.

**Noves variables a StatObservation** (mateix model genèric Fase 2, cap
migració): POB_TOTAL/POB_HOMES/POB_DONES, POB_EDAT_0_14/15_64/65_84/85_MES,
POB_NAC_ESPANYOLA/POB_NAC_TOTAL (estrangera = total - espanyola, derivació
documentada), LLARS_TOTAL (censos), LLARS_MIDA_MITJANA, LLARS_G1..G5_PCT,
LLARS_1P_65_PCT, POB_75_ALONE_PCT, TERRITORI_SUPERFICIE_KM2,
TERRITORI_DENSITAT_HAB_KM2 — amb nivells MUNI + COM + CAT per comparar.

**Integració:**
- `src/lib/idescat-parse.ts` (PUR): parser JSON-stat 2.0 (ordre C verificat),
  parser emex (variants A/B reals), agregació tot-o-res de grans grups.
- `src/lib/idescat-import.ts`: importadors idempotents amb finestra de
  substitució, lots anti-límit de 20.000 cel·les, DataSource + ImportRun +
  AuditLog; seed local per cobertura immediata dels 947 municipis.
- `GET /api/cron/demografia` (noves crons Vercel diàries): un pas per
  execució (POB → EDAT → NAC → CENS_LLARS → lots EMEX), auth CRON_SECRET,
  finestra de frescor de 6 mesos per font.
- `POST /api/admin/import-demografia`: importació manual del propietari.
- `GET /api/demografia/muni/:code` (nou, públic): bloc demogràfic complet amb
  sèries, variacions 5/10 anys, tendència, comarca i Catalunya, fonts per bloc.
- Ficha municipal: component `DemografiaPanel` (KPI, gràfic de línia de
  població, barres per edats, llars per grandària, extrangera, lectura
  automàtica sense causalitat, «no disponible» quan no hi ha dada).
- Informe municipal PDF: NOU capítol P5 «Contexte demogràfic i territorial»
  amb gràfic de línia VECTORIAL de població, barres d'edats, llars, extrangera
  i comparativa comarcal/Catalunya → l'informe passa de 8 a 9 pàgines
  (REPORT_PAGES=9; portada, índex i metodologia actualitzats).
- Comparativa PDF (7,99 €): nova taula demogràfica per municipi.
- Comparador: chips demogràfics (població, 65+, llars, densitat) al resultat.
- Provenance: 2 datasets nous declarats (idescat_pmh_demografia, idescat_emex).

**Tests:** 8 nous a unit.test.ts (parser JSON-stat i emex amb FIXTURES REALS
de l'API descarregades el 2026-11-14; agregació tot-o-res) + capítol PDF
testat (text, fonts i degradació). Blocking suite: 85 tests.

### v38.10 — Fix success_url de Stripe quan NEXT_PUBLIC_SITE_URL no porta esquema
Bug REAL de producció (2026-11-14): el checkout d'informes retornava 502
STRIPE_ERROR amb `url_invalid` al param `success_url` («An explicit scheme
(such as https) must be provided»): NEXT_PUBLIC_SITE_URL era «www.preureal.com»
sense `https://` i els 3 endpoints de Stripe l'usaven en cru.
- **Fix**: els 3 endpoints (`reports/shop/checkout`, `stripe/checkout`,
  `stripe/portal`) usen ara `getSiteUrlOrigin()` (el helper segur de
  `site-url.ts`, que perdona l'esquema mancant i el fallback canònic) quan la
  env està definida; sense env es manté l'origen de la petició (dev/localhost).
- **reports-fulfill.ts** `purchaseDownloadUrl()` també passa pel helper
  (l'enllaç de descàrrega viatja per correu: mateix risc d'URL rota).
- **Acció del propietari a Vercel**: corregir el valor de
  `NEXT_PUBLIC_SITE_URL` a `https://www.preureal.com` i fer Redeploy (a més,
  el codi ja no depèn que el valor sigui perfecte).

### v38.9 — Hardening del mock de security al pas bloquejant del CI
Preparació per afegir `tests/reports_shop.test.ts` a la llista bloquejant
(edit al workflow via GitHub, el token no té scope `workflow`):
- **tests/audit_v23.test.ts**: el `mock.module("@/lib/security")` era PARCIAL
  (faltaven `escapeHtml` i `htmlToText`). Amb bun 1.3.14 el re-vinculat
  retroactiu d'imports ja avaluats explotava amb SyntaxError «Export named
  'htmlToText' not found» i TRUNCAVA el run de tests; amb el bun de CI passava
  per sort. Ara el mock és COMPLET: stubs originals + còpies fidels de les 2
  funcions PURES (sense import real: `security.ts` importa `@/lib/db`, i el
  client Prisma no es genera al pas de tests del CI). Cap canvi de codi de
  producció; cap test nou.
- Detectat i corregit sense tocar el workflow (`.github/workflows/ci.yml`).

### v38.8 — Informes individuals de pagament únic (Stripe mode «payment»)
Encàrrec: «dentro de "Preus" habría que añadir la opció de obtener 3 tipos de
informe diferentes... un solo pago, sin suscripción» (model Tinsa/Evaluo a
preus propis). 3 productes nous, cap subscripció, cap canvi als plans:
- **Catàleg** (preus PROPOSTOS, retocables amb env REPORT_PRICE_*_CENTS sense
  desplegar; cost de generació / llicències de redistribució de dades i IVA
  pendents de verificar pel propietari): Informe municipal PDF 4,99 € (el
  mateix document professional de 8 pàgines del pla Premium, reutilitzat via
  src/lib/report-data.ts — reunió de dades compartida amb /api/reports/pdf),
  Valoració d'habitatge 6,99 € (motor v2 computeValuation, PDF nou de 4
  pàgines bilingüe: base oficial, ajustos visibles, horquilla, habitabilitat
  Decret 141/2012, confiança) i Comparativa de municipis 7,99 € (2-6
  municipis, PDF nou ~4 pàgines: taula, gràfic de barres, fitxa per municipi,
  €/m² DERIVAT ÷ 85 m² amb nota explícita).
- **Flux** (mateix patró que les subscripcions): POST /api/reports/shop/checkout
  (auth + correu verificat + rate limit + validació PURA a reports-shop.ts +
  VIABILITAT ABANS DE COBRAR: una valoració sense base oficial mai es cobra —
  422 NO_DATA) → Stripe Checkout mode "payment" amb price_data inline i
  metadata {userId, purchaseId, kind} → confirmació SEMPRE via webhook signat
  (nova rama checkout.session.completed mode payment + payment_intent.succeeded
  per a pagaments asíncrons SEPA) → ReportPurchase.status paid + token de
  descàrrega (256 bits, a la BD NOMÉS el SHA-256) → correu Resend amb
  l'enllaç (idempotent report-ready:<purchaseId>).
- **Entrega doble via**: GET /api/reports/shop/download?p=<id>&t=<token> amb
  token del correu (sense login) O sessió de l'usuari propietari (pantalla de
  retorn /#/informes/exit via POST /api/reports/shop/return, fallback
  idempotent del webhook). El PDF es REGENERA sempre des dels paràmetres
  SNAPSHOT de la compra (el que es paga es regenera igual encara que les dades
  o els preus canvïin després). DE MO no descàrrega sense pagar (409) ni sense
  token/sessió (403).
- **Model nou** ReportPurchase (migració 20261112180000_report_purchase; sense
  cap canvi a taules existents) + pantalla ReportResultView + secció
  «Informes individuals» a la pàgina de preus (3 tarjetes amb formulari
  inline, cercador de municipis amb debounce, preus de /api/reports/shop/
  catalog — mai durs al client). Bilingüe ca/es; l'idioma del PDF es decideix
  a la compra (user.locale) i es guarda als params.
- **Tests** nous (tests/reports_shop.test.ts, 15): validació de params, preus,
  noms de fitxer, tokens, builders PDF (vàlids en ca i es, degradació sense
  dada). Mock de reportReadyMail afegit a audit_v23 (el webhook ara l'usa via
  reports-fulfill). NOTA per al propietari: afegir tests/reports_shop.test.ts
  a la llista bloquejant del workflow CI (sense scope workflow al token).

## v37.1 — Passkeys (WebAuthn) + hub SEO /lloguer + tests TOTP — 2026-11-12

**Passkeys completes** (@simplewebauthn v14, dependència nova):
- Taula `PasskeyCredential` (migració aditiva `20261112150000_passkeys`):
  credential ID com a PK, publicKey base64url, comptador anti-clonatge,
  transports, deviceType/backedUp, etiqueta amigable del dispositiu.
- RP ID/origin derivats del Host REAL de la petició amb allowlist
  (`lib/webauthn.ts`): les passkeys funcionen a preureal.vercel.app i a
  www.preureal.com (ligades a cada domini per disseny de WebAuthn).
- CHALLENGE en cookie httpOnly de 5 min (stateless en serverless).
- API: `auth/passkeys` (GET llista), `register-options`, `register`,
  `auth-options` (anti-enumeració: emails desconeguts reben opcions igualment),
  `auth-verify` (comptador només pot avançar; si no, credencial eliminada),
  `delete` (exigeix CONTRASENYA, com la baixa del 2FA).
- UI: Panell → Seguretat «Claus d'accés» (llista + afegir + eliminar amb
  contrasenya) i botó «Entra amb una passkey» a l'entrada (només navegadors
  amb WebAuthn). Sessió de 30 dies idèntica al login normal.
- NOTA OPERATIVA: requereix prova manual amb un dispositiu real (huella/cara/
  PIN no és testejable des del sandbox). Registrar i entrar amb 1 passkey abans
  de comunicar-ho.

**Hub SEO**: pàgina pública `/lloguer` amb els 947 municipis per província
(amb preu vigent i marcador d'àrea tensada) + enllaç al peu; `slug` al
response de `/api/lookup` i enllaç «Pàgina pública del municipi» a la fitxa;
`/lloguer` afegida al sitemap.

**Tests TOTP (7/7)** amb els vectors OFICIALS del RFC 6238 (T=59s→287082,
T=1111111109s→081804) + finestra ±1 pas + AES-GCM roundtrip. El test va
destapar i corregir un rang negatiu del comptador amb finestra ±1.

## v37 — Paquet «premium»: compte, 2FA, retenció, exports, alertes i SEO — 2026-11-12

Encàrrec: «funcions que falten (prioritzades)». Fet per passos, una migració
ADITIVA (`20261112100000_premium_retencion_2fa_alertas_seo`) i commits separats.

**1. Gestió de compte completa** (la base ja existia: canvi de contrasenya,
factures Stripe, portal, cancel·lació, export RGPD). Nou:
- **Retenció abans de cancel·lar**: modal amb alternatives reals (baixar a
  Premium amb l'estalvi real, portal de pagament, revisar plans) + motiu
  opcional (whitelist) i feedback lliure (≤500 chars) → `Subscription.cancelReason`.
- **PDF directe de cada factura** (`invoice_pdf`) a Facturació.
- `POST /api/subscription/cancel` accepta `{reason, feedback}` (compat: body buit = igual que abans).

**2. 2FA TOTP complet** (passkeys: pas posterior, necessita designdecisió separada):
- `src/lib/totp.ts` — RFC 6238 SENSE dependències (node:crypto), secret
  base32 de 160 bits, finestra ±1 pas, comparació en temps constant, secret
  CIFRAT a la BD (AES-256-GCM amb clau SHA-256 d'AUTH_SECRET), 10 codis de
  recuperació d'un sol ús (bcrypt). Dep `qrcode` (client, QR data-URL).
- API: `auth/2fa/setup|enable|disable|recovery|verify` + CHALLENGE JWT de 5 min
  (`createTotpChallenge`) — contrasenya correcta MAI crea sessió si hi ha 2FA.
  Baixa i regeneració de codis exigeixen CONTRASENYA (mai només el telèfon).
- UI: pantalla de 2n pas a l'entrada (6 dígits o codi de recuperació) i secció
  completa a Panell → Seguretat (QR, alta manual, codis mostrats UNA vegada).
- Nota: l'entrada amb Google OAuth no passa pel 2FA (el factor el gestiona Google).

**3. Exportacions**: `POST /api/comparator/export` (pla Pro, mateixa política
que export/[code]): una fila per entitat i any, valors vigents + sèrie
completa, anti-CSV-injection. Botó «Exporta CSV» al comparador.

**4. Alertes de preu** (per favorit):
- `Favorite.alertPct` (null = sense alerta; 1-50 = %) + `lastNotifiedValue`
  (LÍNIA BASE: el % es mesura sempre des de l'últim avís — un canvi gradual
  s'acumula fins travessar el llindar) + `tenseNoticed`.
- `PATCH /api/favorites {entityKey, alertPct}` + selector ±3/5/10/15% a Panell → Preferits.
- Cron diari (secció 0.5 de /api/cron/emails): detecta canvis ≥ llindar i
  àrees tensades NOVES; agrupa tots els canvis d'un usuari en UN correu
  (`priceAlertMail`, tipus ALERT, reintentable); idempotència doble:
  `PriceAlertLog` únic per usuari+entitat+tipus+període i
  idempotencyKey `price-alerts:{user}:{dia}`. La primera passada només fixa la línia base (mai avís).
- Noves taules: `PriceAlertLog`; camps nous a User (totp), Favorite, Subscription, Municipality.

**5. Onboarding + estats buits**: tour de 3 passos a la 1a visita del mapa
(localStorage `pr_onboarded`) amb «Prova amb Barcelona» (acció real,
`/mapa?mun=080193`); estat buit del comparador amb 6 exemples d'un clic;
el buit d'històric ja estava cobert (fix 2026-11-11) i el PDF té degradació.

**6. SEO tècnic**: pàgines públiques `src/app/lloguer/[slug]/page.tsx`
(ISR 24 h, server component sense JS de client): H1 amb el preu vigent,
sèrie històrica completa, badge d'àrea tensada, JSON-LD (Place + Offer +
Dataset), canonical + hreflang ca/es i meta descriptions generades.
`src/app/sitemap.ts` dinàmic (substitueix public/sitemap.xml — ESBORRAT el
estàtic; només llista slugs EXISTENTS, mai URLs que donarien 404; ISR 24 h).
Slugs: `src/lib/slug.ts` + `POST /api/admin/backfill-slugs` (UNA sentència
UPDATE…FROM jsonb_to_recordset, patró del seed; idempotent) + botó a l'admin
«Genera els slugs municipals».

**Operativa després del desplegament:** executar a #/admin → «Genera els slugs
municipals» (amb això s'activen les 947 pàgines i el sitemap complet).

## Rebranding «PreuReal.cat» → «Preureal» a tota la superfície visible — 2026-11-12

**Encàrrec:** llevat el «.cat» de tot el que veu l'usuari: web (front end),
metadades SEO i textos dels correus. Revisió exhaustiva ca/es.

**Canviat (només cadenes visibles):**
- **UI (AppShell):** logotip de la capçalera i del peu (s'elimina el `<span>` taronja «.cat»), línia de copyright.
- **i18n ca/es:** `brand`, FAQ q3 («Preureal marca els municipis…»), disclaimer del peu.
- **SEO (layout.tsx):** títol per defecte i template, authors, Open Graph (títol + siteName), Twitter card i JSON-LD (`WebApplication.name`).
- **Correus (mail.ts):** `BRAND`, capçalera i peu de totes les plantilles (benvinguda, verificació, restabliment, rebut, resum de preferits), CTA «Obre el mapa de Preureal», remitent per defecte `Preureal <onboarding@resend.dev>`.
- **Informe PDF (pdf-report.ts):** logotip de portada i de capçalera (s'elimina el «.cat» accentuat), peu de pàgina, notes P4/P5 i clàusula final de l'avís legal.
- **Textos legals:** avís legal (objecte, ca/es) i nota final de la guia.
- **User-Agents** dels importadors/sondes (INE, ICGC, Cadastre, geocodificador, health, seed, update_all): `Preureal/1.0`.
- **.env.production.example:** `MAIL_FROM="Preureal <hola@preureal.com>"`.

**Intacte (funcional, deliberadament):** `www.preureal.com` (domini real),
`admin@preureal.cat` (compte), lògica i notes de `site-url.ts`, noms de fitxers
de descàrrega `preureal_*`, documentació històrica (CHANGES/AUDIT/DEPLOY/...).
**Pendent per a l'usuari:** actualitzar a Vercel la variable `MAIL_FROM`
(valors → `Preureal <hola@preureal.com>`) perquè el remitent real dels correus
mostri la marca nova; el codi per defecte ja és correcte.

## CAUSA ARREL REAL del «No s'ha pogut generar l'informe»: WinAnsi cannot encode ≥/≤ — 2026-11-11

**Correcció de l'entrada següent:** la hipòtesi del paywall era ERRÒNIA.
Amb captura de l'usuari + Postgres local (embedded-postgres, migracions i seed
reals) + usuari Premium/Pro de prova, el fetch es reproduït EXACTAMENT:

```
⨯ Error: WinAnsi cannot encode "≥" (0x2265)
    at widthOfTextAtSize → line() → buildReportPdf → /api/reports/pdf = 500
```

**Origen:** els textos oficials del catàleg d'ajuts (Fase 4, ampliada 4→9)
contenen símbols matemàtics — «Persones amb discapacitat **≥** 33 %»,
«ingressos **≤** 25.200 €/any» — que les StandardFonts de pdf-lib (WinAnsi)
NO poden codificar. Des que el catàleg ampli està carregat, l'informe PDF
donava 500 per a TOTS els usuaris (el CSV seguia funcionant: és text UTF-8).

**Fix (commit eccfe78):** `winAnsi()` a pdf-report.ts — mapa de símbols
(≥→">=", ≤→"<=", ≈→"~", →→"->", espais fi→espai, etc.) + filtre final fora de
repertori → «?»; buildReportPdf sanititza TOTA l'entrada abans de dibuixar;
`JSON.parse(rentHistory)` defensiu a P3; el missatge genèric del frontend ara
inclou el codi HTTP. Verificació E2E local: mun → 200 (%PDF-1.7, 15 KB),
edifici → 200, CSV → 200; tests 7/7 amb regressió pels textos reals.

## Diagnòstic i millores de «Exportació CSV / Informe PDF» a «Estàs pagant de més?» — 2026-11-11

**Informe de l'usuari:** a la secció «Estàs pagant de més?» de la fitxa no es
pot generar ni descarregar l'informe PDF (ni l'exportació CSV).

**Auditoria feta (tot en ordre):** (a) rutes registrades al dispatcher
(`reports/pdf`, `export/:code`) i vives a producció (401 sense sessió, no 404);
(b) el constructor del PDF és pur i passa els 4 tests de `tests/pdf_report.test.ts`
(8 pàgines, degradació, nau industrial, municipi no tensat); (c) cap camí del
servidor llança sense capturar (`recordUsage` mai llança; indicadors i ajudes
tenen fallback). **Conclusió:** els botons funcionen; el que veia l'usuari era
el paywall del seu pla (FREE/Premium) amb un missatge petit només visible
DESPRÉS de clicar + el cas 401 (sessió caducada) que queia al missatge genèric
«No s'ha pogut generar».

**Millores aplicades (MapView):**
1. **Affordància de pla ABANS de clicar:** candau als botons — PDF bloquejat
   per a FREE (i per a informe d'EDIFICI amb Premium, que requereix Pro);
   CSV bloquejat per a tot pla no-Pro. El clic segueix actiu i el servidor
   revalida (mai confiem només en el client).
2. **401 amb causa real:** «La teva sessió ha caducat: torna a iniciar-la.»
   en comptes del genèric (abans semblava un error del sistema).
3. **403 EMAIL_NOT_VERIFIED amb el seu propi missatge** (verificar correu),
   que abans també queia al genèric.
4. **404 informatiu** (municipi/edifici sense dades per a l'informe).
5. **Nom de fitxer del PDF des de Content-Disposition** (abans
   `download=""` i alguns navegadors guardaven «download» sense extensió
   .pdf — semblava «no descarrega res»).

**Servidor (`export/[code]`):** `JSON.parse(rentHistory)` ara és defensiu —
un historial corrupte exportaria la capçalera en lloc d'un 500.

**Per provar les features com a propietari:** Panell d'administració →
Usuaris → canvia el pla del teu compte (Premium informa PDF de municipi;
Pro afegeix informe d'edifici i exportació CSV). El canvi del admin PERSISTE
(subscripció de suport creada amb auditoria).

## Seed-aid també en 1 sentència SQL (mateix patró que el seed municipal) — 2026-11-11

**Risc detectat:** el bucle per fila de `POST /api/admin/seed-aid` feia
2 queries × 9 ajuts (~9-18 s amb la latència real de la BD) — el mateix patró
que va penjar el botó municipal. El comentari encara deia «4-5 filas» però el
catàleg ampliats ja són 9.

**Fix:** 1 SELECT de codis existents (per reportar created/updated) + 1 upsert
SQL únic (INSERT … ON CONFLICT ("code") DO UPDATE des de json_to_recordset).
Sintaxi validada amb el parser real de PostgreSQL (libpg_query) juntament amb
el seed municipal: tots dos PARSE_PG OK.

**Detall crític cobert:** `RentalAid.id` és `@default(cuid())` — un default
del CLIENT Prisma, no de la BD. L'INSERT cru genera un `randomUUID()` per fila
nova; `createdAt`/`updatedAt` = NOW() explícit (també defaults de client).
La resposta conserva la forma `{ ok, created, updated, total, revisado }` que
ja pinta el botó del panell.

## Seed en 1 sola sentència SQL (upsert) — fix del «botó penjat» — 2026-11-11

**Símptoma:** el botó «Sincroniza les dades municipals» es quedava pensant i
mai responia. PERO les dades SÍ van aterrar: /api/health va passar a
`withRent: 693` (+Palamós) i `withComarcaRef: 254` — la funció escrivia tot i
el timeout del serverless la matava ABANS de respondre.

**Causa:** 947 UPDATE individuals en 38 rondes seqüencials de 25 (~20-40 s amb
la latència real de la BD) > límit de durada de la funció (Vercel).

**Fix:** tot l'upsert és ara UNA sola sentència SQL (INSERT … ON CONFLICT DO
UPDATE des de `json_to_recordset`, paràmetre JSON de 518 KB): 1 ida i
tornada, ~1-3 s. Sintaxi validada amb el parser real de PostgreSQL
(libpg_query). `boundary`/`boundaryFetchedAt` NO es toquen (caché ICGC
preservada); `updatedAt` = NOW(). Resposta `{ ok, synced, total }` i el panell
mostra «OK: N/947 municipis sincronitzats».


## Causa arrel del SEED_FAIL corregida: `contractsPeriod` inexistent al schema — 2026-11-11

**Causa confirmada (reproducció empírica):** el payload de
`POST /api/admin/seed-municipalities` enviava `contractsPeriod`, un camp que
NO existeix al model `Municipality` (només hi ha `contractsLatest`). El JSON
el portava als 947 municipis, així que `?? null` no l'amagava: cada
`createMany` i cada `update` llançava `PrismaClientValidationError: Unknown
argument \`contractsPeriod\`` — el seed sencer fallava des del primer
argument. Reproduït i aïllat contra un model mirall (SQLite): amb el camp →
`Unknown argument \`contractsPeriod\``; sense el camp → insert OK.

**Fix:** `contractsPeriod` eliminat del payload i de la interfície `MunRow`,
amb nota que impedeix regressions. `skipDuplicates` es manté (vàlid a
PostgreSQL; només falla a SQLite, artefacte del mirall de prova).


## Seed municipal sincer (recomptes reals) + verificació externa via /api/health — 2026-11-11

**Símptoma en producció:** el botó #/admin podia mostrar «OK: 947 actualitzats»
mentre la BD seguia intacta (Barcelona sense `rentSource`, Palamós buit,
cap referència de comarca).

**Causa:** el comptador d'actualitzacions comptava INTENTS, no èxits
(`updated += chunk.length` rere un `.catch(() => null)` que silenciava
qualsevol error per fila).

**Fix:**
- `POST /api/admin/seed-municipalities`: ara compta només èxits reals
  (`Promise.allSettled`), captura fins a 3 errors de mostra i, si cap fila no
  ha reeixit, respon 502 `SEED_FAIL` amb el missatge real (createMany o primer
  error per fila) en lloc d'un èxit fals.
- `GET /api/health`: nous comptadors agregats `municipalities`
  (`total` / `withRent` / `withComarcaRef` — només recomptes, cap dada
  sensible) per verificar des de fora que el seed ha aterrat.
- Panell #/admin: el missatge del botó ara mostra els errors mostrejats si
  n'hi ha, tant en èxit parcial com en fallda total.


## Els 255 municipis sense dada + avisos d'habitabilitat (Decret 141/2012) — 2026-11-11

**1) Diagnòstic real dels 255 municipis sense dada** (excels oficials Incasòl
«Lloguers per àmbits geogràfics», descarregats avui de habitatge.gencat.cat):
- **Palamós (1)**: el cruïlla per nom havia fallat → **recuperat amb la sèrie
  oficial completa** (19 anys, 2007-2025; vigent 722,6 €/mes el 2025).
- **252 municipis**: tenen 1-5 contractes de fiances registrats però Incasòl NO
  publica la renda mitjana (mostra massa petita) → **no existeix dada oficial
  municipal que importar**.
- **Oliola i Arres (2)**: cap contracte en 2005-2025.

**2) Referència de comarca (mai dada municipal inventada)** — nous camps
`comarcaRefLatest/Period/History` + `rentSource` a Municipality (migració
`20261111120000_comarca_ref`, estrictament aditiva i idempotent): mitjana
PONDERADA pel nº de contractes dels municipis oficials de la mateixa comarca
EL MATEIX ANY (mín. 3 municipis; sèrie 2005-2025). Els camps oficials
(`rentLatest/rentHistory`) resten intactes i buits per a aquests 254.
Exposició: `/api/municipalities`, `/api/municipalities/[code]`, `/api/lookup`,
`/api/comparator`, `/api/buildings` (munRefRent) i `/api/valuation` (base).
UI: cercador («≈612 €»), llegenda del mapa («≈ Ref. de comarca»), edificis
traçats discontinus amb tooltip, fitxa (xifra «≈», etiqueta i nota metòdica),
gràfica «Històric» amb la sèrie de la comarca (barres ocre + nota) i
comparador (barra jaspiada + xip «ref. comarca»). Resultat: cap municipi
dels 947 queda «sense cap dada».

**3) Valoració amb base de comarca** — si el municipi no té fiança oficial,
`computeValuation` usa la referència de comarca amb `baseSource="COMARCA_REF"`
(confiança MAI superior a BAIXA, clau `CONF_BASE_COMARCA_REF`; la base queda
exposada intacta a `baseCentral`). Els 254 ja no donen «NO_DATA» a
`/api/valuation` (si la comarca té pool, valoren; si no, segueix el 422).

**4) Criteris d'habitabilitat a la valoració (Decret 141/2012, de 30
d'octubre, DOGC 6254)** — fins ara una superfície < 15 m² es silenciava a
`null` (10 m² «calculaven» com si no s'haguessin introduït). Ara:
- La validació accepta des de 5 m² per poder AVISAR (mai per cobrir el mínim legal).
- Nou camp `warnings[]` al resultat (`habitabilityWarnings` a territorial.ts),
  informatiu i sense efecte sobre el càlcul:
  - `HAB_MENOR_15` (ILLEGAL): < 15 m² → cap habitatge legal ni excepcional.
  - `HAB_MENOR_20` (EXCEPCIONAL): 15-20 m² → només art. 4.2 (llicència
    sol·licitada abans de 1-2-1984 + cèdula vigent anterior al Decret).
  - `HAB_COMPACTA` (ADVERTENCIA): 20-40 m² → sala ≥ 10 m² (14 amb cuina
    integrada, art. 5.1), zona d'ús comú ≥ 20 m² (art. 3.7.1), alçada 2,50 m
    (art. 3.5), cèdula vigent.
  - `HAB_HABITACIONS_MINIM` (ILLEGAL): habitacions < 5 m² útils (art. 5.2).
- ValuationPanel: pista en viu sota l'input («mínim legal 20 m²») i banners
  per nivell (vermell/taronja/ambre) amb l'article citat; «Com es calcula»
  distingeix «Fiança municipal» de «Referència de comarca».
- Proves: 27 (19 de v2 + 8 noves d'habitabilitat i base de comarca), totes verdes.

**5) Sincronització de dades des del panell admin** — nou `POST
/api/admin/seed-municipalities` (mateix patró que seed-aid): upsert idempotent
de la taula Municipality amb `src/data/municipalities.json` (packaged, 528 KB).
El propietari executa la sincronització des de #/admin («Sincronitza les dades
municipals») sense .env local: refresca les fiances oficials, Palamós i les
254 referències de comarca de cop. NOMÉS escriu a Municipality i queda auditat.

## Buscador per referència catastral al mapa + «Històric del municipi» arreglat — 2026-11-11

**1) Buscador per referència catastral sobre el mapa** — sota el cercador del mapa,
qualsevol visitant pot enganxar la RC (14 o 20 caràcters; surt al rebut de l'IBI i
al contracte de lloguer) i localitzar la parcel·la a qualsevol municipi de Catalunya:
- `/api/lookup-refcat` v2: (1) ruta ràpida per la BD d'edificis coneguts; (2)
  qualsevol parcel·la via ICGC `parcelles-cadastre` amb filtre OGC API
  `filter=refcadp='<RC14>'` (2,66 M de parcel·les, dades obertes CC-BY) →
  centroid → municipi (ICGC elements) → detalls cadastrals públics del Cadastre
  (DNPRC): adreça completa, codi postal, ús principal, superfície (m²) i any de
  construcció. Verificat en calent amb RC reals de Barcelona, Girona i Tarragona.
- `src/lib/icgc.ts`: nova `fetchParcelByRefcat` (polígon + centroid, degradació
  elegant). `src/lib/catastro.ts`: nova `fetchParcelDetailsByRefcat` (parseja
  `<ldt>`, `<dp>`, `<debi><luso|sfc|ant>`; tracta el «null» literal que el servei
  retorna per a solars) i `provinciaForCode`.
- `MapView.tsx`: input dedicat amb botó i Enter, ressaltat de la parcel·la
  trobada (polígon taronja discontinu), vol a z18 i obertura automàtica de la
  fitxa (d'edifici si coincideix amb un conegut, del municipi si no); targeta
  amb els detalls cadastrals i les fonts citades. El cercador general també
  resol ara qualsevol RC (abans només edificis importats).
- Degradació en tota la cadena: si ICGC o Cadastre fallen, la resta continua;
  sense dades → «—», mai s'inventa res.

**2) «Històric del municipi» — gràfica arreglada (mai més buida)** — dues causes:
- a) CSS: les barres feien `height:%` dins d'una columna d'alçada automàtica →
  el percentatge no es resolia i totes quedaven a 3 px (per això semblava buida
  encara que la sèrie fos a la BD). Ara l'alçada és proporcional en px.
- b) El bloc desapareixia en silenci amb <2 punts. Ara sempre és visible: amb
  1 punt es mostra; sense sèrie però amb variació interanual es mostren 2 barres
  reals (any anterior vs període vigent); sense cap dada → missatge clar de
  «sense sèrie publicada» (mai s'inventa). La sèrie 2005–2025 (692 municipis)
  ja és a la BD de producció: ara es veu.
- i18n ca/es (`map.rc.*`, `map.panel.historyPairNote`, `historyNoSeries`).
- Lint 100 % net: `scripts/**` (tooling de dev, no codi de l'app) fora de
  l'escaneig ESLint; així desapareixen els 7 errors preexistents de `require()`.

## Fase 4: catàleg d'ajudes ampliat (4→9, verificades) + lint React 19 net — 2026-11-11

**1) Ajudes al lloguer (Fase 4)** — catàleg editorial ampliat de 4 a 9 entrades,
TOTES verificades avui contra les fonts oficials (enllaç + estat de convocatòria):
- NOVA `AYUDA_ALQUILER_PLA_ESTATAL_2026_2030`: ajuda al lloguer del nou Pla
  Estatal (RD 326/2026, BOE 22/04/2026) — fins a 300 €/mes habitatge /
  200 €/mes habitació, màx. 60 % de la renda, 2 anys; gestió per CCAA.
- NOVA `BO_LLOGUER_JOVE_GENCAT`: convocatòria catalana del bono joven —
  250 €/mes (límit de renda), ≤35 anys, ingressos ≤25.200 €/any, caps per
  demarcació; convocatòria 2026: 9-13 març (tancada, anual).
- NOVA `AJUTS_LLOGUER_36_64_GENCAT`: 50-200 €/mes, ingressos ≤36.279,32 €;
  convocatòria 2026: 14 abril-8 maig (tancada, anual).
- NOVA `AJUTS_LLOGUER_65_MES_GENCAT`: 65+ anys; convocatòria 2026:
  31 març-30 abril (tancada, anual).
- NOVA `AJUTS_LLOGUER_JOVES_RISC_GENCAT`: joves ≤35 en risc de residència —
  600-3.000 €/any, 2 anys; convocatòria 2026: 29 juny-10 juliol (tancada, anual).
- `BONO_ALQUILER_JOVEN` actualitzat (RD 326/2026: fins a 300 €/mes; a Catalunya
  = Bo Lloguer Jove); `AJUTS_LLOGUER_GENCAT` passa a VIGENTE com a paraigües.
- Nou estat editorial `CONVOCATORIA_TANCADA` (honest: programa vigent, finestra
  anual tancada) amb traduccions al badge de GuiaView i validació del test.
- Fitxers: `src/data/rental_aid_seed.json`, `src/components/views/GuiaView.tsx`,
  `scripts/fase4_test.ts`. Per carregar-les a producció: panell #/admin
  (POST /api/admin/seed-aid, upsert idempotent) o `npx tsx scripts/seed_rental_aid.ts`.

**2) Lint React 19 (13 errors → 0, sense canvi de comportament)** — regles noves
`react-hooks` v6 (`set-state-in-effect`, `immutability`,
`preserve-manual-memoization`); TASKS.md P2 tancat:
- `MapView.tsx` (8): callbacks de selecció/dibuix moguts ABANS de l'efecte
  d'inicialització (accés abans de declarar); deps completades
  (drawBuildings, loadBuildingsInView); sincronització de quota i esborrat del
  cercador com a ajust d'estat durant el render; recarrega per idioma amb
  continuació asíncrona.
- `PanelView.tsx` (3): verificació del hash amb lazy initializer; sincronització
  de nom/alertes amb ajust de render (sentinel); càrrega de pestanya asíncrona.
- `ComparadorView.tsx` (2): esborrat de candidats al render; comparació
  automàtica asíncrona.
- `use-user-plan.ts` (1): refresc inicial en continuació asíncrona.
- Verificació: `npx eslint src` = 0 problemes; `npx tsc --noEmit` = net.

## Fix: la valoració orientativa respon a les característiques (motor v2) — 2026-11-11

**Problema reportat pel propietari:** la valoració orientativa donava SEMPRE el
mateix preu, independentment dels m², el nombre d'habitacions o l'estat de
l'immoble.

**Causa:** el motor v1 feia `central = fiança municipal` exacta i les
característiques només generaven notes qualitatives (decisió conservadora de la
v1: "cap coeficient inventat"). Correcte estadísticament, però inútil per a
l'usuari que vol veure COM canvien els números.

**Solució (v2 — coeficients aproximats, documentats i VISIBLES):**
- `src/lib/territorial.ts`: constants exportades amb fonts als comentaris —
  `VAL_REF_M2 = 85` (superfície de la vivenda típica darrere de la mediana de
  fiances; l'oferta de lloguer es concentra entre 60-100 m², Observatori del
  Lloguer; parc total 106,5 m², INE 2023), `VAL_BETA_SUPERFICIE = 0,8` (escala
  sublineal renta-superfície: el €/m² cau amb la mida; estudis hedònics UB
  Barcelona i DIW Berlín), `VAL_ESTAT_MULT` (a reformar 0,80 · bon estat 1,00 ·
  reformada 1,06 · obra nova 1,12; ancoratge Fotocasa 2021: reformar porta la
  renta de ~1.000 a ~1.300 €/mes, +30%), ajust de densitat m²/hab limitat ±5%.
  Nou resultat (additiu, sense trencar res): `baseCentral` (dada oficial
  intacta), `typical`, `adjustments[]` (desglossament traçable). Sense
  característiques → comportament idèntic a la v1 (vivenda típica).
- `src/app/api/_impl/valuation/route.ts`: docstring de metodologia v2 (cap
  canvi de contracte, gating ni quotes).
- `src/components/views/ValuationPanel.tsx`: nou bloc "Com es calcula" —
  fiança municipal → cada ajust amb el seu % i detall → central ajustada;
  notes i textos explicatius actualitzats (ca/es).

**Validació:** 19 comprovacions automàtiques passant (monotonia en superfície,
multiplicadors d'estat exactes, efecte habitacions limitat, horquilla coherent,
baseCentral intacta, 4 perfils diferents → 4 preus diferents). Exemple amb base
1.050 € (tipus Barcelona): estudi 40 m² a reformar ≈ 460 € · vivenda típica
1.050 € · 75 m²/3 hab bon estat ≈ 933 € · 120 m²/4 hab obra nova ≈ 1.550 €.

## Fix: servei Catastro (any de construcció) — 2026-11-11

**Problema en producció:** `/api/health` reportava `catastro ok:false, status:404`
i la fitxa d'edificis deixava de mostrar l'any de construcció per a edificis
sense cau.

**Causa arrel (verificada en calent):** la D.G. del Catastro ha RETIRAT el
servei WCF REST `COVCCatastro.svc` (`ovc.catastro.meh.es/OVCServWeb/
OVCWcfCatastro/`): totes les operacions (`Consulta_DNPPC`, `Consulta_DNPRC`,
`Consulta_PMULT`, `Consulta_DLOC`) i el WSDL responen 404, també al mirall
`www.catastro.hacienda.gob.es/ovc.catastro.meh.es/`. El substitut viu és el
servei clàssic `OVCSWLocalizacionRC/OVCCallejero.asmx` → **`Consulta_DNPRC`**
(Provincia + Municipio en NOM + RC; any al camp `<debi><ant>`).

**Canvis:**
- `src/lib/catastro.ts`: migració a `Consulta_DNPRC` (OVCCallejero.asmx).
  Requereix Provincia i Municipio normalitzats (sense accents, majúscules);
  derivats del municipi de la consulta (`mun.province`, `mun.name`, o per
  prefix de codi 08/17/25/43). Retalla RC de 20 → 14 caràcters (el servei
  només accepta parcel·la; amb 20 respon error de formació — verificat).
  Manté el mateix contracte (`getYearBuilt`), el cau en BD i la degradació
  elegant; ara també reconeix els errors de negoci `<err>` que arriben amb
  HTTP 200 i el nou camp `<ant>` (compatibilitat amb l'antic `<antiguedad>`).
- `src/app/api/_impl/lookup/route.ts`: passa el context territorial
  (provincia, municipio, municipalityCode) a `getYearBuilt`.
- `src/app/api/health/route.ts`: la prova ara és una consulta REAL al servei
  viu amb una parcel·la real (Carrer de Sants 10, Barcelona → ant 1900) i
  valida XML (`<consulta_dnp`, sense `<err>`); abans només mirava el status
  HTTP d'una URL morta.
- `src/app/api/_impl/provenance/route.ts` + `src/app/api/_impl/reports/pdf/route.ts`:
  text de font actualitzat a `Consulta_DNPRC (OVCCallejero.asmx)`.

**Verificació executada (sandbox, serveis reals):**
- Servei antic: 404 a totes les operacions + WSDL (http i mirall).
- Servei nou: `ConsultaNumero` (refcat real de «Carrer de Sants 10») →
  `Consulta_DNPRC` → HTTP 200, XML `consulta_dnp`, `<debi><ant>1900</ant>`.
- RC de 20 caràcters → error oficial «LA REFERENCIA CATASTRAL NO ESTÁ
  CORRECTAMENTE FORMADA» (d'aquí el retall a 14).
- Errors de negoci (p. ex. tipus de via >5 caràcters) arriben amb HTTP 200 +
  `<err>`: gestionats com a null (mai s'inventa cap dada).

## v26 (Fase 2 de fonts oficials) — 2026-11-10 · Modelo de datos + importadores INE (IPVA y Atlas de renta), migración estrictamente aditiva

### 0. Alcance (encargo fuentes oficiales — Fase 2)
- Solo **modelo de datos + importadores INE**: la única fase bloqueante del
  resto. Sin cambios de UI (Fase 4), sin Premium (Fase 5), sin PDF (Fase 6).
- **Nada destructivo**: migración que solo AÑADE dos tablas nuevas
  (`DataSource`, `StatObservation`); ninguna tabla, columna ni fila existente
  se modifica. Cero toques a Stripe/pagos (verificado con `git diff`).

### 1. Fuentes verificadas contra su publicación real (no se inventa nada)
- **IPVA** (INE, base 2015=100, experimental, fuente AEAT/IRPF): tablas
  Tempus3 **59056** (índice NAC+CCAA), **59058** (provincias), **59060**
  (municipios >10.000 hab). Es un ÍNDICE de evolución, nunca un precio en €.
- **ADRH / Atlas de distribución de renta** (INE, serie 2015-2024 publicada
  19-10-2026): tabla nacional **53689** (Total Nacional + CCAA + provincias) y
  provinciales **30896** Barcelona, **31016** Girona, **31079** Lleida,
  **31223** Tarragona (séries municipales «Renta neta media por persona /
  por hogar», 2015-2024). Renta media territorial, nunca salario individual.
- SERPAVI queda fuera (sin API ni ficheros abiertos: solicitud en datos.gob.es
  «asignada»); vigilancia para cuando se abra (Fase 7+).

### 2. Base de datos (migración `20261110120000_fase2_fuentes_oficiales`)
- **`DataSource`**: catálogo de fuentes (code único, institución, licencia,
  unidad, periodicidad, metodología) — la trazabilidad que exige el encargo.
- **`StatObservation`**: una observación = fuente + variable + territorio +
  período + valor. Variables: `IPVA_INDICE`, `IPVA_TASA_ANUAL`,
  `RENTA_NETA_MEDIA_PERSONA`, `RENTA_NETA_MEDIA_HOGAR`; niveles
  `ESTATAL/CCAA/PROV/MUNI` con códigos INE; `municipalityCode` como enlace
  LÓGICO con Municipality (sin FK: la tabla existente no se toca). Clave única
  (sourceId, variable, geoLevel, geoCode, period) → reimportar es idempotente.
- SQL idempotente (seguro también en el SQL Editor de Supabase).

### 3. Importadores (`src/lib/ine-parse.ts` + `src/lib/ine-import.ts`)
- **Parsers puros** testados con fixtures reales (data/fixtures/, fuera de
  git): 23/23 checks OK, incluidas cifras oficiales (índice nacional 2024
  122,92; tasa +3,5%; Cataluña +3,1%; renta neta media nacional 15.948 €) y
  **mapeo 947/947 municipios** (resuelve artículos invertidos INE «Vendrell,
  El» ↔ Gencat «Vendrell, el»). 124 municipios catalanes con IPVA municipal,
  18.480 observaciones municipales de renta, secreto estadístico excluido.
- **Orquestador**: upsert de DataSource, ImportRun + AuditLog, sustitución por
  ventana (solo filas de la fuente/ámbito importado), createMany por lotes,
  reintentos con backoff, `maxDuration=60`, scope parametrizable (Barcelona
  pesa ~35 MB y puede lanzarse sola).
- **Rutas**: `POST /api/admin/import-ine` (admin, rate-limited, {source,
  scope}), `GET /api/cron/ine` (trimestral: ENE/MAR/JUN/SEP, cubre IPVA en
  primavera y Atlas en otoño; guarda CRON_SECRET como en /api/cron/emails) y
  `GET /api/ine/status` (probe público de verificación: solo datos INE,
  ninguna dada de usuario). Dispatcher regenerado (54 rutas).

### 4. Transparencia
- `/api/provenance` documenta las dos fuentes nuevas (unidad, ámbito,
  periodicidad, metodología, advertencias de interpretación).

### 5. Activación tras desplegar (datos aún no cargados)
- Automática: el cron trimestral carga todo (con presupuesto de tiempo; si
  Barcelona no cabe, continúa en la siguiente ejecución).
- Manual inmediato: `curl -X POST https://www.preureal.com/api/admin/import-ine
  -H "Authorization: Bearer <JWT_ADMIN>" -H "Content-Type: application/json"
  -d '{"source":"INE_ATLAS_RENTA"}'` (y `INE_IPVA`), o por scopes
  `{"source":"INE_ATLAS_RENTA","scope":"08"}` para Barcelona.
- Verificación: `curl https://www.preureal.com/api/ine/status`.

## v25 — 2026-11-10 · Comparador per plans: 6 municipis amb Premium/Pro, % de diferència i gràfica premium

### 1. Límit d'entitats per pla (gratuït 2, Premium i Pro 6)
- **`plans.ts`**: nou camp `comparatorMax` per pla (FREE 2 · PREMIUM 6 · PRO 6).
- **Servidor (`POST /api/comparator`)**: el pla efectiu el decideix sempre el
  backend des de la sessió (mai el client). Amb més entitats del permès →
  `403 { error: "PLAN_LIMIT", max, plan }`; amb menys, es retalla al límit.
- **Client (ComparadorView)**: el selector no deixa afegir més enllà del límit,
  mostra «Gratuït: màx. 2», i quan s'arriba al límit apareix upsell amb CTA
  «Fes-te Premium» → `/preus`. Si el servidor retorna PLAN_LIMIT (comparació
  desada amb 6 entitats oberta amb pla gratuït), retalla i avisa amb missatge.

### 2. Gràfica comparativa premium amb % de diferència
- Resultats reordenats **del més car al més barat** amb número de posició.
- Cada municipi té **badge de % de diferència respecte al més barat** de la
  selecció (format català amb coma decimal; tarifa ≥25% destacada en taronja) i
  el més barat porta l'etiqueta verda «el més barat» (referència 0%).
- Barres amb **degradat** i animació suau d'amplada (700 ms), altura major i
  color per trams de preu (mateixa escala que abans).
- Es mantenen: % vs mitjana del conjunt, contractes de mostra, mediana
  històrica, estadístiques (mitjana/mediana/bretxa max-mín) i disclaimer.

### 3. Copies
- Subtítol del comparador: «fins a 2 amb el pla gratuït i fins a 6 amb Premium
  o Pro». El mateix límit serveix per a Premium i Pro (agents).

---

## v24 — 2026-11-09 · Panell Premium útil: accions, comparacions carregables i resum mensual de preferits

### 1. Panell accionable (mai més llistes morts)
- **Historial**: cada consulta té el botó «Al mapa» (`/#/mapa?mun=CODI` — i
  `&edifici=ID` si la consulta incloïa un edifici): reobre la consulta exacta
  al mapa (límit municipal + panell de detall).
- **Preferits**: cada fila (municipi o edifici) té «Al mapa». Els edificis usen
  el nou `GET /api/buildings/[id]` (centroid + nom): el mapa hi vola, espera el
  carregament de la vista i reobri la consulta del polígon.
- **Comparacions desades**: cada fila té «Obrir» → `/#/comparador?id=...`; el
  comparador carrega les entitats desades, resol els noms (municipis via
  `?code=`, edificis via `/api/buildings/[id]`) i executa la comparació.
- Estats buits amb CTA («Explora el mapa» / «Obrir comparador»).
- Els paràmetres de deep-link es consumeixen UNA vegada (`history.replaceState`):
  tornar al mapa des del menú no re-aplica l'últim enllaç.

### 2. Resum mensual de preferits per correu (v24, OPT-IN explícit)
- **`User.alertsEnabled`** (migració `20261109100000_user_alerts_enabled`,
  additiva amb `DEFAULT false`): mai actiu per defecte (RGPD). Toggle al
  **Panell → Preferits** (només Premium/Pro) via `PATCH /api/account
  { alertsEnabled }` — només booleans estrictes. `/api/auth/me` el retorna.
- **Cron `/api/cron/emails` (feina 0)**: els dies 1–3 de cada mes encola un
  correu `DIGEST` per usuari verificat + `alertsEnabled` + pla de pagament amb
  ≥1 preferit. **Idempotència**: `idempotencyKey = favs-digest:<userId>:<YYYY-MM>`
  (reexecucions/dies 2–3 no dupliquen). En mode Resend la fila entra
  «pending» i la mateixa passada la lliura l'outbox (≤20/passada; la resta,
  els dies següents). En sandbox queda «logged» visible al panell admin.
- **Contingut**: preu mitjà vigent (Incasòl) de cada preferit + variació vs
  any anterior (municipis) + enllaç directe «obre al mapa». Màxim 10 files +
  nota «+ N més». Mai s'inventa cap xifra (municipis sense dada → "sense
  dades oficials aquest període").
- **`mail.ts`**: nou tipus `DIGEST` (reintegable al outbox, sense secrets) i
  plantilla `favoritesDigestMail()` (labels escapats, URLs amb codis validats
  en origen).

### Fitxers nous
- `prisma/migrations/20261109100000_user_alerts_enabled/migration.sql`
- `src/app/api/_impl/buildings/[id]/route.ts` (regenerat el dispatcher:
  `/api/buildings/:id` al catch-all)

### Verificació
- `npx next build` ✓ (Next 16 + Turbopack + TypeScript)
- Migració additiva: l'aplica automàticament el build de Vercel
  (`prisma migrate deploy`); també es pot enganxar el SQL al SQL Editor de Supabase.

## v23 — 2026-11-06 · Auditoria de seguretat i cobraments de la Fase 1 (correccions + tests)

### Correccions de seguretat i de diners (prioritat de l'auditoria)
1. **Eliminació de compte (RGPD)** — `account/route.ts`: ABANS de borrar cap
   dada es cancel·len a Stripe les subscripcions REALS actives
   (`stripe.subscriptions.cancel`, sense factura final). Si Stripe falla → 502
   i NO es borra res (mai es deixa un cobrament orfe sobre un compte esborrat).
   Les DEMO no toquen Stripe.
2. **Anti suscripcions duplicades** — `stripe/checkout/route.ts`: amb Stripe
   configurat, un segon checkout amb subscripció REAL activa retorna **409
   ALREADY_SUBSCRIBED** (el canvi Premium⇄Pro es fa pel Portal de Stripe, amb
   prorrateig). Al webhook, si igualment arriba un checkout d'un usuari amb una
   altra sub real activa, l'antiga es cancel·la TAMBÉ a Stripe
   (`STRIPE_SUB_SUPERSEDED`). Les DEMO no bloquegen el checkout real.
3. **Idempotència del webhook (duplicat ≠ error de BD)** — `stripe/webhook/route.ts`:
   el claim de StripeEvent ara distingeix la violació d'unicitat (P2002/23505 →
   200 `duplicate:true`) d'un error de connexió/BD (→ 500; Stripe reentrega).
   Abans, un error de BD es tractava com a duplicat i l'event es PERDIA per sempre.
4. **Mai Premium sense pagament verificat** — `checkout.session.completed` exigeix
   `payment_status` paid/no_payment_required (mètodes asíncrons com SEPA queden
   fora); si no es pot llegir l'estat real de la subscripció a Stripe, la fila es
   crea com `incomplete` (mai `active` a cegues); el plan de l'usuari es deriva
   SEMPRE de les subscripcions vigents via `syncUserPlan` (mai escriptura directa
   des de la sessió de checkout).
5. **Accés a funcionalitats Premium via API** — `favorites GET` exigeix
   `planAllows(preferits)` (el docblock ho deia però no es comprovava). El
   DELETE continua obert a qualsevol sessió (higiene de dades d'un usuari
   degradat, no és funcionalitat Premium).
6. **Cuota mensual ATÒMICA i unificada** — `subscription.ts::consumeDetailQuery`:
   un únic `INSERT ... ON CONFLICT DO UPDATE ... WHERE usageCount < límit` amb
   `RETURNING` (les peticions paral·leles es serialitzen amb el lock de fila;
   el `count()` previ permetia passar dues peticions simultànies). `SubscriptionUsage`
   és l'ÚNICA font de la quota; SearchLog queda per a historial/auditoria
   (backfill del mes corrent en la primera inserció). `lookup/route.ts` l'usa.
7. **Expiració de subscripcions** — `plans.ts::syncUserPlan` expira també
   `trialing` (abans una prova vençuda sense conversió es quedava activa per
   sempre) i `past_due` amb període vençut.
8. **Gràcia de pagaments fallits (política coherent)** — `VIGENT_STATUSES =
   active | trialing | past_due`: l'usuari manté l'accés mentre Stripe reintenta
   el cobrament; es retira quan Stripe marca unpaid/canceled (webhook) o quan
   el període venç (sincronització local). Documentat a subscription.ts.
9. **Unificació de preus** — el rebut per correu mostra l'IMPORT REAL facturat
   (`cs.amount_total`, via `formatEurFromCents`) i el nom nominal del pla
   (`planName`, "Pro (agents)"); l'MRR d'admin usa `getPlanSettings()` (mai
   constants); el correu de benvinguda i el frontend (`/api/plans` nou públic +
   PricingView) usen la mateixa configuració efectiva; `.env.production.example`
   corregit (Session Pooler 5432, el 6543 penja `migrate deploy`).
10. **Canvis de pla des del Portal de Stripe** — el webhook dedueix el pla del
    PRICE de la subscripció (`planFromPriceId`, noms canònics v22 + antics com
    fallback) quan arriba `customer.subscription.created/updated` (el Portal no
    envia metadata). Sense price reconeixible, es conserva el plan existent.
11. **Panel** — el missatge d'error del servidor (p. ex. STRIPE_CANCEL_FAILED,
    ALREADY_SUBSCRIBED) es mostra a l'usuari (abans només el codi d'error).

### Tests (bun test — 47 tests, 0 fallos)
`tests/audit_v23.test.ts` (36 nous): checkout (503 sense Stripe, DEMO marcada
demo:true amb període de 30 dies, 409 anti-duplicat, BAD_PLAN), webhook
(duplicat P2002 → 200 sense efectes, error de BD → 500, checkout unpaid → cap
pla, checkout pagat → upsert amb estat real + rebu amb import real,
subscripció antiga cancel·lada a Stripe, canvi de pla via Portal deduït del
price), cancelació/reactivació (401, DEMO només estat local, REAL via Stripe,
404 res a reactivar), eliminació de compte (400 sense confirmar, cancel·la a
Stripe ABANS de borrar — ordre verificat, 502 i NO es borra si Stripe falla),
cuota atòmica (teaser sense sessió, consulta vàlida, 402 exhaurida), accés
(401 sense sessió, favorites 403 en FREE, /api/plans públic) i funcions pures
(isUniqueViolation, planFromPriceId, formatEurFromCents, highestVigentPlan,
subscriptionLocalData, coherència de preus PLANS↔i18n↔rebuts).

### Verificació executada
- `bun test tests/` → **47 pass, 0 fail** (inclou la suite prèvia unit.test.ts).
- `next build` → compila, TypeScript sense errors, 3 Serverless Functions.
- `npm run lint` → 14 avisos `react-hooks` PREEXISTENTS de la línia base v22
  (carousel/MapView/PanelView/use-user-plan — regles noves de Next 16);
  v23 no en introdueix cap (verificat amb git stash). Es revisaran fora
  d'aquesta auditoria per no tocar UI en funcionament.
- **NO validat**: la integració REAL amb Stripe (cal Test Mode amb claus
  STRIPE_* reals i un webhook configurat). Els tests simulen respostes de
  Stripe; això no substitueix la prova end-to-end en Test Mode.

## v22 — 2026-11-05 · Fase 1 de subscripcions (user_subscriptions + subscription_usage + RLS) sense tocar el correu

### Encàrrec i adaptació d'arquitectura (sense reconstruir res)
L'encàrrec demanava Vite + Supabase Auth + Edge Functions + RLS policies, però
amb la regla explícita «conserva el projecte i el seu disseny, no el
reconstrueixis». S'ha implementat LA MATEIXA GARANTIA sobre el stack real del
projecte (Next.js serverless + auth JWT pròpia + Prisma sobre PostgreSQL de
Supabase). Firebase: **cap referència** (verificat amb grep sobre tot el repo).

### Equivalències implementades
- `supabase.auth.getUser()` ↔ `requireUser()` (auth.ts): JWT httpOnly signat
  (HS256) + verificació a la BD en CADA petició (usuari existent, actiu,
  tokenVersion vigent) + pla/rol FRESCOS. L'usuari mai es confia des del client.
- Edge Functions ↔ rutes de servidor (`/api/subscription/*`, `/api/stripe/*`)
  amb la mateixa frontera de confiança (Vercel serverless en comptes de Deno).
- RLS ↔ doble capa: (1) la migració v22 habilita `ROW LEVEL SECURITY` a TOTES
  les taules de `public` — el rol anon/authenticated de Supabase (la clau anon
  és pública) queda sense cap política → DENY total via PostgREST; l'app
  connecta com a propietari i no pateix res; (2) NO existeix cap ruta que
  accepti plan/status/stripe_* del client (verificat per auditoria de grep:
  els únics escriptors són el webhook signat, el flux DEMO env-gated i
  cancel/reactivate, que mai eleven).
- Stripe com a font de veritat ✓ (ja existia, ampliat), mai premium per URL ✓.

### Nou a l'esquema (migració `20261105150000_subscriptions_fase1`, ADDITIVA i idempotent)
- `Subscription` (+3 columnes): `currentPeriodStart`, `billingInterval`
  (month|year), `cancelAtPeriodEnd`. L'equivalent `user_subscriptions` és la
  taula `Subscription` existent (ampliada, NO duplicada — una sola font de veritat).
- Taula nova `SubscriptionUsage` (equivalent `subscription_usage`):
  userId + usageType (DETAIL_QUERY|EXPORT_CSV|PDF_REPORT|...) + usageMonth
  ("YYYY-MM" UTC) + usageCount, clau única (userId, type, month), CHECK de format.
- **UNA única subscripció vigent per compte**: deduplicació segura a SQL (les
  actives sobrants passen a `superseded`, historial mai esborrat) + índex
  ÚNIC PARCIAL `("userId") WHERE status IN ('active','trialing')` — cap
  carrera (demo ni webhooks) hi pot escapar.
- `EmailLog` / sistema de correu: **ZERO canvis** (requisit explícit).

### Nou al backend
- `src/lib/subscription.ts`: estat de suscripció per al hook, `recordUsage`
  (upsert atòmic, mai llança), `subscriptionLocalData` (mapa Stripe→BD),
  mapping free|premium|pro_agents ↔ FREE|PREMIUM|PRO.
- `GET /api/subscription` — estat complet (401 sense sessió).
- `POST /api/subscription/cancel` — cancel·lació PROGRAMADA a final de període
  (manté l'accés fins `currentPeriodEnd`); amb Stripe real crida l'API de
  Stripe i sincronitza; amb DEMO només estat local. 5/min per usuari.
- `POST /api/subscription/reactivate` — desfés la cancel·lació programada.
- Webhook Stripe: nou cas `customer.subscription.created` (sincronitza subs
  creades fora del checkout, dedueix l'usuari del customer) i els casos
  updated/deleted ara sincronitzen període, interval, price i
  cancelAtPeriodEnd. Idempotència StripeEvent intacta.
- `/api/lookup`: registra `recordUsage(DETAIL_QUERY)` (mai bloqueja la consulta).
- `/api/account` DELETE (RGPD): també purga `SubscriptionUsage`.
- checkout: preus amb els noms canònics del encàrrec
  (`STRIPE_PREMIUM_PRICE_ID`, `STRIPE_PRO_AGENTS_PRICE_ID`) amb fallback als
  antics (`STRIPE_PRICE_PREMIUM/PRO`).

### Nou al frontend (disseny intacte, tot additiu)
- `src/hooks/use-user-plan.ts` — `useUserPlan()` amb EXACTAMENT els camps del
  encàrrec: planType, subscriptionStatus, isFree, isPremium, isProAgents,
  hasPremiumAccess, hasProAgentsAccess, currentPeriodEnd, cancelAtPeriodEnd,
  subscriptionCount, monthlyDetailedQueriesUsed, loading (+refresh()).
- Panell → Facturació: tarjeta «Subscripció vigent» (estat, fi de període,
  consultes del mes) amb accions Cancel·lar (a final de període) / Reactivar.
  Sense Stripe configurat mostra clarament «Mode proves».

### Verificació
- `npx prisma validate` ✓ · `next build` ✓ (Next 16.4.3 + Turbopack; 3
  Serverless Functions: catch-all + health + webhook — límit Hobby intacte).
- Auditoria d'escriptors de plan: cap ruta de client pot pujar de pla.
- Dispatcher regenerat: 49 rutes (+3 noves).

### Per connectar Stripe més endavant (sense tocar codi)
1. `STRIPE_SECRET_KEY` (clau secreta, NUNCA al frontend ni amb prefix VITE_).
2. `STRIPE_WEBHOOK_SECRET` del endpoint
   `https://www.preureal.com/api/stripe/webhook` (els 6 events del encàrrec ja
   estan gestionats).
3. `STRIPE_PREMIUM_PRICE_ID` + `STRIPE_PRO_AGENTS_PRICE_ID` (prices recurrents
   al panell de Stripe).
4. Activar el Customer Portal a Stripe (Settings → Billing → Customer portal).
5. `DEMO_CHECKOUT=false` (i mai true en producció real).

## v21 — 2026-11-05 · Auditoria completa: diagnòstic del correu EN VIVO + neteja del repo

### Diagnòstic (probes reals contra producció, www.preureal.com)
- `/api/health` → **200, `database.ok:true`** i `email: "resend"` → **les variables
  d'entorn NO són la causa**: la BD connecta des del runtime de Vercel i Resend
  està configurat.
- `GET /api/cron/emails` → **500 amb cos buit**: la primera consulta amb les
  columnes noves (`attempts`, `nextRetryAt`, `type`) rebenta → **la migració
  `20261104120000_emaillog_telemetry` SEGUEIX sense aplicar a Supabase** (el
  deploy v20 va quedar penjat i mai la va aplicar).
- `POST /api/auth/register` → **200 amb usuari creat**: el registre SÍ escriu a
  `User`. El que falla és el correu: `sendMail` no pot crear la fila outbox a
  `EmailLog` (columnes inexistents) → **cap correu surt** i per això no apareix
  cap fila nova (l'error s'empassa dins de `after()`).
- DNS: `db.tkbjifmflpxqszaozqlw.supabase.co` resol **NOMÉS IPv6**. Si el
  `DATABASE_URL` de Vercel usa el host directe, el **BUILD** de Vercel (sense
  IPv6 sortint) es queda penjat a `prisma migrate deploy` — explica el «deploy
  infinit». Recomanació: Session Pooler d'Supabase (IPv4) i/o aplicar el SQL a
  mà; afegir `connect_timeout=15` a la URL perquè un fallo sigui ràpid i clar.
- Catastro `Consulta_DNPPC` → **404 des de producció**: la integració de
  l'any de construcció està degradada (compte: `yearBuilt=null` amb
  degradació encallada; el mapa continua funcionant amb ICGC, que és OK).
  PENDENT P2: revisar el servei (pot haver canviat l'endpoint).

### Correccions i neteja (sense tocar funcionalitat existent)
- **register**: WELCOME + VERIFY ara s'envien EN PARAL·LEL (`Promise.allSettled`)
  dins de `after()` — si el primer espatlla el temps reservat (maxDuration 60),
  el segon ja no surt perjudicat.
- **Neteja del repo** (arxius morts de millors èpoques, res que afecti el ZIP
  de Vercel): eliminats AUDIT.md, DEPLOY.md, INFORME_FINAL.md, TASKS.md,
  PROJECT_CONTEXT.md, MIGRATION_ZAI.md, COM_APPLICAR_ELS_CANVIS.md,
  AUDITORIA_FASE1_REGISTRE.md, CORRECCIONS_P1.md, Caddyfile, examples/,
  mini-services/; i des-trackejada la infraestructura local del sandbox
  (`.localpg/` 184 MB, `skills/`, `download/`, `upload/`, `tool-results/`,
  `.zscripts/`) via .gitignore.
- `make_zip.py`: whitelist Vercel sense CORRECCIONS_P1.md; mode --full sense
  els docs eliminats.

### Pendents de l'usuari (panells, sense codi) — ORDRE CRÍTIC
1. **Supabase → SQL Editor**: enganxar i executar el SQL de
   `prisma/migrations/20261104120000_emaillog_telemetry/migration.sql`
   (idempotent). **Sense això no surt CAP correu** — és el problema real.
2. Vercel → Deployments: **Cancel**·lar el deploy penjat i **Redeploy**.
3. Si el build torna a penjar-se a `prisma migrate deploy`: canviar
   `DATABASE_URL` al **Session Pooler** d'Supabase (IPv4, port 5432) i
   afegir `&connect_timeout=15` (o `?connect_timeout=15` si és el primer
   paràmetre) a la URL.
4. Definir `NEXT_PUBLIC_SITE_URL=https://www.preureal.com`, `CRON_SECRET`,
   verificar el domini a Resend i posar `MAIL_FROM=hola@preureal.com`.

## v20 — 2026-11-04 · Correcció: la migració v19 mai s'havia aplicat a la BD + domini mort

### Diagnòstic (verificat EN VIVO contra producció)
- Síntoma de l'usuari: «he fet un registre nou i no ha arribat a la base de
  dades» (mirava EmailLog a Supabase, la taula que calia vigilar després de
  la correcció v18).
- Probes de producció (`www.preureal.com`):
  - `POST /api/auth/register` → `{"ok":true,...}` — **el registre SÍ crea la
    fila a `User`** (provat amb un usuari de diagnòstic). L'app i la BD són
    sanes (`/api/health` → `database.ok`).
  - `GET /api/cron/emails` (ruta que només existeix a v19) → **HTTP 500 buit**:
    la primera consulta amb columnes noves (`attempts`, `nextRetryAt`, `type`)
    revienta → **la migració `20261104120000_emaillog_telemetry` NO estava
    aplicada a Supabase**. Conseqüència: `sendMail` no pot escriure l'outbox
    a EmailLog → **cap correu surt i cap fila nova apareix** (el fallo
    s'empassa en silenci dins de `after()`), i per això «no arribava res».
  - DNS públic: **`preureal.cat` = NXDOMAIN** (registrat però sense registres
    A). El fallback de `site-url.ts` i els exemples d'env apuntaven allí:
    tot enllaç de verificació hauria estat un enllaç mort.
- `preureal.com` (comprat a Vercel) SÍ funciona: apex → 308 →
  `https://www.preureal.com` — domini canònic des d'ara.

### Correccions
- **Migracions idempotents** (`IF NOT EXISTS` a taules/índexs/columnes i
  `DO $$ EXCEPTION WHEN duplicate_object` a les FK): es poden aplicar dues
  vegades o sobre una BD creada amb `db push`/SQL a mà sense error.
- **El build aplica les migracions automàticament**:
  `build = check_repo && prisma generate && prisma migrate deploy && next build`
  — mai més un desplegament sortirà amb la BD desactualitzada.
- **`site-url.ts`**: fallback `https://preureal.cat` → **`https://www.preureal.com`**
  (els enllaços dels correus mai més no senyalaran a un domini mort).
- `.env.production.example` + `VERCEL.md`: `NEXT_PUBLIC_SITE_URL=https://www.preureal.com`,
  `MAIL_FROM` amb domini verificable a Resend (`hola@preureal.com`) i notes
  NXDOMAIN de `preureal.cat`.
- `scripts/make_migrations_idempotent.py`: eina que va generar el canvi
  (idempotent, es pot re-executar).

### Pendents de l'usuari (panel Vercel/Supabase, sense codi)
1. Aplicar la migració ja (SQL Editor de Supabase) o simplement desplegar v20
   (el build ho fa sol). Sense això, **cap correu sortirà**.
2. `NEXT_PUBLIC_SITE_URL=https://www.preureal.com` a Vercel.
3. Definir `CRON_SECRET` (el cron va respondre 500 sense Bearer: no definit).
4. Verificar `preureal.com` a Resend + `MAIL_FROM` — amb
   `onboarding@resend.dev`, Resend només deixa escriure a l'adreça pròpia del
   compte (HTTP 403 per a la resta).

## v19 — 2026-11-04 · Sistema de correu robust (P0/P1/P2 de l'auditoria)

### P0 — Seguretat
- **EmailLog ja no guarda tokens**: el cos es persisteix REDACTAT
  (`?token=...` → `?token=***`). El HTML real només viatja cap a Resend.
- **Purga històrica**: `scripts/scrub_emaillog_tokens.ts` (idempotent) redacta
  els cossos antics i esborra tokens pendents/caducats; el cron també fa de
  xarxa de seguretat cada dia.
- **Hash de tokens**: `EmailToken`/`PasswordToken` guarden el SHA-256 del token
  (`src/lib/token-hash.ts`); una filtració de BD no dona enllaços vius.
  Els tokens pendents anteriors al desplegament queden invalidats (es demanen
  enllaços nous — el scrub els esborra).
- **Consum atòmic de tokens**: verify confirm i password-reset confirm
  reclamen el token amb `updateMany` condicionat (`used: false → true`);
  només UNA petició concurrent guanya (abans hi havia finestra de carrera).

### P1 — Fiabilitat
- **Outbox durables**: EmailLog crea la fila ABANS d'enviar (status `pending`);
  si l'execució mor, el cron la recupera. Reintents inline amb backoff
  (3 intents: 0/800ms/3.2s) + reposició diària fins a 5 intents totals
  (només tipus no sensibles: WELCOME/RECEIPT/GENERIC; VERIFY/RESET → l'usuari
  demana enllaç nou).
- **Idempotència**: `idempotencyKey` únic — els rebots Stripe
  (`stripe-receipt:<id>`) mai es dupliquen en re-entregues del webhook.
- **Telemetría real**: `providerMessageId` (id de Resend), `sentAt` (quan
  Resend va ACCEPTAR), `attempts`. `status:"sent"` = acceptat pel proveïdor
  (la entrega en bandeja requeriria events de Resend — futur).

### P2 — Operació
- **Cron `/api/cron/emails`** (Vercel Cron diari via `vercel.json`, protegit
  amb `CRON_SECRET`): reintenta l'outbox, purga tokens caducats > 7 dies,
  aplica retenció d'EmailLog (`EMAILLOG_RETENTION_DAYS`, 90 per defecte) i
  redacta cossos llegats amb tokens.
- **Panell admin (Correus)**: mostra tipus, intents i id de Resend.
- **Un sol enllaç viu per compte**: en reenviar verificació o demanar reset,
  els tokens pendents anteriors s'anul·len en la mateixa transacció.
- **Rate limits per compte** a més dels per-IP: reenviament verificació
  3/5min per usuari; reset de contrasenya 3/h per correu.
- **Copys**: els enllaços s'anuncien «d'un sol ús» i la UI ja no promet
  l'enviament com a garantit («si no arriba, pots demanar un altre»).
- `receiptMail`: planName i amount escapats (defensa en profunditat).
- **Migració nova (ADITIVA)**: `20261104120000_emaillog_telemetry` — aplicar
  amb `npx prisma migrate deploy` ABANS del push.

## v18 — 2026-11-04 · Correcció CRÍTICA: els correus no sortien a producció

- **Causa (vista a Supabase → EmailLog com a «fetch: TimeoutError [23]»)**: tots
  els `sendMail` es llançaven com a promesa flotant després de respondre. Vercel
  congela la funció en tornar la resposta → el fetch a Resend queda a mig fer,
  el guardià d'abort el mata en descongelar-se i el correu MAI surt.
  Conseqüència visible: bloqueig «Verifica tu correo para continuar» en bucle.
- **Correcció**: tots els enviaments (registre: benvinguda + verificació,
  reenviament de verificació, restabliment de contrasenya, benvinguda Google,
  rebut Stripe) van ara dins de `after()` de next/server → Vercel manté la
  funció viva fins que els enviaments acaben (semàntica waitUntil).
- `mail.ts`: guardià per intent 15s → 20s, i el log d'error d'EmailLog inclou
  ara intent i durada en ms (`fetch [intento 1, 20004ms]: ...`) per diagnosticar
  de veritat: ~20000 ms = connexió congelada/penjada; pocs ms = DNS/socket/TLS.
- `maxDuration = 60` a les 5 rutes que envien correu (register, verify,
  password-reset, google/callback, stripe/webhook).

## FASE 1 — Registre i autenticació (cap canvi d'esquema de BD)

### Verificació del correu
- **Bloqueig server-side de les funcions principals** fins verificar el correu:
  `POST /api/lookup` respon `403 EMAIL_NOT_VERIFIED` amb correu emmascarat si
  `emailVerifiedAt` és null (els ADMIN hi escapen). Decisió al SERVIDOR.
- **Pantalla nova «Revisa el teu correu»** (`/#/revisa-correu`, component
  `CheckEmailView`): apareix després de registrar-se i en entrar sense verificar;
  amb botó de reenviament (genera token NOU de 24 h) i continuació al mapa.
- **Estats de verificació diferenciats** al panell: `ok`, `ja_usat` (enllaç ja
  utilitzat), `caducat` (24 h, amb reenviament), `invalid`.
- **Panell del mapa nou** quan una consulta està bloquejada per verificació:
  explica el motiu, deixa reenviar el correu i enllaça al compte.
- **Un sol enllaç viu**: en verificar, tots els altres `EmailToken` pendents del
  compte queden anul·lats; es registra l'esdeveniment `EMAIL_VERIFIED`.
- **Google OAuth coherent**: els comptes de Google neixen i queden verificats
  (`email_verified=true` s'exigeix al callback).

### Recuperació de contrasenya
- Confirmació de restabliment: ara **invalida tots els altres enllaços pendents**
  del compte (a més del ja existent ús únic + revocació de sessions).

### Sessions
- **Nou endpoint `POST /api/auth/sessions/revoke-all`**: tanca la sessió a tots
  els altres dispositius (incrementa `tokenVersion`) i renova la sessió actual.
- **Botó al panell (Seguretat)** + últim inici de sessió visible.

### Perfil
- **Nou endpoint `GET /api/account/activity`**: últims 20 esdeveniments del
  compte (registre, logins, verificació, restabliments, revocacions, consultes)
  + etiquetes llegibles bilingües al tab Seguretat.
- La verificació del correu es mostra també al resum del panell amb reenviament.

### Seguretat
- Nou helper `maskEmail()` (`jo***@gmail.com`) per a respostes compartides.
- Rate limits a les rutes noves (reenviament 3/5 min, revocació 5/5 min).
- Registe/login retornen `verificationSent` i `emailVerified` per dirigir la UI.

## Altres millores incloses (pre-Fase 1)

- **Guardia d'URL**: `src/lib/site-url.ts` + `layout.tsx` — un
  `NEXT_PUBLIC_SITE_URL` mal escrit (p. ex. `https//...`) ja no pot tancar el
  build; cau a `https://preureal.cat`. Testat amb el cas real de Vercel.
- **Alineació de l'arquitectura API** amb el desplegament v9: dispatcher únic
  (`/api/[[...path]]`) + 45 handlers a `src/app/api/_impl/` + `api/health` i
  `api/stripe/webhook` independents. Retirats duplicats de plantilla.

## Verificació

- `npm run build` ✓ (Next 16.4.3 + Turbopack + TypeScript)
- `npx tsx scripts/test_auth_fase1.ts` → 40/40 ✓ (estructural + unitats)
- `npx tsx scripts/e2e_auth_fase1.ts` → 32/32 ✓ (E2E real amb PostgreSQL:
  registre → bloqueig 403 → verificació → desbloqueig → sessions → reset → RGPD)
- Auditoria completa: `AUDIT.md` (secció V3)

## Desplegament (recordatori)

1. Aplicar `prisma/migrations/.../migration.sql` si la BD encara no té les taules
   (no cal cap migració NOVA per a aquesta versió).
2. Variables a Vercel: `DATABASE_URL` (pooler 6543), `AUTH_SECRET`,
   `NEXT_PUBLIC_SITE_URL` (amb `https://` complet!).
3. Correus: sense `RESEND_API_KEY` funcionen en sandbox (log d'admin).
