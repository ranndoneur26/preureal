# CHANGES — PreuReal.cat v0.7.0 (Fase 1: registre i autenticació)

Data: 2026-11-03 · Base: v0.5.0 (v9) + alineació d'arquitectura + Fase 1 completa

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
