# PreuReal.cat — Guía de despliegue a producción

> **ACTUALITZACIÓ (2026-11):** la base de dades ara és **PostgreSQL** (servei inclòs
> a docker-compose.yml amb volum persistent i healthcheck). El volum ./dbdata i la
> SQLite ja no s'usen al desplegament Docker. Per migrar l'arxiu SQLite original:
> `docker compose run --rm dbinit python3 scripts/migrate_sqlite_to_pg.py`.
> Per desplegar a Vercel, vegeu VERCEL.md (Neon/Supabase).

> Última actualización: noviembre 2026 · Stack: Next.js 16 (standalone) + Prisma/PostgreSQL + Caddy + Docker
> Coste objetivo: **≈ 5 €/mes VPS + ≈ 15 €/año dominio** (coherente con el plan de negocio: break-even con 1–3 suscriptores)

---

## 0. Entorno de desarrollo local (sandbox / portátil del desarrollador)

PostgreSQL incrustado, persistente y sin root, dentro del propio proyecto (sin Docker):

```bash
bash scripts/pg_local.sh ensure          # arranca el clúster .localpg y crea la BD si falta
python3 scripts/migrate_sqlite_to_pg.py  # importa + verifica datos (idempotente, 7.617 filas)
```

- **Binarios**: `.localpg/vendor` (PostgreSQL 17 del paquete npm `@embedded-postgres/linux-x64`; si faltan, `pg_local.sh` los re-descarga solo).
- **Datos**: `.localpg/data` → sobreviven a reinicios/reciclajes; tras apagar la máquina basta `bash scripts/pg_local.sh start`.
- **`.env` local**: `DATABASE_URL=postgresql://preureal@127.0.0.1:5432/preureal`
- **Auto-reparación**: `src/instrumentation.ts` arranca el clúster al arrancar el servidor si la `DATABASE_URL` heredada es `file:` (la plataforma del sandbox inyecta SQLite) o si el clúster local no responde. Nunca se ejecuta en Vercel ni durante `next build`.
- **Keepalive (solo sandbox)**: `setsid nohup bash scripts/dev_keepalive.sh </dev/null >/dev/null 2>&1 &` mantiene el puerto 3000 arriba rearrancando `next dev` si el entorno lo mata.

---

## 1. Arquitectura

```
                    ┌──────────────────── VPS (Ubuntu 22.04/24.04) ────────────────────┐
Usuario ── HTTPS ──▶│  Caddy (:80/:443)  ──▶  App Next.js standalone (:3000)           │
   preureal.cat     │  · certificado TLS automático       · /api/*  (20 rutas)         │
   + www            │  · HTTP/3, gzip/zstd                · /#map  (Leaflet + ICGC)    │
                    │                                          │                      │
                    │                                     ./dbdata/custom.db           │
                    │                                     (SQLite en bind mount)       │
                    └──────────────────────────────────────────────────────────────────┘
                     Externas (en vivo, sin estado): Incasòl/Gencat · Socrata ·
                     ICGC · Catastro · (Stripe/Resend cuando se activen)
```

Decisiones clave:

| Decisión | Razón |
|---|---|
| **SQLite en bind mount `./dbdata`** | Cero dependencias externas, backup = copiar un fichero. La carga prevista (miles de consultas/día) es trivial para SQLite en modo WAL. |
| **Docker Compose** | Reproducible en cualquier VPS, rollback trivial, actualización con 2 comandos. |
| **Caddy** | HTTPS automático de Let's Encrypt (renueva solo), HTTP/3, configuración de 20 líneas. |
| **Datos oficiales "pull"** | Las fuentes (Incasòl, ICGC, Catastro) se consultan en vivo o se cargan con `update_all.sh`; no hay nada que sincronizar en el servidor. |

Contenedores: **dbinit** (imagen `preureal/tools`: esquema + seed idempotente, corre antes de la app; también sirve para actualizar datos oficiales) → **app** (imagen `preureal/app`: servidor standalone mínimo) → **caddy** (proxy + TLS).

---

## 2. Lo que hay que contratar (pendiente de tu autorización)

| Servicio | Recomendación | Precio | Alternativas |
|---|---|---|---|
| VPS 2 vCPU / 4 GB RAM / 40 GB | **Hetzner CX22** (Falkenstein/Helsinki) | ≈ 4,5 €/mes | Contabo (5 €), OVH (4 €), Netcup |
| Dominio | **Porkbun / Namecheap** — `preureal.cat` | ≈ 15 €/año | Cloudflare (al coste), Dinahosting (soporte .cat) |
| Email transaccional | **Resend** (capa gratuita) | 0 € hasta 3.000/mes | Brevo, Postmark |

> El `.cat` funciona igual en cualquier registrador; si te importa el soporte en catalán/español, Dinahosting o Nominalia.

Total arranque: **≈ 20 €** el primer año de software + 5 €/mes. Nada más.

---

## 3. Despliegue paso a paso

