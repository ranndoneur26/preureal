#!/usr/bin/env python3
"""
v20: convierte las migraciones de Prisma en SQL IDEMPOTENTE para que
`prisma migrate deploy` pueda ejecutarse de forma segura en el build de
Vercel aunque la BD ya tenga las tablas (p. ej. si se crearon con
`prisma db push`, a mano en el SQL Editor, o si la migración se aplicó
dos veces). Sin esto, un deploy sobre una BD inicializada sin Prisma
fallaría con "relation already exists" y el build moriría.

Transformaciones:
  - CREATE TABLE  →  CREATE TABLE IF NOT EXISTS
  - CREATE [UNIQUE] INDEX  →  ... IF NOT EXISTS
  - ALTER TABLE ... ADD CONSTRAINT  →  DO $$ ... EXCEPTION WHEN
    duplicate_object THEN NULL $$  (PostgreSQL no tiene IF NOT EXISTS
    para constraints)
"""
import re

BASE = "/home/z/my-project/prisma/migrations"
FILES = [
    f"{BASE}/20261102000000_init_postgres/migration.sql",
    f"{BASE}/20261104120000_emaillog_telemetry/migration.sql",
]


def to_idempotent(sql: str) -> str:
    sql = re.sub(r"\bCREATE TABLE (?!IF NOT EXISTS)", "CREATE TABLE IF NOT EXISTS ", sql)
    sql = re.sub(
        r"\bCREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)",
        lambda m: f"CREATE {m.group(1) or ''}INDEX IF NOT EXISTS ",
        sql,
    )

    def wrap(m: "re.Match[str]") -> str:
        tbl, cons, rest = m.group(1), m.group(2), m.group(3)
        return (
            f"DO $$\nBEGIN\n  ALTER TABLE {tbl} ADD CONSTRAINT {cons} {rest}\n;\n"
            f"EXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;"
        )

    sql = re.sub(r'ALTER TABLE ("[^"]+") ADD CONSTRAINT ("[^"]+") ([^;]+);', wrap, sql)
    return sql


for f in FILES:
    with open(f, encoding="utf-8") as fh:
        src = fh.read()
    out = to_idempotent(src)
    if out != src:
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(out)
        print(f"idempotente ✓  {f}")
    else:
        print(f"sin cambios    {f}")
