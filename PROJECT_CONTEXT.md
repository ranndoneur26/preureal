# PROJECT_CONTEXT — PreuReal.cat

> Documento de referencia para continuar el desarrollo desde Claude.
> Estado: análisis del ZIP `PreuReal-cat-Vercel-v7` (versión `0.3.0`). Ningún archivo de código modificado.
> Última verificación: lint y tipos ejecutados; **build completo no verificado** (ver §9).

## 1. Qué es

Plataforma web con el **precio real del alquiler en Cataluña**: 947 municipios con datos de fianzas del Incasòl (Gencat), marca de **áreas de mercado residencial tensado** (DOGC), edificios reales (ICGC), comparador, historial, informes PDF y suscripciones (Free / Premium 7,99 € / Pro 19,99 €). Interfaz bilingüe catalán (por defecto) / castellano.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Estilos | Tailwind 4 (`@tailwindcss/postcss`, `tw-animate-css`), shadcn/ui (Radix) |
| Mapa | Leaflet 1.9 |
| BD | PostgreSQL vía Prisma 6 (Neon/Supabase), 18 tablas |
| Auth | JWT HS256 (`jose`) en cookie `pr_session`, `bcryptjs`, Google OAuth opcional |
| Pagos | Stripe 23 (checkout, webhook, portal) + modo DEMO |
| Correo | Resend (opcional); sin clave → tabla `EmailLog` (sandbox) |
| PDF | `pdf-lib` |
| Gestor | **npm** (`package-lock.json`); `tsx` para el seed |
| Despliegue | Vercel Hobby (3 funciones serverless) o self-host `standalone` |

Dependencias instaladas y no usadas aparentemente en el flujo principal (no tocar sin comprobar): `@mdxeditor/editor`, `react-syntax-highlighter`, `@dnd-kit/*`, `next-intl`, `zustand`, `@tanstack/*`, `embla-carousel`, `framer-motion`, `recharts` (parte son extras del scaffold de Z.ai).

## 3. Arquitectura

- **SPA con hash-routing**: `src/app/page.tsx` → `AppShell` decide la vista según `location.hash` (`/#/mapa`, `/#/comparador`, `/#/preus`, `/#/registre`, `/#/entrada`, `/#/oblidat`, `/#/restablir?token=`, `/#/panell`, `/#/admin`, `/#/avis-legal`, `/#/privacitat`, `/#/subscripcio/exit|cancelat`).
- **Contexto global** (`components/app-context.ts`): `locale`, `t` (diccionario), `navigate`, `auth {user, quota, refresh}`.
- **API consolidada**: handlers reales en `src/app/api/_impl/**/route.ts`; `src/app/api/[[...path]]/route.ts` es un **dispatcher autogenerado** (`scripts/gen_api_dispatcher.py`, no editar a mano). `api/health` y `api/stripe/webhook` son funciones propias (el webhook necesita el cuerpo crudo).
- **Sesión**: `requireUser()` valida JWT **y** consulta la BD (activo, `tokenVersion`); `getSession()` solo JWT (para teaser vs registro).
- **Rate limit** compartido en Postgres (`INSERT … ON CONFLICT`), con fallback en memoria.
- **Cuotas/planes**: `lib/plans.ts`, valores por defecto + override en tabla `PlanSetting` (caché 30 s) editable desde Admin.

## 4. Estructura de carpetas

```
prisma/                 schema.prisma + migrations/20261102000000_init_postgres
public/                 logo.svg, robots.txt, sitemap.xml
data/municipalities.json   947 municipios (seed)
scripts/
  seed.ts               municipios + edificios Eixample (ICGC) + admin
  prepare_data.py       Socrata + Excels Incasòl + listas tensadas → data/*.json
  update_all.sh         refresco trimestral
  gen_api_dispatcher.py regenera el dispatcher de la API
  check_repo.mjs        guardia anti-repo mezclado (build)
src/
  app/                  layout.tsx (SEO/JSON-LD), page.tsx, globals.css, api/
  components/           AppShell, CookieConsent, app-context, views/*, ui/* (shadcn)
  hooks/                use-toast, use-mobile
  lib/                  auth, db, plans, security, rate-limit, i18n, icgc, catastro,
                        geocode, google, mail, email, utils
  instrumentation.ts    hook de arranque (ver §8: resto de Z.ai)
```

## 5. Funcionalidades existentes

**Públicas**: landing; mapa (búsqueda de municipio, dirección vía ICGC y referencia catastral; edificios desde zoom 16; panel de detalle); comparador de hasta 6 entidades; precios; registro/login/recuperación; avisos legales; cookies.

**Consulta detallada** (`POST /api/lookup`): sin sesión → *teaser*; Free → 3/mes (402 paywall al agotar); Premium/Pro → ilimitadas. Devuelve precio medio, contratos, zona tensada, refcat (ICGC), año de construcción (Catastro) y, si existe, precio por edificio importado.

