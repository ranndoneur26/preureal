# Millora v60 — motor de dades, funcionalitats i UI/UX (3 passos validats)

Encàrrec (2026-11-17): executar les millores proposades en **3 passos**, validant cada
pas i **sense trencar ni modificar el funcionament actual** de la web. Cada pas és un
commit atòmic amb la mateixa suite de guardes verda (els únics fallos són els
**14 únics fallos preexistents d'entorn** per manca de BD local, idèntics a v59).

## Pas 1 — Motor de dades (commit `feat(v60)`)

| Demanda | Solució | Fitxers |
| --- | --- | --- |
| Filtre d'atípics (IQR / z-score robust) abans de les gràfiques | `stats.ts`: IQR de Tukey (k=1,5, quartils tipus 7) + z-score robust mediana/MAD (3,5) + variant **ponderada** per mostres d'edifici (contractes com a pes). No-op garantit amb n<8 edificis o MAD=0 (municipis petits idèntics: zero regressió). Aplicat a la banda P25/50/75 del mercat registrat, amb traçabilitat («N valors extrems exclosos (filtre IQR)») | `src/lib/stats.ts`, `src/lib/indicators-data.ts` |
| Modelatge predictiu 12–24 mesos | `forecast.ts`: regressió lineal OLS sobre la sèrie anual oficial + bandes ±1,28σ, R², flag `volatile` (|pendent|>15 %/any), mai negatius, null amb <4 anys. Exposat a `GET /api/analisi/muni/:code` com a `rent.forecast` amb font etiquetada «NO és una previsió ni una valoració oficial» | `src/lib/forecast.ts`, `src/lib/analisi.ts` |
| Cau de consultes pesades | `cache.ts`: Map per procés amb TTL + **coalescing** (50 peticions concurrents → 1 query) + evicció LRU/FIFO + estadístiques. Aplicat a `getMuniIndicators` (clau muni+preu), `loadRelevantObservations` i `getMuniAnalisi` (muni+idioma, 10 min). Sense Redis ni dependències | `src/lib/cache.ts` |

Coeficients del motor de valoració **intactes** (guarda S5: `VAL_REF_M2 = 85`,
`VAL_BETA_SUPERFICIE = 0.8`). Tests: `tests/stats_v60.test.ts` (25).

## Pas 2 — Funcionalitats (commit `feat(v61)`)

| Demanda | Solució | Detalls |
| --- | --- | --- |
| Exportació .csv/.xlsx massiva per comarca o municipi | Generador **XLSX propi sense dependències** (`xlsx.ts`: ZIP stored + CRC32 + OOXML mínim; evita les GHSA del paquet npm `xlsx`) + NOU `GET /api/export/dataset` (filtres `comarca` / `province` / `muni`, `format=csv|xlsx`, pla PRO, rate limit 10/min, cau 10 min) + `format=xlsx` a `GET /api/export/[code]` i `POST /api/comparator/export` (mateix gating PRO; CSV per defecte) + secció «Exportació de dades (Pro)» al panell amb filtre comarca/província | `src/lib/xlsx.ts`, `src/app/api/_impl/export/dataset/route.ts`, `PanelView.tsx`, dispatcher regenerat (97 rutes) |
| Alertes quan s'actualitzen els índexs del municipi d'interès | Nova secció 0.6 al cron diari `/api/cron/emails`: quan `rentPeriod` avança (p. ex. 2025→2026) s'avisa els usuaris amb `alertsEnabled` + verificats + Premium/Pro que tenen el municipi als preferits. Idempotent via `PriceAlertLog` kind `DATA` per període; la primera passada només ancla (mai rajada d'avisos). Plantilla bilingüe `dataUpdateMail` | `cron/emails/route.ts`, `mail.ts` |
| Comparador multi-municipi (matriu 3–4+ side-by-side) | Commutador **Fitxes \| Matriu** (per defecte fitxes = zero regressió) amb taula d'11 variables clau: lloguer vigent, variació interanual, mediana històrica, contractes, població, densitat, % cens, % parc + renda llar / esforç / IPVA amb gating avançat del servidor (cadenat sense valor a pla gratuït). Millor/pitjor per fila en verd/ambre controlats, accessible (`role=tablist`, `aria-selected`) | `ComparadorView.tsx` |

Tests: `tests/features_v60.test.ts` (22), incloent un lector ZIP que valida la
signatura, el CRC32 i les parts OOXML de cada fitxer generat.

## Pas 3 — UI/UX (commit `feat(v62)`)

| Demanda | Solució |
| --- | --- |
| Jerarquia tipogràfica als panells de mètriques | `ui/kpi.tsx` (`KpiCard`): xifra en display numèric (`font-black tracking-tight tabular-nums`), etiqueta neutra en majúscules petites, xips semàntics de variació. Aplicat a AnalitzaReport (compact 3 + full 4), EstimaReport, ValuationPanel i DemografiaPanel |
| Micro-interaccions i esqueletos | `ui/skeletons.tsx` (`Skeleton`, `KpiGridSkeleton`, `ChartSkeleton`, `PanelSkeleton`) sobre el shimmer `.pr-skeleton` del design system. Consumidors: RentalSharePanel, DemografiaPanel, EntornPanel, ComparadorView (en comptes del «…» mut) i AnalisiView — tots amb `role="status"` + `aria-live="polite"` |
| Paleta cromàtica consistents | `chart-palette.ts`: `CHART_COLORS` (6 colors de marca), tokens neutres (grid/axis/pine/ember/stone), escala de renda compartida amb el mapa (llindars 550/700/850/1000) i `deltaTone` semàntic. Aplicat a LineChart, BarChart, ComparadorView, AnalisiView, DemografiaPanel i MapView — **zero hex inline als consumers** |
| Formularis en passos progressius | `forms/Stepper.tsx` compartit (`Pas X de N` + barres + `aria-live`). AnalitzaForm passa a 2 passos (1 Ubicació: e-mail + municipi + adreça + mapa · 2 Dades de l'anunci) **sense trencar el contracte v48** (sense `<select>`, sanejat del borrador intacte, email continua sent la primera casella, textos del submit idèntics); EstimaForm reutilitza el mateix component (sense barres duplicades). El contenidor del mapa sempre al DOM (Leaflet s'acopla una sola vegada) |

Tests: `tests/uiux_v60.test.ts` (17).

## Validació per pas

| Pas | tsc | eslint | Suite (únicament fallos nous) | next build | Navegador |
| --- | --- | --- | --- | --- | --- |
| 1 | ✓ | ✓ | 296 pass · 14 únics preexistents | ✓ | — |
| 2 | ✓ | ✓ | 296 pass · 14 únics preexistents | ✓ | — |
| 3 | ✓ | ✓ | 313 pass · 14 únics preexistents | ✓ | portada, /analitza (pas 1 + mapa), /comparador, /com-funciona, gating 401 del dataset, 0 errors de consola |

Nota: el sandbox de desenvolupament no té PostgreSQL; els 14 fallos únics
(email-first D1-D7, plans×2, security×5) són exactament els de HEAD v59 i
requereixen BD. Tota la lògica nova és pura o mockejada i queda coberta pels
+64 tests nous.
