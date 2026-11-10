#!/usr/bin/env python3
"""PreuReal.cat — instantània neta de la BD per al paquet Vercel.

Copia db/custom.db (consistent, via backup API) i esborra TOTES les dades
d'usuari/sessió/log de desenvolupament. Manté municipis, edificis (cache ICGC)
i metadades. Fa VACUUM i comprovació d'integritat.
"""
import os
import sqlite3
import sys

SRC = os.environ.get("PREUREAL_DB", "/home/z/my-project/db/custom.db")
DST = sys.argv[1] if len(sys.argv) > 1 else "/tmp/vercel-pkg/db/custom.db"

os.makedirs(os.path.dirname(DST), exist_ok=True)

# Còpia consistent amb la backup API de SQLite
src = sqlite3.connect(SRC)
dst = sqlite3.connect(DST)
src.backup(dst)
src.close()

cur = dst.cursor()
# Esborra dades de desenvolupament (ordre respectant les FK: fills primer)
for table in ("SearchLog", "Event", "EmailLog", "PasswordToken",
              "PriceReport", "Subscription", "User"):
    cur.execute(f"DELETE FROM {table}")
dst.commit()
cur.execute("VACUUM")
dst.commit()

ok = cur.execute("PRAGMA integrity_check").fetchone()[0]
counts = {
    t: cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    for t in ("Municipality", "Building", "User", "SearchLog", "Event")
}
dst.close()

size_mb = os.path.getsize(DST) / 1_048_576
print(f"integrity: {ok}")
print(f"counts: {counts}")
print(f"size: {size_mb:.2f} MB -> {DST}")
if ok != "ok" or counts["Municipality"] < 900 or counts["User"] != 0:
    sys.exit("FALLA la validació de la instantània")
