#!/usr/bin/env bash
# PreuReal.cat — puja el ZIP de lliurament a un host públic i torna la URL.
# Ús: bash scripts/upload_zip.sh [fitxer.zip]
# Prova en ordre: Litterbox (72h) → 0x0.st → tmpfiles.org (60 min).
set -u
F="${1:-download/PreuReal-cat-v24-panell-premium.zip}"
[ -f "$F" ] || { echo "✗ No trobo $F"; exit 1; }

echo "Pujant $F ($(du -h "$F" | cut -f1))..."

# 1) Litterbox (catbox) — enllaç vàlid 72 hores
U=$(curl -s --max-time 60 -F "reqtype=fileupload" -F "time=72h" \
      -F "file=@$F" https://litterbox.catbox.moe/resources/internals/api.php)
case "$U" in https*) echo "OK litterbox (72h): $U"; exit 0;; esac

# 2) 0x0.st — retenció dies/setmanes segons mida
U=$(curl -s --max-time 60 -A "curl/8.5.0" -F "file=@$F" https://0x0.st)
case "$U" in http*) echo "OK 0x0.st: $U"; exit 0;; esac

# 3) tmpfiles.org — només 60 minuts
U=$(curl -s --max-time 60 -F "file=@$F" https://tmpfiles.org/api/v1/upload)
case "$U" in *url*) echo "OK tmpfiles (60min): $U"; exit 0;; esac

echo "✗ Cap host disponible. Revisa la connexió del sandbox."
exit 1
