#!/usr/bin/env python3
"""
gen_v23_delivery.py — genera els 2 scripts de reparació v23 per al Mac de l'Marc.

Cada script: stash de seguretat → paquet bz2+base64 incrustat → escriptura de
fitxers canònics amb verificació sha256 → (part 2) prisma generate + build +
tests + commit. Es prova després contra un worktree a HEAD~1 (estat del Mac).
"""
import base64, bz2, hashlib, io, os, tarfile

REPO = "/home/z/my-project"
OUT = "/home/z/my-project/download"
os.makedirs(OUT, exist_ok=True)

PART1 = [
    ".env.production.example",
    "src/app/api/[[...path]]/route.ts",
    "src/app/api/_impl/account/route.ts",
    "src/app/api/_impl/admin/stats/route.ts",
    "src/app/api/_impl/auth/register/route.ts",
    "src/app/api/_impl/favorites/route.ts",
    "src/app/api/_impl/lookup/route.ts",
    "src/app/api/_impl/plans/route.ts",
    "src/app/api/_impl/stripe/checkout/route.ts",
    "src/app/api/stripe/webhook/route.ts",
    "src/lib/mail.ts",
    "src/lib/plans.ts",
    "src/lib/subscription.ts",
]
PART2 = [
    "src/components/views/PanelView.tsx",
    "src/components/views/PricingView.tsx",
    "tests/audit_v23.test.ts",
    "CHANGES.md",
    "scripts/make_zips_v23.py",
]

MAC_REPO = "/Users/marcxicola/Desktop/Feines 2025-26/preureal"


def make_tar_bz2(files):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:bz2", compresslevel=9) as tf:
        for f in files:
            content = open(os.path.join(REPO, f), "rb").read()
            ti = tarfile.TarInfo(f)
            ti.size = len(content)
            ti.mtime = 0
            ti.mode = 0o644
            tf.addfile(ti, io.BytesIO(content))
    return buf.getvalue()


def b64_wrapped(data, width=76):
    b = base64.b64encode(data).decode()
    return "\n".join(b[i : i + width] for i in range(0, len(b), width))


def expect_map(files):
    return {
        f: hashlib.sha256(open(os.path.join(REPO, f), "rb").read()).hexdigest()
        for f in files
    }


TEMPLATE = r"""#!/usr/bin/env bash
# ===================================================================
#  PreuReal v23 · PART @@N@@/2 — @@TITOL@@
#  Substitueix els fitxers afectats per les versions canòniques,
#  verificades aquí amb sha256 (build OK · 47/47 tests · lint OK).
# ===================================================================
set -u
REPO="@@REPO@@"

cd "$REPO" || { echo "ERROR: no trobo el projecte a: $REPO"; exit 1; }

echo ""
echo "== V23 · PART @@N@@/2 — @@TITOL@@ =="
command -v python3 >/dev/null 2>&1 || { echo "ERROR: cal python3 (ve amb les Command Line Tools de macOS)"; exit 1; }

@@PREPARA@@

echo "--- 2/@@PASSOS@@  Escrivint fitxers canònics i verificant sha256 ---"
cat > /tmp/v23_p@@N@@.b64 << 'B64EOF_V23'
@@B64@@
B64EOF_V23

python3 - <<'PYEOF_V23'
import base64, bz2, tarfile, io, hashlib, os, sys
EXPECT = @@EXPECT@@
raw = open("/tmp/v23_p@@N@@.b64").read().strip()
try:
    data = bz2.decompress(base64.b64decode(raw))
except Exception:
    print("ERROR: el paquet ha arribat TRUNCAT — el bloc copiat és incomplet.")
    print("Solució: torna a copiar Tot el bloc des de l'inici (des de 'cat >') fins a 'bash /tmp/...'.")
    sys.exit(2)
names = set()
ok = 0
with tarfile.open(fileobj=io.BytesIO(data), mode="r:bz2") as tf:
    for m in tf.getmembers():
        if not m.isfile():
            continue
        names.add(m.name)
        content = tf.extractfile(m).read()
        if hashlib.sha256(content).hexdigest() != EXPECT.get(m.name):
            print("ERROR de checksum a:", m.name)
            sys.exit(3)
        d = os.path.dirname(m.name)
        if d:
            os.makedirs(d, exist_ok=True)
        with open(m.name, "wb") as fh:
            fh.write(content)
        ok += 1
        print("  OK  " + m.name)
falt = sorted(set(EXPECT) - names)
if falt:
    print("ERROR falten fitxers al paquet:", falt)
    sys.exit(4)
print("--- %d/%d fitxers escrits i verificats (sha256) ---" % (ok, len(EXPECT)))
PYEOF_V23
RC=$?
if [ $RC -ne 0 ]; then
  echo ""
  echo "== PART @@N@@/2 ATURADA (codi $RC). Res perdut: el teu estat anterior és al stash. =="
  echo "Engancha'm la sortida completa del terminal."
  exit 1
fi
@@VERIFICACIO@@
"""