### Paso 1 — VPS
1. Crea el VPS (Ubuntu 24.04, clave SSH, sin IPv6 si quieres simplificar).
2. Anota la IP pública (ej. `203.0.113.10`).
3. Bootstrap del servidor:
   ```bash
   scp scripts/deploy_vps.sh root@203.0.113.10:
   ssh root@203.0.113.10 "bash deploy_vps.sh"
   ```
   Esto instala Docker, configura UFW (solo 22/80/443) y crea el usuario `deploy`.

### Paso 2 — Código en el servidor
Sube el repo a Git (GitHub/GitLab privado) y clona:
```bash
su - deploy
git clone git@github.com:TU_USUARIO/preureal.git ~/preureal && cd ~/preureal
```
> Alternativa sin Git: `rsync -av --exclude node_modules --exclude .next --exclude dbdata ./ deploy@203.0.113.10:~/preureal/`

### Paso 3 — Secretos
```bash
cp .env.production.example .env
nano .env
```
Rellena **mínimo**: `AUTH_SECRET` (`openssl rand -hex 32`), `ADMIN_PASSWORD` (¡no la de desarrollo!), `NEXT_PUBLIC_SITE_URL=https://preureal.cat`, `DOMAIN=preureal.cat`. Deja `DEMO_CHECKOUT=true` hasta activar Stripe real (§8).

### Paso 4 — Arranque
```bash
docker compose build        # 3–6 min la primera vez
docker compose up -d        # dbinit → app → caddy
docker compose ps           # app y caddy "running", dbinit "exited (0)"
docker compose logs -f app  # Ctrl+C para salir
```

### Paso 5 — DNS (en tu registrador)
| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `@` | `203.0.113.10` | 3600 |
| A | `www` | `203.0.113.10` | 3600 |

Cuando el DNS propague, Caddy obtiene el certificado automáticamente (puede tardar ~1 min). Comprueba: `docker compose logs caddy | grep certificate`.

> **Modo prueba sin dominio**: antes de comprarlo puedes validar todo con `DOMAIN=:80` y comentando el bloque `www` en `deploy/Caddyfile.prod` — accederías por `http://203.0.113.10`.

### Paso 6 — Verificación post-despliegue
```bash
curl -s https://preureal.cat/api/health | python3 -m json.tool
```
Checklist: `status: "ok"` · ICGC `ok:true` · Catastro puede dar `404` en el *healthcheck* (endpoint HEAD; el lookup real funciona con degradación elegante — no bloquea). Luego en navegador:
- [ ] El mapa carga edificios del Eixample y al clicar muestra precio real
- [ ] Buscador: "Girona" → vuela y marca zona tensada
- [ ] Registro de usuario + login
- [ ] Login admin y **cambia la contraseña del admin** la primera vez
- [ ] Pago demo → paywall → estado premium (DEMO_CHECKOUT=true)
- [ ] `https://www.preureal.cat` redirige a `https://preureal.cat`

---

## 4. Backups

Automático con cron (en el host):
```bash
crontab -e
# 15 3 * * * cd ~/preureal && bash scripts/backup_db.sh >> dbdata/backup.log 2>&1
```
`backup_db.sh` copia con `sqlite3 .backup` (consistente con la app en marcha), valida integridad, comprime y conserva 30 días. **Prueba el primer backup a mano** al desplegar.

**Restaurar**:
```bash
docker compose stop app
gunzip -c dbdata/backups/custom-2026-11-10_0315.db.gz > dbdata/custom.db
docker compose start app
```
> Recomendado: sincroniza `dbdata/backups/` a otro sitio (restic a Backblaze B2, o `rclone` a tu NAS) — un backup en el mismo disco no es un backup.

---

## 5. Actualizaciones

**App (nueva versión de código):**
```bash
cd ~/preureal
git pull
docker compose build
docker compose up -d        # recrea solo lo cambiado; dbinit es idempotente
```

**Datos oficiales (Incasòl/DOGC):** igual que en desarrollo, un solo comando:
```bash
docker compose run --rm dbinit bash scripts/update_all.sh
```
> La imagen `preureal/tools` incluye python3 + openpyxl + curl: el script completo (descarga de Excels, pipeline y seed) corre dentro del contenedor y escribe en el volumen `./dbdata`. Los recordatorios programados de DOGC (abril/octubre) te avisarán.

**Rollback de la app:**
```bash
git checkout v1.0.0 && docker compose build && docker compose up -d
```
(Etiqueta versiones: `git tag v1.0.0` en cada release.)

---

## 6. Incidentes frecuentes

| Síntoma | Diagnóstico | Solución |
|---|---|---|
| `502 Bad Gateway` | App caída | `docker compose logs app` · `docker compose restart app` |
| Sin certificado TLS | DNS no propagado o puertos cerrados | `dig +short preureal.cat` · UFW 80/443 abiertos · `docker compose logs caddy` |
| `dbinit` falla con ICGC | API externa caída | No bloquea a la app; reintenta con `docker compose restart dbinit` o `update_all.sh` |
| `dbinit` se queda colgado | `prisma db push` pidiendo confirmación por cambio destructivo de esquema | `docker compose down`, revisa el cambio de esquema; en desarrollo usa `bun run db:push` (nunca `--accept-data-loss` en producción sin backup previo) |
| Disco lleno | Logs de Caddy/backups | `docker compose logs caddy` ya rota (5×50 MB); revisa `dbdata/backups` |
| BD corrupta (improbable) | `integrity_check` falla | Restaurar backup (§4) |

