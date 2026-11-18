# Buscador invers — zones que compleixen l'índex de referència (v67)

Documentació tècnica del «buscador invers» de la portada: trobar zones
(seccions censals) on el **preu real del lloguer compleix l'índex de
referència**, amb estat **ZMRT** (Zona de Mercat Residencial Tensionat) del
municipi, taula ordenable i CTA cap al cercador directe.

## 1. Què és i com tanca el cercle amb el buscador directe

| Flux | Eina | Ubicació |
|---|---|---|
| **Invers** (nou) | «Buscador invers: zones que compleixen l'índex» | Portada (`LandingView`, pestanya 1 de la targeta) |
| **Directe** (existent, intacte) | «Consulta el preu real registrat» (adreça o refcat) | `/#/analitza` (eina completa, mapa ICGC) i `/#/consulta` (mòdul ràpid mogut de la portada) |

El CTA de cada zona — «**Verificar un edifici concret en aquesta zona**» —
navega a `/#/analitza?muni=<codi6>&mn=<nom>` amb el municipi **prefilat**
(prop additiu `initialMunicipi` d'`AnalitzaForm`, v67). Tanca el cercle
invers → directe. Sense els paràmetres, cap canvi de comportament.

## 2. Esquema de dades (PostgreSQL + PostGIS)

DDL de referència: [`pipeline/sql/002_zones_buscador_invers.sql`](../pipeline/sql/002_zones_buscador_invers.sql)
— tres taules noves a l'esquema `geo`, **additives** (mai toquen les taules del
app ni les `geo_*` del pipeline F1–F3):

| Taula | Contingut | Clau |
|---|---|---|
| `geo.municipis` | estat ZMRT (DOGC), comarca, cobertura del pilot, centroide | `muni5` (INE 5) |
| `geo.seccions_censals` | secció censal amb **geometria** `geometry(MultiPolygon,4258)` (Idescat bseccen; NULL fins la càrrega cartogràfica) + `wkt_fallback` sense PostGIS | `id_seccio` (CUSEC) |
| `geo.dades_lloguer_agregades` | `preu_real_mitja_eur_m2`, `index_referencia_eur_m2`, `percentatge_compliment`, `nivell_dada`, `compliment_metode` | `id` = `<id_seccio>_<any>` |

Índexs: `idx_dades_muni_compliment (muni5, percentatge_compliment DESC NULLS LAST)`
— l'índex de la consulta del buscador; GIST a `seccions_censals.geom`.

## 3. Fórmules (les mateixes que la resta del producte)

```
m² mitjà municipal          = Σ(sup_media_m2 · num_viviendas) / Σ(num_viviendas)   [Catastro, via dim F2]
índex de referència €/m²·mes  = fiança mitjana oficial (€/mes, Incasòl; o ref. de comarca ESTIMACIÓ) ÷ m² mitjà
preu real secció €/m²·mes     = Σ(renta_m2_mes · num_viviendas) / Σ(num_viviendas)  de la secció
% compliment secció           = 100 · Σ(num_viviendes amb renta_m2_mes ≤ índex) / Σ(num_viviendas)
```

Verificació de la conversió amb dades reals: Barcelona 1.134,6 €/mes ÷ 97,9 m²
mitjà ≈ 11,59 €/m²·mes — consistent amb l'àncora del pipeline F2 (11,622).

**Nivells de dada (honestitat):**
- `nivell_dada='MUNICIPAL'` + `compliment_metode='QUOTA_EDIFICIS_ESTIMADA'`:
  mentre Incasòl no publiqui el fitxer seccional, el preu per secció és
  l'àncora municipal + residu hedònic d'illa (F2) i el compliment és una
  **estimació** marcada (`estimacio=true`).
- Quan el fitxer seccional arribi (PASO 3 de la F2, ja implementat via
  `f1 --incasol-seccional-csv`): el loader passa a `nivell_dada='SECCIONAL'`
  + `compliment_metode='CONTRACTES_REALS'` amb el % real de contractes per
  secció. **Zero canvis de DDL ni d'API** (camp `nivell_dada` previst).

