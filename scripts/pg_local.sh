#!/usr/bin/env bash
# PreuReal.cat — PostgreSQL local del sandbox (usuari z, sense root).
#
# Els binaris (PostgreSQL 17, paquet npm @embedded-postgres/linux-x64) i el
# clúster de dades viuen DINS del projecte (.localpg/), perquè és l'única ruta
# que sobreviu als reciclatges del sandbox. Si els binaris falten, es tornen a
# descarregar automàticament.
#
# Ús:
#   bash scripts/pg_local.sh init|start|ensure|createdb|stop|status|url
set -euo pipefail

ROOT="/home/z/my-project"
PGBIN="$ROOT/.localpg/vendor/bin"
PGLIB="$ROOT/.localpg/vendor/lib"
PGDATA="$ROOT/.localpg/data"
export LD_LIBRARY_PATH="$PGLIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
LOG="$ROOT/.localpg/postgres.log"
PORT="${PREUREAL_PG_PORT:-5432}"
PGUSER="preureal"
PGDB="preureal"
URL="postgresql://${PGUSER}@127.0.0.1:${PORT}/${PGDB}"
PG_VERSION_PKG="17.11.0-beta.19"   # → PostgreSQL 17.11
SELF="$ROOT/scripts/pg_local.sh"

running() { "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; }

ensure_vendor() {
  if [ ! -x "$PGBIN/initdb" ]; then
    echo "» Binaris PostgreSQL absents — descarregant…"
    mkdir -p "$ROOT/.localpg"
    local tgz
    tgz=$(cd /tmp && npm pack "@embedded-postgres/linux-x64@${PG_VERSION_PKG}" 2>/dev/null | tail -1)
    rm -rf /tmp/ep-restore && mkdir -p /tmp/ep-restore
    tar xzf "/tmp/${tgz}" -C /tmp/ep-restore
    rm -rf "$ROOT/.localpg/vendor"
    cp -r /tmp/ep-restore/package/native "$ROOT/.localpg/vendor"
    rm -rf /tmp/ep-restore "/tmp/${tgz}"
  fi
  # El postinstall del paquet npm crearia aquests symlinks de soname;
  # com que copiem els binaris a mà, els fem aquí (idempotent).
  if [ ! -e "$PGLIB/libicuuc.so.60" ]; then
    for p in icuuc icui18n icudata; do ln -sf "lib${p}.so.60.2" "$PGLIB/lib${p}.so.60"; done
    ln -sf libpq.so.5.17 "$PGLIB/libpq.so.5"
    ln -sf libecpg.so.6.17 "$PGLIB/libecpg.so.6"
    ln -sf libpgtypes.so.3.17 "$PGLIB/libpgtypes.so.3"
    ln -sf libecpg_compat.so.3.17 "$PGLIB/libecpg_compat.so.3"
  fi
}

case "${1:-start}" in
  init)
    ensure_vendor
    if [ -d "$PGDATA" ]; then echo "✓ clúster ja existeix ($PGDATA)"; exit 0; fi
    "$PGBIN/initdb" -D "$PGDATA" -U "$PGUSER" -A trust -E UTF8 --no-locale >"$LOG" 2>&1
    echo "✓ clúster inicialitzat ($PGDATA · usuari $PGUSER · trust local)"
    ;;
  start)
    ensure_vendor
    if running; then echo "✓ PostgreSQL ja en marxa (port $PORT)"; exit 0; fi
    [ -d "$PGDATA" ] || bash "$SELF" init
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOG" -w -t 30 \
      -o "-p $PORT -c listen_addresses=127.0.0.1 -k $ROOT/.localpg" start >/dev/null
    echo "✓ PostgreSQL arrencat (port $PORT)"
    ;;
  ensure)
    bash "$SELF" start
    bash "$SELF" createdb
    ;;
  createdb)
    python3 - "$URL" <<'PY'
import sys, psycopg2
url = sys.argv[1]
db = url.rsplit("/", 1)[-1]
c = psycopg2.connect(url.rsplit("/", 1)[0] + "/postgres")
c.autocommit = True
cur = c.cursor()
cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db,))
if cur.fetchone():
    print(f"✓ BD '{db}' ja existeix")
else:
    cur.execute(f'CREATE DATABASE "{db}"')
    print(f"✓ BD '{db}' creada")
cur.close(); c.close()
PY
    ;;
  stop)
    if running; then "$PGBIN/pg_ctl" -D "$PGDATA" stop; else echo "(no en marxa)"; fi
    ;;
  status)
    if running; then echo "en marxa (port $PORT)"; else echo "aturat"; fi
    ;;
  url)
    echo "$URL"
    ;;
  *)
    echo "ús: pg_local.sh {init|start|ensure|createdb|stop|status|url}"; exit 1 ;;
esac