---

## 7. Seguridad mínima operacional

- [ ] `AUTH_SECRET` único y aleatorio (regenerar si se filtró alguna vez)
- [ ] `ADMIN_PASSWORD` distinta de la de desarrollo (cámbiala en el primer login)
- [ ] UFW activo: solo 22/80/443; SSH con clave (deshabilita `PasswordAuthentication` en `/etc/ssh/sshd_config`)
- [ ] `apt unattended-upgrades` (viene activado por defecto en Ubuntu server)
- [ ] Backups diarios verificados + copia externa
- [ ] No publiques el `.env` ni lo commits (gitignore ya lo cubre)

---

## 8. Activar pagos reales, email y Google OAuth (CUANDO lo autorices)

**Stripe** (no se toca hasta tu OK):
1. Cuenta Stripe + 2 precios: Premium 7,99 €/mes y Pro 19,99 €/mes.
2. `.env`: `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_PRICE_PREMIUM=price_…`, `STRIPE_PRICE_PRO=price_…`.
3. Webhook: `https://preureal.cat/api/stripe/webhook` → evento `checkout.session.completed` → copia el `whsec_…` a `STRIPE_WEBHOOK_SECRET`.
4. `DEMO_CHECKOUT=false` y `docker compose up -d`.
5. Prueba de humo: compra real de 1 mes y cancelación inmediata.

**Email (Resend):**
1. Alta en Resend, verifica `preureal.cat` (registro DNS SPF/DKIM que te dan).
2. `.env`: `RESEND_API_KEY=re_…`, `MAIL_FROM="PreuReal.cat <hola@preureal.cat>"` → `docker compose up -d`.
   Sin clave, la app sigue funcionando con el proveedor `sandbox` (solo log en `EmailLog`).

**Google OAuth — botón "Continua amb Google"** (opcional; sin credenciales el botón se oculta solo):
1. Ve a [Google Cloud Console](https://console.cloud.google.com) → crea un proyecto (ej. "PreuReal.cat").
2. **APIs y servicios → Pantalla de consentimiento OAuth**: tipo *Externo*, nombre de la app, email de soporte, dominio `preureal.cat`. Alcances sugeridos: `openid`, `email`, `profile` (no sensibles, no requieren verificación de Google).
3. **Credenciales → Crear credenciales → ID de cliente OAuth** → tipo *Aplicación web*:
   - Orígenes JavaScript autorizados: `https://preureal.cat` (y `http://localhost:3000` para desarrollo)
   - URI de redirección autorizadas: `https://preureal.cat/api/auth/google/callback` (y `http://localhost:3000/api/auth/google/callback`)
4. `.env`: `GOOGLE_CLIENT_ID=…apps.googleusercontent.com`, `GOOGLE_CLIENT_SECRET=GOCSPX-…` → `docker compose up -d`.
5. Verificación: el botón aparece en registro/login y el flujo completo crea la sesión (usuario nuevo con contraseña aleatoria inutilizable; si el email ya existía, entra en esa cuenta — solo si Google lo tiene verificado).

> Seguridad ya implementada en el código: estado CSRF (cookie httpOnly de un solo uso), `email_verified` obligatorio, correu normalizado (puntos/+alias de Gmail) y rate limit en ambos endpoints.

---

## 9. Checklist final de lanzamiento (resumen ejecutable)

```
VPS creado y bootstrap OK                 ▢
Repo clonado en ~/preureal                ▢
.env con AUTH_SECRET/ADMIN_PASSWORD       ▢
docker compose up -d sin errores          ▢
DNS apuntando + HTTPS verde               ▢
/api/health OK (ICGC true)                ▢
Mapa + búsqueda + paywall verificados     ▢
Contraseña admin cambiada                 ▢
Cron de backups activo + 1 backup hecho   ▢
Copia externa de backups configurada      ▢
Legal: sustituir placeholders 【COMPLETAR】(titular, NIF, contacto)   ▢
Update_all.sh probado en el servidor      ▢
```

---

## 10. Alternativa Vercel (por qué no, hoy)

Vercel es cómodo, pero exige **abandonar SQLite** (serverless sin disco persistente → Turso/Postgres), añade una pieza más y un coste variable con el tráfico; además los webhooks de Stripe y el límite de funciones gratuitas complican el modelo de 7,99 €. La ruta VPS mantiene el stack actual sin un cambio de código, con coste fijo mínimo. Si en el futuro el tráfico lo justifica, la migración a Turso es viable cambiando el `provider` de Prisma — decisión para más adelante.
