#!/usr/bin/env python3
"""Genera los TROZOS 1 y 2 de la p3 (mitades autoverificadas del blob
gzip+base64 ya probado) para esquivar la corrupción de copiar-pegar.
Cada trozo se guarda como .b64 con su propio sha; el montaje los une."""
import base64, gzip, hashlib, pathlib

D = pathlib.Path("/home/z/my-project/scripts/guia_transfer")
p3 = (D / "guia_p3.html").read_bytes()
sha_p3 = hashlib.sha256(p3).hexdigest()

blob = (D / "guia_p3_repara.b64").read_text()
assert blob.endswith("\n")
lines = blob.splitlines(keepends=True)
half = len(lines) // 2
frag1 = "".join(lines[:half])
frag2 = "".join(lines[half:])
sha1 = hashlib.sha256(frag1.encode()).hexdigest()
sha2 = hashlib.sha256(frag2.encode()).hexdigest()

def trozo(name: str, path: str, delim: str, frag: str, fsha: str, n: str) -> str:
    return (
        f'mkdir -p "$HOME/preureal_guia"\n'
        f'cat > "$HOME/preureal_guia/{path}" << \'{delim}\'\n'
        + frag
        + f"{delim}\n"
        f'G="$(shasum -a 256 "$HOME/preureal_guia/{path}" | awk \'{{print $1}}\')"\n'
        f'if [ "$G" = "{fsha}" ]; then echo "✅ trozo {n} OK"; else echo "❌ trozo {n} dañado ($G) — cópiame esta salida"; fi\n'
    )

(D / "bloque_C1.txt").write_text(trozo("C1", "p3_c1.b64", "FIN_P3C1", frag1, sha1, "1/2"))
(D / "bloque_C2.txt").write_text(trozo("C2", "p3_c2.b64", "FIN_P3C2", frag2, sha2, "2/2"))

montaje = (
    'cat "$HOME/preureal_guia/p3_c1.b64" "$HOME/preureal_guia/p3_c2.b64" '
    '| openssl base64 -d | gunzip > "$HOME/preureal_guia/guia_p3.html"\n'
    'GOT="$(shasum -a 256 "$HOME/preureal_guia/guia_p3.html" | awk \'{print $1}\')"\n'
    f'if [ "$GOT" = "{sha_p3}" ]; then\n'
    '  echo "✅ p3 reconstruida — ahora ejecuta:  bash ~/preureal_guia.sh"\n'
    "else\n"
    '  echo "❌ no cuadra ($GOT) — cópiame esta salida"\n'
    "fi\n"
)
(D / "bloque_C3.txt").write_text(montaje)

print(f"líneas blob: {len(lines)} · frag1={len(frag1)}B sha={sha1}")
print(f"frag2={len(frag2)}B sha={sha2}")
print(f"p3 sha={sha_p3}")
print("C1:", (D / "bloque_C1.txt").stat().st_size, "B · C2:", (D / "bloque_C2.txt").stat().st_size, "B")