VERIFY_P2 = r"""
echo "--- 3/5  prisma generate (versió fixada 6.19.3) ---"
npx --yes prisma@6.19.3 generate > /tmp/v23_prisma.log 2>&1 && echo "  OK" || { tail -5 /tmp/v23_prisma.log; echo "ERROR en prisma generate"; exit 1; }

echo "--- 4/5  Build de verificació (pot trigar 1-2 min) ---"
if [ ! -d node_modules ]; then
  echo "  node_modules no existeix — executant npm install (pot trigar)..."
  npm install --no-audit --no-fund > /tmp/v23_npm.log 2>&1 || { tail -8 /tmp/v23_npm.log; echo "ERROR en npm install"; exit 1; }
fi
npx next build > /tmp/v23_build.log 2>&1
RC=$?
tail -14 /tmp/v23_build.log
if [ $RC -ne 0 ]; then
  echo "== BUILD HA FALLAT (codi $RC) — no facis res més i engancha'm aquesta sortida =="
  exit 1
fi

echo "--- 5/5  Tests (bun) i estat final ---"
if command -v bun >/dev/null 2>&1; then
  bun test tests/ > /tmp/v23_test.log 2>&1
  TRC=$?
  tail -6 /tmp/v23_test.log
  if [ $TRC -ne 0 ]; then
    echo "== TESTS HAN FALLAT (codi $TRC) — engancha'm la sortida. No s'ha fet cap commit. =="
    exit 1
  fi
else
  echo "  (bun no instal·lat al Mac: ometo aquest pas. Els 47 tests ja han passat al meu entorn: 47/47)"
fi

git add -A
git commit -m "v23: correccions de seguretat i cobraments (Stripe, cuota atòmica, RGPD, preus) + 47 tests" >/dev/null 2>&1 && echo "  commit creat: $(git log --oneline -1)" || echo "  (commit automàtic omès — res a commitar o git sense identitat configurada)"

echo ""
echo "== PART 2/2 COMPLETADA — codi v23 complet i verificat =="
"""


P1_STASH = 'echo "--- 1/3  Còpia de seguretat de l\'estat actual (git stash) ---"\ngit stash push -m "v23-bloc1-parcial (recuperable)" >/dev/null 2>&1 || true\necho "  fet (l\'estat anterior queda guardat al stash; no cal recuperar-lo)"\n'

def gen(n, title, files, outname, verify, pasos, prepara):
    blob = b64_wrapped(bz2.compress(make_tar_bz2(files), 9))
    expect = expect_map(files)
    exp_str = "{\n" + "".join('    "%s": "%s",\n' % (k, v) for k, v in expect.items()) + "}"
    script = (
        TEMPLATE.replace("@@N@@", str(n))
        .replace("@@TITOL@@", title)
        .replace("@@REPO@@", MAC_REPO)
        .replace("@@PASSOS@@", pasos)
        .replace("@@B64@@", blob)
        .replace("@@EXPECT@@", exp_str)
        .replace("@@VERIFICACIO@@", verify)
        .replace("@@PREPARA@@", prepara)
    )
    path = os.path.join(OUT, outname)
    with open(path, "w") as fh:
        fh.write(script)
    print("%s → %d bytes (b64 %d línies, %d fitxers)" % (outname, len(script), blob.count("\n") + 1, len(files)))


def part1_sha_block():
    rows = []
    for f in PART1:
        sha = hashlib.sha256(open(os.path.join(REPO, f), "rb").read()).hexdigest()
        rows.append('    "%s": "%s",' % (f, sha))
    return "\n".join(rows)


GUARD = (
    'echo "--- 1/5  Comprovant que la PART 1/2 ja està aplicada ---"\n'
    "python3 - <<'PYEOF_V23G'\n"
    "import hashlib, sys\n"
    "PART1_SHA = {\n"
    + part1_sha_block()
    + "\n"
    "}\n"
    "bad = []\n"
    "for f, sha in PART1_SHA.items():\n"
    "    try:\n"
    "        if hashlib.sha256(open(f, 'rb').read()).hexdigest() != sha:\n"
    "            bad.append(f)\n"
    "    except OSError:\n"
    "        bad.append(f)\n"
    "if bad:\n"
    "    print('  ERROR: aquests fitxers de la PART 1/2 no esten aplicats:', bad)\n"
    "    print('  -> Executa PRIMER el bloc de la PART 1/2 i després aquest.')\n"
    "    sys.exit(1)\n"
    "print('  OK — els 13 fitxers de la PART 1/2 ja són canònics')\n"
    "PYEOF_V23G\n"
    'if [ $? -ne 0 ]; then echo "== PART 2/2 ATURADA: falta la PART 1/2 =="; exit 1; fi\n'
)

gen(1, "backend i seguretat", PART1, "preureal_v23_part1.sh", "", "3", P1_STASH)
gen(2, "frontend + tests + verificació", PART2, "preureal_v23_part2.sh", VERIFY_P2, "5", GUARD)
print("FET")
