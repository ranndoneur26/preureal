# CHANGES — PreuReal.cat v0.7.0 (Fase 1: registre i autenticació)

Data: 2026-11-03 · Base: v0.5.0 (v9) + alineació d'arquitectura + Fase 1 completa

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
