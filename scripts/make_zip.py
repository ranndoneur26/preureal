#!/usr/bin/env python3
"""
PreuReal.cat — genera el ZIP lliurable del projecte (per Vercel / continuar dev).

Criteri: tots els fitxers git-trackejats del projecte real, excloent
infraestructura local, secrets i artefactes de plataforma. Idempotent.

Ús: python3 scripts/make_zip.py [sortida.zip]
"""
import os
import subprocess
import sys
import zipfile
from collections import Counter

ROOT = "/home/z/my-project"
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "download", "preureal-v3.zip")

# Prefixes/exactes EXCLOSOS sempre (secrets, infra local, artefactes de plataforma)
EXCLUDE_EXACT = {".env"}
EXCLUDE_PREFIX = (
    ".localpg/", "skills/", ".zscripts/", "tool-results/",
    "download/", "upload/", "node_modules/", ".next/",
)
# De data/ només el JSON que fa servir l'app (la resta són PDFs del pla de negoci)
DATA_KEEP = {"data/municipalities.json"}

# Fitxers que el ZIP ha de contenir sí o sí (fail-fast si falta algun)
MUST_HAVE = [
    "next.config.ts", "package.json", "bun.lock", "tsconfig.json",
    "src/instrumentation.ts", "src/lib/db.ts", "src/app/page.tsx",
    "prisma/schema.prisma", "prisma/migrations/20261102000000_init_postgres/migration.sql",
    "scripts/pg_local.sh", "scripts/dev_keepalive.sh", "scripts/migrate_sqlite_to_pg.py",
    "db/custom.db", "deploy/Caddyfile.prod", "docker-compose.yml", "Dockerfile",
    "VERCEL.md", "DEPLOY.md", "AUDIT.md", "INFORME_FINAL.md",
    ".gitignore", ".env.production.example", "tests/e2e.sh",
    "public/robots.txt", "public/sitemap.xml",
]
MUST_NOT_PREFIX = (".localpg/", "node_modules/", ".next/", "download/", "upload/", "skills/")
FORBIDDEN_SUBSTR = ("BEGIN PRIVATE KEY", "sk_live_")

tracked = subprocess.run(
    ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=False, check=True
).stdout.decode().split("\0")
tracked = [t for t in tracked if t]

files, skipped = [], []
for t in tracked:
    if t in EXCLUDE_EXACT:
        skipped.append(t); continue
    if any(t.startswith(p) for p in EXCLUDE_PREFIX):
        skipped.append(t); continue
    if t.startswith("data/") and t not in DATA_KEEP:
        skipped.append(t); continue
    files.append(t)

# Fitxers volguts però NO trackejats (p. ex. si .gitignore els tapa): inclosos explícitament
EXTRA_WANTED = [".env.production.example"]
existing = set(files)
for e in EXTRA_WANTED:
    p = os.path.join(ROOT, e)
    if e not in existing and os.path.isfile(p):
        files.append(e)

files = sorted(set(files))

missing = [m for m in MUST_HAVE if m not in files]
if missing:
    sys.exit(f"✗ FALTAN fitxers imprescindibles: {missing}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in files:
        z.write(os.path.join(ROOT, f), f)

# Verificació post-escriptura
with zipfile.ZipFile(OUT) as z:
    names = z.namelist()
    bad = [n for n in names if n in EXCLUDE_EXACT
           or any(n.startswith(p) for p in MUST_NOT_PREFIX)
           or n.endswith(".log")]
    if bad:
        sys.exit(f"✗ El ZIP conté fitxers prohibits: {bad[:5]}")
    for n in ("src/instrumentation.ts", "scripts/pg_local.sh"):
        content = z.read(n).decode("utf-8", "replace")
        if FORBIDDEN_SUBSTR[0] in content:
            sys.exit(f"✗ Possible clau privada a {n}")

size = os.path.getsize(OUT)
c = Counter(n.split("/")[0] if "/" in n else "(arrel)" for n in names)
print(f"✓ {OUT}")
print(f"  fitxers: {len(names)} · mida: {size/1e6:.2f} MB")
print("  desglos:")
for k, v in c.most_common():
    print(f"    {v:5}  {k}")
print(f"  exclosos (secrets/infra/artefactes): {len(skipped)}")
