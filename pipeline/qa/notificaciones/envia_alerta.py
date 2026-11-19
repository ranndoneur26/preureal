#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Envío de alertas por email (Resend) — Fase P0 del Plan de Mantenimiento cap. 5.

Renderiza una plantilla HTML del directorio plantillas/ sustituyendo variables
{{KEY}} y envía el resultado por Resend (canal ya integrado en PreuReal, ver
src/lib/mail.ts). Sin RESEND_API_KEY funciona en MODO SECO: guarda el HTML
renderizado y lo imprime por stdout — nunca falla el job llamador por falta
de credenciales, pero registra la omisión.

Niveles y plantillas (paleta del Plan, tabla de estados visuales):
  CRITICA → alerta_critica.html  rojo     #B23B3B  email inmediato + banner
  MEDIA   → alerta_media.html    naranja  #B8860B  digest diario + email
  BAJA    → alerta_baja.html     azul     #2563EB  digest semanal/mensual
  EXITO   → exito_import.html    verde    #2E7D5B  cierre de importación OK
  DIGEST  → digest_diario.html   neutro   #0F172A  resumen diario/semanal

Variables estándar (opcional, con valores por defecto):
  ASUNTO FECHA NIVEL JOB CUERPO ACCIONES ENLACE

Uso:
  python3 envia_alerta.py --nivel CRITICA --asunto "[PreuReal][CRÍTICA] A2 ..." \
      --var "CUERPO=<p>Municipios 171 ≠ 947</p>" \
      --var "ACCIONES=Revisar informe F0" --var "ENLACE=https://preureal.com/#/admin"

  python3 envia_alerta.py --nivel DIGEST --cuerpo-file /tmp/digest.html --dry-run
  python3 envia_alerta.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DIR = Path(__file__).resolve().parent
PLANTILLAS = DIR / "plantillas"
RESEND_ENDPOINT = "https://api.resend.com/emails"

ETIQUETA = {"CRITICA": "CRÍTICA", "MEDIA": "MEDIA", "BAJA": "BAJA",
            "EXITO": "ÉXITO", "DIGEST": "DIGEST"}
PLANTILLA_POR_NIVEL = {
    "CRITICA": "alerta_critica.html",
    "MEDIA": "alerta_media.html",
    "BAJA": "alerta_baja.html",
    "EXITO": "exito_import.html",
    "DIGEST": "digest_diario.html",
}


