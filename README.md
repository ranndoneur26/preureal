# Preureal — El mapa del lloguer real de Catalunya

Plataforma amb el **preu real del lloguer** dels 947 municipis de Catalunya
(fiances Incasòl/Gencat), àrees de mercat tensat (DOGC), edificis reals ICGC,
comparador de municipis, històric de consultes, informes PDF i subscripcions
(Stripe: Free / Premium 7,99 € / Pro 19,99 €). Interfície en català i castellà.

**Producció:** https://www.preureal.com · dominis variants (`preureal.com` apex,
`preureal.cat`) redirigeixen 301 al canònic via `src/middleware.ts`.

## Documentació del projecte

| Fitxer | Contingut |
|---|---|
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Context complet: arquitectura, funcionalitats, estat, problemes |
| [TASKS.md](TASKS.md) | Tasques pendents per prioritat |
| [VERCEL.md](VERCEL.md) | Desplegament a Vercel pas a pas |
| [CHANGES.md](CHANGES.md) | Changelog per versions (v31…v38) |

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind 4 + Leaflet
- **Prisma 6 + PostgreSQL** (Neon/Supabase en producció)
- Auth pròpia (JWT en cookie httpOnly), 2FA TOTP, passkeys WebAuthn, Stripe, Resend (opcional), Google OAuth (opcional)
- API consolidada en **3 Serverless Functions** per complir el límit del pla
  Hobby de Vercel (`/api/[[...path]]` catch-all + `/api/health` +
  `/api/stripe/webhook`)

## Executar en local

Cal Node 20+ (npm) i un PostgreSQL accessible (Docker o Neon de desenvolupament):

```bash
# 1. Dependències
npm install --legacy-peer-deps

# 2. Variables d'entorn
cp .env.production.example .env    # omple DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_SITE_URL
# Postgres local amb Docker (opcional):
# docker run -d --name pr-pg -e POSTGRES_PASSWORD=pr -e POSTGRES_DB=preureal -p 5432:5432 postgres:16
# DATABASE_URL="postgresql://postgres:pr@localhost:5432/preureal"

# 3. Esquema i dades (947 municipis + edificis Eixample + admin)
npx prisma migrate deploy
ADMIN_PASSWORD="una-contrasenya-forta" npm run db:seed

# 4. Arrenca
npm run dev                        # http://localhost:3000
```

Admin: `admin@preureal.cat` / el valor d'`ADMIN_PASSWORD`.
Sense `STRIPE_SECRET_KEY` i amb `DEMO_CHECKOUT=true` el pagament és simulat (sense cobrar).

## Tests

| Comanda | Què fa |
|---|---|
| `npm test` | Suite amb **bun test**: unitaris (email, seguretat, plans), TOTP RFC 6238, informe PDF (8 pàg., WinAnsi) i lògica de subscripcions amb BD mockejada |
| `npm run test:e2e` | **Playwright** sobre els fluxos crítics (landing→preus, mapa Leaflet, fitxa SEO, legal, validació de registre) contra `PLAYWRIGHT_BASE_URL` (per defecte localhost) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config de Next 16) |
| `npm run audit` | `npm audit` de dependències de **producció**; falla amb high+ |

Estat conegut: 2 tests de `tests/funcionalitats.test.ts` (motor F4
`computeValuation`) fallen per EXPECTATIVES desactualitzades — són
preexistents, el CI els executa en mode no bloquejant fins que es corregeixin.

Primera vegada amb Playwright:

```bash
npx playwright install chromium
PLAYWRIGHT_BASE_URL=https://www.preureal.com npm run test:e2e
```

## CI/CD

`.github/workflows/ci.yml` executa en cada PR i push a `main`:
guardia de repo + **check anti-drift del dispatcher**, lint, typecheck,
tests bun (bloquejants), audit de prod, i build de producció amb
`DATABASE_URL` fictici (el build no toca la BD; el hub i el sitemap degraden
amb gràcia). Les migracions les aplica Vercel amb `prisma migrate deploy`
dins del script `build`.

**Preview deployments:** en connectar el repo a Vercel, cada PR genera un
preview automàtic (`*.vercel.app`); el middleware no redirigeix aquests hosts.

## Arquitectura de l'API i anti-drift

Un sol dispatcher generat (`src/app/api/[[...path]]/route.ts`) enruta 75+
handlers reals que viuen a `src/app/api/_impl/**/route.ts`. Si afegeixes un
endpoint: crea el handler i regenera:

