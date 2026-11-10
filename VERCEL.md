# PreuReal.cat — Desplegament a Vercel (PostgreSQL)

Guia per desplegar a Vercel amb **base de dades persistent** (Fase 4.1).
L'aplicació ara usa **PostgreSQL** (Neon/Supabase) — les dades sobreviuen a
reinicis i cold starts, i usuaris/subscripcions són reals.

## 1. Crea la base de dades PostgreSQL

**Supabase (projecte ja creat):** entra al teu projecte a supabase.com`
1. Dashboard → **Project Settings → Database → Connection string → URI**.
2. Per al **runtime** (Vercel): usa el **Connection pooler** (port `6543`,
   transacció) — `postgresql://postgres.<PROJECT-REF>:[DB-PASSWORD]@aws-0-<regio>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`
3. Per fer el **migrate deploy** una vegada: usa el mode **session** (port
   `5432` del pooler) o la connexió directa — Prisma necessita una sessió
   real per crear l'esquema (pgBouncer en mode transacció no ho permet).
4. La contrasenya és la **Database Password** del projecte (Settings →
   Database). Si no la tens: Reset database password.
5. ⚠️ Les claus **anon / service_role JWT NO serveixen** per connectar Prisma:
   aquesta app parla directe amb PostgreSQL, no fa servir el SDK de Supabase.
   La `service_role` és un secret: no la shares ni la commitis (si s'ha
   compartit per xat, **rotala** a Settings → API).

**Neon (alternativa, plan gratuit):**
1. https://neon.tech → crea projecte `preureal` (regió EU-central).
2. Copia el **Pooled connection string** (conté `-pooler`).

## 2. Aplica l'esquema i les dades

```bash
# 2a. Esquema (migracions versionades — aplica TOTES les pendents, p. ex. la
#     telemetria EmailLog de v19):
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  npx prisma migrate deploy

# 2b. Dades reals: 947 municipis amb lloguer Incasòl, edificis ICGC de
#     l'Eixample (API ICGC) i usuari administrador:
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  ADMIN_PASSWORD="una-contrasenya-forta" npm run db:seed
# → credencials admin: admin@preureal.cat / $ADMIN_PASSWORD
```

> ✅ **v20 en endavant**: les migracions s'apliquen SOLES — el build de Vercel
> executa `prisma migrate deploy` abans de compilar (les migracions són
> idempotents: es poden aplicar dues vegades sense error). Si preferissis
> aplicar-les a mà, segueix sent possible amb la comanda del pas 2a o
> enganxant el SQL de `prisma/migrations/<carpeta>/migration.sql` al SQL
> Editor de Supabase.


## 3. Puja el codi a Vercel

El paquet `PreuReal-cat-Vercel-v12.zip` conté **només els fitxers necessaris per
al desplegament**: codi font, Prisma, configs, dades de seed i aquesta guia.
Sense infraestructura local (SQLite, Docker, scripts del sandbox).

> ⚠️ **No ho pugis arrossegant fitxers a la web de GitHub**: la web només
> admet ~100 fitxers per pujada i `src/` en té 125 — la carpeta no pujaria
> i el build fallaria amb `Falta "src/app/"`. Fes servir `git` per terminal
> (o GitHub Desktop), com es mostra a sota.

```bash
unzip PreuReal-cat-Vercel-v12.zip -d preureal && cd preureal
git init && git add -A && git commit -m "PreuReal.cat v12"
git branch -M main
git remote add origin <URL-de-tu-repo>   # si el repo ja existeix
git push -uf origin main                 # -f substitueix el contingut vell
# GitHub → vercel.com/new → import → framework Next.js (auto)
```

El build no necessita cap configuració addicional:

- `postinstall` → `prisma generate` (el client Prisma es genera sempre)
- `build` → `node scripts/check_repo.mjs && prisma generate && prisma migrate deploy && next build`
  — el guardia `check_repo.mjs` detecta repos **mezclados**: una carpeta
  `app/` antiga a l'arrel (fallaria amb `Can't resolve './globals.css'`) o
  un `prisma/schema.prisma` antic amb `provider = "sqlite"` (fallaria amb
  el críptic `P1012: Environment variable not found: DATABASE_URL`) —
  i explica com arreglar-ho. **v20**: `prisma migrate deploy` aplica les
  migracions pendents a la BD abans de compilar (idempotent, segur).
- Vercel detecta `package-lock.json` i instal·la amb npm
- API consolidada en **3 Serverless Functions** (límit del pla Hobby:
  12) — vegeu la nota de la secció 5

## 4. Variables d'entorn (Vercel → Settings → Environment Variables)

| Variable                | Valor                                             | Obligatòria |
|-------------------------|---------------------------------------------------|-------------|
| `DATABASE_URL`          | `postgresql://...-pooler...neon.tech/preureal?sslmode=require` | ✅ |
| `NEXT_PUBLIC_SITE_URL`  | `https://www.preureal.com` (el domini real que fan servir els usuaris — els enllaços dels correus surten d'aquí) | ✅ |
| `AUTH_SECRET`           | `openssl rand -hex 32`                            | ✅ |
| `DEMO_CHECKOUT`         | `true` mentre no hi hagi Stripe real              | Recomanada  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth (redirect URI: `https://DOMINI/api/auth/google/callback`) | Opcional |
| `GOOGLE_REDIRECT_URI` | només si cal sobreescriure la redirect URI de Google | Opcional |
| `RESEND_API_KEY` / `MAIL_FROM` | correus reals (sense: sandbox a EmailLog)  | Opcional    |
| `CRON_SECRET`            | protegeix els cron de Vercel: `/api/cron/emails` (manteniment diari de correu) i `/api/cron/ine` (refresc trimestral INE) | Recomanada |
| `EMAILLOG_RETENTION_DAYS` | dies de retenció del log de correus (90 per defecte) | Opcional |
| `STRIPE_*`              | activació de pagaments reals                      | Opcional    |
| `FRAME_ANCESTORS`       | per defecte `'self'` en producció (anti-clickjacking); només canviar si s'incrusta el mapa com a widget en un altre domini | Opcional |

## 5. Actualitzar dades de lloguer

> **Nota sobre el límit de functions (pla Hobby):** Vercel Hobby permet màxim
> **12 Serverless Functions** per deployment. Per això l'API està consolidada en
> **3 functions**: el catch-all `/api/[[...path]]` (enruta les ~43 rutes via
> `src/app/api/_impl/**`, generat per `scripts/gen_api_dispatcher.py`),
> `/api/health` i `/api/stripe/webhook`. Si afegeixes una ruta nova:
> crea `src/app/api/<ruta>/route.ts` dins `_impl/` i re-executa el generador.
> En passar a Pro pots tornar a rutes individuals si ho prefereixes.

```bash
bash scripts/update_all.sh     # local: descarrega Excels oficials + Socrata → upsert a PG
```
(el script detecta `DATABASE_URL` postgres automàticament)

## Notes

- El pla **Hobby** de Vercel + **Neon free** són suficients per començar.
- Health check: `GET /api/health` inclou estat de la BD (latència) i integracions.
- Backups: Neon/Supabase en fan automàticament; extra: `pg_dump` programat.
- Autoallotjament (VPS/Docker): `npm run build:selfhost` i `npm start` (mode `standalone`) amb un PostgreSQL propi.
