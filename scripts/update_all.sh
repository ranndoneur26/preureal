#!/usr/bin/env bash
# ============================================================================
# PreuReal.cat — Actualización de datos oficiales en UN solo comando
#
# Uso:
#   bash scripts/update_all.sh                 # descarga + pipeline + verificación
#   bash scripts/update_all.sh --no-download   # reusa los Excels ya en /tmp
#   bash scripts/update_all.sh --help
#
# Qué hace:
#   1. Descarga los 2 Excel oficiales de Incasòl (habitatge.gencat.cat)
#   2. Ejecuta prepare_data.py  (Socrata 948 municipis + Excels + zonas tensadas)
#   3. Ejecuta seed.ts          (upsert idempotente en SQLite, no duplica)
#   4. Verifica la BD y el /api/health
#   5. Imprime el recordatorio DOGC de zonas tensadas
#
# Frecuencia recomendada: trimestral (opcional) / anual completa (otoño).
# Zonas tensadas: revisar DOGC ~abril y ~octubre (los listados TENSE_* están
# hardcodeados a propósito en scripts/prepare_data.py — son texto legal).
#
# Cron sugerido (domingo 04:00, cada 3 meses):
#   0 4 1 1,4,7,10 *  bash /home/z/my-project/scripts/update_all.sh >> /var/log/preureal_update.log 2>&1
# ============================================================================
set -euo pipefail

ROOT="/home/z/my-project"
TMP_DIR="/tmp"
URL_BASE="https://habitatge.gencat.cat/web/.content/home/dades/estadistiques/01_Estadistiques_de_construccio_i_mercat_immobiliari/03_Mercat_de_lloguer/02_Lloguers_per_ambits_geografics"
UA="Mozilla/5.0 (compatible; PreuReal.cat update/1.0)"

LLOGUER_URL="$URL_BASE/Lloguer_mitja/municipis_anual_lloguer.xlsx"
CONTRACTES_URL="$URL_BASE/Fitxers_contractes/municipis_anual_contractes.xlsx"
LLOGUER_FILE="$TMP_DIR/municipis_anual_lloguer.xlsx"
CONTRACTES_FILE="$TMP_DIR/municipis_anual_contractes.xlsx"

NO_DOWNLOAD=0
case "${1:-}" in
  --no-download) NO_DOWNLOAD=1 ;;
  -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
  "") ;;
  *) echo "Bandera desconocida: $1 (usa --help)"; exit 1 ;;
esac

cd "$ROOT"
echo "============================================================"
echo " PreuReal.cat — actualización de datos  $(date '+%Y-%m-%d %H:%M %Z')"
echo "============================================================"

# --- 0. Requisitos ----------------------------------------------------------
echo "» [0/4] Comprobando requisitos..."
for cmd in curl python3 bun; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "  ✗ Falta '$cmd'"; exit 1; }
done
python3 -c "import openpyxl" 2>/dev/null || {
  echo "  ✗ Falta openpyxl (pip install openpyxl)"; exit 1; }
[ -d "$ROOT/db" ] || { echo "  ✗ No existe $ROOT/db"; exit 1; }
echo "  ✓ curl / python3 / openpyxl / bun OK"

# --- 1. Descarga de los Excels oficiales de Incasòl -------------------------
if [ "$NO_DOWNLOAD" -eq 0 ]; then
  echo "» [1/4] Descargando Excels de habitatge.gencat.cat..."
  for pair in "lloguer:$LLOGUER_URL" "contractes:$CONTRACTES_URL"; do
    name="${pair%%:*}"; url="${pair#*:}"
    dest="$TMP_DIR/municipis_anual_${name}.xlsx"
    curl -fSL --retry 3 --retry-delay 5 -A "$UA" -o "$dest" "$url" || {
      echo "  ✗ Falló la descarga de $url"
      echo "    Descárgalo a mano desde:"
      echo "    https://habitatge.gencat.cat/ca/dades/indicadors_estadistiques/estadistiques_de_construccio_i_mercat_immobiliari/mercat_de_lloguer/lloguers-per-ambits-geografics"
      echo "    y vuelve a ejecutar con: bash scripts/update_all.sh --no-download"
      exit 1
    }
    size=$(stat -c%s "$dest")
    [ "$size" -gt 10000 ] || { echo "  ✗ $dest sospechosamente pequeño ($size bytes)"; exit 1; }
    python3 -c "import openpyxl,sys; openpyxl.load_workbook('$dest', read_only=True)" \
      || { echo "  ✗ $dest no es un xlsx válido"; exit 1; }
    echo "  ✓ ${name}: $(du -h "$dest" | cut -f1)  sha256=$(sha256sum "$dest" | cut -c1-12)…"
  done