```bash
python3 scripts/gen_api_dispatcher.py
```

`scripts/check_repo.mjs` (s'executa al `build` i al CI) **falla el build** si:
hi ha rutes API fora del dispatcher, o si una ruta `_impl` no està registrada
a la `TABLE` (drift → 404 silenciosos).

## Observabilitat i seguretat

- **Request ID + access logs JSON**: cada petició de l'API registra una línia
  `{ts, level, event:"api_access", reqId, method, path, status, ms}` i retorna
  la capçalera `X-Request-ID` (el cos d'error 500 també la inclou).
- **Sentry opcional sense SDK**: defineix `SENTRY_DSN` a Vercel i els errors
  no capturats s'envien a l'Envelope API (màx 3 per invocació); sense DSN,
  res no canvia ni falla.
- **Rate limiting**: límit atòmic per PostgreSQL (`RateLimit`) per IP i per
  usuari a auth (login 10/min, registre 8/min), PDF (10/min), catastro
  (30-60/min), admin i crons; degradació fail-open documentada a
  `src/lib/rate-limit.ts`. No cal Upstash: la BD ja és un punt únic atòmic.
- **Capçaleres** (`next.config.ts`): HSTS preload, CSP completa en producció
  (`default-src 'self'`, `frame-ancestors`, `object-src 'none'`…), nosniff,
  Referrer-Policy, Permissions-Policy. Cookies de sessió `httpOnly`,
  `SameSite=Lax` (compatible amb el callback OAuth), `Secure` en prod;
  revocació global via `tokenVersion`. Rotació d'`AUTH_SECRET`: en canviar-la,
  totes les sessions JWT existents deixen de validar-se (les sessions moren;
  els usuaris tornen a entrar).

## Backups i migracions

- 9 migracions Prisma versionades; Vercel executa `prisma migrate deploy` al
  build (aditives, mai destructives).
- **Backup independent** (regla 3-2-1): `scripts/backup_pg.sh` fa dump
  comprimit amb retenció de 30 dies i verificació de mida:

  ```bash
  DATABASE_URL="postgresql://..." ./scripts/backup_pg.sh ./backups
  # restore:
  gunzip -c backups/preureal_XXXX.sql.gz | psql "$DATABASE_URL"
  ```

  El hosting gestionat fa snapshots puntuals; aquest dump és la còpia fora de
  la plataforma. Programa'l amb cron (vegeu la capçalera del script).

## Ruta de millora coneguda (roadmap)

1. **Cola per informes PDF**: la generació és síncrona (pdf-lib, ~50-150 ms);
   amb quota per pla (5/mes Premium, 30/mes Pro) el risc és baix, però si el
   volum creix, moure a Inngest/Trigger.dev amb notificació per correu.
2. **Tests F4**: corregir les 2 expectatives antigues de `computeValuation`.
3. **E2E en CI**: job de Playwright amb `PLAYWRIGHT_BASE_URL` del preview.
4. **Uptime històric**: pàgina pública `/#/estat` amb sondes en directe; per
   uptime % continu, connectar un monitor extern (UptimeRobot/Better Stack).

## Estructura rellevant

```
src/app/api/[[...path]]/route.ts   dispatcher únic de l'API (generat, no editar)
src/app/api/_impl/**               handlers reals de cada endpoint
src/app/lloguer/**                 hub + fitxes SEO públiques (ISR 24 h)
src/components/AppShell.tsx        shell + routing per hash (/#/mapa, /#/preus…)
src/components/views/              vistes (Landing, Map, Comparador, Panel…)
src/lib/                           auth, plans, db, i18n, icgc, catastro, mail, observability…
prisma/                            esquema + 9 migracions PostgreSQL versionades
scripts/seed.ts                    dades reals (municipis, edificis, admin)
scripts/update_all.sh              refresc trimestral de dades oficials
scripts/backup_pg.sh               dump comprimit amb retenció 30 dies
tests/                             bun test (unitaris, TOTP, PDF, subscripcions)
tests/e2e-ui/                      Playwright (fluxos crítics)
.github/workflows/ci.yml           lint + typecheck + tests + audit + build
```

> Gestor de paquets: **npm** (`package-lock.json`). Neteja de les restes de Z.ai feta;
> detall a [MIGRATION_ZAI.md](MIGRATION_ZAI.md).
