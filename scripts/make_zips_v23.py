#!/usr/bin/env python3
"""Genera el zip de entrega v23 (auditoría de seguridad) con nombres nuevos.
Limpia primero los zips v22 para dejar el panel limpio."""
import os, shutil, zipfile

ROOT = '/home/z/my-project'
DL = os.path.join(ROOT, 'download')

# 1) Limpieza de zips anteriores
for f in sorted(os.listdir(DL)):
    if f.endswith('.zip'):
        os.remove(os.path.join(DL, f))
        print('eliminado:', f)

# 2) Zip completo (mismo criterio que v22)
EXCLUDE_DIRS = {'node_modules', '.next', '.git', 'db', 'upload', 'download',
                'skills', 'tool-results', 'agent-ctx', '.turbo'}
EXCLUDE_FILES = {'.env', '.env.local', 'tsconfig.tsbuildinfo'}
def wanted(rel):
    parts = rel.split('/')
    if any(p in EXCLUDE_DIRS for p in parts): return False
    if parts[-1].startswith('.env') and parts[-1] != '.env.production.example': return False
    if rel in EXCLUDE_FILES: return False
    return True

stamp = '2026-11-06'
out = os.path.join(DL, f'PreuReal-v23-auditoria-{stamp}.zip')
n = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fn in sorted(filenames):
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT)
            if not wanted(rel): continue
            z.write(full, arcname=os.path.join('preureal', rel))
            n += 1

# 3) Copia idéntica (segundo nombre, como en v22)
out2 = os.path.join(DL, f'PreuReal-v23-copia-{stamp}.zip')
shutil.copy2(out, out2)

# 4) Verificación de integridad + ficheros clave
KEY = [
    'preureal/src/lib/subscription.ts',
    'preureal/src/lib/plans.ts',
    'preureal/src/app/api/stripe/webhook/route.ts',
    'preureal/src/app/api/_impl/account/route.ts',
    'preureal/src/app/api/_impl/stripe/checkout/route.ts',
    'preureal/src/app/api/_impl/subscription/route.ts',
    'preureal/src/app/api/_impl/subscription/cancel/route.ts',
    'preureal/src/app/api/_impl/subscription/reactivate/route.ts',
    'preureal/src/app/api/_impl/lookup/route.ts',
    'preureal/src/app/api/_impl/favorites/route.ts',
    'preureal/src/app/api/_impl/admin/stats/route.ts',
    'preureal/src/app/api/_impl/plans/route.ts',
    'preureal/src/app/api/[[...path]]/route.ts',
    'preureal/src/components/views/PricingView.tsx',
    'preureal/src/components/views/PanelView.tsx',
    'preureal/src/lib/mail.ts',
    'preureal/src/app/api/_impl/auth/register/route.ts',
    'preureal/tests/audit_v23.test.ts',
    'preureal/.env.production.example',
    'preureal/CHANGES.md',
]
for p in (out, out2):
    with zipfile.ZipFile(p) as z:
        bad = z.testzip()
        names = set(z.namelist())
        missing = [k for k in KEY if k not in names]
        print(os.path.basename(p), '->', 'OK' if bad is None else f'CORRUPTO {bad}',
              '| ficheros:', len(names), '| claves missing:', missing or 'ninguna')
print('total escritos:', n)
