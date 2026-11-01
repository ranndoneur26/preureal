# PreuReal.cat — Desplegament a Vercel

Guia per pujar aquest paquet a Vercel. Conté **només els fitxers necessaris**
(codi font, config de build, esquema Prisma i la base de dades amb les dades
reals ja carregades).

## Què hi ha dins

```
├── src/                    # Codi de l'aplicació (app, components, lib)
├── prisma/schema.prisma    # Esquema de la base de dades
├── db/custom.db            # SQLite amb les dades reals (947 municipis, lloguers Incasòl,
│                           #   àrees tensades DOGC, cache d'edificis ICGC) — SENSE usuaris
├── public/                 # logo, robots.txt, sitemap.xml
├── next.config.ts          # inclou la BD al bundle (outputFileTracingIncludes)
├── src/instrumentation.ts  # copia la BD a /tmp en arrencar (cold start)
├── package.json / bun.lock / tsconfig.json / tailwind.config.ts / postcss.config.mjs
├── .env.production.example # plantilla de variables d'entorn
└── .gitignore
```

**No inclou**: `.env` real (secrets), `node_modules`, builds, Docker/VPS ni els
scripts del pipeline de dades (`scripts/`) — per actualitzar dades cal
executar-los localment (vegeu més avall).

## Opció A — GitHub + Vercel (recomanada)

```bash
# 1) Descomprimeix i crea el repositori
unzip preureal-vercel.zip -d preureal
cd preureal
git init && git add -A && git commit -m "PreuReal.cat — deploy inicial"
# Crea un repo buit a github.com i:
git remote add origin git@github.com:USUARI/preureal.git
git push -u origin main
```

2. A [vercel.com/new](https://vercel.com/new) → importa el repositori.
3. Vercel detecta Next.js automàticament (build: `prisma generate && next build`).
4. Abans de fer el deploy, afegeix les **variables d'entorn** (taula inferior).
5. Deploy.

## Opció B — Vercel CLI

```bash
unzip preureal-vercel.zip -d preureal && cd preureal
npm i -g vercel
vercel          # primer deploy (preview)
vercel --prod   # producció
```

## Variables d'entorn (Vercel → Settings → Environment Variables)

| Variable                | Valor                                        | Obligatòria |
|-------------------------|----------------------------------------------|-------------|
| `DATABASE_URL`          | `file:/tmp/custom.db`                        | ✅ Sí        |
| `NEXT_PUBLIC_SITE_URL`  | `https://el-teu-projecte.vercel.app` (o domini propi) | ✅ Sí |
| `AUTH_SECRET`           | secret aleatori — `openssl rand -hex 32`     | ✅ Sí        |
| `DEMO_CHECKOUT`         | `true` (checkout de prova, no cobra)         | Recomanada   |
| `GOOGLE_CLIENT_ID`      | OAuth de Google Cloud Console                | Opcional     |
| `GOOGLE_CLIENT_SECRET`  | OAuth de Google Cloud Console                | Opcional     |
| `RESEND_API_KEY`        | correus reals (sense això: sandbox, només log BD) | Opcional |
| `MAIL_FROM`             | `PreuReal.cat <hola@el-teu-domini.cat>`      | Amb Resend   |
| `STRIPE_SECRET_KEY`     | activació de pagaments reals                 | Opcional     |
| `STRIPE_PRICE_PREMIUM`  | `price_...` (7,99 €/mes)                     | Amb Stripe   |
| `STRIPE_PRICE_PRO`      | `price_...` (19,99 €/mes)                    | Amb Stripe   |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...`                                  | Amb Stripe   |
| `ADMIN_PASSWORD`        | — no s'utilitza a Vercel (no hi ha seed)     | —            |

Si configures Google OAuth, afegeix a Google Cloud Console el redirect URI:
`https://EL-TEU-DOMINI/api/auth/google/callback`
(sense credencials, el botó «Continua amb Google» s'oculta sol).

## Com funciona la base de dades a Vercel (IMPORTANT)

- La SQLite **va incrustada al build** (`outputFileTracingIncludes`) i
  `src/instrumentation.ts` la copia a `/tmp/custom.db` en cada cold start.
- A Vercel el disc és **efímer**: registres d'usuari, informes i logs
  **es perden** quan la funció es reinicia. El mapa i totes les dades reals
  de lloguer funcionen perfectament (són de només lectura), però si vols
  usuaris/subscripcions persistents cal:
  - **VPS + Docker** (recomanat, vegeu `DEPLOY.md` del projecte complet), o
  - una BD gestionada (p. ex. Turso, que és SQLite compatible, o Neon/Postgres
    canviant el provider de Prisma).
- La BD incrustada s'ha **netejat**: no conté cap usuari, sessió, log ni correu
  de desenvolupament. Registra't normalment des de la web per provar el flux.
- Per tenir un admin a Vercel: crea'l localment i torna a pujar la BD:
  ```bash
  sqlite3 db/custom.db "UPDATE User SET role='ADMIN' WHERE email='tu@correo.com';"
  ```

## Actualitzar les dades de lloguer

El pipeline no corre a Vercel (necessita Python + descàrregues oficials):

```bash
# Al projecte complet (local o VPS):
bash scripts/update_all.sh          # descarrega Excels d'Incasòl + Socrata, regenera la BD
# Després substitueix db/custom.db en aquest paquet/repo i fa push a GitHub
# → Vercel farà redeploy automàtic amb les dades noves.
```

Frequència recomanada: lloguers 1×/any (Incasòl publica a primavera), àrees
tensades quan surti una resolució nova al DOGC (hi ha recordatoris creats).

## Notes

- El pla **Hobby** de Vercel és gratuït i suficient per provar el producte.
- Les peticions a ICGC/Catastro funcionen a Vercel (hi ha accés a internet en
  temps d'execució); Catastro pot ser lenta — l'app ja degrada amb elegància.
- Per producció real amb usuaris i pagaments, el camí recomanat continua sent
  **VPS + Docker + Caddy** (`DEPLOY.md`), amb SQLite persistent a disc.
