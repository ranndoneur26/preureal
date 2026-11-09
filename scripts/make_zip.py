#!/usr/bin/env python3
"""
PreuReal.cat — genera el ZIP net per desplegar a Vercel (v24). Idempotent.

Paquet: codi font, configs, Prisma, dades de seed i guia de desplegament.
Sense infraestructura local del sandbox (SQLite, Docker, PG incrustat,
logs, informes d'auditoria).

Ús: python3 scripts/make_zip.py [sortida.zip]
"""
import os
import sys
import zipfile
from collections import Counter

ROOT = "/home/z/my-project"

# ─────────────────────────────────────────────────────────────────────────────
# Mode VERCEL: whitelist explícita — només el necessari per desplegar
# ─────────────────────────────────────────────────────────────────────────────
VERCEL_DIRS = ["src", "prisma", "public"]  # sencers (walk del sistema de fitxers)
VERCEL_FILES = [
    # configs de build
    "package.json", "package-lock.json", "next.config.ts", "tsconfig.json",
    "tailwind.config.ts", "postcss.config.mjs", "components.json",
    "eslint.config.mjs",
    # repo + entorn
    ".gitignore", ".env.production.example",
    # config Vercel (cron de manteniment del correu — v19)
    "vercel.json",
    # documentació de desplegament (v21: fora CORRECCIONS_P1.md, doc obsoleta v1)
    "VERCEL.md", "README.md",
    # dades de seed (municipis amb lloguer Incasòl real)
    "data/municipalities.json",
    # scripts d'operació referenciats per VERCEL.md / README.md
    "scripts/seed.ts", "scripts/update_all.sh", "scripts/prepare_data.py",
    "scripts/gen_api_dispatcher.py", "scripts/check_repo.mjs",
    # P0 auditoria correu v19: purga de tokens històrics a EmailLog
    "scripts/scrub_emaillog_tokens.ts",
]
VERCEL_MUST_HAVE = VERCEL_FILES + [
    "src/instrumentation.ts", "src/lib/db.ts", "src/app/page.tsx",
    "src/app/globals.css",
    "src/app/api/[[...path]]/route.ts",
    "src/app/api/_impl/auth/login/route.ts",
    "src/app/api/_impl/stripe/checkout/route.ts",
    "src/app/api/health/route.ts",
    "src/app/api/stripe/webhook/route.ts",
    "prisma/schema.prisma",
    "prisma/migrations/20261102000000_init_postgres/migration.sql",
    "public/robots.txt", "public/sitemap.xml",
]
VERCEL_MUST_NOT_PREFIX = (
    "db/", "deploy/", "tests/", "examples/", "mini-services/", "data/plan",
    "node_modules/", ".next/", ".localpg/", "skills/", "download/", "upload/",
    "tool-results/", ".zscripts/", "scripts/pg_local.sh", "scripts/dev_keepalive.sh",
)
VERCEL_MUST_NOT_EXACT = {
    ".env", "Dockerfile", "docker-compose.yml", "Caddyfile",
    "AUDIT.md", "DEPLOY.md", "INFORME_FINAL.md", "next-env.d.ts",
}
WALK_JUNK_SUFFIX = (".log", ".DS_Store", ".pyc")
WALK_JUNK_PARTS = ("__pycache__",)

FORBIDDEN_SUBSTR = ("BEGIN PRIVATE KEY", "sk_live_")


def build_vercel_files():
    files = []
    for d in VERCEL_DIRS:
        for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, d)):
            dirnames[:] = [x for x in dirnames if x not in WALK_JUNK_PARTS]
            for f in filenames:
                if f.endswith(WALK_JUNK_SUFFIX):
                    continue
                rel = os.path.relpath(os.path.join(dirpath, f), ROOT).replace(os.sep, "/")
                files.append(rel)
    missing = [f for f in VERCEL_FILES
               if f not in files and not os.path.isfile(os.path.join(ROOT, f))]
    if missing:
        sys.exit(f"✗ FALTEN fitxers explícits del paquet Vercel: {missing}")
    files += VERCEL_FILES
    files = sorted(set(files))

    # Guardia d'arquitectura: l'API consolidada només permet el catch-all,
    # health, webhook i els handlers de _impl/. Una ruta route.ts a qualsevol
    # altra ubicació (p. ex. restaurada per un checkpoint de la plataforma)
    # crearia UNA funció serverless per ruta i trencaria el límit de 12 del
    # pla Hobby — s'exclou amb avís fort.
    ALLOWED_API_ROUTES = {
        "src/app/api/[[...path]]/route.ts",
        "src/app/api/health/route.ts",
        "src/app/api/stripe/webhook/route.ts",
    }
    stray = [f for f in files
             if f.startswith("src/app/api/") and f.endswith("/route.ts")
             and f not in ALLOWED_API_ROUTES and "/_impl/" not in f]
    if stray:
        print(f"⚠ EXCLUÏTS del ZIP (ruta API fora de l'arquitectura consolidada "
              f"— l'endpoint viu a src/app/api/_impl/): {stray}")
        files = [f for f in files if f not in stray]

    miss = [m for m in VERCEL_MUST_HAVE if m not in files]
    if miss:
        sys.exit(f"✗ FALTEN fitxers imprescindibles (vercel): {miss}")
    bad = [f for f in files
           if f in VERCEL_MUST_NOT_EXACT
           or any(f.startswith(p) for p in VERCEL_MUST_NOT_PREFIX)
           or f.endswith((".log", ".db", ".sqlite"))]
    if bad:
        sys.exit(f"✗ El paquet Vercel no hauria d'incloure: {bad[:8]}")
    return files, []


def main():
    args = sys.argv[1:]
    default_out = os.path.join(ROOT, "download", "PreuReal-cat-Vercel.zip")
    out = args[0] if args else default_out

    files, skipped = build_vercel_files()

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            z.write(os.path.join(ROOT, f), f)

    # Verificació post-escriptura
    with zipfile.ZipFile(out) as z:
        names = z.namelist()
        bad = [n for n in names
               if n.endswith((".log", ".db", ".sqlite"))
               or n in VERCEL_MUST_NOT_EXACT
               or any(n.startswith(p) for p in VERCEL_MUST_NOT_PREFIX)]
        if bad:
            sys.exit(f"✗ El ZIP conté fitxers prohibits: {bad[:5]}")
        scanned = 0
        for n in names:
            if os.path.getsize(os.path.join(ROOT, n)) > 1_000_000:
                continue
            content = z.read(n).decode("utf-8", "replace")
            for s in FORBIDDEN_SUBSTR:
                if s in content:
                    sys.exit(f"✗ Possible secret a {n}")
            scanned += 1

    size = os.path.getsize(out)
    c = Counter(n.split("/")[0] if "/" in n else "(arrel)" for n in names)
    print(f"✓ {out}")
    print(f"  fitxers: {len(names)} · mida: {size/1e6:.2f} MB "
          f"(escanejats per secrets: {scanned})")
    print("  desglos:")
    for k, v in c.most_common():
        print(f"    {v:5}  {k}")
    if skipped:
        print(f"  exclosos: {len(skipped)}")


if __name__ == "__main__":
    main()
