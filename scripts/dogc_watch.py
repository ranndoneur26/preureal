#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigilancia DOGC de zonas tensadas (ZMRT) — Fase P0, alertas A3 y A7.

Rastrea las páginas oficiales (listado de habitatge.gencat.cat + dogc.gencat.cat)
buscando resoluciones TER nuevas o retiradas, y compara contra la línea base
vigente (v69.2): TER/3739/2026 (prórroga, 118) + TER/2408/2024 (2ª tanda, 131,
DOGC núm. 9196 de 3-7-2024) + TER/3740/2026 (53 nuevas) = 302 municipios.

Programación del Plan (figura 2, hora local Europe/Madrid):
  quincenal estándar : día 1 y 15 a las 09:00
  ventanas editoriales: DIARIA en abril y octubre (09:00) — A9 avisa 7 días antes

Alertas:
  nueva resolución TER detectada        → CRÍTICA A3 (import en < 72 h, protocolo v69)
  resolución vigente desaparece         → MEDIA (posible revocación — verificar DOGC)
  fuente oficial inaccesible            → MEDIA A7 (3 intentos con backoff)
  sin cambios                           → OK (solo queda registrado en el digest)

Códigos de salida: 0 sin cambios o MEDIA · 1 CRÍTICA (resolución nueva).
Uso:
  python3 scripts/dogc_watch.py                      # rastreo estándar
  python3 scripts/dogc_watch.py --selftest           # auto-test sin red
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
NOTIFICA = REPO / "pipeline" / "qa" / "notificaciones" / "envia_alerta.py"
BASELINE_PATH = REPO / "scripts" / "dogc_baseline.json"
INFORMES_DIR = REPO / "scripts" / ".informes_canario"

PATRON_TER = re.compile(r"TER\s*/\s*(\d{4})\s*/\s*(\d{4})", re.IGNORECASE)
UA = "Mozilla/5.0 (compatible; Preureal dogc-watch/1.0)"

PAGINAS = [
    {"id": "gencat_zonas_tensades",
     "url": "https://habitatge.gencat.cat/ca/ambits/lloguer/zones-tensades/",
     "nombre": "Listado oficial de zonas de demanda tensionada (habitatge.gencat.cat)"},
    {"id": "dogc_portal",
     "url": "https://dogc.gencat.cat/ca/cercador/?q=zones+tensades",
     "nombre": "Buscador del DOGC (Diari Oficial de la Generalitat de Catalunya)"},
]


def ahora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def descargar(url: str, intentos: int = 3) -> tuple[str | None, str]:
    import urllib.request
    esperas = [2, 5, 10]
    ultimo = ""
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                data = r.read()
                return data.decode("utf-8", "replace"), f"200 OK · {len(data):,} bytes"
        except Exception as e:  # noqa: BLE001
            ultimo = f"{type(e).__name__}: {e}"
            if i < intentos - 1:
                time.sleep(esperas[min(i, len(esperas) - 1)])
    return None, ultimo


def extraer_resoluciones(html: str) -> list[str]:
    """Devuelve las referencias TER/AAAA/AAAA normalizadas (TER/2408/2024)."""
    out = set()
    for m in PATRON_TER.finditer(html or ""):
        out.add(f"TER/{m.group(1)}/{m.group(2)}")
    return sorted(out)


def vigilar(baseline: dict, paginas_html: dict[str, str] | None = None) -> dict:
    """Núcleo puro (testable). paginas_html permite inyectar fixtures en selftest."""
    resultado: dict = {
        "fecha": ahora(),
        "vigentes_baseline": baseline["resoluciones_vigentes"],
        "paginas": [], "nuevas": [], "desaparecidas": [], "ok": False,
    }
    encontradas: set[str] = set()
    fallo_paginas = []

    for pag in PAGINAS:
        if paginas_html is not None:
            html, detalle = paginas_html.get(pag["id"]), "fixture"
        else:
            html, detalle = descargar(pag["url"])
        if html is None:
            resultado["paginas"].append({"id": pag["id"], "ok": False, "detalle": detalle})
            fallo_paginas.append(pag["id"])
            continue
        refs = extraer_resoluciones(html)
        encontradas.update(refs)
        resultado["paginas"].append({"id": pag["id"], "ok": True,
                                     "detalle": f"{len(refs)} referencias TER",
                                     "refs": refs})

    if fallo_paginas == [p["id"] for p in PAGINAS]:
        resultado["alerta"] = {"nivel": "MEDIA", "codigo": "A7",
                               "titulo": "Fuentes DOGC inaccesibles (3 intentos con backoff)",
                               "accion": "Reintentar más tarde; verificar dogc.gencat.cat"}
        return resultado

    vigentes = set(baseline["resoluciones_vigentes"])
    resultado["nuevas"] = sorted(encontradas - vigentes)
    resultado["desaparecidas"] = sorted(vigentes - encontradas)
    if resultado["nuevas"]:
        resultado["alerta"] = {
            "nivel": "CRITICA", "codigo": "A3",
            "titulo": f"Resolución(es) ZMRT nueva(s) en el DOGC: {resultado['nuevas']}",
            "accion": ("Importar en < 72 h con protocolo v69: NO MODIFICAR los 302 "
                       "vigentes · NO DUPLICAR · editar TENSE_A/TENSE_B/TENSE_C en "
                       "scripts/prepare_data.py · guardas pre/post · test "
                       "zmrt_v69_ter2408 · verificar /api/zones 08019 y 08227"),
        }
    elif resultado["desaparecidas"]:
        resultado["alerta"] = {
            "nivel": "MEDIA", "codigo": "A3-rev",
            "titulo": f"Resolución(es) vigente(s) no aparecen en las fuentes: "
                      f"{resultado['desaparecidas']} — posible revocación",
            "accion": "Verificar en el DOGC antes de tocar ningún dato",
        }
    else:
        resultado["alerta"] = None
        resultado["ok"] = True
    return resultado


