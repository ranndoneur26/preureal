# AUDITORIA — preureal.com — 2026-11-17

**Abast:** repo (`main` de v50 `4b9d1eb` a v53) + **producció verificada amb
peticions reals** el mateix dia + matriu de codi mort (2 passades de grep per
mòdul sobre 218 fitxers src) + `npm audit` + proves reals de les fonts
GTFS/Socrata. Cada hallazgo porta: **evidència** (fitxer:línia o petició),
**risc**, **proposta** i **esforç** (S/M/L).

**Veredicte global:** P0 = 0 · P1 = 0 obertes (**3 trobades i tancades al
moment a v51/v52**) · P2 = 16 accions. La base de seguretat, quota i privacitat
és sòlida i es va verificar EN VIU; el gruix del treball pendent és P2
(millora contínua).

---

## 0. Resum executiu

| Àrea | Estat | Notes |
|---|---|---|
| Protocolos/TLS/Cabeceres | **Sòlid** | TLS 1.3 + HSTS preload, CSP completa, XCTO/XFO/RP/PP verificats en viu |
| Auth i quota | **Sòlid** | Gate server-side verificat en viu (401 `REGISTRAT_PRIMER`), quota atòmica v23, TOTP+passkeys |
| Privacitat | **Sòlid** | 0 trackers (grep), CSP `connect-src 'self'`, consent granular sense res que consentir de tercers |
| Rendiment | Bo | HTML 40,3 kB → **9,4 kB brotli**; leaflet/qrcode/passkeys via `import()` dinàmic |
| SEO | Bo (corregit v51) | robots+sitemap+hub 947 slugs; títols doblats i hreflang corregits |
| Accessibilitat | Bo (millores v51) | `<html lang>` dinàmic ara també al restaurar idioma; mapa sense tecla nativa (limitació Leaflet) |
| Dependències | **Net** | 0 vulnerabilitats (v52: next 16.4.6); llicències totes permissives |
| Observabilitat | Bàsic | /estat amb sondes en viu; falta alertatge extern |
| Codi mort | **Netejat** | v51+v53: 1 fitxer + 9 claus i18n + 2 exports; 0 fitxers src sense referència |
| Lingüística ca/es | Neta | 0 castellanismes reals a ca, 0 catalanismes reals a es (auditor + greps) |

**Correccions aplicades durant aquesta auditoria** (commits atòmics):
- **v51** — `tailwind.config.ts` mort fora; 7 claus i18n huérfanes fora;
  paràgraf de zones tensades DUPLICAT a la portada (bug editorial confirmat:
  `t.tense.desc` renderitzat 2 cops — es manté el de la columna del títol);
  títols SEO doblats («… \| Preureal \| Preureal») a /estima, /analitza,
  /lloguer, /lloguer/[slug] ×3; «Faq»→«Preguntes freqüents»; hreflang ca/es
  cap a la mateixa URL eliminat (layout + /lloguer + /lloguer/[slug]);
  `<html lang>` també al restaurar idioma; doc-rot d'EstatView.
- **v52** — next 16.4.3→16.4.6 (advisory moderat `unstable_cache` tancat).
- **v53** — `DemoBlock<T>` i `EMAIL_FIRST_QUOTA_NOTE` morts fora.

---

## A. Protocolos i seguretat (peticions reals, 2026-11-17)

**Verificat EN VIU:**

