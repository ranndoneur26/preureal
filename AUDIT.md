# AUDITORIA TÈCNICA — PreuReal.cat
**Data:** 2026-11-02 · **Abast:** repositori complet (src/, prisma/, scripts/, configs)
**Mètode:** lectura íntegra de codi (10.251 línies TS/TSX), proves empíriques de build i runtime, anàlisi de seguretat per superfície d'atac.

> Nota metodològica: durant l'auditoria es va detectar que el transport de sortida
> de la consola distorsiona seqüències `[m` (les interpreta com a escapes ANSI).
> Totes les troballes de codi d'aquest document s'han verificat amb lectures de
> bytes crues (Python `repr` + cerques booleanes) per evitar falsos positius.

---

## 1. Funcionalitats existents i operatives (INVENTARI A PRESERVAR)

| Funcionalitat | Estat verificat |
|---|---|
| Mapa Leaflet amb base ICGC (WMTS topogràfic gris) | ✅ Operatiu |
| Edificis reals ICGC RTT amb cau BD (30 dies, mosaics ≤40 ha) | ✅ Operatiu (provat: HTTP 200, dades reals Eixample) |
| 947 municipis amb lloguer real Incasòl (fiances) + històric | ✅ BD 4,2 MB verificada |
| Àrees de mercat residencial tensat (DOGC) amb llista A/B | ✅ Operatiu |
| Refcat real per punt (ICGC parcelles-cadastre) | ✅ Operatiu |
| Any de construcció via Catastro (Consulta_DNPPC) amb degradació elegant | ✅ Operatiu |
| Registre/login/logout JWT (bcrypt, cookie httpOnly SameSite=Lax Secure) | ✅ Operatiu |
| Normalització Gmail (punts/+alias) anti-abús | ✅ Operatiu + tests |
| Google OAuth complet (state CSRF, email_verified, find-or-create) | ✅ Implementat (pendent només de credencials) |
| Quota 3 consultes/mes pla FREE aplicada AL SERVIDOR (lookup 402) | ✅ Operatiu |
| Teaser sense sessió (protecció de dades + captació) | ✅ Operatiu |
| Límit municipal GeoJSON amb cau BD + fitBounds | ✅ Operatiu |
| Comparador inline (el teu lloguer vs mitjana municipal) | ✅ Operatiu |
| Històric gràfic per municipi (barreres) | ✅ Operatiu |
| Stripe checkout real + webhook amb firma verificada | ✅ Codi correcte (pendent credencials) |
| Mode DEMO_CHECKOUT clarament marcat (mai simulació d'èxit real) | ✅ Operatiu |
| Export CSV pla PRO amb guard de servidor | ✅ Operatiu |
| Log de correus (sandbox/Resend) | ✅ Operatiu |
| Panell admin (mètriques, usuaris, correus, importació) | ✅ Operatiu (milorable) |
| SEO: metadades, OG, JSON-LD, sitemap.xml, robots.txt | ✅ Operatiu |
| Health check d'integracions externes | ✅ Operatiu (milorable: falta BD) |
| Reports de preus ciutadans (crowdsourcing) | ⚠️ Operatiu amb defectes (§3) |
| Instrumentació cold-start per serverless | ✅ Operatiu |

## 2. Funcionalitats incompletes

1. **Panell d'usuari** (PanelView, 115 línies): només mostra pla/quota. Falten: dades personals, historial de consultes, preferits, comparacions desades, informes, facturació, preferències, seguretat, eliminació de compte (Fase 11).
2. **Panell d'admin** (AdminView, 350 línies): falta gestió d'activació d'usuaris, moderació d'informes, historial d'importacions, MRR real per subscripció, exportacions CSV, registre d'auditoria (Fase 12).
3. **Stripe**: falta ruta de retorn amb verificació de l'estat real de la sessió, portal de client, historial de facturació, idempotència de webhooks, gestió de pagaments fallits (Fase 7).
4. **Cercadors del mapa**: només cerca per municipi. Falten adreça/carrer-número, refcat, codi postal (Fase 8.1).
5. **Fitxa d'edifici**: mostra any+refcat però sense metodologia/font/qualitat ni indicadors de disponibilitat explícits (Fase 8.2, Fase 9).
6. **Comparador**: només inline contra la mitjana municipal; no hi ha comparador avançat multi-entitat ni desat (Fase 8).
7. **Informes PDF**: no existeixen (Fase 13).
8. **Legal**: manca banner de consentiment de cookies; dades del titular amb placeholders (Fase 15).
9. **Verificació de correu**: els correus s'envien però el compte no es marca ni es verifica (Fase 6).

## 3. Errors detectats (verificats)

| # | Gravetat | Fitxer | Error |
|---|---|---|---|
| E1 | **ALTA** | `src/components/views/MapView.tsx` (`submitReport`) | Fals èxit: `setReportSent(true)` s'executa encara que el servidor retorni 4xx/5xx (la UI diu "gràcies" sense haver-se desat res). |
| E2 | **ALTA** | `src/app/api/buildings/route.ts` (L55) | *Fals positiu descartat*: verificació byte-a-byte confirma codi correcte `new Map(muns.map((m) => [m.code, m]))`; l'aparença d'error era un artefacte del transport de consola. Provat en runtime: 200 OK. |
| E3 | **ALTA** | `src/app/api/admin/import/route.ts` | Els camps `avgRentEurMonth` i `sampleSize` del format d'importació es descarten (no existeixen a l'esquema) — els preus a nivell edifici mai es poden carregar (Fase 9.1). |
| E4 | **MITJANA** | `src/app/api/admin/stats/route.ts` | MRR calculat com `premium*7.99 + pro*19.99` sobre COMPTADORS D'USUARIS, sense distingir subscripcions actives/cancel·lades/demo — sobrevalora ingressos (Fase 12). |
| E5 | **MITJANA** | `src/app/api/stripe/checkout/route.ts` | Rate limit amb clau global `"checkout"`: tots els usuaris comparteixen el mateix cub (10/min globals) — un usuari pot bloquejar la resta. |
| E6 | **MITJANA** | `src/app/api/reports/route.ts`, `events`, `pwconfirm` | Mateix defecte: rate limit global per acció en lloc de per usuari/IP. |
| E7 | **MITJANA** | `src/app/api/export/[code]/route.ts` | El guard de pla llegeix el JWT (`session.plan`), que pot ser obsolet si l'admin canvia el pla — cal verificar contra BD. |
| E8 | **BAIXA** | `src/app/api/auth/me/route.ts` | `(user.plan as "FREE")` — cast erroni que amaga el pla real a la cota; funciona per casualitat (canConsult usa `PLANS[plan]`). |
| E9 | **BAIXA** | `src/components/views/MapView.tsx` (L663) | Botó ocult mort (`hidden`) que fa checkout — codi mort. |
| E10 | **BAIXA** | `.env` local | `DATABASE_URL` amb ruta absoluta de la sandbox — fràgil fora d'ella. |

