#!/usr/bin/env python3
"""Divide el HTML de la guía en 3 partes para transferencia por heredoc,
y verifica que la concatenación de las partes reproduce el fichero original."""
import hashlib, pathlib

SRC = pathlib.Path("/home/z/my-project/download/PreuReal_Guia_V23.html")
OUT = pathlib.Path("/home/z/my-project/scripts/guia_transfer")
OUT.mkdir(parents=True, exist_ok=True)

raw = SRC.read_bytes()
lines = raw.decode("utf-8").split("\n")  # 782 líneas
n = len(lines)
sizes = [261, 261, n - 522]  # 261 / 261 / 260

start = 0
shas = []
for i, sz in enumerate(sizes, 1):
    chunk = "\n".join(lines[start:start + sz])
    # cada parte debe acabar en \n para que la concatenación reproduzca
    # exactamente el original (join solo pone \n ENTRE líneas)
    if not chunk.endswith("\n"):
        chunk += "\n"
    p = OUT / f"guia_p{i}.html"
    p.write_text(chunk, encoding="utf-8")
    data = p.read_bytes()
    print(f"parte {i}: líneas {start+1}-{start+sz}  ({len(data):,} bytes)")
    shas.append(hashlib.sha256(data).hexdigest())
    start += sz

# Verificación: concatenación == original
joined = b"".join((OUT / f"guia_p{i}.html").read_bytes() for i in (1, 2, 3))
print("orig sha256 :", hashlib.sha256(raw).hexdigest())
print("join sha256 :", hashlib.sha256(joined).hexdigest())
print("JOIN OK" if joined == raw else "JOIN MISMATCH!!!")
print("orig bytes  :", len(raw), "| join bytes:", len(joined))
