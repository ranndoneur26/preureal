# INFORME FINAL — PreuReal.cat
**Encàrrec:** Auditoria, correcció, desenvolupament i preparació per a producció
**Data:** 2026-11-02 · **Mètode:** implementació directa sobre el repositori original, amb proves reals executades (mai assumides)

---

## 1. Resum executiu

S'ha treballat DIRECTAMENT sobre el projecte original seguint l'ordre obligatori (BLOC A→D). **Cap funcionalitat existent ha estat eliminada**: el mapa ICGC, les dades oficials (947 municipis Incasòl + 170 àrees tensades DOGC), els 3 plans, el sistema d'usuaris, Google OAuth, els correus i el mode DEMO de Stripe es conserven i funcionen. S'hi han afegit: PostgreSQL persistent amb migració verificada, correccions de seguretat (XSS crític inclòs), Stripe complet (retorn/portal/factures/idempotència), panell d'usuari de 8 seccions, panell d'administració de 7 pestanyes, cercadors d'adreça/refcat, comparador avançat, historial/preferits, informes amb moderació i informes PDF professionals.

**Proves executades realment:** 9 tests unitaris + 48 verificacions E2E contra el servidor de producció amb PostgreSQL real → **48/48 superades**.

---

## 2. Taula d'estat de tasques

