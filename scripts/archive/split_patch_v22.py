#!/usr/bin/env python3
"""Divideix patch_v22.sh en 3 blocs autoexecutables (bash << 'DELIM') per enganxar al Terminal de l'usuari.

- Contingut dels heredocs interns: byte a byte idèntic a patch_v22.sh.
- Cada bloc: wrapper 'bash << PREUREAL_Px_FI', cd al projecte, backup (només P1),
  blocs cat > fitxer amb verificació automàtica de bytes (check).
- EXCLÒS: bloc CHANGES.md (documentació; es lliurarà a part si cal).
- P3 afegeix la cua de verificació (greps) original del patch.
"""
import os, re, subprocess, sys

SRC = '/home/z/my-project/download/patch_v22.sh'
OUT = '/home/z/my-project/scripts/patch_parts'
PROJ = '/Users/marcxicola/Desktop/Feines 2025-26/preureal'
os.makedirs(OUT, exist_ok=True)

text = open(SRC, encoding='utf-8').read()
assert text.endswith('\n')
lines = text.split('\n')[:-1]

opener_re = re.compile(r"^cat > \"([^\"]+)\" << 'PREUREAL_V22_EOF'$")
openers = [i for i, l in enumerate(lines) if opener_re.match(l)]
closers = [i for i, l in enumerate(lines) if l == 'PREUREAL_V22_EOF']
assert len(openers) == len(closers), (len(openers), len(closers))

blocks = []
for op in openers:
    cl = min(c for c in closers if c > op)
    fname = opener_re.match(lines[op]).group(1)
    mkdir = lines[op - 1] if lines[op - 1].startswith('mkdir -p ') else None
    content = '\n'.join(lines[op + 1:cl]) + '\n'
    blocks.append({'file': fname, 'mkdir': mkdir, 'start': op, 'end': cl,
                   'content': content, 'bytes': len(content.encode('utf-8'))})

names = [b['file'] for b in blocks]
print('BLOCS DETECTATS (%d):' % len(blocks))
for b in blocks:
    print('  %6d  %s%s' % (b['bytes'], b['file'], '  [mkdir]' if b['mkdir'] else ''))

expected = ['prisma/schema.prisma',
            'prisma/migrations/20261105150000_subscriptions_fase1/migration.sql',
            'src/lib/subscription.ts', 'src/lib/plans.ts',
            'src/app/api/[[...path]]/route.ts',
            'src/app/api/_impl/subscription/route.ts',
            'src/app/api/_impl/subscription/cancel/route.ts',
            'src/app/api/_impl/subscription/reactivate/route.ts',
            'src/app/api/_impl/lookup/route.ts',
            'src/app/api/_impl/account/route.ts',
            'src/app/api/_impl/stripe/checkout/route.ts',
            'src/app/api/stripe/webhook/route.ts',
            'src/hooks/use-user-plan.ts',
            'src/components/views/PanelView.tsx',
            '.env.production.example', 'CHANGES.md']
assert names == expected, names

by_name = {b['file']: b for b in blocks}
P1 = ['prisma/schema.prisma',
      'prisma/migrations/20261105150000_subscriptions_fase1/migration.sql',
      'src/lib/subscription.ts', 'src/lib/plans.ts',
      'src/app/api/[[...path]]/route.ts']
P2 = ['src/app/api/_impl/subscription/route.ts',
      'src/app/api/_impl/subscription/cancel/route.ts',
      'src/app/api/_impl/subscription/reactivate/route.ts',
      'src/app/api/_impl/lookup/route.ts',
      'src/app/api/_impl/account/route.ts',
      'src/app/api/_impl/stripe/checkout/route.ts',
      'src/app/api/stripe/webhook/route.ts',
      'src/hooks/use-user-plan.ts',
      '.env.production.example']
P3 = ['src/components/views/PanelView.tsx']

tail = lines[by_name['CHANGES.md']['end'] + 1:]
assert tail[0].startswith('echo "== Verificaci'), tail[0]

CHECK_FN = ("check() { s=$(wc -c < \"$1\" | tr -d ' '); "
            "if [ \"$s\" = \"$2\" ]; then echo \"  OK $1 ($s bytes)\"; "
            "else echo \"  !! ATENCIO: $1 te $s bytes (esperava $2) - copia tot aixo al xat\"; fi; }")

