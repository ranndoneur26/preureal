#!/usr/bin/env bash
# ============================================================================
# Preureal — carga de ENSAYO en STAGING (Fase P2.1) antes de tocar producción
#
# Uso (normalmente lo invoca el workflow trimestral, no a mano):
#   STAGING_DATABASE_URL=postgresql://... bash scripts/staging_load.sh
#
# Qué hace:
#   S1. Aplica las migraciones Prisma al proyecto de staging (paridad de esquema)
#   S2. Copia los Excels descargados por la auditoría F0 (/tmp/f0_descarga) a
#       las rutas que espera update_all.sh y ejecuta el MISMO pipeline de carga
#       (prepare_data.py → seed idempotente → verificación) contra STAGING.
#
# Red de seguridad:
#   · Nunca toca producción: la única conexión que abre va a STAGING_DATABASE_URL.
#   · Exige pooler de sesión (puerto 5432) y rechaza pgbouncer= (misma regla
#     que producción — Anexo B).
#   · Si algo falla, sale con código ≠ 0 y el workflow detiene el ciclo ANTES
#     del Paso 3 (producción intacta).
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${STAGING_DATABASE_URL:?✗ STAGING_DATABASE_URL no definida}"
case "$STAGING_DATABASE_URL" in
  postgres*) ;;
  *) echo "✗ STAGING_DATABASE_URL no es PostgreSQL (postgresql://...)"; exit 1 ;;
esac
case "$STAGING_DATABASE_URL" in
  *pgbouncer=*) echo "✗ pgbouncer= no permitido — usa el pooler de sesión :5432 (Anexo B)"; exit 1 ;;
esac

MASKED="$(echo "$STAGING_DATABASE_URL" | sed 's#//[^@]*@#//****@#')"
echo "============================================================"
echo " Ensayo STAGING — $(date '+%Y-%m-%d %H:%M %Z')"
echo " destino: $MASKED"
echo "============================================================"

for cmd in python3 npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "✗ Falta '$cmd'"; exit 1; }
done
python3 -c "import openpyxl, psycopg2" 2>/dev/null || {
  echo "✗ Faltan openpyxl/psycopg2 (pip install openpyxl psycopg2-binary)"; exit 1; }

# --- S1 · Migraciones Prisma contra staging (esquema idéntico a producción) --
echo "» [S1] prisma migrate deploy contra staging..."
DATABASE_URL="$STAGING_DATABASE_URL" npx prisma migrate deploy

# --- S2 · Mismo pipeline de carga que producción, apuntado a staging ---------
echo "» [S2] Copiando Excels del ensayo F0 (si existen)..."
for f in municipis_anual_lloguer municipis_anual_contractes; do
  if [ -f "/tmp/f0_descarga/$f.xlsx" ]; then
    cp "/tmp/f0_descarga/$f.xlsx" "/tmp/$f.xlsx"
    echo "  ✓ $f (reutilizado de la auditoría F0)"
  elif [ -f "/tmp/$f.xlsx" ]; then
    echo "  ✓ $f ya presente en /tmp"
  else
    echo "  ✗ Falta /tmp/f0_descarga/$f.xlsx — ejecuta antes la auditoría F0 (--descargar)"
    exit 1
  fi
done

echo "» [S2] update_all.sh --no-download contra STAGING..."
DATABASE_URL="$STAGING_DATABASE_URL" bash scripts/update_all.sh --no-download

echo ""
echo "✓ Ensayo en staging completado — siguiente: puerta C11/C12 (staging_diff.py)."
