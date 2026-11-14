#!/usr/bin/env python3
"""
Preureal — descarga la SUPERFÍCIE i DENSITAT oficials d'IDESCAT (emex API)
per als 947 municipis i genera el seed src/data/idescat_superficie_seed.json.

Cada valor és la tripletta oficial [muni, comarca, Catalunya] del API
«El municipi en xifres» (api.idescat.cat/emex/v1/dades.json?id=<code>).
Font citada per la mateixa API. Dades reals: mai s'inventa res; els munis
sense valor queden null i el producte ho mostra com «no disponible».
"""
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = "/home/z/my-project/github-preureal"
UA = "Preureal/1.0 (dades oficials IDESCAT; +https://www.preureal.com)"

munis = json.load(open(f"{ROOT}/src/data/municipalities.json"))
codes = [m["code"] for m in munis]
print(f"{len(codes)} municipis")

def fetch(code):
    url = f"https://api.idescat.cat/emex/v1/dades.json?id={code}"
    for attempt in range(3):
        r = subprocess.run(
            ["curl", "-s", "--max-time", "25", "-A", UA, url],
            capture_output=True, text=True,
        )
        try:
            d = json.loads(r.stdout)
            # walk to find f271 (superfície) i f262 (densitat) leaves
            out = {"code": code}
            def walk(node):
                if isinstance(node, dict):
                    nid = node.get("id")
                    if nid in ("f271", "f262", "f167", "f27", "f28", "f29") and "v" in node:
                        vals = [None if x == "_" else float(x) for x in str(node["v"]).split(",")]
                        out[nid] = {"v": vals, "r": node.get("r"), "u": node.get("u")}
                    for v in node.values():
                        if isinstance(v, (dict, list)):
                            walk(v)
                elif isinstance(node, list):
                    for x in node:
                        walk(x)
            walk(d)
            if "f271" in out or "f262" in out:
                return out
            return {"code": code, "empty": True}
        except Exception:
            time.sleep(1.0 * (attempt + 1))
    return {"code": code, "error": True}

results = {}
done = 0
with ThreadPoolExecutor(max_workers=6) as ex:
    futs = {ex.submit(fetch, c): c for c in codes}
    for f in as_completed(futs):
        c = futs[f]
        try:
            results[c] = f.result()
        except Exception as e:
            results[c] = {"code": c, "error": str(e)}
        done += 1
        if done % 100 == 0:
            print(f"  {done}/{len(codes)}")

seed = {
    "font": "IDESCAT, El municipi en xifres (api.idescat.cat/emex) — superfície (f271), densitat (f262) i grans grups d'edat vigents (f167/f27/f28/f29) amb tripletta [muni, comarca, Catalunya]",
    "llicencia": "Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT); citació de font obligatòria",
    "descarregat": time.strftime("%Y-%m-%d"),
    "municipis": [results.get(c, {"code": c, "error": True}) for c in codes],
}
with open(f"{ROOT}/src/data/idescat_superficie_seed.json", "w") as fh:
    json.dump(seed, fh, ensure_ascii=False, separators=(",", ":"))
ok = sum(1 for r in results.values() if "f271" in r)
err = sum(1 for r in results.values() if r.get("error"))
empty = sum(1 for r in results.values() if r.get("empty"))
print(f"fet: ok={ok} sense_dada={empty} error={err}")
sys.exit(0 if err == 0 else 1)