def wrapper(n, title, body, backup=False):
    out = ["bash << 'PREUREAL_P%d_FI'" % n,
           'set -e',
           'cd "%s" || { echo "ERROR: no trobo la carpeta del projecte (%s)"; exit 1; }' % (PROJ, PROJ)]
    if backup:
        out += ['BACKUP="$HOME/Downloads/backup_pre_v22_$(date +%Y%m%d_%H%M%S).tgz"',
                'tar --exclude=node_modules --exclude=.next --exclude=.git -czf "$BACKUP" . || echo "(avis: backup ha fallat, continuo)"',
                'echo "== Copia de seguretat previa: $BACKUP =="']
    out.append('echo "== PreuReal v22 · PART %d/3: %s ==" ' % (n, title))
    out.append(CHECK_FN)
    out += body
    return out

def render(fnames):
    body = []
    for fn in fnames:
        b = by_name[fn]
        if b['mkdir']:
            body.append(b['mkdir'])
        body.append("cat > \"%s\" << 'PREUREAL_V22_EOF'" % b['file'])
        body += b['content'].rstrip('\n').split('\n')
        body.append('PREUREAL_V22_EOF')
        body.append('check "%s" %d' % (b['file'], b['bytes']))
    return body

p1 = wrapper(1, 'schema + migracio SQL + llibreries (plans, subscription) + dispatcher API',
             render(P1), backup=True)
p1 += ['echo "== PART 1/3 completada. Torna al xat i escriu: continua =="',
       'PREUREAL_P1_FI']

p2 = wrapper(2, 'rutes API de subscripcio + Stripe (preparat, no connectat) + hook useUserPlan + .env exemple',
             render(P2))
p2 += ['echo "== PART 2/3 completada. Torna al xat i escriu: continua =="',
       'PREUREAL_P2_FI']

p3 = wrapper(3, 'panell (PanelView.tsx) + verificacio final', render(P3))
p3 += tail
p3 += ['echo "== PART 3/3 completada - v22 aplicada al projecte =="',
       'PREUREAL_P3_FI']

for n, part in [(1, p1), (2, p2), (3, p3)]:
    delim = 'PREUREAL_P%d_FI' % n
    body = '\n'.join(part) + '\n'
    assert body.count(delim) == 2, (n, body.count(delim))  # obertura + tancament
    assert 'PREUREAL_P%d_FI' % n not in text  # mai apareix al contingut original
    path = os.path.join(OUT, 'part%d.txt' % n)
    open(path, 'w', encoding='utf-8').write(body)
    r = subprocess.run(['bash', '-n', path], capture_output=True, text=True)
    status = 'sintaxi OK' if r.returncode == 0 else 'ERROR SINTAXI: ' + r.stderr[:300]
    print('part%d.txt  %7d bytes  %s' % (n, len(body.encode('utf-8')), status))

# Verificació global: recomposar els heredocs de P1+P2+P3 i comparar amb l'original
recomp = []
for fn in P1 + P2 + P3:
    b = by_name[fn]
    if b['mkdir']:
        recomp.append(b['mkdir'])
    recomp.append("cat > \"%s\" << 'PREUREAL_V22_EOF'" % b['file'])
    recomp += b['content'].rstrip('\n').split('\n')
    recomp.append('PREUREAL_V22_EOF')
orig_without_changes = (lines[:by_name['prisma/schema.prisma']['start']]
                        + recomp
                        + tail)
rebuilt = '\n'.join(orig_without_changes) + '\n'
missing = [l for l in lines if l not in set(orig_without_changes) and l != 'PREUREAL_V22_EOF'
           and not l.startswith('cat > ') and not l.startswith('#') and not l.startswith('cd ')
           and not l.startswith('set -e') and not l.startswith('echo')]
print('RECOMPOSAT: %d linies de contingut de fitxers (original sense CHANGES.md ni capçalera)' % len(recomp))
for b in P1 + P2 + P3:
    print('  Esperat al check del Terminal:  OK %-55s %6d bytes' % (by_name[b]['file'], by_name[b]['bytes']))
print('FET. Fitxers a %s' % OUT)
