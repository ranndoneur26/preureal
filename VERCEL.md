# PreuReal.cat — Desplegament a Vercel (PostgreSQL)

Guia per desplegar a Vercel amb **base de dades persistent** (Fase 4.1).
L'aplicació ara usa **PostgreSQL** (Neon/Supabase) — les dades sobreviuen a
reinicis i cold starts, i usuaris/subscripcions són reals.

## 1. Crea la base de dades PostgreSQL

**Neon (recomanat, plan gratuit):**
1. https://neon.tech → crea projecte `preureal` (regió EU-central).
2. Copia el **Pooled connection string** (conté `-pooler`).

**Supabase (alternativa):** Settings → Database → Connection string (Pooled).

## 2. Aplica l'esquema i les dades

```bash
# 2a. Esquema (17 taules, migració versionada):
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  bunx prisma migrate deploy

# 2b. Dades reals: 948 municipis amb lloguer Incasòl, edificis ICGC de
#     l'Eixample (API ICGC) i usuari administrador:
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  ADMIN_PASSWORD="una-contrasenya-forta" bun run scripts/seed.ts
# → credencials admin: admin@preureal.cat / $ADMIN_PASSWORD
```

> Alternativa: amb el paquet complet (el genera `python3 scripts/make_zip.py --full`)
> tens `db/custom.db` (l'arxiu SQLite original amb usuaris, informes i historial).
> Per portar TOTES les dades: `python3 scripts/migrate_sqlite_to_pg.py` (vegeu DEPLOY.md
> d'aquell paquet).

## 3. Puja el codi a Vercel

El paquet `preureal-vercel-v5.zip` conté **només els fitxers necessaris per
al desplegament**: codi font, Prisma, configs, dades de seed i aquesta guia.
Sense infraestructura local (SQLite, Docker, scripts del sandbox).

```bash
unzip preureal-vercel-v5.zip -d preureal && cd preureal
git init && git add -A && git commit -m "PreuReal.cat"
# GitHub → vercel.com/new → import → framework Next.js (auto)
```

El build no necessita cap configuració addicional:

- `postinstall` → `prisma generate` (el client Prisma es genera sempre)
- `build` → `node scripts/check_repo.mjs && prisma generate && next build`
  — el guardia `check_repo.mjs` detecta repos **mezclados** (p. ex. una
  carpeta `app/` antiga a l'arrel al costat de `src/app/`, que fa fallar
  Turbopack amb `Can't resolve './globals.css'`) i explica com arreglar-ho
- Vercel detecta `bun.lock` i instal·la amb Bun (si preferiu npm, afegiu
  un `package-lock.json` propi)
- API consolidada en **3 Serverless Functions** (límit del pla Hobby:
  12) — vegeu la nota de la secció 5

## 4. Variables d'entorn (Vercel → Settings → Environment Variables)

| Variable                | Valor                                             | Obligatòria |
|-------------------------|---------------------------------------------------|-------------|
| `DATABASE_URL`          | `postgresql://...-pooler...neon.tech/preureal?sslmode=require` | ✅ |
| `NEXT_PUBLIC_SITE_URL`  | `https://el-teu-projecte.vercel.app` o domini     | ✅ |
| `AUTH_SECRET`           | `openssl rand -hex 32`                            | ✅ |
| `DEMO_CHECKOUT`         | `true` mentre no hi hagi Stripe real              | Recomanada  |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth (redirect URI: `https://DOMINI/api/auth/google/callback`) | Opcional |
| `RESEND_API_KEY` / `MAIL_FROM` | correus reals (sense: sandbox a EmailLog)  | Opcional    |
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
- Per VPS/Docker amb PostgreSQL local, vegeu `DEPLOY.md` i `docker-compose.yml`.