def render(nivel: str, vars: dict) -> tuple[str, list[str]]:
    ruta = PLANTILLAS / PLANTILLA_POR_NIVEL[nivel]
    html = ruta.read_text(encoding="utf-8")
    todos = dict(vars)
    todos.setdefault("NIVEL", ETIQUETA[nivel])
    todos.setdefault("ASUNTO", "Aviso de datos PreuReal")
    todos.setdefault("FECHA", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    todos.setdefault("JOB", "—")
    todos.setdefault("CUERPO", "(sin cuerpo)")
    todos.setdefault("ACCIONES", "Revisar el panel de administración")
    todos.setdefault("ENLACE", "https://preureal.com/#/admin")

    restantes: list[str] = []

    def sust(m: "re.Match[str]") -> str:
        clave = m.group(1)
        if clave in todos:
            return str(todos[clave])
        restantes.append(clave)
        return ""

    html = re.sub(r"\{\{([A-Z0-9_]+)\}\}", sust, html)
    return html, restantes


def enviar_por_resend(asunto: str, html: str, to: list[str]) -> tuple[bool, str]:
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        return False, "RESEND_API_KEY no definida — modo seco"
    remitente = os.environ.get("MAIL_FROM", "PreuReal Datos <onboarding@resend.dev>")
    payload = json.dumps({"from": remitente, "to": to, "subject": asunto,
                          "html": html}).encode("utf-8")
    req = urllib.request.Request(
        RESEND_ENDPOINT, data=payload, method="POST",
        headers={"Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode("utf-8", "replace")[:300]
            return r.status in (200, 201), f"HTTP {r.status} · {body}"
    except Exception as e:  # noqa: BLE001
        return False, f"{type(e).__name__}: {e}"


def selftest() -> int:
    print("SELFTEST envia_alerta.py\n")
    fallos = []

    def check(nombre: str, cond: bool) -> None:
        print(f"  {'✓' if cond else '✗'} {nombre}")
        if not cond:
            fallos.append(nombre)

    check("existen las 5 plantillas",
          all((PLANTILLAS / p).exists() for p in PLANTILLA_POR_NIVEL.values()))

    colores = {"alerta_critica.html": "#B23B3B", "alerta_media.html": "#B8860B",
               "alerta_baja.html": "#2563EB", "exito_import.html": "#2E7D5B"}
    for fichero, color in colores.items():
        html = (PLANTILLAS / fichero).read_text(encoding="utf-8")
        check(f"{fichero} usa el color del Plan ({color})", color in html)
        check(f"{fichero} es email-safe (tablas + CSS inline)",
              "<table" in html and "font-family" in html and "<script" not in html)
        check(f"{fichero} sin variables fuera de contrato",
              not re.search(r"\{\{(?!ASUNTO|FECHA|NIVEL|JOB|CUERPO|ACCIONES|ENLACE)[A-Z0-9_]+\}\}", html))

    html, restantes = render("CRITICA", {"CUERPO": "<p>test</p>"})
    check("render CRÍTICA sin placeholders residuales",
          not restantes and "{{" not in html and "<p>test</p>" in html)
    check("render incluye etiqueta de nivel", "CRÍTICA" in html)

    html_d, restantes_d = render("DIGEST", {"CUERPO": "<table><tr><td>k</td></tr></table>"})
    check("render DIGEST sin placeholders residuales", not restantes_d and "{{" not in html_d)

    print()
    if fallos:
        print(f"SELFTEST FALLIDO: {fallos}")
        return 1
    print("SELFTEST OK — 5 plantillas, colores y render correctos")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Envío de alertas PreuReal (Resend)")
    ap.add_argument("--nivel", choices=list(ETIQUETA))
    ap.add_argument("--asunto")
    ap.add_argument("--var", action="append", default=[],
                    help="variable KEY=VAL (repeatable; CUERPO admite HTML)")
    ap.add_argument("--var-file", help="JSON con variables")
    ap.add_argument("--cuerpo-file", help="fichero cuyo contenido pasa a CUERPO (HTML)")
    ap.add_argument("--to", action="append", default=[],
                    help="destinatario (repeatable); por defecto ALERT_EMAIL_TO")
    ap.add_argument("--out", help="guarda el HTML renderizado en esta ruta")
    ap.add_argument("--dry-run", action="store_true", help="no envía; guarda y muestra")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if not args.nivel or not args.asunto:
        ap.error("--nivel y --asunto son obligatorios (excepto con --selftest)")

    vars: dict = {}
    for v in args.var:
        if "=" in v:
            k, _, val = v.partition("=")
            vars[k] = val
    if args.var_file:
        vars.update(json.loads(Path(args.var_file).read_text(encoding="utf-8")))
    if args.cuerpo_file:
        vars["CUERPO"] = Path(args.cuerpo_file).read_text(encoding="utf-8")

    html, restantes = render(args.nivel, vars)
    asunto = vars.get("ASUNTO", args.asunto)

    if restantes:
        print(f"⚠ variables sin definir en la plantilla: {sorted(set(restantes))}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = args.out or (DIR / ".envios" / f"{args.nivel.lower()}_{stamp}.html")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")

    if args.dry_run:
        print(f"MODO SECO · asunto: {asunto}")
        print(f"HTML renderizado: {out_path} ({len(html):,} bytes)")
        return 0

    to = args.to or [x for x in [os.environ.get("ALERT_EMAIL_TO") or ""] if x]
    if not to:
        print("⚠ ALERT_EMAIL_TO/--to no definido — guardado sin enviar:")
        print(f"  {out_path}")
        return 0

    ok, detalle = enviar_por_resend(asunto, html, to)
    print(f"{'✓ enviado' if ok else '✗ NO enviado'}: {detalle}")
    if ok:
        print(f"  HTML: {out_path}")
        return 0
    print(f"  copia local: {out_path} — revisar RESEND_API_KEY / MAIL_FROM")
    return 0


if __name__ == "__main__":
    sys.exit(main())
