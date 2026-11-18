#!/usr/bin/env bash
# ============================================================================
# PreuReal — ACCIO ① : càrrega del pipeline geo a la BD de producció (Neon)
# Runbook: docs/PIPELINE_GEO_ML.md §5 · pipeline/README.md §7
#
# Ús (la credencial SEMPRE per env — mai argument ni fitxer versionat):
#   export DATABASE_URL="postgresql://...ep-xxx.neon.tech/...?sslmode=require"
#   bash pipeline/f3_produccio.sh [dim.parquet] [cache.parquet]
#
# Paths per defecte: pilot_data/ al costat del repo (estructura del sandbox de
# treball). Idempotent: DROP+CREATE només de l'esquema geo — mai taules del app.
# Al final executa la verificació §5 (verifica_prod.py).
# ============================================================================
set -euo pipefail

: "${DATABASE_URL:?ERROR: exporta DATABASE_URL (la credencial mai per argument, mai impresa)}"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$HERE")"
DIM="${1:-$REPO/../pilot_data/out_amb/dim_building_rent_estimation_amb.parquet}"
CACHE="${2:-$REPO/../pilot_data/out_amb/_cache_amb.parquet}"

[ -f "$DIM" ] || { echo "ERROR: dim no trobada: $DIM"; exit 1; }
[ -f "$CACHE" ] || { echo "ERROR: cache no trobada: $CACHE"; exit 1; }

# resum amable SENSE credencial (només la part del host, després de @)
if [[ "$DATABASE_URL" == *"@"* ]]; then
  echo "» BD objectiu: ${DATABASE_URL#*@}"
else
  echo "» BD objectiu: (format sense @ — no es mostra)"
fi

echo "» Càrrega f3 (2-5 min sobre WAN; 27-30 s amb PostGIS local)…"
python3 "$HERE/f3_carga_postgis.py" --dim "$DIM" --cache "$CACHE" --out f3_carga_prod.json

echo "» Verificació §5 del runbook…"
python3 "$HERE/qa/verifica_prod.py"

echo ""
echo "ACCIO ① COMPLETA — https://www.preureal.com/api/geo/illes?muni=08019 → 200"
echo "(el cau de 10 min del endpoint pot tardar una mica en refrescar)"
