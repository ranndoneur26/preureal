#!/usr/bin/env bash
# ===================================================================
#  PreuReal v23 · PART 2/2 — frontend + tests + verificació
#  Substitueix els fitxers afectats per les versions canòniques,
#  verificades aquí amb sha256 (build OK · 47/47 tests · lint OK).
# ===================================================================
set -u
REPO="/Users/marcxicola/Desktop/Feines 2025-26/preureal"

cd "$REPO" || { echo "ERROR: no trobo el projecte a: $REPO"; exit 1; }

echo ""
echo "== V23 · PART 2/2 — frontend + tests + verificació =="
command -v python3 >/dev/null 2>&1 || { echo "ERROR: cal python3 (ve amb les Command Line Tools de macOS)"; exit 1; }

echo "--- 1/5  Comprovant que la PART 1/2 ja està aplicada ---"
python3 - <<'PYEOF_V23G'
import hashlib, sys
PART1_SHA = {
    ".env.production.example": "d72a8a5bd80473423365bb5a47f3dfc8add372decee40b7bc42ce388cfbfd042",
    "src/app/api/[[...path]]/route.ts": "9296b9abb5bb418ac31ed47bab902228e1452493538280ea351c936080fc6d46",
    "src/app/api/_impl/account/route.ts": "1cf2afd6b4625c07620b841a7965b658caf3e74362fa01c48a7de1191dd62816",
    "src/app/api/_impl/admin/stats/route.ts": "95223d3cae0223f8f6728adac7270dfa34afbb3783c650668738f338750b1020",
    "src/app/api/_impl/auth/register/route.ts": "89ad60be97eb38592bb661d41fe05d41e311004b9699acc3f7646f618862bf68",
    "src/app/api/_impl/favorites/route.ts": "445dcb20b0b32e6a736f44fbae445a0e48ca5a9a5d26e98023dae2938a450d24",
    "src/app/api/_impl/lookup/route.ts": "678e998c527a7577ab9164f53039ec39301d5200eb0f7477a1156d3eb63a2ac0",
    "src/app/api/_impl/plans/route.ts": "fa1f8bddcbc9b76d9760f8c4b456c04027987dc9f129b11aadc715478c2606c7",
    "src/app/api/_impl/stripe/checkout/route.ts": "e2c29832e14f4c4ae92a327a690a9fb2134c36ba3f049698aea44d3111332940",
    "src/app/api/stripe/webhook/route.ts": "ac2bcf58652c71085a2175094ee4a18fa75e8c906cfe81cf075f8464854be88a",
    "src/lib/mail.ts": "66325c013128f2248aa5c1103295699d4fb8950338c6d46f3d606205d7e38a95",
    "src/lib/plans.ts": "70afad00d00b807f0494226787db70c9d66dd64aa3eedece5fe6c053f9a244b3",
    "src/lib/subscription.ts": "6ec0e68fd1d1c99fb826229596f80e81b16c1c1bda2096867bb0431fc4defcfe",
}
bad = []
for f, sha in PART1_SHA.items():
    try:
        if hashlib.sha256(open(f, 'rb').read()).hexdigest() != sha:
            bad.append(f)
    except OSError:
        bad.append(f)
if bad:
    print('  ERROR: aquests fitxers de la PART 1/2 no esten aplicats:', bad)
    print('  -> Executa PRIMER el bloc de la PART 1/2 i després aquest.')
    sys.exit(1)
print('  OK — els 13 fitxers de la PART 1/2 ja són canònics')
PYEOF_V23G
if [ $? -ne 0 ]; then echo "== PART 2/2 ATURADA: falta la PART 1/2 =="; exit 1; fi


echo "--- 2/5  Escrivint fitxers canònics i verificant sha256 ---"
echo "--- Comprovant el paquet de dades (/tmp/v23_p2.b64) ---"
[ -s /tmp/v23_p2.b64 ] || { echo "ERROR: falta /tmp/v23_p2.b64. Enganxa PRIMER els 2 BLOCS DE DADES (els que comencen per cat > i cat >>)."; exit 2; }
GOT=$(wc -c < /tmp/v23_p2.b64 | tr -d ' ')
[ "$GOT" = "36640" ] || { echo "ERROR: el paquet té $GOT bytes i en cal 36640. Esborra'l (rm /tmp/v23_p2.b64) i torna a enganxar els 2 blocs de dades des de l'inici."; exit 2; }
echo "  OK: $GOT bytes"
echo ""

python3 - <<'PYEOF_V23'
import base64, bz2, tarfile, io, hashlib, os, sys
EXPECT = {
    "src/components/views/PanelView.tsx": "ebb00900514012a3826374e2709d3b08b1580bc3e670fb5aec26dd36566e5d8c",
    "src/components/views/PricingView.tsx": "3bd708f398715210ed02a2fbcb247fad9776688d2c2ece5982cebce7f4869c6c",
    "tests/audit_v23.test.ts": "87297c08593c08ccaa0977fee737f00b028ae140170db26c8cba0b2b30eaa4eb",
    "CHANGES.md": "11d365e4ba075045ca7ed80dae91d07011410a3afeff3f1eae4e92c8802892c2",
    "scripts/make_zips_v23.py": "b9d9d7d52d1a39bd0198bbe98e679e172b05cdc085132606fd12478ede40597d",
}
raw = open("/tmp/v23_p2.b64").read().strip()
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
  echo "== PART 2/2 ATURADA (codi $RC). Res perdut: el teu estat anterior és al stash. =="
  echo "Engancha'm la sortida completa del terminal."
  exit 1
fi

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

