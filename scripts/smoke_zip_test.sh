#!/usr/bin/env bash
# Preureal — smoke test del servidor standalone (paquet Vercel v4).
# Ús: bash scripts/smoke_zip_test.sh <dir_del_paquet> [port]
set -u
DIR="${1:?ús: smoke_zip_test.sh <dir> [port]}"
PORT="${2:-3100}"
BASE="http://127.0.0.1:$PORT"
JAR="/tmp/smoke_cookies.txt"
rm -f "$JAR"

cd "$DIR"
# Passos de self-host per poder arrancar el standalone a local
cp -r .next/static .next/standalone/.next/ 2>/dev/null
cp -r public .next/standalone/ 2>/dev/null

export DATABASE_URL="${DATABASE_URL:-postgresql://preureal@127.0.0.1:5432/preureal}"
export NODE_ENV=production PORT
nohup bun .next/standalone/server.js > /tmp/smoke_server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

pass=0; fail=0
check () { # check <nom> <esperat> <obtingut>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ✓ $1 ($3)";
  else fail=$((fail+1)); echo "  ✗ $1 — esperat $2, obtingut $3"; fi
}
code () { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body () { curl -s "$@"; }

# Espera a que el port respongui (màx 20s)
for i in $(seq 1 40); do
  curl -s -o /dev/null "$BASE/api/health" && break
  sleep 0.5
done

echo "— Statiques i capçaleres"
check "GET /                  " 200 "$(code "$BASE/")"
check "GET /robots.txt         " 200 "$(code "$BASE/robots.txt")"
csp=$(curl -s -I "$BASE/" | grep -i content-security-policy | tr -d '\r')
case "$csp" in *frame-ancestors*"'self'"*) check "CSP frame-ancestors prod" ok ok;; *) check "CSP frame-ancestors prod" ok "mal: $csp";; esac

echo "— API: catch-all (dispatcher)"
check "GET /api/health        " 200 "$(code "$BASE/api/health")"
prov=$(body "$BASE/api/health" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("database",{}).get("provider","?"))' 2>/dev/null)
check "provider=postgresql    " postgresql "$prov"
nmun=$(body "$BASE/api/municipalities?limit=200" | python3 -c 'import json,sys;print(len(json.load(sys.stdin).get("municipalities",[])))' 2>/dev/null)
[ "${nmun:-0}" -eq 200 ] && check "GET /api/municipalities?limit=200" ok ok || check "GET /api/municipalities?limit=200" ok "mal: $nmun"
bcn=$(body "$BASE/api/municipalities/080193" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("name",d.get("municipality",{}).get("name","?")))' 2>/dev/null)
check "GET /api/municipalities/080193" Barcelona "$bcn"
check "GET /api/inexistent    " 404 "$(code "$BASE/api/inexistent")"
check "DELETE /api/municipalities (405)" 405 "$(code -X DELETE "$BASE/api/municipalities")"

echo "— API: auth complet (register → login → me → logout)"
EMAIL="smoke$(date +%s)@test.cat"
r1=$(code -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest2026!\",\"name\":\"Smoke\",\"locale\":\"ca\"}" "$BASE/api/auth/register")
[ "$r1" = "200" ] || [ "$r1" = "201" ] && check "POST /api/auth/register" ok ok || check "POST /api/auth/register" "200|201" "$r1"
check "POST /api/auth/login   " 200 "$(code -c "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"SmokeTest2026!\"}" "$BASE/api/auth/login")"
me=$(body -b "$JAR" "$BASE/api/auth/me" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("user",{}).get("email","?"))' 2>/dev/null)
check "GET /api/auth/me (cookie)" "$EMAIL" "$me"
menull=$(body "$BASE/api/auth/me" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("user"))' 2>/dev/null)
check "GET /api/auth/me sense cookie → user:null" None "$menull"
check "POST /api/auth/logout  " 200 "$(code -b "$JAR" -X POST "$BASE/api/auth/logout")"

echo "— API: protegit i webhook"
check "PATCH /api/account sense sessió (401)" 401 "$(code -X PATCH -H 'Content-Type: application/json' -d '{}' "$BASE/api/account")"
admin=$(code "$BASE/api/admin/stats")
[ "$admin" = "401" ] || [ "$admin" = "403" ] && check "GET /api/admin/stats (bloquejat)" ok ok || check "GET /api/admin/stats" "401|403" "$admin"
wh=$(code -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/stripe/webhook")
[ "$wh" = "400" ] || [ "$wh" = "401" ] || [ "$wh" = "503" ] && check "POST /api/stripe/webhook (sense claus)" ok ok || check "POST /api/stripe/webhook" "400|401|503" "$wh"
expc=$(code "$BASE/api/export/noexist")
[ "$expc" = "401" ] || [ "$expc" = "404" ] && check "GET /api/export/noexist (bloquejat)" ok ok || check "GET /api/export/noexist" "401|404" "$expc"
demo=$(code -X POST "$BASE/api/stripe/demo")
[ "$demo" = "400" ] || [ "$demo" = "401" ] || [ "$demo" = "403" ] && check "POST /api/stripe/demo (sense sessió)" ok ok || check "POST /api/stripe/demo" "400|401|403" "$demo"

echo
echo "RESULTAT: $pass OK · $fail KO"
[ "$fail" -eq 0 ]