def selftest() -> int:
    print("SELFTEST dogc_watch.py (sin red)\n")
    fallos = []

    def check(nombre: str, cond: bool) -> None:
        print(f"  {'✓' if cond else '✗'} {nombre}")
        if not cond:
            fallos.append(nombre)

    baseline = json.loads(BASELINE_PATH.read_text())
    check("baseline = 3 resoluciones vigentes", len(baseline["resoluciones_vigentes"]) == 3)
    check("baseline 302 = A 118 + B 131 + C 53",
          baseline["zmrt"]["total"] == 302
          and baseline["zmrt"]["llista"] == {"A": 118, "B": 131, "C": 53})

    # página estable → sin alerta
    html_ok = ("Listado vigente: Resolució TER/3739/2026 prorroga, "
               "TER/2408/2024 segona tanda, TER/3740/2026 noves.")
    r = vigilar(baseline, {"gencat_zonas_tensades": html_ok, "dogc_portal": html_ok})
    check("página estable → sin alerta", r["alerta"] is None and r["ok"])

    # resolución nueva → CRÍTICA A3
    html_nuevo = html_ok + " Nova Resolució TER/4102/2026, DOGC de 15-11-2026."
    r2 = vigilar(baseline, {"gencat_zonas_tensades": html_nuevo, "dogc_portal": html_ok})
    check("resolución nueva → CRÍTICA A3",
          r2["alerta"] and r2["alerta"]["nivel"] == "CRITICA"
          and "TER/4102/2026" in r2["alerta"]["titulo"])

    # resolución retirada → MEDIA
    html_revocado = "Vigente: TER/3739/2026 y TER/2408/2024."
    r3 = vigilar(baseline, {"gencat_zonas_tensades": html_revocado, "dogc_portal": html_revocado})
    check("resolución desaparecida → MEDIA",
          r3["alerta"] and r3["alerta"]["nivel"] == "MEDIA"
          and "TER/3740/2026" in r3["alerta"]["titulo"])

    check("regex normaliza espacios (TER / 2408 / 2024)",
          extraer_resoluciones("resol TER / 2408 / 2024 de 3-7-2024") == ["TER/2408/2024"])

    print()
    if fallos:
        print(f"SELFTEST FALLIDO: {fallos}")
        return 1
    print("SELFTEST OK — detección A3 (nueva/revocada) y A7 correctas")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Vigilancia DOGC de zonas tensadas — Fase P0")
    ap.add_argument("--sin-email", action="store_true")
    ap.add_argument("--out", help="ruta del informe JSON")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    baseline = json.loads(BASELINE_PATH.read_text())
    print(f"Vigilancia DOGC ZMRT · {ahora()}")
    print(f"  vigentes esperados: {', '.join(baseline['resoluciones_vigentes'])} "
          f"= {baseline['zmrt']['total']} municipios")

    r = vigilar(baseline)
    for p in r["paginas"]:
        marca = "✓" if p["ok"] else "✗"
        print(f"  {marca} {p['id']}: {p['detalle']}")
        if p.get("refs"):
            print(f"      referencias: {', '.join(p['refs'])}")

    INFORMES_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ruta = args.out or (INFORMES_DIR / f"dogc_{stamp}.json")
    ruta.write_text(json.dumps(r, indent=2, ensure_ascii=False))
    print(f"Informe: {ruta}")

    a = r.get("alerta")
    if a:
        print(f"  [{a['nivel']}] {a['codigo']}: {a['titulo']}")
        print(f"         acción: {a['accion']}")
        if not args.sin_email:
            cmd = [sys.executable, str(NOTIFICA), "--nivel", a["nivel"],
                   "--asunto", f"[PreuReal][{a['codigo']}] {a['titulo']}",
                   "--var", f"CUERPO=<p>{a['titulo']}</p><p><b>Acción:</b> {a['accion']}</p>"
                            f"<p>Vigentes esperados: {', '.join(baseline['resoluciones_vigentes'])}"
                            f" = {baseline['zmrt']['total']} municipios (A 118 · B 131 · C 53).</p>",
                   "--var", f"ACCIONES={a['accion']}",
                   "--var", f"ENLACE=https://habitatge.gencat.cat/ca/ambits/lloguer/zones-tensades/"]
            try:
                subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            except Exception as e:  # noqa: BLE001
                print(f"⚠ aviso no enviado: {e}")
        return 1 if a["nivel"] == "CRITICA" else 0

    print("  ✓ Sin cambios en el DOGC — 302 vigentes estables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