else
  echo "» [1/4] --no-download: usando los Excels ya presentes en $TMP_DIR"
  [ -f "$LLOGUER_FILE" ] && [ -f "$CONTRACTES_FILE" ] || {
    echo "  ✗ Faltan los Excels en $TMP_DIR — ejecuta sin --no-download"; exit 1; }
  echo "  ✓ archivos presentes"
fi

# --- 2. Pipeline de datos (Socrata + Excels + zonas tensadas → JSON) --------
echo "» [2/4] Ejecutando prepare_data.py (Socrata + Excels + zonas tensadas)..."
python3 scripts/prepare_data.py

# --- 3. Upsert en la base de datos (PostgreSQL o SQLite) --------------------
echo "» [3/4] Ejecutando seed.ts (upsert idempotente)..."
bun run scripts/seed.ts

# --- 4. Verificación (PostgreSQL si DATABASE_URL es postgres, si no SQLite) --
echo "» [4/4] Verificando la base de datos..."
python3 - <<'PY'
import os

DB_URL = os.environ.get("DATABASE_URL", "")

if DB_URL.startswith("postgres"):
    # PostgreSQL (producció / Vercel)
    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    # purga de filas artificiales del dataset Socrata (999998/999999)
    cur.execute("DELETE FROM \"Municipality\" WHERE \"code\" LIKE '9999%'")
    conn.commit()
    cur.execute('SELECT COUNT(*) FROM "Municipality"')
    tot = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "Municipality" WHERE "rentLatest" IS NOT NULL')
    rent = cur.fetchone()[0]
    cur.execute('SELECT MAX("rentPeriod") FROM "Municipality"')
    period = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "Municipality" WHERE "isTense" = true')
    tense = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM "Building"')
    bld = cur.fetchone()[0]
    conn.close()
else:
    # SQLite (desarrollo local sin PostgreSQL)
    import sqlite3
    DB = os.environ.get("PREUREAL_DB", "/home/z/my-project/db/custom.db")
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("DELETE FROM Municipality WHERE code LIKE '9999%'")
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM Municipality")
    tot = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM Municipality WHERE rentLatest IS NOT NULL")
    rent = cur.fetchone()[0]
    cur.execute("SELECT MAX(rentPeriod) FROM Municipality")
    period = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM Municipality WHERE isTense = 1")
    tense = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM Building")
    bld = cur.fetchone()[0]
    conn.close()

print(f"  ✓ Municipios: {tot} | con alquiler: {rent} | último periodo: {period}")
print(f"  ✓ Zonas tensadas vigentes: {tense} | Edificios en BD: {bld}")
if rent < 600: print("  ⚠ Pocos municipios con alquiler — revisa los Excels"); exit(1)
if tense < 100: print("  ⚠ Menos de 100 zonas tensadas — ¿listas DOGC desactualizadas?")
PY

if curl -sf -m 5 http://localhost:3000/api/health >/dev/null 2>&1; then
  echo "  ✓ Servidor en marcha — /api/health responde"
  curl -s -m 5 http://localhost:3000/api/health | head -c 400; echo
else
  echo "  ℹ Servidor no arrancado (normal en mantenimiento). Para verificar en vivo: bun dev"
fi

# --- Recordatorio DOGC ------------------------------------------------------
echo ""
echo "──────────────────────────── RECORDATORIO DOGC ────────────────────────────"
echo " Zonas tensadas vigentes: TER/3739/2026 (118 prórroga) + TER/3740/2026"
echo " (53 nuevas) = 170 municipios · DOGC 19-10-2026."
echo " Las declaraciones se renuevan ~2 veces/año (primavera y otoño)."
echo " Ventanas de revisión: ABRIL y OCTUBRE. Fuentes:"
echo "   • https://habitatge.gencat.cat/ca/ambits/lloguer/zones-tensades/"
echo "   • https://dogc.gencat.cat  (buscar: «zones tensades» / resolució TER/)"
echo " Si hay resolución nueva: edita TENSE_A y TENSE_C en scripts/prepare_data.py"
echo " y re-ejecuta este script."
echo "────────────────────────────────────────────────────────────────────────────"
echo ""
echo "✓ Actualización completada."
