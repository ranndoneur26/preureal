#!/usr/bin/env bash
# PreuReal.cat — dimoni keepalive del sandbox.
#
# Manté en marxa el PostgreSQL incrustat (.localpg) i el servidor de dev del
# port 3000 (el preview de la plataforma apunta a aquest port). És idempotent:
# si el servei ja respon, no fa res. Arranca'lo així:
#
#   setsid nohup bash scripts/dev_keepalive.sh </dev/null >/dev/null 2>&1 &
#
cd /home/z/my-project || exit 1

while true; do
  # 1) PostgreSQL incrustat (idempotent: si ja corre, surt a l'instant)
  bash scripts/pg_local.sh ensure >/dev/null 2>&1

  # 2) Servidor de dev: només si el port 3000 està lliure
  if ! ss -tln 2>/dev/null | grep -q ":3000 "; then
    echo "[$(date +%H:%M:%S)] :3000 lliure → arrencant next dev" >> dev-keepalive.log
    env -u DATABASE_URL nohup bun run dev >> dev-run.log 2>&1 &
  fi

  sleep 15
done