| Comprovació | Resultat |
|---|---|
| `https://preureal.com/` | 308 → `https://www.preureal.com/` (Vercel) |
| `http://www.preureal.com/` | 308 → https |
| TLS | **TLSv1.3** `TLS_AES_128_GCM_SHA256` + `X25519MLKEM768` (híbrid post-quantum), HTTP/2, cert LE `www.preureal.com` fins 2027-02-02 |
| HSTS | `max-age=63072000; includeSubDomains; preload` (www, resposta 200) |
| CSP | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; frame-src/form-action → checkout.stripe.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; upgrade-insecure-requests` |
| XCTO / XFO / RP / PP | `nosniff` / `SAMEORIGIN` / `strict-origin-when-cross-origin` / `geolocation=(self), camera=(), microphone=()` |
| Compressió | GET amb `Accept-Encoding: gzip, br` → **`content-encoding: br`**, 40.329 B → 9.399 B |
| Cache HTML | `max-age=0, must-revalidate` + ETag + edge `x-vercel-cache: HIT` |
| API `/api/analitza` GET | 405 `{"error":"method_not_allowed"}` — mètodes explícits |
| API POST sense sessió | 401 `{"error":"UNAUTHENTICATED","code":"REGISTRAT_PRIMER"}` — el gate server-side del flux email-first funciona en viu |
| Preflight OPTIONS creuat | 204 **sense** `Access-Control-Allow-Origin` → el navegador bloqueja crides cross-origin a l'API (privacitat per disseny) |
| 404 | 404 correcte |

**Hallazgos:**

- **F-C1 (P2)** CSP amb `'unsafe-inline'` a script-src (hidratació Next sense
  nonce). Risc baix (no hi ha fonts externes de script), però un CSP amb nonce
  és més resistent. Proposta: avaluar nonces/hashes amb el suport de Next 16.
  Esforç M.
- **F-C2 (P2)** La resposta HTML inclou `access-control-allow-origin: *`
  (innocu per HTML sense credencials, però és soroll inconsistent amb l'API,
  que no emet ACAO). Proposta: treure la capçalera dels assets estàtics.
  Esforç S.
- **F-C3 (P2)** `robots.txt` disallow `/api/admin` i `/api/export` — correcte
  com a senyal, però la protecció real ha de seguir sent el gate ADMIN del
  dispatcher (existeix, verificat per codi i tests). Proposta: guarda estàtica
  que exigeixi `role === "ADMIN"` a totes les rutes `_impl/admin/**`.
  Esforç S.
- Nota positiva: la línia del 308 de l'apex no porta HSTS (redirect estàtic
  Vercel); no és explotable per downgrade i `preload` el cobreix quan el
  navegador ja coneix el domini.

## B. Auth, quota i anti-abús

- **B-0 (verificat)** La quota Free (3 consultes detallades/mes) s'aplica
  **SEMPRE al servidor**: `gateDetailedQuery()` davant de `/api/analitza` i
  `/api/estima` (401 sense sessió — comprovat en viu), quota atòmica v23 per
  `user_id`, sense lectura del body ni BD si no hi ha sessió. El client només
  PINTA el resultat (panell bloquejat sense compte, v46).
- **B-1 (verificat)** `rateLimit` server-side a les rutes públiques de mapa
  (`/api/buildings`) i valuació (`/api/valuation`: 10/min per usuari).
- **B-2 (P2)** Verificar de forma exhaustiva que TOTES les rutes públiques
  (`lookup`, `geocode`, `comparisons`, `events`…) porten `rateLimit` propi.
  Proposta: guarda de test que escaneja `_impl/**` i exigeix rateLimit o
  justificació comentada. Esforç S.
- **B-3 (P2)** Anti-abús del formulari: el gate exigeix compte + quota, però
  el registre (magic-link) no té cap rate limit explícit visible per
  `email` → avaluar límit per IP/email al `/api/auth/*` contra bombardeig de
  correus. Esforç S-M.

## C. Privacitat i RGPD

- **C-0 (verificat)** Zero terceres parts: grep de `gtag|analytics|hotjar|`
  etc. = 0; CSP `connect-src 'self'` impedeix beacons; consent granular
  (CookieConsent amb categories) encara que actualment no hi res de tercers
  que carregar — superfície mínima.
- **C-1 (P2)** **Favicon inexistent** (`src/app/favicon.ico` i
  `public/favicon.ico` no existeixen): cada visita genera un 404 de favicon.
  Proposta: `app/icon.svg` (brand) + `og:image` 1200×630 (el twitter card
  `summary_large_image` avui no té imatge — enllaços compartits sense
  previsualització). Esforç S.
- **C-2 (P2, decisió de producte)** `clearEmailFirstDraft()` existeix però
  MAI s'invoca: els esborranys sessionStorage del flux email-first (email,
  municipi, superfície…) poden persistir a la sessió fins que es tanqui la
  pestanya. sessionStorage expira sol al tancar la pestanya (risc baix), però
  convé definir QUAN es neteja (p. ex. després d'executar el borrador amb
  èxit). Proposta: cridar-lo en consumir el draft. Esforç S. **No aplicat per
  prudència**: toca el flux email-first (regla de no regressions).

## D. Rendiment

- **D-0 (verificat)** HTML 9,4 kB brotli; chunks totals 1,4 MB (sense
  comprimir, totes les rutes); 25 pàgines estàtiques al build; leaflet,
  qrcode i WebAuthn via `import()` dinàmic (mai al primer render); LandingMap
  lleuger (1 càrrega per vista + moveend, sense controls de zoom, scroll mai
  segrestat — v49).
- **D-1 (P2)** Analitzar la divisió de bundle per ruta (`@next/bundle-analyzer`)
  i avaluar `dynamic()` per a vistes fora del primer render (Admin, Design,
  Comparador). Esforç M.
- **D-2 (P2)** `preconnect` a `geoserveis.icgc.cat` (tiles del mapa sempre es
  carreguen) per estalviar la negocació TLS del primer tile. Esforç S.
- **D-3 (NO MESURAT)** Core Web Vitals de camp (LCP/CLS/INP): no mesurable
  des d'aquest entorn. Proposta: PageSpeed Insights en producció i recollir
  bàsic al /estat. Esforç S (mesura) + accions segons resultat.

## E. SEO

- **E-0 (verificat)** robots.txt + sitemap dinàmic (/, /analitza, /estima…),
  hub /lloguer amb 947 enllaços interns (v37), metadataBase segur
  (getSiteUrl), JSON-LD WebApplication amb `inLanguage: [ca, es]`, canonical
  correctes.
- **E-1 (tancat v51)** títols doblats i hreflang ca/es cap a la mateixa URL.
- **E-2 (P2)** `/design` (pàgina interna del design system) és indexable →
  `robots: { index: false }` + `Disallow: /design`. Esforç S.
- **E-3 (P2)** meta description/títol només en ca (una URL bilingüe): opció
  documentada; si es vol SEO es, caldria variació per paràmetre o serveix
  `x-default`. Proposta: no tocar (decisió documentada), vigilar Search
  Console. Esforç —.

## F. Accessibilitat

- **F-0 (verificat per codi)** objectius tàctils ≥44-48 px, `role="tablist"`
  + `aria-selected` a les pestanyes de la portada, `aria-label` en CTAs
  (v47), `aria-hidden` en icones decoratives, focus visible Tailwind.
- **F-1 (tancat v51)** `<html lang>` s'actualitza també quan l'idioma ve
  restaurat del localStorage/navegador (fins ara només al toggle manual).
- **F-2 (P2)** Mapa Leaflet sense navegació de teclat nativa (limitació
  coneguda de Leaflet): la ruta accessible és el cercador de municipi (existeix).
  Proposta: documentar al footer d'accessibilitat + avaluar mapes estàtics
  alternatius per lectors de pantalla. Esforç M.
- **F-3 (P2)** Resultats asíncrons (formularis consulta/estima) sense
  `aria-live` explícit → afegir `aria-live="polite"` al contenidor de
  resultats. Esforç S.
- **F-4 (NO MESURAT)** Contrast real (tema clar i fosc): passar axe/Lighthouse
  en producció. Esforç S (mesura).

## G. Dependències i llicències

- **G-0 (verificat)** `npm audit --omit=dev` = **0 vulnerabilitats** després
  de v52 (next 16.4.6). Versions: next 16.4.6, react 19.3.1, prisma 6.11.1,
  leaflet 1.9.4, stripe 23.1.0, jose 6.2.15, bcryptjs 3.0.3, pdf-lib 1.17.1,
  WebAuthn 14.x, lucide 0.525.0.
- **G-1 (verificat)** Llicències (llegides de node_modules): MIT
  (next/react/qrcode/stripe/pdf-lib/jose/WebAuthn), BSD-2 (leaflet),
  BSD-3 (bcryptjs), Apache-2.0 (@prisma/client), ISC (lucide) — totes
  permissives, sense copyleft que obligui a redistribuir codi propi.
- **G-2 (P2, observació)** `prisma` CLI a `dependencies` (convencionalment a
  devDependencies): INTENCIONAL aquí — el postinstall/build de Vercel el
  necessita. Documentat, no tocar.
- **G-3 (verificat)** 0 dependències sense ús (leaflet/qrcode/passkeys per
  import dinàmic, verificats).

## H. Observabilitat

- **H-0 (verificat)** `/api/health` + `/api/ine/status` públics i pàgina
  `/estat` amb sondes en viu (BD, ICGC, Cadastre, Stripe, correu) auto-refresc
  60 s; crons d'importació amb budget de temps (INE, rental-share, demografia).
- **H-1 (P2)** No hi ha alertatge extern: els errors són `console.error` al
  servidor (31 punts, sense rastre distribut). Proposta conservadora respecte
  la promesa de privacitat: logging estructurat + uptime extern del
  `/api/health` (sense qualsevol SDK de tercers al client). Esforç M.
- **H-2 (P2)** Alarmes per fonts externes (ICGC/Catastro): si fallen N vegades
  seguides, avisar (el /estat ja ho pinta; falta el «avisar»). Esforç S-M.

## I. Arquitectura i qualitat de codi (duplicacions)

Matriu completa de l'agente: **0 fitxers src sense referència** (91 mòduls;
dispatcher `_impl` amb drift-check al build), 3 exports morts (tancats v53),
31 exports amb ús només a tests (API de test — NO tocar), 138 exports
d'ús només intern (cosmètic, no acció).

Duplicacions estructurals candidates a refactor (totes VIVES, cap acció de
neteja, només proposta):

| # | Bloque | Ubicacions | Esforç |
|---|---|---|---|
| I-1 | Loop fetch amb 3 reintents + backoff | 6 còpies (ine-import, rental-share ×2, entorn-import, idescat-import ×2) | S |
| I-2 | URL tile ICGC literal | MapView, LandingMap, AnalitzaView (sense constant compartida) | S |
| I-3 | `fmt0/fmt1` | 4 fitxers PDF/càlcul (locale fixat ca-ES/es-ES — format idèntic es/ca de xifres, impacte nul però unificar) | S |
| I-4 | Footer/numeració PDF | pdf-comparison ≈ pdf-valuation | S |
| I-5 | Quartils tipus 7 | territorial.ts vs indicators.ts (dues implementacions) | M |
| I-6 | `BUDGET_MS` + cron loop | ine, rental-share, demografia (entorn ja té el patró compartit) | S |
| I-7 | Classes Tailwind repetides (botons/caixes) | ×3-4 blocs a Auth/CheckEmail/Verifica/Forms | M |

## J. Qualitat lingüística (ca/es — filologia)

- **J-0 (verificat)** Auditor automàtic (castellanismes a ca, errades
  ortogràfiques, espais): **117 incidències analitzades → 0 reals** (totes
  INFO fals-positiu — «mes», «renta» són català vàlid — i 1 «errada» que és la
  URL `#/analisi`). La copy ca és neta ortogràficament.
- **J-1 (verificat)** 0 catalanismes clars a es: els 4 matches de grep són
  marques/URLs legítimes (Incasòl, habitatge.gencat.cat).
- **J-2 (tancat v51)** Títols SEO doblats i «Faq» sense traduir al títol.
- **J-3 (verificat)** Les 24 claves ca==es restants revisades: precios,
  topònims i símbols (legítimes). A vigilar si creixen: `legal.cookies` i
  `plans.informes.muni.name`.
- **J-4 (P2)** Passar `lang_audit.py` a CI com a check no bloquejant
  (alerta només). Esforç S.
- Terminologia normativa revisada: «àrea de mercat residencial tensat» (ca) /
  «área de mercado residencial tensionado» (es) coherents a tot el producte;
  «fiances» (ca) / «fianzas» (es) — correcte amb DIEC2 i RAE/Fundéu.

## K. Codi mort — matriu final (accions aplicades)

| Candidat | Evidència de no ús | Risc | Acció |
|---|---|---|---|
| `tailwind.config.ts` (arrel) | 0 imports; sense `@config` a globals.css/postcss/next.config; Tailwind v4 l'ignora; `content` cap a `./pages` inexistent; cap test el llegeix | Cap | **ELIMINAT v51** |
| Clau i18n `brand` (ca+es) | 0 usos de `t.brand` (logo és constant) | Cap | **ELIMINADA v51** |
| `admin.mrr`, `admin.reports`, `admin.usersTable.actions` | AdminView només pinta email/plan/role/created | Cap | **ELIMINADES v51** |
| `map.title`, `map.panel.trend` | 0 usos (MapView pinta tendència sense etiqueta) | Cap | **ELIMINADES v51** |
| `plans.stripeOff` (només es, sense cap ca) | 0 usos | Cap | **ELIMINADA v51** |
| `DemoBlock<T>` (demografia.ts) | 0 refs src/tests/scripts | Cap | **ELIMINAT v53** |
| `EMAIL_FIRST_QUOTA_NOTE` | 0 refs | Cap | **ELIMINAT v53** |
| `clearEmailFirstDraft()` | 0 refs — però revela decisió de producte pendent | Mig (UX) | **CONSERVAT** (F-C2) |
| `data/municipalities.json` (arrel, 538 KB) | VIU: input de `scripts/seed.ts`; byte-a-byte idèntic a src/data/ | — | Deduplicar en un PR propi (verificant seed) — P2 |
| 31 exports només-test | Usats per tests (API de test) | — | NO tocar |
| Feature dormida «illa de cases» | Conveni Incasòl pendent (import admin, panel, PDF, banda disponible=null per disseny) | — | **EXCLÙS per mandat: documentada, mai eliminada** |

## L. Transport públic (GTFS) i «Serveis de l'entorn»

Investigació amb peticions reals + proposta per fases: **`docs/gtfs-investigacio-transport.md`**
(ronda 1) i **`docs/fuentes-transport-matrix.md`** (ronda 2, 17-11-2026).
**Ronda 2 — verificat completament el GTFS AGREGAT de T-mobilitat** (l'única
font que cobreix els 947 municipis): descàrrega real de 94 MB via portal
(navegador CDP) o NAP MIMTRANS amb ApiKey gratuïta; **41.449 parades, 2.453
rutes, 198 operadors** (TMB, FGC, Rodalies-Renfe, AMB, interurbans…), llicència
Ley 37/2007, actualització DIÀRIA; cobertura real mesurada: **919/947
municipis amb parada a ≤2 km del centre** (899 a ≤1 km), Vall d'Aran 9/9,
Sort 110 m; 28 municipis rurals petits sense parada a ≤2 km documentats per
a la degradació elegant. Les fonts per operador (TMB/FGC/TRAM/Renfe/AMB) són
redundants per a l'estàtic i només aporten valor per al temps real (fase T3).
Integració (MVP capa Leaflet + indicador EntornPanel) **pendent d'aprovació**.

## M. «Com funciona» (C1 + C2)

Inventari funcional real i copy final ca/es llest per a i18n (claus
`howFull.*`, exemple numèric amb dades reals de producció): **`docs/com-funciona-copy.md`**.

## N. Pla d'acció prioritzat

| Prioritat | Acció | Ref | Esforç |
|---|---|---|---|
| Ara | favicon + og:image | C-1 | S |
| Ara | robots/noindex /design | E-2 | S |
| Ara | `aria-live` a resultats asíncrons | F-3 | S |
| Ara | preconnect ICGC | D-2 | S |
| Curt | guarda de rateLimit a totes les `_impl` públiques | B-2 | S |
| Curt | rate limit al registre/magic-link | B-3 | S-M |
| Curt | neteja de `clearEmailFirstDraft` (decisió producte) | C-2 | S |
| Curt | CSP amb nonce | F-C1 | M |
| Mitjà | refactor duplicacions I-1…I-7 (helper fetch, tile constant, quartils) | I | M |
| Mitjà | bundle per ruta + dynamic views | D-1 | M |
| Mitjà | logging estructurat + uptime extern (sense trackers) | H-1 | M |
| Mitjà | mesures: CWV, contrast, Lighthouse | D-3/F-4 | S |
| Fase futura (aprovació) | Transport: proxy server-side + EntornPanel | docs GTFS | M-L |
| Fase futura (aprovació) | Pàgina «Com funciona» completa | docs C2 | M |

---

## Annex — peticions de verificació executades (reproducibles)

- `curl -sI https://preureal.com/` · `curl -sI http://www.preureal.com/` ·
  `curl -sIv https://www.preureal.com/` (TLS/HSTS/cabeceras)
- `curl -s -H "Accept-Encoding: gzip, br" https://www.preureal.com/`
  (compressió real, mida)
- `curl -s https://www.preureal.com/robots.txt` · `/sitemap.xml`
- `curl -s -o /dev/null -w "%{http_code}" https://www.preureal.com/api/analitza`
  (GET → 405) · `POST {}` → 401 `REGISTRAT_PRIMER`
- `curl -X OPTIONS -H "Origin: https://exemple-maliciós.com" …/api/analitza`
  (preflight sense ACAO)
- `curl -s https://www.preureal.com/lloguer/manresa` (títol SSR amb la dada
  real: «585 €/mes» — base de l'exemple del copy) · `/lloguer/barcelona`
  (1135 €/mes)
- `curl https://www.preureal.com/api/buildings?west=…&south=…&east=…&north=…`
  (edifici real de producció, `tipus: "ill"`, `munRent: 1134.6`,
  `munTense: true` — feature dormida illes operativa en mode dormit)
- Socrata: `/api/catalog/v1?q=gtfs`, `/api/views/<id>.json`,
  `/resource/<id>.json?$limit=` (detalls a docs/gtfs-investigacio-transport.md)
- `npm audit --omit=dev` (abans: 1 moderada next; després v52: 0)