Higiene RGPD del loader: seccions amb `< 5` edificis no es publiquen
(`MIN_EDIFICIS_SECCIO`).

## 4. API — `GET /api/zones?muni=<5|6 dígits>`

Implementació: `src/app/api/_impl/zones/route.ts` + capa de lectura
`src/lib/zones.ts` (patró `geo/illes`: rate limit 30/min IP, cache 10 min,
`Cache-Control: public, max-age=600, stale-while-revalidate=86400`).

Consulta optimitzada (usa `idx_dades_muni_compliment`; el planner no ordena en memòria):

```sql
SELECT d.id_seccio, s.nom, d.preu_real_mitja_eur_m2, d.index_referencia_eur_m2,
       d.percentatge_compliment, d.nivell_dada, d.compliment_metode, ...
FROM   geo.dades_lloguer_agregades d
JOIN   geo.seccions_censals s ON s.id_seccio = d.id_seccio
WHERE  d.muni5 = $1
ORDER  BY d.percentatge_compliment DESC NULLS LAST,
          d.preu_real_mitja_eur_m2 ASC NULLS LAST
LIMIT  2000;
```

Resposta (resum): `municipi`, `zmrt {tense, llista, font, publicacio,
resolucionsVigents}`, `indexReferencia {valorEurMes, period, municipal,
estimacio, font, eurM2}`, `cobertura: 'PILOT_AMB'|'FORA_ABAST_PILOT'`,
`n_zones`, `zones[]` (mai geometria; només atributs + centroide),
`nota_rgpd`, `nota_estimacio`, `disclaimer`.

Errors: `400 BAD_MUNI` · `404 NOT_FOUND` · `503 DATA_NOT_READY` (taules no
carregades — degradació honesta, mai cobertura simulada) · `200` amb
`cobertura:'FORA_ABAST_PILOT'` i `zones:[]` per a municipis fora del pilot.

Ruta NOVA i aditiva al dispatcher (104 rutes, regenerat amb
`python3 scripts/gen_api_dispatcher.py`).

## 5. RGPD

- **Agregació mínima = secció censal** (unitat estadística oficial
  Idescat/INE, milers de llars): mai dades de contracte individual ni
  d'edifici no anonimitzat. La taula d'edificis (`geo.dim_…`) no es consulta
  en cap ruta pública del buscador.
- La geometria de secció mai surt al payload (només centroide), patró
  `geo/illes`.
- Nota RGPD a la resposta de l'API i a la UI.

## 6. Runbook

```bash
# 1) càrrega local o de producció (mai imprimeix credencials; només host/db)
export DATABASE_URL="postgres…neon.tech…?sslmode=require"
python3 pipeline/f4_zones_buscador.py                # [--seccions-shp bseccen.gpkg]

# 2) verificació
curl "https://www.preureal.com/api/zones?muni=08019" | jq '.zmrt, .indexReferencia, .n_zones'
```

Idempotent (DROP+CREATE només de les 3 taules). Sortida resum: `f4_carga.json`.

## 7. Tests

`tests/zones_buscador.test.ts` (20 tests): Z1–Z8 API (validació, ordenació
SQL, cobertura honesta, 503, RGPD, sense geometria), D1–D3 DDL, L1–L2 loader,
U1–U7 UI/navegació (toggle semàfor, ZMRT, CTA, taula amb `aria-sort`, i18n
CA/ES, prefil additiu). Guardes v47/v56 evolucionades JUSTIFICADAMENT amb el
mòdul mogut a `/#/consulta` (mateixos textos, nova ubicació).

## 8. Limitacions honestes

- Cobertura de zones: **pilot geoespacial AMB** (municipis amb àncora
  municipal carregada). La resta de municipis mostra `FORA_ABAST` amb nota
  honesta; l'estat ZMRT cobreix els 947 municipis (DOGC).
- El compliment estimat compara l'estimació per secció amb l'índex municipal;
  no substitueix el % real de contractes (fitxer seccional pendent).
- Noms de barri/secció pendents de la càrrega cartogràfica Idescat
  (`nom` column ready); la UI mostra «Secció censal NNNNN».
