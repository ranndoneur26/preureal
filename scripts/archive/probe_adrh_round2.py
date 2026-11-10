#!/usr/bin/env python3
"""
Segunda pasada de identificación de tablas ADRH: reintenta las tablas no
identificadas con mayor volumen de descarga y emparejando también series de
distrito/sección (quitando el sufijo « distrito NN» / « sección NNNNN»).
"""
import json
import re
import subprocess
import time
import unicodedata
from collections import Counter
from pathlib import Path

BASE = Path("/home/z/my-project")
API = "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/{tid}?nult=1"
CAP_BYTES = 500_000
RE_NOMBRE = re.compile(r'"Nombre":"([^"]+?)\. Dato base\. ([^"]+?)\.?"')
RE_SUFIJO = re.compile(r"\s+(distrito|secci[oó]n)\s+\w+$")

prev = json.load(open(BASE / "data/adrh_table_ids.json"))
tablas = json.load(open("/tmp/adrh_tables.json"))
renta = [t for t in tablas if t["Nombre"] == "Indicadores de renta media y mediana"]

muni_prov = {}
for m in json.load(open(BASE / "data/municipalities.json")):
    muni_prov[norm_key := unicodedata.normalize("NFD", m["name"])
              .encode("ascii", "ignore").decode().lower().strip()] = m["province"]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()
    return s


def fetch_capped(url: str, cap: int) -> str:
    p = subprocess.Popen(["curl", "-s", "--max-time", "90", url],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    buf = b""
    while len(buf) < cap:
        chunk = p.stdout.read(65_536)
        if not chunk:
            break
        buf += chunk
    p.kill()
    p.wait()
    return buf.decode("utf-8", errors="replace")


for i, t in enumerate(renta):
    tid = t["Id"]
    if prev.get(str(tid)) not in (None, "?"):
        continue
    raw = fetch_capped(API.format(tid=tid), CAP_BYTES)
    hits = Counter()
    first_names = []
    for nombre, _var in RE_NOMBRE.findall(raw):
        base = RE_SUFIJO.sub("", nombre).strip()
        if not first_names:
            first_names.append(nombre)
        prov = muni_prov.get(norm(base))
        if prov:
            hits[prov] += 1
    top = hits.most_common(2)
    ident = top[0][0] if top and top[0][1] >= 8 else "?"
    prev[str(tid)] = ident
    print(f"id={tid:6d} -> {ident:10s} matches={dict(top)}  primera_serie='{first_names[0] if first_names else '-'}'")
    time.sleep(0.4)

(BASE / "data/adrh_table_ids.json").write_text(json.dumps(prev, indent=1, ensure_ascii=False))
catalanes = {k: v for k, v in prev.items() if v in ("Barcelona", "Girona", "Lleida", "Tarragona")}
print("TABLAS CATALANAS:", catalanes)
