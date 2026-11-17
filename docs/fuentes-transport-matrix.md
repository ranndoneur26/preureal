# Matriz de fuentes de transporte verificadas — 2026-11-17 (segona ronda)

Entregable del BLOQUE D demanat pel propietari: **matriz de fuentes con
peticiones reales ANTES de tocar el mapa**. Complementa
`docs/gtfs-investigacio-transport.md` (ronda 1). Cap cambio destructivo:
aquest document NO toca el mapa ni l'EntornPanel — la integració queda
pendent d'aprovació.

**Mètode.** Totes les peticions s'han fet amb proves reals el 17-11-2026 des
d'aquest entorn: `curl` per API/fitxers i un navegador Chromium real (CDP)
per als portals amb protecció anti-bot (queue-it), registrant codi HTTP,
tamanys, llicències i payloads. El GTFS agregat s'ha DESCARREGAT i ANALITZAT
completament (41.449 parades × 947 municipis de `src/data/municipalities.json`).
Detall de xifres: `docs/gtfs-cobertura-analisi.json`.

---

## 1. Matriz de fuentes (verificació real)

| Font | Petició real (2026-11-17) | Resultat | Llicència / atribució | Actualització | Cobertura rural verificada | Veredicte |
|---|---|---|---|---|---|---|
| **T-mobilitat/CGIM — Oferta planificada de transport COMPLETA** (recomanada) | Portal oficial amb navegador real: fitxa tècnica «Oferta planificada de transport completa»; descàrrega `t-mobilitat.cat/opendata/static/download/WBL/` → **ZIP 94.039.246 bytes** descarregat i analitzat | 200 OK · **41.449 parades** (34.415 amb servei) · **2.453 rutes** · **208.004 serveis** · **198 operadors** (TMB 116 rutes, FGC, **Rodalies de Catalunya - Renfe**, AMB 140, interurbans Generalitat 946, EMT Tarragona, Lleida, Manresa, Vic, Figueres…) · modos: bus 33.334 parades, tren 455, metro 214, tram 107, taxi comunitari/demanda 392, funicular 9 | «Autorización según la ley 37/2007» (reutilización comercial i no comercial); atribució ATM/CGIM + operadors; també publicat al NAP (fichero 2060) i MobilityDatabase (mdb 2826) | **DIÀRIA** (fitxa oficial; data de creació 17-11-26) | **899/947 municipis amb parada a ≤1 km del centre i 919/947 a ≤2 km**; Vall d'Aran **9/9** (Vielha 238 m, Bossòst 207 m, Les 40 m…), **Sort 110 m** (Estació d'Autobusos), Puigcerdà (tren+bus), Amposta 27 parades; **28 municipis rurals petits sense parada a ≤2 km** (llista a l'annex) | **VERIFICAT COMPLET** (payload real) |
| **T-mobilitat — Oferta planificada SIMPLIFICADA** | Mateix catàleg: «dades sense duplicitats, una única versió per línia amb shape» | Catalogada; mateixa llicència i àmbit; NAP fichero 2059 | Igual (Ley 37/2007) | Diària | Igual al complet (mateix sistema agregat) | **VERIFICAT** (catalogat; recomanada com a base pel MVP per evitar duplicitats) |
| T-mobilitat — GTFS-RT (alertes + trip updates) | Catàleg del portal: «Alteracions de servei» i «Actualitzacions de viatge» GTFS JSON/PB, botons ACCEDEIX/DESCARREGA | Present al catàleg (payload RT no descarregat aquesta ronda) | Igual | Temps real | — | **VERIFICAT (catàleg)** — fase T3 futura |
| **NAP MIMTRANS** (transportes.gob.es, Punt d'Accés Nacional) | `GET /api/Fichero/download/2060` (complet) i `/2059` (simplificada) | **401 sense ApiKey** (`{"error":401}` de 25 bytes) — cal **ApiKey GRATUÏTA** amb registre (`/Account/SignIn` verificat); llicència a `/licencia-datos` | **LDA MITRAMS**: reutilització permesa per a fins comercials i no comercials (Ley 37/2007 + Ley 18/2015) | Diària | Mateix feed (és el canal oficial del mateix fitxer) | **VERIFICAT** — canal programàtic estable per al MVP (clau server-side) |
| MobilityDatabase (mirall) | `GET storage.googleapis.com/.../es-atm-autobuses-trains-complete-gtfs-2826.zip` | **404** (mirall `mdb-latest` caducat per aquest feed; metadades 2025-08-12) | — | — | — | **NO USABLE** com a canal (només índex de metadades) |
| **TMB** | `GET api.tmb.cat/v1/ibus/stops/2775` sense clau → **401**; `developer.tmb.cat` → 302 Keycloak (registre) | Cal clau gratuïta (server-side) per RT/iBus | Termes del portal dev | RT | — | **VERIFICAT** — només cal per fase T3 (el GTFS estàtic de TMB JA ÉS dins l'agregat: operador `TMB_` verificat) |
| **FGC** (dadesobertes.fgc.cat, Opendatasoft v2.1) | `GET /api/explore/v2.1/catalog/datasets/gtfs_stops/records?limit=2` | **200 OK amb payload real**: 305 estacions (Barcelona - Plaça Catalunya 41.3856/2.1687, Provença…); datasets gtfs_zip/gtfs_stops/gtfs_routes/gtfs_shapes/gtfs_agency | Termes Opendatasoft/FGC (revisar abans de redistribuir) | Diària | FGC = xarxa metropolitana+Vallès+Bages… | **VERIFICAT** — redundància útil (el GTFS de FGC JA ÉS dins l'agregat: `FGC_` verificat) |
| **TRAM** (opendata.tram.cat) | `GET /` → 200 (SPA); `GET /GTFS/download/` → **JSON `{"message":"There aren't any GTFS files generated."}`** | La plataforma existeix però **avui no genera fitxers GTFS** al seu canal propi | — | — | — | **VERIFICAT (canal buit)** — el tram ja és dins l'agregat (route_type 0: 5 rutes, 107 parades Trambaix/Trambesòs) |
| **Renfe** (data.renfe.com, CKAN) | `GET /api/3/action/package_search?q=gtfs` + descàrregues reals | **200 OK**: GTFS estàtic **Cercanías** `ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip` (**15,6 MB, Last-Modified avui 03:14 → diària**) i AV/LD `google_transit.zip` (690 KB); **GTFS-RT viu**: `gtfsrt.renfe.com/alerts.json` amb entitats reals (routeId 10T0001C1…) | CKAN Renfe (revisar termes) | Diària (estàtic) + RT | Rodalies tota Catalunya | **VERIFICAT** — el GTFS de Rodalies JA ÉS dins l'agregat (`ROD_1071`); canal propi útil per RT futur |
| **AMB** (ambmobilitat.cat XML) | `GET ambmobilitat.cat/OpenData/OpenDataGoogleTransit.xml` | **TIMEOUT (connexió penjada) en 2 intents** (13:19 i 13:24, 25 s cadascun) | — | — | — | **NO VERIFICAT** (2×) — prob. geobloqueig o feed mort; l'àrea metropolitana ja és dins l'agregat (`AMB_*`) |
| gencat Socrata (ronda 1) | Catàleg 200 OK; payloads «no row or column access to non-tabular tables» | El GTFS/RT no és descargable per API del portal | «See Terms of Use» | — | — | **VERIFICAT que NO hi ha payload** (mantenir com a índex) |
| **OSM Overpass** (fallback/creuament) | `POST overpass.kumi.systems/api/interpreter` bbox Vall d'Aran | **200 OK amb payload real**: 17 nodes (Vielha Central, Vado-Hospital, Es Bòrdes, Vilac, Pont d'Arròs, Aubert…) | **ODbL** — atribució © OpenStreetMap contributors obligatòria | Continua (comunitat) | Rural excel·lent (fins a nuclis de <100 hab.) | **VERIFICAT** — fallback sa; límits públics (~1-2 req/s); MAI res d'OSM sense atribució |

**Conclusió de la matriz:** el **GTFS agregado de T-mobilitat es, efectivamente,
la pieza clave** — és l'ÚNICA font que inclou els 947 municipis de Catalunya
(bus interurbà + urbà, Rodalies, Regionals, FGC, metro, tram, funiculars) en
un sol fitxer amb llicència de reutilització i actualització DIÀRIA. Les fonts
per operador (TMB/FGC/TRAM/Renfe/AMB) són redundants per a l'oferta estàtica
(ja dins l'agregat) i només aporten valor per al TEMPS REAL (fase T3).

---

## 2. Anàlisi de cobertura real (GTFS descarregat × 947 municipis del repo)

Font de la dada: script `scripts/gtfs_analisi.py` (distància haversine del
centre municipal de `src/data/municipalities.json` a la parada més propera,
amb modes i operadors reals). Resultats complets:
`docs/gtfs-cobertura-analisi.json`.

| Mètrica | Valor |
|---|---|
| Parades amb coordenades | **41.449** (40.944 location_type 0/1; 34.415 amb servei) |
| Rutes / serveis / operadors | 2.453 · 208.004 · 198 |
| Municipis amb parada ≤1 km del centre | **899/947 (94,9 %)** |
| Municipis amb parada ≤2 km del centre | **919/947 (97,0 %)** |
| Municipis sense parada a ≤2 km | **28** (pobles petits d'Anoia, Noguera, Conca de Barberà, Osona, Alt/Baix Empordà, Baix Camp…) — llista completa a l'annex JSON |
| Vall d'Aran | **9/9 municipis** amb parada ≤1 km (el pitjor: Vilamòs 1,0 km) |
| Proves del criteri d'acceptació | Barcelona 313 parades/1 km (metro+tren+bus) · Girona 162 · Lleida 114 · Tarragona 120 (EMT) · **Sort 110 m (bus)** — els 5 superats + Manresa 134, Vic 116, Amposta 27, La Seu 3, Puigcerdà 19 (tren+bus) |
| Mides per al futur ingest | ZIP 94 MB; stops.txt ~1,6 MB; shapes.txt 250 MB (NO cal per parades); **JSON compacte de parades estimat ~3,0 MB** (committable) |

**Solapaments/duplicitats:** el feed COMPLET és agregat i conté duplicats per
disseny (la fitxa oficial ho declara: «aquesta informació pot aparèixer
duplicada a més d'una font»). La versió SIMPLIFICADA el deduplica (una
versió per línia, amb shape). Per al MVP: usar la simplificada O deduplicar
per `stop_id`+coordinades en l'ingest.

---

## 3. Canal d'accés veritat (important per al MVP server-side)

1. **NAP MIMTRANS (recomanat)** — fitxer complet `download/2060`, simplificat
   `download/2059`, amb **ApiKey gratuïta** (registre a nap.transportes.gob.es,
   verificat). Sense anti-bot, llicència LDA clara. Clau SEMPRE server-side
   (regla 5).
2. **Portal T-mobilitat** — el mateix fitxer (`/opendata/static/download/WBL/`
   capturat). El portal té protecció anti-bot (queue-it + redirecció 303 per a
   clients sense capçaleres de navegador real: verificat amb curl → 303;
   amb Chromium real → 200). Per a ingest automàtic setmanal és més fràgil que
   el NAP; OK com a via manual de verificació.
3. **MobilityDatabase** — només metadades (mirall 404).

## 4. Proposta MVP (pendent d'APROVACIÓ — cap canvi tocat avui)

- **Ingest setmanal** (encara que el feed sigui diari) del GTFS SIMPLIFICAT via
  NAP (ApiKey server-side, cron amb budget com ine/rental-share) → normalitzar
  `stops.txt`+`routes.txt`(+`trips` per modos) a JSON compacte (~3 MB,
  committable) amb `stop_id`, nom, lat/lon, modes, operadors, línies.
- **API `/api/entorn/transport`** (patró `_impl`, rate-limit propi):
  `?lat&lng&r=500..1000` → parades dins el radi amb distància a peu i modes.
  Índex grid en memòria al primer ús (34k punts, <50 ms).
- **Capa Leaflet activable «Transport públic»**: icones per modo
  (bus/metro/tren/tram), radi 500-1000 m des de l'edifici seleccionat, popup
  amb nom, línies, modo i distància. Atribució visible: «T-mobilitat
  (ATM/CGIM) · operadors · Ley 37/2007 · © OpenStreetMap (si Overpass)».
- **Indicador a «Serveis i qualitat de l'entorn»** (EntornPanel): nº de
  parades i modos a 500 m, parada més propera i línies, amb font i període
  visibles (estil «cada xifra amb la seva font»).
- **Degradació elegant**: municipi sense cobertura → «sense dades de transport
  per a aquesta zona» (28 municipis documentats); mai mapa roto, mai dada
  inventada.
- **Fase 2 (només després d'aprovar el MVP)**: temps real (GTFS-RT
  T-mobilitat/NAP, iBus TMB, Renfe RT — totes verifiquades), GBFS AMBici i
  refugis climàtics com a capes «qualitat de l'entorn».

## 5. Annex — evidència de les peticions (reproduïbles)

- Portal amb navegador real (CDP): fitxa «Oferta planificada de transport
  completa» → àmbit «Cataluña», freqüència «Diaria», llicència «Autorización
  según la ley 37/2007», data de creació 17-11-26; descàrrega capturada
  `GET /opendata/static/download/WBL/` → 200, 94.039.246 bytes
  (`TMOB_GTFS_WSAGWBL.zip`).
- curl sense sessió → `HTTP/2 303` (gate rdwr/queue-it) — el portal exigeix
  navegador real; el NAP no.
- `HEAD ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip` → 200,
  15.621.401 bytes, Last-Modified 17-11-26 03:14.
- `GET nap.transportes.gob.es/api/Fichero/download/2060` → 401 (25 bytes).
- `GET dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/gtfs_stops/records?limit=2`
  → 200 amb 305 estacions.
- `GET gtfsrt.renfe.com/alerts.json` → 200 amb entitats reals.
- `GET opendata.tram.cat/GTFS/download/` → JSON «There aren't any GTFS files
  generated.»
- `POST overpass.kumi.systems/api/interpreter` bbox Aran → 17 parades.
- Anàlisi del ZIP: `scripts/gtfs_analisi.py` →
  `docs/gtfs-cobertura-analisi.json` (12 KB, committable).
