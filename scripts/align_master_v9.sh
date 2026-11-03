#!/bin/bash
# PreuReal.cat — Alineació de la còpia master amb l'arquitectura v9 desplegada.
#
# 1. Recupera 3 handlers _impl que falten (des del ZIP v9, font del repo desplegat)
# 2. Retira les rutes visibles duplicades (només han d'existir [[...path]], health i stripe/webhook)
# 3. Neteja directoris buits
set -e

ZIP="/home/z/my-project/upload/PreuReal-cat-Vercel-v9.zip"
API="/home/z/my-project/src/app/api"
TMP="/tmp/v9_extract"

echo "== 1. Recuperant handlers _impl perduts des del v9 =="
rm -rf "$TMP" && mkdir -p "$TMP"
unzip -q -o "$ZIP" \
  "preureal/src/app/api/_impl/auth/google/callback/route.ts" \
  "preureal/src/app/api/_impl/auth/google/status/route.ts" \
  "preureal/src/app/api/_impl/auth/password-reset/confirm/route.ts" \
  -d "$TMP"
for rel in auth/google/callback auth/google/status auth/password-reset/confirm; do
  mkdir -p "$API/_impl/$rel"
  cp "$TMP/preureal/src/app/api/_impl/$rel/route.ts" "$API/_impl/$rel/route.ts"
  echo "  + restaurat _impl/$rel/route.ts"
done

echo "== 2. Retirant rutes visibles duplicades =="
REMOVED=0
cd "$API"
for f in $(ls */route.ts */*/route.ts 2>/dev/null | grep -vE "_impl|^health/|^stripe/webhook"); do
  rm "$f"
  REMOVED=$((REMOVED+1))
  echo "  - retirat $f"
done

echo "== 3. Netejant directoris buits =="
find . -type d -empty -not -path "./_impl*" -delete 2>/dev/null || true

echo "== Resum: $REMOVED duplicats retirats =="
echo "== Rutes visibles restants: =="
ls "$API" | grep -v _impl
ls "$API"/*/route.ts 2>/dev/null | grep -v _impl