## 4. Vulnerabilitats (verificades)

| # | Gravetat | Localització | Descripció |
|---|---|---|---|
| V1 | **CRÍTICA** | `AdminView.tsx` L265 | **XSS emmagatzemat**: `dangerouslySetInnerHTML={{__html: e.body}}` renderitza el cos de correus que conté dades controlades per l'usuari (p. ex. `name` del registre). Un usuari registrat amb `<img src=x onerror=...>` com a nom executes JS al panell d'admin (robament de sessió d'admin). |
| V2 | **ALTA** | `mail.ts` (`welcomeMail`) | El `name` proporcionat per l'usuari s'interpola sense escapar al HTML del correu → injecció HTML al correu + vector de V1. |
| V3 | **ALTA** | `analytics.ts` (`rateLimit`) | Rate limiting NOMÉS en memòria per instància — en serverless cada instància té el seu comptador: el límit real és N_instàncies × límit (el requisit del projecte demana compartit). |
| V4 | **MITJANA** | `lookup/route.ts` (`hashIp`) | Hash d'IP feble (multiplicació 31 bits, reversible per força bruta trivial) — pseudonimització RGPD insuficient. |
| V5 | **MITJANA** | `auth.ts` | `AUTH_SECRET` té fallback `"dev-secret-cambia-esto"` — en producció sense variable, les sessions es firmen amb un secret públic (suplantació total). |
| V6 | **MITJANA** | Schema/rutes | No hi ha revocació de sessions: el JWT és vàlid 30 dies encara que l'usuari canviï contrasenya o sigui desactivat. |
| V7 | **BAIXA** | `municipalities`, `admin/users` | Cerques `contains` — en PostgreSQL seran case-sensitive (canvi de comportament en migrar); cal `mode: "insensitive"`. |
| V8 | **BAIXA** | API en general | Falta capçaleres de seguretat (CSP, X-Frame-Options...) i validació de mida màxima de payloads. |
| V9 | **BAIXA** | Stripe webhook | Webhooks sense idempotència (reentrega de Stripe pot duplicar efectes/subscripcions). |

**Coses que estan BÉ de seguretat** (verificat): cookies httpOnly+Secure+SameSite=Lax; bcrypt cost 10; tokens de reset aleatoris 24 bytes amb caducitat 1h i ús únic; OAuth amb state un-sol-ús + `email_verified` obligatori; guards `requireAdmin()` a totes les rutes admin (verificat ruta per ruta); normalizeEmail anti-multiplicació de quota; resposta de reset no revela si el correu existeix; cap consulta SQL crua (Prisma parametritza).

## 5. Dependències externes necessàries (credencials pendents del propietari)

1. **PostgreSQL gestionat** (Neon/Supabase) — per persistència real a Vercel. *La infraestructura completa es lliura preparada.*
2. **Stripe** (claus test/live + webhook secret) — el codi ja integra checkout/webhook/portal.
3. **Resend** (API key + domini verificat) — correus reals; sense clau funciona en sandbox.
4. **Google Cloud Console** (OAuth client) — el botó s'activa sol en posar les credencials.
5. **Dades del titular legal** (nom/NIF/adreça) — placeholders marcats, mai inventats.

## 6. Arquitectura objectiu (modificacions previstes)

1. **BD**: SQLite → **PostgreSQL** (Neon compatible serverless), esquema Prisma ampliat amb 9 taules noves (RateLimit, StripeEvent, AuditLog, ImportRun, PlanSetting, Favorite, SavedComparison, EmailToken, + camps a User/Building/PriceReport). Script de migració SQLite→PG **repetible i verificable** (recompte per taula + mostres). SQLite original es conserva com a arxiu (no s'elimina).
2. **Seguretat**: sanitització XSS (admin + correus), rate limit compartit via BD, hash IP SHA-256+salt, guard d'AUTH_SECRET en prod, revocació de sessions (tokenVersion), capçaleres de seguretat, validació zod centralitzada.
3. **Comerç**: Stripe complet (retorn verificat, portal, factures, idempotència, fallits), MRR real per subscripcions actives.
4. **Producte**: cercadors (adreça/refcat/CP), fitxa d'edifici amb proveniència, comparador avançat, historial+preferits, informes amb moderació, PDF professional.
5. **Legal/SEO**: consentiment cookies, RGPD (exportació+eliminació), sitemap dinàmic, pàgines públiques de municipi.

## 7. Decisió sobre l'error E2 del transport

S'ha documentat com a lliçó operativa: per a futures revisions de codi s'usarà
`Read` o verificacions booleanes de bytes, mai `cat`/`grep` crues per codi amb
seqüències `[`+lletra, per evitar falsos positius com el detectat avui.

---

# V3 — Auditoria FASE 1: registre i autenticació (2026-11-03)

## Abast

Completar el sistema de registre i autenticació (Fase 1 del producte) seguint
la llista funcional del propietari: verificació de correu, recuperació de
contrasenya, login/sessions i perfil d'usuari. **Cap canvi d'esquema de BD**: la
Fase 1 s'ha implementat amb els camps i taules que ja existien
(`User.emailVerifiedAt`, `User.tokenVersion`, `EmailToken`, `PasswordToken`,
`Event`). Cap funció eliminada; tots els canvis són additius o millores de
comportament.

## 1. Compliment de la llista funcional

### 1.1 Verificació del correu electrònic

| Requisit | Estat | Implementació |
|---|---|---|
| Registre amb nom, correu i contrasenya | Ja existia | `POST /api/auth/register` (bcrypt 10, rate limit 8/min) |
| Compte amb `email_verified = false` | Ja existia | `emailVerifiedAt = null` per defecte |
| Correu de verificació automàtic | Ja existia | Token 24 B hex + `EmailToken` (24 h) + `verifyMail()` |
| Botó «Verificar correu» → validació al servidor | Millorat | `GET /api/auth/verify?token=` (validació de token, caducitat i ús a la BD) |
| Redirecció a benvinguda/perfil | Ja existia | → `/#/panell?verificacio=ok` |
| Pàgina «Revisa el teu correu» | **Nou** | `CheckEmailView` a `/#/revisa-correu` (registre i login sense verificar hi cauen) |
| Botó reenviar correu | Ja existia + millorat | `POST /api/auth/verify` (panell, pantalla revisa-correu i panell del mapa) |
| Token amb caducitat | Ja existia | 24 h (`EmailToken.expiresAt`) |
| Nou token si caduca | Ja existia | El reenviament crea token NOU; el restabliment de contrasenya també reenvia verificació |
| **Bloqueig de funcions principals** | **Nou** | `POST /api/lookup` → **403 `EMAIL_NOT_VERIFIED`** si `emailVerifiedAt` és null (excepte ADMIN). Validació AL SERVIDOR, abans de la quota |
| Missatge error si l'enllaç ja s'ha utilitzat | **Nou** | Redirect diferenciat `verificacio=ja_usat` (abans tot era `invalid`) |
| Enllaç caducat → nou token | **Nou** | Redirect `verificacio=caducat` + botó reenviament al panell |
| Protecció registres repetits | Ja existia | 409 `EMAIL_EXISTS` (verificat E2E) |
| Confirmació visual de verificació | Millorat | Banner verd al panell amb text explícit «ja pots fer consultes detallades» |
| Neteja de tokens | **Nou** | En verificar, tots els altres `EmailToken` pendents del compte es marquen usats (un sol enllaç viu) |

### 1.2 Recuperació de contrasenya

| Requisit | Estat |
|---|---|
| «He oblidat la contrasenya» + formulari correu | Ja existia (`/#/oblidat`) |
| Enviament del correu de recuperació | Ja existia (sandbox EmailLog o Resend) |
| Enllaç segur i temporal | Ja existia (token 48 hex, 1 h) |
| Formulari nova contrasenya + confirmació | Ja existia (`/#/restablir?token=`) |
| Invalidació del token després de l'ús | Ja existia + **Nou**: la confirmació ara invalida TOTS els altres enllaços pendents del compte |
| Revocació de sessions amb la contrasenya antiga | Ja existia (`tokenVersion+1`) |

### 1.3 Login i gestió de sessions

| Requisit | Estat |
|---|---|
| Inici/tancament de sessió | Ja existia (JWT HS256 en cookie httpOnly SameSite=Lax Secure) |
| Recordar sessió de manera segura | Ja existia (cookie persistent 30 dies + expiració del JWT) |
| Redirecció si no autenticat / protecció pàgines privades | Ja existia (panell i admin demanen sessió; `requireUser` revalida a la BD) |
| Expiració de sessions | Ja existia (30 d) |
| **Tancar sessions en altres dispositius** | **Nou**: `POST /api/auth/sessions/revoke-all` + botó al panell (incrementa `tokenVersion`, la sessió actual es renova) |

### 1.4 Perfil de l'usuari

| Requisit | Estat |
|---|---|
| Nom, correu i estat de verificació visibles | Ja existia |
| Edició de dades personals | Ja existia (`PATCH /api/account`, nom + idioma) |
| Canvi de contrasenya | Ja existia (`POST /api/auth/change-password`) |
| Preferències | Ja existia (idioma ca/es) |
| **Historial d'activitat** | **Nou**: `GET /api/account/activity` (últims 20 esdeveniments + últim login) al tab Seguretat |
| Eliminació del compte (RGPD) | Ja existia (`DELETE /api/account`, pseudonimització de registres agregats) |
| Nom i cognoms | El camp únic `name` (80 caràcters) acull nom i cognoms; no s'ha afegit columna per no alterar l'esquema |

## 2. Millores de seguretat d'aquesta revisió

1. **Bloqueig server-side de consultes sense verificar** (`403 EMAIL_NOT_VERIFIED`): el frontend només ho presenta; la decisió és del servidor, com exigeix la Fase 1.
2. **OAuth de Google coherent**: els comptes creats amb Google ara neixen amb `emailVerifiedAt` (Google exigeix `email_verified=true` abans de vincular) i els comptes locals que només hagin entrat amb Google es marquen verificats en fer-ho — sense això, el nou bloqueig els hauria deixat fora.
3. **Invalidació creuada de tokens**: un sol enllaç de verificació i un sol enllaç de restabliment vius per compte.
4. **Correu emmascarat** a respostes compartides (`jo***@gmail.com`) — nou helper `maskEmail()` (testat).
5. **Rate limits** verificats a totes les rutes noves (reenviament 3/5 min, revoke 5/5 min).

## 3. Riscos residuals i recomanacions

1. **Enumeració de correus al registre** (409 `EMAIL_EXISTS`): és el compromís UX estàndard; el restabliment NO revela existència. Recomanat: mantindre així.
2. **Canvi de correu electrònic**: no està a la llista de la Fase 1; si s'afegeix, caldrà re-verificació + revocació de sessions.
3. **2FA**: fora d'abast de la Fase 1; recomanat per a comptes ADMIN.
4. **Contrasenyes**: mínim 8 caràcters (comprovar també contra llistes filtrades és una millora futura).
5. **Correus en sandbox** fins que el propietari connecti Resend (`RESEND_API_KEY`): els correus queden al log d'administració i la verificació es pot fer des d'allà.
6. **Admin de seed**: `admin@preureal.cat` té contrasenya per defecte si no s'executa el seed amb `ADMIN_PASSWORD` — canviar-la abans de producció.

## 4. Evidència de verificació (2026-11-03)

- **Build de producció**: `npm run build` ✓ (compile + TypeScript + 5 pàgines).
- **Verificació estructural**: `npx tsx scripts/test_auth_fase1.ts` → **40/40 ✓**
  (unitats `maskEmail`, paritat i18n ca/es, dispatcher amb les 2 rutes noves, portes server-side, estats de verificació, revocació, UI, schema sense canvis).
- **E2E amb servidor real + PostgreSQL local**: `npx tsx scripts/e2e_auth_fase1.ts` → **32/32 ✓**
  (registre→correu sandbox, bloqueig 403 amb correu emmascarat, verificació ok/ja_usat/caducat, login emailVerified, lookup desbloquejat amb dades reals, revoke-all amb sessió antiga morta i actual viva, activitat, reset complet amb token d'un sol ús, duplicat 409).
- **Dispatcher regenerat**: 45 rutes (45 handlers `_impl`), inclòs `/api/auth/sessions/revoke-all` i `/api/account/activity`.
