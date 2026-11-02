#!/usr/bin/env python3
"""
PreuReal.cat — Migració SQLite → PostgreSQL (repetible i verificable).

Porta TOTES les dades de l'arxiu SQLite original (db/custom.db) al PostgreSQL
nou, amb upserts idempotents (es pot re-executar sense duplicar res) i una
verificació d'integritat per taula (recomptes + mostres concretes).

Ús:
    python3 scripts/migrate_sqlite_to_pg.py                       # migra + verifica
    python3 scripts/migrate_sqlite_to_pg.py --verify-only         # només verifica
    PREUREAL_SQLITE=/ruta/custom.db PREUREAL_PG=postgresql://... python3 ...

L'SQLite original NO es modifica ni s'elimina (arxiu històric).
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values

SQLITE_PATH = os.environ.get("PREUREAL_SQLITE", "/home/z/my-project/db/custom.db")
_PG_ENV = os.environ.get("PREUREAL_PG") or os.environ.get("DATABASE_URL") or ""
if not _PG_ENV.startswith("postgres"):
    _PG_ENV = "postgresql://postgres@127.0.0.1:5433/preureal"
PG_DSN = _PG_ENV

# taula → (clau primària, [columnes SQLite], [columnes PG addicionals amb valor per defecte])
TABLES = {
    "User": {
        "pk": "id",
        "cols": ["id", "email", "passwordHash", "name", "locale", "role", "plan", "createdAt", "updatedAt"],
        "defaults": {"active": True, "emailVerifiedAt": None, "tokenVersion": 0, "lastLoginAt": None},
    },
    "Subscription": {
        "pk": "id",
        "cols": ["id", "userId", "stripeCustomerId", "stripeSubscriptionId", "stripePriceId",
                 "plan", "status", "currentPeriodEnd", "demo", "createdAt", "updatedAt"],
        "defaults": {},
    },
    "PasswordToken": {
        "pk": "id",
        "cols": ["id", "userId", "token", "expiresAt", "used", "createdAt"],
        "defaults": {},
    },
    "Municipality": {
        "pk": "code",
        "cols": ["code", "ineCode", "name", "comarca", "province", "lat", "lng",
                 "rentLatest", "rentPeriod", "rentPrevYear", "rentPrevPeriod", "rentHistory",
                 "contractsLatest", "isTense", "tenseList", "boundary", "boundaryFetchedAt", "updatedAt"],
        "defaults": {},
    },
    "Building": {
        "pk": "id",
        "cols": ["id", "externalId", "source", "municipalityCode", "tipus", "estat", "altura",
                 "nom", "polygonJson", "centroidLat", "centroidLng", "refcat", "yearBuilt",
                 "yearSource", "cachedAt"],
        "defaults": {"avgRentEurMonth": None, "sampleSize": None},
    },
    "SearchLog": {
        "pk": "id",
        "cols": ["id", "userId", "buildingId", "municipalityCode", "ipHash", "kind", "createdAt"],
        "defaults": {},
    },
    "Event": {
        "pk": "id",
        "cols": ["id", "type", "userId", "meta", "createdAt"],
        "defaults": {},
    },
    "PriceReport": {
        "pk": "id",
        "cols": ["id", "userId", "municipalityCode", "buildingId", "offerEurMonth", "offerEurM2",
                 "surfaceM2", "rooms", "note", "createdAt"],
        "defaults": {"status": "PENDING", "contractType": None, "reportedAt": None,
                     "reviewedAt": None, "reviewNote": None},
    },
    "EmailLog": {
        "pk": "id",
        "cols": ["id", "to", "subject", "body", "provider", "status", "error", "createdAt"],
        "defaults": {},
    },
}

BOOLEAN_COLS = {"demo", "used", "isTense", "active"}
DATETIME_COLS = {"createdAt", "updatedAt", "expiresAt", "currentPeriodEnd", "boundaryFetchedAt",
                 "cachedAt", "reportedAt", "reviewedAt", "emailVerifiedAt", "lastLoginAt"}


def q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def parse_dt(v):
    """Converteix la representació DateTime de Prisma/SQLite a datetime UTC per PG."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    # Prisma pot desar epochs en mil·lisegons (int o string de dígits)
    if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
        n = float(v)
        if n >= 1e12:
            n = n / 1000.0  # mil·lisegons → segons
        elif n < 1e9:
            raise ValueError(f"epoch fora de rang: {v!r}")
        return datetime.fromtimestamp(n, tz=timezone.utc)
    s = str(v).strip().replace("Z", "+00:00")
    if "T" not in s and " " in s:
        s = s.replace(" ", "T", 1)
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(str(v), fmt)
                break
            except ValueError:
                continue
        else:
            raise ValueError(f"data no parsejable: {v!r}")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def adapt(col, v):
    if v is None:
        return None
    if col in BOOLEAN_COLS:
        return v if isinstance(v, bool) else bool(v)
    if col in DATETIME_COLS:
        return parse_dt(v)
    return v


