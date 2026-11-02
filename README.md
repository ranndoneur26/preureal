# PreuReal.cat — El mapa del lloguer real de Catalunya

Plataforma amb el **preu real del lloguer** dels 947 municipis de Catalunya
(fiances Incasòl/Gencat), àrees de mercat tensat (DOGC), edificis reals ICGC,
comparador de municipis, històric de consultes, informes PDF i subscripcions
(Stripe: Free / Premium 7,99 € / Pro 19,99 €). Interfície en català i castellà.

## Documentació del projecte

| Fitxer | Contingut |
|---|---|
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Context complet: arquitectura, funcionalitats, estat, problemes |
| [TASKS.md](TASKS.md) | Tasques pendents per prioritat |
| [MIGRATION_ZAI.md](MIGRATION_ZAI.md) | Restes de l'entorn Z.ai i pla de neteja |
| [VERCEL.md](VERCEL.md) | Desplegament a Vercel pas a pas |

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind 4 + shadcn/ui + Leaflet
- **Prisma + PostgreSQL** (Neon/Supabase en producció)
- Auth pròpia (JWT en cookie httpOnly), Stripe, Resend (opcional), Google OAuth (opcional)
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

## Desplegament a Vercel

Guia completa: **[VERCEL.md](VERCEL.md)**. Resum: BD Neon → `prisma migrate deploy` + seed →
repo a GitHub → `vercel.com/new` → variables `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `AUTH_SECRET`.

## Estructura rellevant

```
src/app/api/[[...path]]/route.ts   dispatcher únic de l'API (generat, no editar)
src/app/api/_impl/**               handlers reals de cada endpoint
src/components/AppShell.tsx        shell + routing per hash (/#/mapa, /#/preus…)
src/components/views/              vistes (Landing, Map, Comparador, Panel, Admin…)
src/lib/                           auth, plans, db, i18n, icgc, catastro, mail…
prisma/                            esquema + migració versionada
scripts/seed.ts                    dades reals (municipis, edificis, admin)
scripts/update_all.sh              refresc trimestral de dades oficials
```

Per afegir un endpoint nou: crea el handler a `src/app/api/_impl/<ruta>/route.ts`
i re-executa `python3 scripts/gen_api_dispatcher.py` (vegeu VERCEL.md §5).

> Gestor de paquets: **npm** (`package-lock.json`). Neteja de les restes de Z.ai feta;
> detall a [MIGRATION_ZAI.md](MIGRATION_ZAI.md).
