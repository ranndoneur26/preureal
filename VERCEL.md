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
# des del projecte:
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  bunx prisma migrate deploy          # crea les 17 taules (migració versionada)

# porta les dades reals de l'arxiu SQLite (947 municipis, edificis, usuaris):
DATABASE_URL="postgresql://...neon.tech/preureal?sslmode=require" \
  python3 scripts/migrate_sqlite_to_pg.py
# → verifica integritat taula a taula (recomptes + mostra Barcelona)
```

## 3. Puja el codi a Vercel

```bash
unzip preureal-vercel.zip -d preureal && cd preureal
git init && git add -A && git commit -m "PreuReal.cat"
# GitHub → vercel.com/new → import → framework Next.js (auto)
```

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
