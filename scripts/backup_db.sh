#!/usr/bin/env bash
# ============================================================================
# PreuReal.cat — backup diario de la base de datos SQLite
#
# Se ejecuta EN EL SERVIDOR (host). Copia consistente con `sqlite3 .backup`
# mientras la app está en marcha, verifica integridad y comprime.
#
# Cron sugerido (3:15 cada noche, conserva 30 días):
#   15 3 * * * cd ~/preureal && bash scripts/backup_db.sh >> dbdata/backup.log 2>&1
#
# Restaurar (ver DEPLOY.md §7):
#   gunzip -c dbdata/backups/custom-AAAA-MM-DD_HHMM.db.gz > dbdata/custom.db
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP="${KEEP:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p dbdata/backups

# copia consistente dentro del contenedor (la BD está en uso por la app)
docker compose exec -T app sqlite3 /data/custom.db ".backup '/data/backups/custom-${STAMP}.db'"

# verificación de integridad de la copia
INTEG="$(docker compose exec -T app sqlite3 "/data/backups/custom-${STAMP}.db" "PRAGMA integrity_check;")"
[ "$INTEG" = "ok" ] || { echo "✗ backup con corrupción: $INTEG"; exit 1; }

# compresión en el host + retención
gzip -f "dbdata/backups/custom-${STAMP}.db"
ls -1t dbdata/backups/custom-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "✓ backup $(date '+%F %H:%M') → dbdata/backups/custom-${STAMP}.db.gz ($(du -h "dbdata/backups/custom-${STAMP}.db.gz" | cut -f1)), retención ${KEEP} días"