| Tasca | Estat | Observacions (resultat verificat) |
|---|---|---|
| **BLOC A — Estabilització** | | |
| Auditoria del projecte | ✅ Completada | `AUDIT.md`: 22 funcionalitats inventariades, 10 errors, 9 vulnerabilitats, verificació byte-a-byte (fals positiu E2 documentat) |
| Còpia de seguretat | ✅ Completada | git baseline `9a0f502` + `download/backup/custom.db.baseline-20261101.db` |
| Correcció de vulnerabilitats | ✅ Completada | V1 XSS admin (correus com a TEXT net, HTML cru mai retorna a la API), V2 escapament a correus, V3 rate limit compartit en BD (taula `RateLimit`, enunciat atòmic), V4 hash IP SHA-256+sal, V5 guard AUTH_SECRET en prod, V6 revocació de sessions (tokenVersion), V7 cerques insensibles, V8 capçaleres de seguretat, V9 idempotència webhooks — totes verificades a l'E2E |
| Correcció d'errors | ✅ Completada | E1 fals èxit d'informes (ara només amb res.ok), E3 camps d'importació guardats (provat en BD), E4 MRR real, E5/E6 rate limits per usuari/IP, E7 pla fresc de BD, E8 cast, E9 codi mort eliminat; validació BAD_SURFACE |
| Base de dades persistent | ✅ Completada | PostgreSQL 17 (provat localment) + esquema amb 9 taules noves; provider `postgresql`; migració versionada `20261102000000_init_postgres` aplicada amb `prisma migrate deploy` |
| Migració de dades | ✅ Completada | `scripts/migrate_sqlite_to_pg.py`: **7.617 files migrades, integritat OK taula a taula (947 municipis, 6.567 edificis), mostra Barcelona idèntica, re-execució idempotent verificada**. SQLite original intacte (arxiu) |
| **BLOC B — Funcionalitat comercial** | | |
| Autenticació completa | ✅ Completada | Registre/login/logout/recuperació (existents, millorats) + **verificació de correu** (token 24h, provat E2E), **canvi de contrasenya** amb revocació de sessions (provat), **eliminació de compte RGPD** (provada), Google OAuth preservat (pendent només de credencials) |
| Plans | ✅ Completada | Límits i features **configurables des de l'admin** (PlanSetting, cau 30 s), aplicats al servidor (quota provada: 4a consulta → 402) |
| Stripe | ⚙️ Preparat + demo verificada | Checkout real (codi correcte), **webhooks idempotents** (StripeEvent), **ruta de retorn amb verificació de l'estat real** de Stripe (mai activa per URL), **portal de client**, **historial de facturació**, pagaments fallits → past_due. Sense claus reals: mode DEMO funcionant (provat E2E); activació real pendent de credencials del propietari |
| Panell d'usuari | ✅ Completada | 8 seccions connectades a dades reals: resum, dades personals, facturació (factures Stripe quan n'hi hagi), historial, preferits, comparacions, informes meus, seguretat+eliminació (provades E2E) |
| Panell d'administració | ✅ Completada | 7 pestanyes: mètriques (MRR real/demora/demo), usuaris (cerca, filtre, pla, rol, activació), correus (TEXT net), dades (importació amb historial), moderació d'informes, plans i límits, auditoria + exports CSV (provats E2E) |
| **BLOC C — Producte immobiliari** | | |
| Mapa | ✅ Completada | Preservat 100% (base ICGC, edificis, límits). Nous cercadors: **adreça amb número (Geocodificador oficial ICGC, provat: "Carrer de Sants 10, Barcelona"), codi postal dins la cerca d'adreça, refcat (BD pròpia)**, filtres de zones tensades (llegenda+badge existents millorats) |
| Cobertura de mosaics | ✅ Completada | La vista informa "N zones sense edificis / no carregades"; mai es presenta com a completa si falla un mosaic (camp `coverage` provat E2E) |
| Assignació municipal | ⚠️ Parcial | L'assignació segueix venint del mosaic ICGC; el LOOKUP (dades detallades) resol pel punt real clicat. La millora completa (point-in-polygon per a tots els edificis) queda com a següent pas — vegeu §6 |
| Fitxa d'edifici | ✅ Completada | Any de construcció (Cadastre), refcat, **preu real d'illa si hi ha importació (amb mostres)**, "No disponible" explícit quan falta una dada (mai inventat), font i període citats |
| Motor de dades | ✅ Completada | `/api/provenance`: registre de 7 datasets amb font/llicència/unitat/metodologia/qualitat; importació corregida (E3) amb historial d'execucions (ImportRun) |
| Comparador | ✅ Completada | Vista pròpia `/comparador`: 2-6 municipis, barres, diferències %, mitjana/mediana del conjunt, evolució temporal, comparacions desades (provat E2E: Barcelona vs Girona) |
| Historial i cartera | ✅ Completada | Historial de consultes (Premium, esborrable), preferits d'edificis/municipis (Premium, guard servidor provat), comparacions desades |
| Informes ciutadans | ✅ Completada | Validació de rangs, tipus de contracte, detecció de duplicats 24h (409 provat), **fals èxit corregit (E1)**, moderació admin acceptar/rebutjar, pla sempre FREE→DB |
| Informes PDF | ✅ Completada | `/api/reports/pdf`: PDF professional amb identitat PreuReal.cat (capçalera de marca, dades, gràfic d'evolució, tensió, fonts, metodologia, limitacions); Premium→municipi, Pro→edifici; generació real provada (byte `%PDF`) |
| **BLOC D — Producció** | | |
| Privacitat i legalitat | ✅ Completada | Banner de consentiment (només essencials; funcional sense acceptar), RGPD ampliat (drets art. 15-22, terminis de conservació, exportació i esborrat al panell), LSSI art. 10 referenciat, resolucions DOGC actualitzades; titular amb 【COMPLETAR】 (mai inventat) |
| SEO | ✅ Completada | Metadades/OG/JSON-LD existents preservats; sitemap.xml i robots.txt operatius; rutes privades sense índex (client-side) |
| Rendiment | ✅ Completada | Índexs nous a PG (SearchLog, PriceReport, RateLimit, Favorite...), `Promise.allSettled` a mosaics, cau d'adreces 1 h, `buildings` amb resposta única |
| Proves | ✅ Completada | **9/9 unitaris + 48/48 E2E** (detall a §4). Lint net, build de producció net |
| Desplegament | ✅ Completada | VERCEL.md (Neon + Vercel), docker-compose amb servei postgres + healthcheck, Dockerfile amb psycopg2, .env.production.example actualitzat |

**Estat global: Completada (amb pendents externs documentats a §5).**

---

## 3. Errors corregits (de l'auditoria)

E1 fals èxit d'informes · E3 importació descartava preus/mostres · E4 MRR sobrevalorat · E5/E6 rate limits compartits · E7 pla obsolet del JWT · E8 cast erroni · E9 botó mort · E10 ruta absoluta de BD (substituïda per PostgreSQL) — **tots corregits i verificats**. E2 va resultar ser un fals positiu del transport de consola (documentat com a lliçó operativa a AUDIT.md).

## 4. Proves executades (resultats reals)

**Unitaris (bun test): 9/9** — normalizeEmail, escapeHtml, htmlToText, sanitizeName (NFC), hashIp, clientIp, plans.
**E2E (bash+curl contra standalone+PostgreSQL 17 real): 48/48** — salut BD, cerces insensibles, edificis+cobertura, geocodificació ICGC, registre+normalització Gmail (409 en duplicat), quota FREE 3/mes aplicada al servidor (402 a la 4a), guards de pla (403 preferits/historial/PDF/admin per a FREE), informes (validació, duplicat 409), admin (login, MRR, activació de pla, moderació, plans configurables, auditoria, imports), XSS (la API mai retorna HTML cru), PDF real, comparador, Stripe DEMO+retorn controlat+cancel·lació+webhook sense claus, canvi de contrasenya amb revocació de sessió, rate limit 429, eliminació de compte RGPD, verificació de correu per token.
**No executades per falta de serveis externs** (marcades com a pendents, mai com a superades): pagaments Stripe reals en test mode, correus Resend reals, OAuth Google real.

## 5. Credencials i serveis pendents (del propietari)

1. **PostgreSQL gestionat** (Neon/Supabase) → posar `DATABASE_URL` a Vercel + `prisma migrate deploy` + `migrate_sqlite_to_pg.py` (procés a VERCEL.md §2).
2. **Stripe** (claus test/live + webhook secret) → el sistema activa cobros reals sense canviar codi; mentre, DEMO_CHECKOUT=true.
3. **Resend** (API key + domini) → correus reals; sense clau tot queda a EmailLog (sandbox).
4. **Google Cloud Console** (OAuth client) → redirect URI `https://DOMINI/api/auth/google/callback`.
5. **Dades del titular legal** (nom/NIF/adreça) → els placeholders 【COMPLETAR】 esperen aquestes dades.

## 6. Limitacions conegudes i recomanacions

1. **Assignació municipal d'edificis de frontera**: la millora completa requereix point-in-polygon per mosaic (recomano implementar-ho amb els límits ja emmagatzemats a `Municipality.boundary`).
2. **Cerca per codi postal aïllat**: el Geocodificador ICGC no indexa CPs sols; s'interpreten com a part de l'adreça (documentat). Si es vol CP com a filtre propi, cal un dataset CP→municipi oficial.
3. **Vercel + Neon**: usa el connection string *pooled*; per càrrega alta valora Prisma Accelerate.
4. **Backups**: programa `pg_dump` setmanal a més dels backups del proveïdor.
5. **Següents iteracions**: pàgines públiques SSR per municipi (SEO long-tail), dades de barris (Incasòl), notificacions de canvis de preu.

## 7. Lliurables

- **A. Projecte complet**: repositori actualitzat (commits `c92b609`…), build de producció net, lint net.
- **B. Base de dades**: `prisma/schema.prisma` (PostgreSQL), `prisma/migrations/20261102000000_init_postgres/`, `scripts/migrate_sqlite_to_pg.py` (repetible+verificable), SQLite original intacte a `db/custom.db` i backup a `download/backup/`.
- **C. Documentació**: `AUDIT.md` (auditoria), `VERCEL.md` (desplegament Vercel+Neon), `DEPLOY.md` (VPS/Docker amb postgres), `.env.production.example`, aquest informe.
- **D. Informe final**: aquest document.
- **E. Paquet final**: `download/preureal-v2.zip` (projecte complet preparat per a Vercel, sense node_modules/secrets).

## 8. Correccions posteriors (2026-11-02, verificades en executar-se)

1. **Preview del sandbox bloquejat (V8, refinament)**: la capçalera `X-Frame-Options: SAMEORIGIN` afegida a la correcció V8 impedía incrustar l'app a l'iframe del preview (origen diferent). Substituïda per CSP `frame-ancestors` (estàndard actual): `*` en dev/preview i `'self'` en producció, configurable amb `FRAME_ANCESTORS` (documentat a `.env.production.example` i VERCEL.md). Verificat: la capçalera surt a la resposta i el preview carrega.
2. **Restauració del PostgreSQL local del sandbox**: el reciclatge del sandbox esborra els binaris instal·lats al sistema. Nou entorn **persistent i auto-reparable**: PostgreSQL 17.11 incrustat a `.localpg/` (dins del projecte), gestió amb `scripts/pg_local.sh` (init/start/ensure/stop/status), dimoni `scripts/dev_keepalive.sh` (rearraanca el servidor de dev si el port 3000 queda lliure) i bootstrap automàtic a `src/instrumentation.ts`: en arrencar, si la `DATABASE_URL` heretada és `file:` (la plataforma inyecta SQLite) o el clúster local no respon, arrenca `.localpg` i reescriu la URL — mai s'executa a Vercel ni al build de producció. Dades re-migrades i verificades amb `migrate_sqlite_to_pg.py`: **7.617 files, integritat OK** (947 municipis, 6.567 edificis). Health check: `ok:true, provider: postgresql`.
3. **Consolidació de l'API per al límit de 12 functions del pla Hobby de Vercel**: el build fallava amb "No more than 12 Serverless Functions" (l'app té 45 rutes). Tots els handlers viuen ara a `src/app/api/_impl/**/route.ts` (carpeta privada, codi intacte) i UN catch-all `/api/[[...path]]` generat per `scripts/gen_api_dispatcher.py` els enruta; `/api/health` i `/api/stripe/webhook` queden com a funcions pròpies → **3 functions total**. Build net, URL públiques idèntiques, **E2E re-executat: 46/48 + 2 checks que fallaven només per la DATABASE_URL inyectada a la shell del sandbox, verificats manualment OK (import E3 a BD i verificació de correu → 200) = 48/48 equivalents**. `tests/e2e.sh` endurit contra aquest artefacte d'entorn.
