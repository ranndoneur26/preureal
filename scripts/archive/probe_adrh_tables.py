#!/usr/bin/env python3
"""
Sondea las 54 tablas Tempus3 de la operación ADRH (Atlas de distribución de
renta de los hogares, INE) del bloque «Indicadores de renta media y mediana»
y las identifica por provincia / ámbito usando los nombres de municipio de
data/municipalities.json (los 947 de Catalunya).

Uso: python3 scripts/probe_adrh_tables.py
Salida: mapping tableId -> territorio identificado.
"""
import json
import re
import subprocess
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

BASE = Path("/home/z/my-project")
API = "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/{tid}?nult=1"
CAP_BYTES = 160_000  # descarga limitada por tabla: solo necesitamos ~40 series
PAISOS = ["Total España", "Cataluña", "Comunitat Valenciana", "Andalucía",
          "Aragón", "Asturias", "Illes Balears", "Canarias", "Cantabria",
          "Castilla y León", "Castilla - La Mancha", "Ceuta", "Melilla",
          "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia",
          "Navarra", "País Vasco", "Principado de Asturias",
          "Comunitat de Madrid", "Illes Balears"]

RE_NOMBRE = re.compile(r'"Nombre":"([^"]+?)\. Dato base\. ([^"]+?)\.?"')


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def fetch_capped(url: str, cap: int = CAP_BYTES) -> str:
    """curl con corte de stream a cap bytes (no descarga tablas completas)."""
    p = subprocess.Popen(
        ["curl", "-s", "--max-time", "60", url],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    buf = b""
    while len(buf) < cap:
        chunk = p.stdout.read(32_768)
        if not chunk:
            break
        buf += chunk
    p.kill()
    p.wait()
    return buf.decode("utf-8", errors="replace")


def main() -> None:
    tablas = json.load(open("/tmp/adrh_tables.json"))
    renta = [t for t in tablas if t["Nombre"] == "Indicadores de renta media y mediana"]
    print(f"Tablas 'Indicadores de renta media y mediana': {len(renta)}")

    muni_prov = {}
    for m in json.load(open(BASE / "data/municipalities.json")):
        muni_prov[norm(m["name"])] = m["province"]

    resultados = {}
    for i, t in enumerate(renta):
        tid = t["Id"]
        raw = fetch_capped(API.format(tid=tid))
        nombres = RE_NOMBRE.findall(raw)
        # solo series municipales (sin distrito/sección)
        municipios = [n for n, _ in nombres if "distrito" not in n and "sección" not in n]
        ccaa_hits = [n for n, _ in nombres if n in PAISOS]
        prov_count = Counter(muni_prov.get(norm(n)) for n in municipios)
        prov_count.pop(None, None)
        top = prov_count.most_common(2)
        ident = top[0][0] if top and top[0][1] >= 5 else (ccaa_hits[0] if ccaa_hits else "?")
        resultados[tid] = ident
        print(f"{i+1:2d}/54  id={tid:6d}  series_mun={len(municipios):4d}  -> {ident}  ({dict(top)})")
        time.sleep(0.5)

    out = BASE / "data" / "adrh_table_ids.json"
    out.write_text(json.dumps(resultados, indent=1, ensure_ascii=False))
    print("Guardado:", out)
    catalanes = {tid: p for tid, p in resultados.items() if p in ("Barcelona", "Girona", "Lleida", "Tarragona")}
    print("TABLAS CATALANAS:", catalanes)


if __name__ == "__main__":
    sys.exit(main())
