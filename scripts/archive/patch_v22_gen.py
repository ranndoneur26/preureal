#!/usr/bin/env python3
"""Genera download/patch_v22.sh — parche autocontenido v21→v22 para el Mac
del usuario (plan B si el ZIP no aparece en el panel de descargas).
Cada archivo se escribe con heredoc íntegro, como el cambio v21 que ya aplicó."""
import os

ROOT = "/home/z/my-project"
OUT = "/home/z/my-project/download/patch_v22.sh"
DELIM = "PREUREAL_V22_EOF"

# (ruta_destino, es_nueva) — las modificadas se escriben íntegras también
FILES = [
    ("prisma/schema.prisma", False),
    ("prisma/migrations/20261105150000_subscriptions_fase1/migration.sql", True),
    ("src/lib/subscription.ts", True),
    ("src/lib/plans.ts", False),
    ("src/app/api/[[...path]]/route.ts", False),
    ("src/app/api/_impl/subscription/route.ts", True),
    ("src/app/api/_impl/subscription/cancel/route.ts", True),
    ("src/app/api/_impl/subscription/reactivate/route.ts", True),
    ("src/app/api/_impl/lookup/route.ts", False),
    ("src/app/api/_impl/account/route.ts", False),
    ("src/app/api/_impl/stripe/checkout/route.ts", False),
    ("src/app/api/stripe/webhook/route.ts", False),
    ("src/hooks/use-user-plan.ts", True),
    ("src/components/views/PanelView.tsx", False),
    (".env.production.example", False),
    ("CHANGES.md", False),
]

lines = []
lines.append("#!/bin/bash")
lines.append("# PreuReal.cat v22 — Fase 1 de suscripciones (parche autocontenido)")
lines.append("# Uso:  bash ~/Downloads/patch_v22.sh")
lines.append("set -e")
lines.append('cd "/Users/marcxicola/Desktop/Feines 2025-26/preureal"')
lines.append('echo "== PreuReal v22: escribiendo archivos... =="')
for rel, _new in FILES:
    src = os.path.join(ROOT, rel)
    with open(src, "r", encoding="utf-8") as f:
        content = f.read()
    d = os.path.dirname(rel)
    if d:
        lines.append(f'mkdir -p "{d}"')
    lines.append(f'cat > "{rel}" << \'{DELIM}\'')
    lines.append(content.rstrip("\n"))
    lines.append(DELIM)
lines.append('echo "== Verificación v22 =="')
lines.append('grep -c "model SubscriptionUsage" prisma/schema.prisma')
lines.append('grep -c "Promise.allSettled" src/app/api/_impl/auth/register/route.ts')
lines.append('grep -c "useUserPlan" src/components/views/PanelView.tsx')
lines.append('grep -c "subscription" "src/app/api/[[...path]]/route.ts"')
lines.append('echo ""')
lines.append('echo "Si las 4 líneas de arriba muestran números (1, 2, 2, >=2), el parche está aplicado."')
lines.append('echo "Siguiente paso:  npx prisma generate && npm run build   (o solo el push: Vercel compila solo)."')
script = "\n".join(lines) + "\n"

with open(OUT, "w", encoding="utf-8") as f:
    f.write(script)
os.chmod(OUT, 0o755)
size = os.path.getsize(OUT)
print(f"✓ {OUT}  ({size/1024:.0f} KB, {len(FILES)} archivos)")

# Validación: el delimitador no puede aparecer en ningún contenido
bad = [rel for rel, _ in FILES
       if DELIM in open(os.path.join(ROOT, rel), encoding="utf-8").read()]
if bad:
    raise SystemExit(f"✗ DELIMITADOR EN CONFLICTO: {bad}")
print("✓ delimitador heredoc sin conflictos")
