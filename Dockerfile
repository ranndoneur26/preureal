# syntax=docker/dockerfile:1
# ============================================================================
# PreuReal.cat — imágenes de producción (Next.js 16 standalone + Prisma/SQLite)
#
# Dos targets:
#   runtime (preureal/app)   → servidor standalone, imagen mínima
#   build   (preureal/tools) → herramientas: prisma CLI, seed, update_all.sh
#                              (python3 + openpyxl + curl + sqlite3 + bun)
#
# Construir:  docker compose build
# Arrancar:   docker compose up -d
# Actualizar datos oficiales:  docker compose run --rm dbinit bash scripts/update_all.sh
# ============================================================================

# --- 1. dependencias ---------------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- 2. build + caja de herramientas (dbinit / update_all) -------------------
FROM oven/bun:1 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# herramientas del pipeline de datos (update_all.sh) y del dbinit
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip curl sqlite3 ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages openpyxl

RUN bunx prisma generate
# bun run build = next build + copia .next/static y public a .next/standalone
RUN bun run build

# --- 3. runtime mínimo (solo servidor) --------------------------------------
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/custom.db \
    NEXT_TELEMETRY_DISABLED=1

# sqlite3 para backups dentro del contenedor
RUN apt-get update \
 && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# servidor standalone (incluye .next/static y public gracias al build script)
COPY --from=build /app/.next/standalone ./

# motor nativo de Prisma (el tracing de standalone no siempre lo incluye)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server.js"]
