#!/usr/bin/env python3
"""Genera el BLOQUE B: p3 blindada (gzip+base64, el mismo blob que ya
funcionó en la Mac de Marc como guia_p3_repara.b64) + verificación."""
import base64, gzip, hashlib, pathlib

D = pathlib.Path("/home/z/my-project/scripts/guia_transfer")
p3 = (D / "guia_p3.html").read_bytes()
sha_p3 = hashlib.sha256(p3).hexdigest()

# reutiliza el blob ya probado en la Mac de Marc; valida por CONTENIDO descomprimido
# (los bytes del gzip pueden diferir por cabecera/mtime; lo que importa es el sha de p3)
import gzip as _gz, io
blob_existing = (D / "guia_p3_repara.b64").read_text()
decoded = _gz.decompress(base64.b64decode("".join(blob_existing.split())))
assert decoded == p3, "el blob existente NO corresponde a la p3 — regenerar"
blob = blob_existing if blob_existing.endswith("\n") else blob_existing + "\n"

block = (
    'mkdir -p "$HOME/preureal_guia"\n'
    'openssl base64 -d << \'FIN_P3B\' | gunzip > "$HOME/preureal_guia/guia_p3.html"\n'
    + blob
    + "FIN_P3B\n"
    'GOT="$(shasum -a 256 "$HOME/preureal_guia/guia_p3.html" | awk \'{print $1}\')"\n'
    'if [ "$GOT" = "' + sha_p3 + '" ]; then\n'
    '  echo "✅ p3 guardada y verificada — ahora ejecuta:  bash ~/preureal_guia.sh"\n'
    "else\n"
    '  echo "❌ no cuadra ($GOT) — cópiame esta salida"\n'
    "fi\n"
)
out = D / "bloque_B.txt"
out.write_text(block)
print(f"bloque_B.txt: {out.stat().st_size} bytes, sha_p3={sha_p3}")
