# Investigació: transport públic de Catalunya (GTFS/GTFS-RT) — 2026-11-17

> **SEGONA RONDA COMPLETADA (17-11-2026):** el GTFS AGREGAT de T-mobilitat
> (l'única font que cobreix els 947 municipis) s'ha verificat completament —
> descàrrega real de 94 MB, 41.449 parades, 198 operadors, **919/947
> municipis amb parada a ≤2 km del centre**. Matriz completa de fonts i
> resultat de la cobertura: **`docs/fuentes-transport-matrix.md`** +
> `docs/gtfs-cobertura-analisi.json`. La integració (T1-T3) segueix pendent
> d'aprovació.

Objectiu del PROMPT MASTER: investigar i integrar transport públic al mapa
Leaflet i a «Serveis i qualitat de l'entorn» (EntornPanel). **Aquest document
és la FASE D'INVESTIGACIÓ (ronda 1)**: totes les fonts s'han PROBAT amb
peticions reals el 2026-11-17 des d'aquest entorn. La integració es proposa
per fases i queda pendent d'aprovació (regles 2 i 8 del prompt: res de no
verificat es presentarà com a fet; decisions ambigues → opció conservadora
documentada).

---

## 1. Fonts provades (resultats reals)

| # | Font | Petició real | Resultat | Veredicte |
|---|---|---|---|---|
| 1 | Catàleg Socrata gencat (`analisi.transparenciacatalunya.cat`) | `GET /api/catalog/v1?q=gtfs` | 200 OK. Trobats: **FGC - Actualitzacions de viatge GTFS_Realtime** (`9y7v-5ajc`), **FGC - Posicions de vehicles GTFS_Realtime** (`y6iv-pycv`), **FGC - Alertes de servei GTFS_Realtime** (`6ddf-pzqd`), parades/línies/horaris d'autobús interurbà (`bca2-b4i3`), estat del servei Rodalies (`ups9-rjhy` i per línia). Llicència declarada: «See Terms of Use»; atribució: FGC / Departament de Territori | **VERIFICAT** (catàleg) |
| 2 | Dades per API de files Socrata | `GET /resource/9y7v-5ajc.json?$limit=2` · `y6iv-pycv` · `bca2-b4i3` · `ups9-rjhy` | Error JSON: **«no row or column access to non-tabular tables»** en TOTS | **VERIFICAT que NO són tabulars** |
| 3 | Adjunts descarregables | `GET /api/views/9y7v-5ajc.json` → `attachments` | `attachments: []` també a `bca2-b4i3`; `displayType: href` sense `viewUrl` resolta | **VERIFICAT que NO hi ha payload pel portal** |
| 4 | TMB (`api.tmb.cat`) | `GET /v1/ibus/stops/2775` sense clau | **401** — cal registrar-se i obtenir clau d'API | **VERIFICAT**: requiereix clau (server-side) |
| 5 | AMB (`ambmobilitat.cat/OpenData/OpenDataGoogleTransit.xml`) | GET amb timeout 25 s | **Connection timed out** des d'aquest entorn | **NO VERIFICAT** (pot ser geobloqueig o feed mort; cal repetir des d'una altra xarxa) |
| 6 | Cerca «ATM horaris» i «rodalies gtfs» al catàleg | `GET /api/catalog/v1?q=…` | Sense datasets GTFS estàtics de ATM; Rodalies només estat de servei (no GTFS) | **VERIFICAT**: el GTFS estàtic de Rodalies/ATM no és al portal Socrata |

**Conclusió honesta:** els datasets EXISTEIXEN i estan catalogats amb
atribució i termes d'ús, però **el payload real (binari GTFS/GTFS-RT) no és
descarregable via API oberta del portal Socrata de la Generalitat**. La
integració real exigeix canals de cada operador: TMB (clau d'API — verificat
que la demana), AMB (registre — NO VERIFICAT), FGC (petició formal / termes
d'ús). Res es pot integrar avui «connectant i ja» sense acord ni clau.

## 2. Llicències i límits (el que el catàleg declara)

- **FGC**: llicència «See Terms of Use» — cal revisar els termes ABANS de
  redistirbir cap dada a la UI. Atribució obligatòria.
- **Departament de Territori** (autobús interurbà, Rodalies): «See Terms of
  Use» igualment; el dataset de parades té darrera actualització registrada
  al 2017 (possiblement desactualitzat — verificar vigència abans d'usar-lo).
- **Socrata**: límits de rate per IP (app token opcional). Si s'integrés via
  Socrata, el proxy propi hauria de portar caché + paginació defensiva.
- **TMB**: termes al seu portal de dev; la clau MAI al frontend (regla 5).

## 3. Proposta d'integració per fases (pendent d'aprovació)

**Principis fixos** (regles del repo): totes les crides a tercers van
SERVER-SIDE amb proxy propi (`/api/entorn/transport` o similar); clau mai al
client; caché en BD/Servidor; atribució visible a la UI (com l'ICGC CC-BY al
mapa); degradació elegant si la font cau (el panell diu «no disponible» i mai
no inventa — mateix patró que DemografiaPanel v39/v50); res no bloqueja mai
el render del mapa.

- **Fase T1 — «Serveis de l'entorn: transport» (recomanada, risc baix)**
  A l'EntornPanel de la fitxa d'edifici, nova secció «Transport públic proper»:
  parades (metro/bus/tren) amb distància a peu a partir del POI classifier
  existent (`classifyPoi` d'analitza.ts) i de la font de parades que es
  verifiqui (la de Territori quan es confirmi payload vigent, o OSM Overpass
  com a alternativa totalment oberta ODPbL — pendents de provar en una
  segona ronda d'investigació). Sense temps real: horaris només «a X min a
  peu». Esforç M.
- **Fase T2 — GTFS estàtic setmanal**: import cron (patró ine/rental-share
  amb budget) de stops/routes de l'operador obtingut per canal oficial;
  indexat per bbox; el mapa pot mostrar parades com a capa opcional
  (activable, per no pesar). Esforç M-L.
- **Fase T3 — GTFS-RT**: trip updates/alertes amb clau per operador al
  servidor, caché curta (30-60 s), rate limit, mai per render del mapa.
  Esforç L (operació continuada).

## 4. Segona ronda d'investigació proposada (abans d'aprovar T1)

1. **OSM Overpass API** (parades amb llicència ODbL, sense clau): provar
   `https://overpass-api.de/api/interpreter` amb bbox petit — candidata
   més sana per T1 que els catàlegs buits de Socrata.
2. Reintent AMB des d'una altra xarxa/IP (timeout actual NO VERIFICAT).
3. Contacte/registre TMB + termes d'ús FGC (decisió de negoci, no tècnica).
4. Confirmar vigència del dataset `bca2-b4i3` (2017) si es vol usar.

## 5. Decisions conservadores preses (regla 8)

- NO s'integra res avui: cap dataset té payload accessible verificat.
- NO s'afegeix cap dependència ni cap crida de tercers al client.
- La investigació queda documentada amb evidència reproducible i el pla T1-
  T3 esperada aprovació explícita.