def upsert_table(pg, table, spec, rows):
    cols = spec["cols"] + list(spec["defaults"].keys())
    pk = spec["pk"]
    col_sql = ", ".join(q(c) for c in cols)
    stmt = (
        f'INSERT INTO {q(table)} ({col_sql}) VALUES %s '
        f'ON CONFLICT ({q(pk)}) DO UPDATE SET '
        + ", ".join(f"{q(c)} = EXCLUDED.{q(c)}" for c in cols if c != pk)
    )
    values = []
    for r in rows:
        vals = [adapt(c, r.get(c)) for c in spec["cols"]] + [
            adapt(c, spec["defaults"][c]) for c in spec["defaults"]
        ]
        values.append(tuple(vals))
    cur = pg.cursor()
    execute_values(cur, stmt, values, page_size=500)
    cur.close()


def verify(pg, sq, table, spec):
    """Recompte + distinció de PK a banda i banda."""
    c = sq.cursor()
    c.execute(f'SELECT COUNT(*), COUNT(DISTINCT {q(spec["pk"])}) FROM {q(table)}')
    s_count, s_distinct = c.fetchone()
    c.close()
    c = pg.cursor()
    c.execute(f'SELECT COUNT(*), COUNT(DISTINCT {q(spec["pk"])}) FROM {q(table)}')
    p_count, p_distinct = c.fetchone()
    c.close()
    ok = (s_count == p_count == s_distinct == p_distinct)
    detail = f"origen={s_count} destí={p_count}"
    if not ok:
        detail += " MISMATCH"
    return ok, detail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(SQLITE_PATH):
        sys.exit(f"ERROR: no existeix l'SQLite origen {SQLITE_PATH}")

    sq = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    sq.row_factory = sqlite3.Row
    pg = psycopg2.connect(PG_DSN)

    print(f"Origen : {SQLITE_PATH}")
    print(f"Destí  : {PG_DSN.split('@')[-1]}")

    if not args.verify_only:
        total = 0
        for table, spec in TABLES.items():
            col_sql = ", ".join(q(c) for c in spec["cols"])
            c = sq.cursor()
            c.execute(f"SELECT {col_sql} FROM {q(table)}")
            rows = [dict(r) for r in c.fetchall()]
            c.close()
            upsert_table(pg, table, spec, rows)
            total += len(rows)
            print(f"  -> {table}: {len(rows)} files migrades (upsert)")
        pg.commit()
        print(f"TOTAL: {total} files escrites")

    print("\n--- VERIFICACIO D'INTEGRITAT ---")
    all_ok = True
    for table, spec in TABLES.items():
        ok, detail = verify(pg, sq, table, spec)
        all_ok = all_ok and ok
        print(f"  {'OK ' if ok else 'FAIL'} {table}: {detail}")

    # mostra concreta: Barcelona (080193) — preu i tensió idèntics
    c = sq.cursor()
    c.execute("SELECT code, rentLatest, isTense FROM Municipality WHERE code='080193'")
    src_mun = c.fetchone()
    c.close()
    c = pg.cursor()
    c.execute('SELECT "code", "rentLatest", "isTense" FROM "Municipality" WHERE "code"=%s', ("080193",))
    dst_mun = c.fetchone()
    c.close()
    sample_ok = (
        dst_mun is not None and src_mun is not None
        and dst_mun[1] == src_mun["rentLatest"]
        and bool(dst_mun[2]) == bool(src_mun["isTense"])
    )
    all_ok = all_ok and sample_ok
    print(f"  {'OK ' if sample_ok else 'FAIL'} mostra Barcelona (080193): "
          f"origen={tuple(src_mun) if src_mun else None} desti={tuple(dst_mun) if dst_mun else None}")

    pg.close()
    sq.close()
    if not all_ok:
        sys.exit("FALLA la verificacio — NO esborris l'SQLite original.")
    print("\nOK: migracio verificada, integritat confirmada taula a taula.")


if __name__ == "__main__":
    main()
