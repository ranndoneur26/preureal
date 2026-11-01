# PreuReal.cat — El mapa del lloguer real de Catalunya

Plataforma amb el **preu real del lloguer** dels 947 municipis de Catalunya
(fiances Incasòl/Gencat), àrees de mercat tensat (DOGC), edificis reals ICGC,
comparador de municipis, històric d'anuncis, informes PDF i subscripcions
(Stripe: Free / Premium 7,99 € / Pro 19,99 €).

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind 4 + shadcn/ui
- **Prisma + PostgreSQL** (Neon/Supabase en producció)
- API consolidada en **3 Serverless Functions** per complir el límit del pla
  Hobby de Vercel (`/api/[[...path]]` catch-all + `/api/health` +
  `/api/stripe/webhook`)

## Desplegament a Vercel

Guia completa pas a pas: **[VERCEL.md](VERCEL.md)** — resum:

```bash
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  bunx prisma migrate deploy
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  bun run scripts/seed.ts
```

Puja el repo a GitHub → `vercel.com/new` → variables `DATABASE_URL`,
`NEXT_PUBLIC_SITE_URL`, `AUTH_SECRET` (detalls i llista completa a VERCEL.md).

## Desenvolupament local

Cal un PostgreSQL accessible (local, Docker o Neon de desenvolupament):

```bash
bun install
DATABASE_URL="postgresql://usuari:clau@localhost:5432/preureal" bun run dev
# http://localhost:3000
```

## Estructura rellevant

```
src/app/api/[[...path]]/route.ts   dispatcher únic de l'API (generat)
src/app/api/_impl/**               handlers reals de cada endpoint
src/lib/                           auth, plans, db, validació…
prisma/                            esquema + migració versionada
scripts/seed.ts                    dades reals (municipis, edificis, admin)
scripts/update_all.sh              refresc trimestral de dades oficials
```

Per afegir un endpoint nou: crea el handler a `src/app/api/_impl/<ruta>/route.ts`
i re-executa `python3 scripts/gen_api_dispatcher.py` (vegeu VERCEL.md §5).
