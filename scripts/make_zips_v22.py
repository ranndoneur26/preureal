#!/usr/bin/env python3
"""Regenera los zips de entrega v22 con nombres nuevos (bypass del panel congelado).
Limpia primero los ficheros obsoletos de download/."""
import os, shutil, zipfile, datetime

ROOT = '/home/z/my-project'
DL = os.path.join(ROOT, 'download')

# 1) Limpieza: los zips viejos y el patch (que aún lleva la migración SIN corregir -> riesgo)
for f in ['PreuReal-codi-complet-v22.zip', 'PreuReal-v22-suscripcions.zip', 'patch_v22.sh']:
    p = os.path.join(DL, f)
    if os.path.exists(p):
        os.remove(p)
        print('eliminado:', f)

# 2) Construcción del zip completo excluyendo lo pesado/privado/ajeno al proyecto
EXCLUDE_DIRS = {'node_modules', '.next', '.git', 'db', 'upload', 'download',
                'skills', 'tool-results', 'agent-ctx', '.turbo'}
EXCLUDE_FILES = {'.env', '.env.local', 'tsconfig.tsbuildinfo',
                 'scripts/split_patch_v22.py', 'scripts/patch_v22_gen.py',
                 'scripts/gen_api_dispatcher.py'}
def wanted(rel):
    parts = rel.split('/')
    if any(p in EXCLUDE_DIRS for p in parts): return False
    if parts[-1].startswith('.env') and parts[-1] != '.env.production.example': return False
    if rel in EXCLUDE_FILES: return False
    if parts[0] == 'scripts' and len(parts) == 2 and parts[1] == 'patch_parts': return False
    return True

stamp = '2026-11-06'
out = os.path.join(DL, f'PreuReal-v22-complet-{stamp}.zip')
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

# 3) Copia de seguridad idéntica con el segundo nombre (como pedía el usuario)
out2 = os.path.join(DL, f'PreuReal-v22-copia-{stamp}.zip')
shutil.copy2(out, out2)

# 4) Verificación de integridad
for p in (out, out2):
    with zipfile.ZipFile(p) as z:
        bad = z.testzip()
        print(os.path.basename(p), '->', os.path.getsize(p), 'bytes |', len(z.namelist()),
              'ficheros | integridad:', 'OK' if bad is None else 'CORROMPIDO: ' + bad)
print('total ficheros empaquetados:', n)
