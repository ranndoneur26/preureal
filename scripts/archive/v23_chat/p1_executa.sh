#!/usr/bin/env bash
# ===================================================================
#  PreuReal v23 · PART 1/2 — backend i seguretat
#  Substitueix els fitxers afectats per les versions canòniques,
#  verificades aquí amb sha256 (build OK · 47/47 tests · lint OK).
# ===================================================================
set -u
REPO="/Users/marcxicola/Desktop/Feines 2025-26/preureal"

cd "$REPO" || { echo "ERROR: no trobo el projecte a: $REPO"; exit 1; }

echo ""
echo "== V23 · PART 1/2 — backend i seguretat =="
command -v python3 >/dev/null 2>&1 || { echo "ERROR: cal python3 (ve amb les Command Line Tools de macOS)"; exit 1; }

echo "--- 1/3  Còpia de seguretat de l'estat actual (git stash) ---"
git stash push -m "v23-bloc1-parcial (recuperable)" >/dev/null 2>&1 || true
echo "  fet (l'estat anterior queda guardat al stash; no cal recuperar-lo)"


echo "--- 2/3  Escrivint fitxers canònics i verificant sha256 ---"
echo "--- Comprovant el paquet de dades (/tmp/v23_p1.b64) ---"
[ -s /tmp/v23_p1.b64 ] || { echo "ERROR: falta /tmp/v23_p1.b64. Enganxa PRIMER els 2 BLOCS DE DADES (els que comencen per cat > i cat >>)."; exit 2; }
GOT=$(wc -c < /tmp/v23_p1.b64 | tr -d ' ')
[ "$GOT" = "34509" ] || { echo "ERROR: el paquet té $GOT bytes i en cal 34509. Esborra'l (rm /tmp/v23_p1.b64) i torna a enganxar els 2 blocs de dades des de l'inici."; exit 2; }
echo "  OK: $GOT bytes"
echo ""

python3 - <<'PYEOF_V23'
import base64, bz2, tarfile, io, hashlib, os, sys
EXPECT = {
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
raw = open("/tmp/v23_p1.b64").read().strip()
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
  echo "== PART 1/2 ATURADA (codi $RC). Res perdut: el teu estat anterior és al stash. =="
  echo "Engancha'm la sortida completa del terminal."
  exit 1
fi

