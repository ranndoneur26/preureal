#!/usr/bin/env python3
"""
gen_v23_chat_blocks.py — prepara los bloques de chat para entregar v23 por Terminal.

Los scripts canónicos download/preureal_v23_part{1,2}.sh (ya probados) se separan en:
  - 2 bloques de DATOS por parte (heredoc cat > / cat >> con el paquete b64)
  - 1 bloque EJECUTABLE pequeño por parte (runner: comprueba el paquete, escribe
    ficheros verificando sha256 y —en la parte 2— prisma generate + build + tests + commit)

Todo se escribe en scripts/v23_chat/ para poder leerlo en mensajes siguientes.
"""
import hashlib
import os
import re

REPO = "/home/z/my-project"
OUT = os.path.join(REPO, "scripts", "v23_chat")
os.makedirs(OUT, exist_ok=True)

PARTS = {1: 225, 2: 238}  # n -> línea de corte del bloque b64


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


for n, cut in PARTS.items():
    src_path = os.path.join(REPO, "download", f"preureal_v23_part{n}.sh")
    script = open(src_path).read()
    pat = re.compile(r"cat > /tmp/v23_p%d\.b64 << 'B64EOF_V23'\n(.*?)B64EOF_V23\n" % n, re.S)
    m = pat.search(script)
    assert m, f"no encuentro el bloque b64 en part{n}"
    blob = m.group(1)  # líneas b64 + \n final (exactamente lo que escribe el heredoc)
    lines = blob.rstrip("\n").split("\n")
    assert len(blob) == len("\n".join(lines)) + 1

    d1, d2 = lines[:cut], lines[cut:]
    c1_after = len("\n".join(d1)) + 1
    total = len(blob)

    block1 = "cat > /tmp/v23_p%d.b64 << 'B64EOF_V23'\n%s\nB64EOF_V23\n" % (n, "\n".join(d1))
    block2 = "cat >> /tmp/v23_p%d.b64 << 'B64EOF_V23'\n%s\nB64EOF_V23\n" % (n, "\n".join(d2))

    check = (
        'echo "--- Comprovant el paquet de dades (/tmp/v23_p%d.b64) ---"\n'
        '[ -s /tmp/v23_p%d.b64 ] || { echo "ERROR: falta /tmp/v23_p%d.b64. Enganxa PRIMER els 2 BLOCS DE DADES (els que comencen per cat > i cat >>)."; exit 2; }\n'
        'GOT=$(wc -c < /tmp/v23_p%d.b64 | tr -d \' \')\n'
        '[ "$GOT" = "%d" ] || { echo "ERROR: el paquet té $GOT bytes i en cal %d. Esborra\'l (rm /tmp/v23_p%d.b64) i torna a enganxar els 2 blocs de dades des de l\'inici."; exit 2; }\n'
        'echo "  OK: $GOT bytes"\n'
        'echo ""\n'
    ) % (n, n, n, n, total, total, n)

    runner = pat.sub(lambda _: check, script, count=1)
    assert "B64EOF_V23" not in runner.split("PYEOF_V23")[0].split("Comprovant")[1], "quedó b64 en el runner?"

    with open(os.path.join(OUT, f"p{n}_dades1.txt"), "w") as fh:
        fh.write(block1)
    with open(os.path.join(OUT, f"p{n}_dades2.txt"), "w") as fh:
        fh.write(block2)
    with open(os.path.join(OUT, f"p{n}_executa.sh"), "w") as fh:
        fh.write(runner)

    print(f"part{n}: b64={total}B ({len(lines)} lin) | tras dades1={c1_after}B | "
          f"dades1={len(block1)}B dades2={len(block2)}B executa={len(runner)}B")
    print(f"  sha256(executa)={sha256_bytes(runner.encode())[:16]}…")
print("FET")
