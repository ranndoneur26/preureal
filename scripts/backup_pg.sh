#!/usr/bin/env bash
# =============================================================================
# Preureal — Backup de la base de dades de producció (v38.3)
#
# Dump comprimit de la BD PostgreSQL (Neon/Supabase/Vercel Postgres) amb
# retenció de 30 dies. Pensat per programar-se al teu ordinador o VPS:
#
#   crontab -e
#   15 3 * * * DATABASE_URL="postgresql://..." /ruta/repo/scripts/backup_pg.sh /ruta/backups >> /ruta/backups/backup.log 2>&1
#
# Restore (provat amb pg_dump --clean --if-exists):
#   gunzip -c backups/preureal_XXXX.sql.gz | psql "$DATABASE_URL"
#
# Nota: el hosting gestionat (Neon/Supabase) ja fa snapshots puntuals; aquest
# dump és la còpia INDEPENDENT fora de la plataforma (regla 3-2-1).
# =============================================================================
set -euo pipefail

: "${DATABASE_URL:?Cal la variable DATABASE_URL (postgresql://usuari:pass@host/bd)}"

DEST="${1:-./backups}"
mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/preureal_$STAMP.sql.gz"

command -v pg_dump >/dev/null || { echo "✗ Falta pg_dump (apt install postgresql-client)"; exit 1; }

echo "→ Dump $OUT"
pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists | gzip -9 > "$OUT"

# Retenció: conserva els 30 darrers dumps
ls -1t "$DEST"/preureal_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --

# Verificació: el dump comprimit no pot ser buit
SIZE=$(du -b "$OUT" | cut -f1)
if [ "$SIZE" -lt 1000 ]; then
  echo "✗ El dump és sospitosament petit (${SIZE} bytes) — revisa'l ABANS de confiar-hi"
  exit 1
fi

echo "✓ OK: $OUT ($(du -h "$OUT" | cut -f1)) · retenció 30 dies aplicada"
echo "  Restore: gunzip -c '$OUT' | psql \"\$DATABASE_URL\""
