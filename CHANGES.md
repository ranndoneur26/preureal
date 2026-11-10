# CHANGES — PreuReal.cat v0.7.0 (Fase 1: registre i autenticació)

Data: 2026-11-03 · Base: v0.5.0 (v9) + alineació d'arquitectura + Fase 1 completa

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