**Panel de usuario** (`/#/panell`): resumen, perfil, facturación, historial (Premium+), favoritos (Premium+), comparaciones guardadas, informes de precio enviados, seguridad (cambio de contraseña, exportación y borrado de cuenta).

**Admin** (`/#/admin`): estadísticas/embudo, usuarios (plan, rol, desactivar), correos, importación de datos por edificio, moderación de informes, ajustes de planes, auditoría, export CSV.

**Planes** (`lib/plans.ts`): Free (comparador); Premium (+historial, favoritos, PDF municipio); Pro (+CSV, PDF edificio).

**Otros**: informes PDF (`/api/reports/pdf`), export CSV por municipio, `provenance` (fuentes y licencias), analítica de eventos, JSON-LD y metadatos OG.

## 6. Modelo de datos (Prisma)

User, Subscription, PasswordToken, EmailToken, Municipality, Building, SearchLog, Event, PriceReport, EmailLog, RateLimit, StripeEvent, AuditLog, ImportRun, PlanSetting, Favorite, SavedComparison. Campos JSON guardados como `String` (`rentHistory`, `polygonJson`, `features`, `entities`, `meta`).

## 7. Integraciones externas y variables de entorno

| Servicio | Uso | Variables |
|---|---|---|
| PostgreSQL | BD | `DATABASE_URL` (obligatoria) |
| — | firma de sesiones, sal de IP | `AUTH_SECRET` (obligatoria en Vercel) |
| — | URL canónica, OAuth, Stripe | `NEXT_PUBLIC_SITE_URL` |
| Stripe | pagos | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PREMIUM`, `STRIPE_PRICE_PRO`, `DEMO_CHECKOUT` |
| Resend | correo | `RESEND_API_KEY`, `MAIL_FROM` |
| Google OAuth | login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| ICGC API Territorial / Geocodificador | edificios, geocodificación | sin clave |
| Catastro (OVC) | año de construcción | sin clave |
| Seed | contraseña admin | `ADMIN_PASSWORD` |
| Cabeceras | CSP frame-ancestors | `FRAME_ANCESTORS` |

Admin creado por el seed: `admin@preureal.cat`.

## 8. Dependencias de Z.ai (resto del sandbox)

No hay SDK ni servicios de Z.ai. Los restos de entorno (rutas fijas, arranque de Postgres embebido, referencias a archivos inexistentes, bun) ya se han limpiado; detalle en `MIGRATION_ZAI.md`.

## 9. Estado actual y problemas detectados

- **Build**: no verificado aquí (el sandbox bloquea la descarga de motores de Prisma, `binaries.prisma.sh` 403). Los 12 errores de `tsc` observados se deben a que el cliente Prisma no se pudo generar.
- **Lint**: 12 errores `react-hooks/set-state-in-effect` / `immutability` (carousel, ComparadorView ×2, MapView ×4, PanelView ×3, use-mobile). No rompen `next build`.
- **Zonas tensadas (resuelto)**: son 171 (118 en TER/3739/2026 + 53 en TER/3740/2026). Palamós (código 171181, "Palamós i Sant Joan" en Socrata) no cruzaba por nombre; corregido con `NAME_ALIASES` en `prepare_data.py` y parcheado en `data/municipalities.json`. Palamós sigue sin dato de alquiler hasta el próximo refresco con `update_all.sh` (no se ha inventado ningún valor). Solo 692/947 municipios tienen alquiler.
- **Corregido**: 947 municipios en todo el texto, "datos hasta 2025", histórico "2005–2025", lista tensada "C" en schema y PDF (el PDF mostraba la "C" sin etiqueta porque comparaba con "B").
- **Legal**: `LegalView` con huecos (razón social, NIF, domicilio, contacto).
- **SEO**: hash-routing; `sitemap.xml` lista URLs con `#/`.
- **`tailwind.config.ts`** (sintaxis Tailwind 3, `hsl(var())`) sin efecto con Tailwind 4.
- **Sin tests.**
- `next.config.ts`: `output: standalone` fuera de Vercel; `reactStrictMode: false`.

## 10. Pendiente de producto

Stripe real (precios, webhook, `DEMO_CHECKOUT=false`); datos a nivel edificio/illa (convenio Incasòl); Resend con dominio verificado; Google OAuth en producción; textos legales; ver `TASKS.md`.

## 11. Ejecutar el proyecto

```bash
npm install --legacy-peer-deps
cp .env.production.example .env  # rellenar DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_SITE_URL
npx prisma migrate deploy
ADMIN_PASSWORD="…" npm run db:seed
npm run dev                      # http://localhost:3000
```

Necesita un PostgreSQL accesible (Docker local o Neon de desarrollo). Producción: `VERCEL.md`.

## 12. Reglas de trabajo acordadas

No eliminar ni simplificar funcionalidades; no cambiar el diseño visual sin autorización; no sustituir componentes funcionales sin motivo; no inventar funcionalidades; conservar dependencias compatibles; trabajo incremental, entregando archivos completos.
