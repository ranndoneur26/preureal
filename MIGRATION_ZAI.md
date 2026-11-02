# MIGRATION_ZAI — Plan de migración de dependencias de Z.ai

## Conclusión
El proyecto **no usa SDK, API ni servicios de Z.ai**. Es autónomo con PostgreSQL + servicios públicos (ICGC, Catastro, Stripe, Resend, Google). Lo que queda son **restos del entorno sandbox** de Z.ai: código/rutas que asumen su máquina.

## Estado
Hechos: #1, #2, #3, #4, #5 y #8 (npm). Pendientes: #6 (`.gitignore`, inocuo), #7 (CSP en dev, decisión tuya) y #9 (auditar dependencias).

## Inventario exacto

| # | Dónde | Qué es | Impacto | Sustitución propuesta |
|---|---|---|---|---|
| 1 | `src/instrumentation.ts` | Arranca un PostgreSQL embebido (`.localpg`) con `scripts/pg_local.sh` (no incluido) y reescribe `DATABASE_URL` si recibe `file:`. | En local, ruido o error si no hay Postgres en 5432. No afecta a Vercel (se salta). | Dejar solo el log de conexión. Para BD local: `docker run postgres` o Neon dev (documentado en README). |
| 2 | `scripts/gen_api_dispatcher.py` (`ROOT`) | Ruta fija `/home/z/my-project`. | El generador falla fuera del sandbox. | `ROOT = Path(__file__).resolve().parent.parent`. |
| 3 | `scripts/prepare_data.py` (`OUT`) | Ruta fija `/home/z/my-project/data`. | Idem. | Ruta relativa al script. |
| 4 | `scripts/update_all.sh` | Cron de ejemplo y `PREUREAL_DB` con `/home/z/…`; exige `db/` si no hay Postgres; textos de SQLite. | Confunde; falla sin `db/`. | Quitar rama SQLite, usar `$ROOT`. |
| 5 | `VERCEL.md`, `schema.prisma` | Citan `DEPLOY.md`, `docker-compose.yml`, `make_zip.py`, `migrate_sqlite_to_pg.py`, `db/custom.db` (no existen en el ZIP). | Documentación rota. | Eliminar referencias o recrear los archivos si los necesitas. |
| 6 | `.gitignore` | `.z-ai-config`, `.localpg/`, `dev.log`, `server.log`, "carpeta skills del sandbox". | Ninguno funcional. | Dejar o depurar. |
| 7 | `next.config.ts` | Comentarios y CSP `frame-ancestors '*'` en dev para el preview iframe de Z.ai. | Solo dev. | Dejar `'self'` por defecto también en dev (decisión tuya). |
| 8 | `package.json` | `dev`/`start` usan `tee dev.log/server.log` y `bun`. | Funciona; específico del sandbox. | Scripts estándar; elegir gestor. |
| 9 | Dependencias | `bun-types`, y extras del scaffold (mdxeditor, syntax-highlighter, dnd-kit, next-intl, zustand…). | Peso del bundle/instalación. | Auditar uso real y retirar solo lo comprobado como no usado. |

## Qué es autónomo y qué depende de externos
- **Autónomo (con Postgres)**: auth, planes, cuotas, comparador, admin, PDF, CSV, rate limit.
- **Depende de externos públicos**: edificios/geocodificación (ICGC), año de construcción (Catastro), pagos (Stripe), correo (Resend), Google login. Todos degradan con elegancia si faltan claves (DEMO, sandbox de correo, botón Google oculto).

## Orden de migración (cada paso independiente y reversible)
1. Verificar build en tu entorno (sin cambios).
2. Corregir rutas fijas (#2, #3, #4): bajo riesgo, no afecta a la app.
3. Simplificar `instrumentation.ts` (#1) tras probar con Postgres local.
4. Limpiar documentación (#5) y `.gitignore` (#6).
5. Decidir CSP/dev y gestor de paquetes (#7, #8).
6. Auditar dependencias (#9) con `depcheck` y retirar solo con tu aprobación.
