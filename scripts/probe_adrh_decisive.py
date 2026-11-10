#!/usr/bin/env python3
"""
Verificación decisiva de tablas ADRH con municipios discriminantes
(únicos en España dentro de su provincia catalana).
"""
import json
import re
import subprocess
import time
from pathlib import Path

BASE = Path("/home/z/my-project")

# (id_tabla, candidata a, discriminantes)
CANDS = [
    (30860, "Girona", ["Figueres", "Olot", "Blanes", "Ripoll", "Lloret de Mar"]),
    (31016, "Girona", ["Figueres", "Olot", "Blanes", "Ripoll", "Lloret de Mar"]),
    (31250, "Girona", ["Figueres", "Olot", "Blanes", "Ripoll", "Lloret de Mar"]),
    (31223, "Tarragona", ["Reus", "Salou", "Tortosa", "Amposta", "Vendrell, El"]),
    (30896, "Barcelona", ["Badalona", "Terrassa", "Sabadell", "Mataro", "Igualada"]),
    (31079, "Lleida", ["Balaguer", "Cervera", "Tremp", "Sort", "Seu d'Urgell, La"]),
]


def fetch_full(tid: int) -> str:
    url = f"https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/{tid}?nult=1"
    r = subprocess.run(["curl", "-s", "--max-time", "180", url],
                       capture_output=True)
    return r.stdout.decode("utf-8", errors="replace")


for tid, prov, disc in CANDS:
    raw = fetch_full(tid)
    found = [d for d in disc if re.search(rf'"Nombre":"{re.escape(d)}\. Dato base', raw)]
    print(f"Tabla {tid} ({prov}): discriminantes={found}  tamaño={len(raw)//1024}KB")
    time.sleep(1)

# ¿Qué bloque es 53687/53688 y qué contiene 53689 (nacional)?
tablas = {t["Id"]: t for t in json.load(open("/tmp/adrh_tables.json"))}
for tid in (53687, 53688, 53689):
    t = tablas.get(tid)
    print(f"Tabla {tid}: {t['Nombre'] if t else 'NO ESTÁ en la operación ADRH'}")

raw = fetch_full(53689)
ccaa = re.findall(r'"Nombre":"(Catalu[añ]+[^"]*?)\. Dato base\. ([^"]+?)\.?"', raw)
provs = re.findall(r'"Nombre":"(Barcelona|Girona|Lleida|Tarragona)\. Dato base\. ([^"]+?)\.?"', raw)
print("53689 series Cataluña:", sorted(set(ccaa))[:6])
print("53689 series provincias catalanas:", sorted(set(provs))[:8])
print("53689 tamaño:", len(raw) // 1024, "KB")
