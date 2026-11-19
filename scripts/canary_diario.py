#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Canario diario de datos — Fase P0 del Plan de Mantenimiento (cap. 5 y 9).

Ejecuta cada mañana (cron 05:00 UTC = 06:00 CET / 07:00 CEST):
  1. SONDAS API  (KPI-7): /api/health · /api/zones?muni=08019 (ZMRT A · índice
     canario de Barcelona) · /api/zones?muni=08227 (ZMRT B · Sant Martí Sarroca,
     honesto FORA_ABAST_PILOT) · /api/geo/illes.
  2. KPIs DE BD  (sin tocar datos, solo SELECT): KPI-1 frescura por fuente
     (ImportRun) · KPI-2 completitud · KPI-3 tasa de error 90 d · KPI-4 validez
     geográfica (ST_IsValid) · KPI-6 cobertura · conteos estructurales (947
     municipios · 302 ZMRT = A 118 + B 131 + C 53 · dim · illes · agregats).
  3. CLASIFICA alertas A1-A10 según la matriz del Plan y envía:
     - CRÍTICA inmediata (A1 3 fallos consecutivos · A2 conteos fuera de rango)
     - MEDIA inmediata (A5 frescura > SLA · A7 fuente inaccesible)
     - digest diario (siempre, con --digest) usando la plantilla DIGEST.

Códigos de salida: 0 = sin críticas · 1 = alerta CRÍTICA activa.
La DATABASE_URL y los correos NUNCA se imprimen. Sin RESEND_API_KEY el envío
queda en modo seco (el informe se guarda como archivo y se imprime por stdout).

Uso:
  DATABASE_URL=... SITE_URL=https://preureal.com RESEND_API_KEY=... \
    ALERT_EMAIL_TO=datos@preureal.com \
    python3 scripts/canary_diario.py --digest

  # Solo sondas API (sin BD): útil en CI o para comprobar el despliegue
  python3 scripts/canary_diario.py --sin-db

  # Digest semanal (domingo 03:00 UTC): añade tendencias y últimas importaciones
  python3 scripts/canary_diario.py --semanal --digest

  # Auto-test sin red y sin BD
  python3 scripts/canary_diario.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
NOTIFICA = REPO / "pipeline" / "qa" / "notificaciones" / "envia_alerta.py"
INFORMES_DIR = REPO / "scripts" / ".informes_canario"

# Baselines verificadas en producción v69.2 (CHANGES v69.2 · verifica_prod.py)
BASELINE = {
    "municipios": 947,
    "zmrt_total": 302,
    "zmrt": {"A": 118, "B": 131, "C": 53},
    "dim_min": 142_283,          # solo-crecer (re-modelos legítimos la aumentan)
    "illes_min": 11_633,
    "seccions_min": 1_983,
    "agregats_min": 1_945,
    "completitud_verde": 690,    # KPI-2: ≥ 690 verde · 600-689 aviso · < 600 rojo
}

# SLA de frescura (días) por fuente ImportRun — KPI-1 (ajustable por el admin)
SLA_FUENTES = {
    "INCASOL_MUNICIPIS": 100,
    "INCASOL_EDIFICIS": 100,
    "CATASTRO_ATOM": 180,
    "SERPAVI": 365,
    "INE_IPVA": 400,
    "INE_ATLAS_RENTA": 400,
    "IDESCAT": 400,
    "RENTAL_SHARE": 200,
    "ENTORN": 200,
}

SONDAS = [
    {"id": "health", "ruta": "/api/health", "espera_status": 200},
    {"id": "zones_a", "ruta": "/api/zones?muni=08019", "espera_status": 200,
     "check": "zmrt.llista == 'A'"},
    {"id": "zones_b", "ruta": "/api/zones?muni=08227", "espera_status": 200,
     "check": "zmrt.llista == 'B'"},
    {"id": "geo_illes", "ruta": "/api/geo/illes", "espera_status": 200},
]

# Umbral A1: fallos CONSECUTIVOS de una sonda antes de escalar a CRÍTICA
A1_UMBRAL_CRITICA = 3


# ─────────────────────────── utilidades ────────────────────────────────────
def ahora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def mask_url(url: str) -> str:
    try:
        rest = url.split("@", 1)[1]
        host = rest.split("/", 1)[0]
        db = rest.split("/", 1)[1].split("?")[0]
        return f"host={host} db={db}"
    except Exception:
        return "(url no estándar)"


def dsn() -> str:
    u = os.environ.get("DATABASE_URL") or os.environ.get("PREUREAL_PROD_DATABASE_URL") or ""
    if "pgbouncer=" in u:
        import urllib.parse as up
        p = up.urlparse(u)
        u = up.urlunparse(p._replace(query="sslmode=require"))
    return u


def estado_path() -> Path:
    p = Path(os.environ.get("CANARY_STATE_FILE", "/tmp/preureal_canario_estado.json"))
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def cargar_estado() -> dict:
    try:
        return json.loads(estado_path().read_text())
    except Exception:
        return {}


def guardar_estado(estado: dict) -> None:
    estado_path().write_text(json.dumps(estado, indent=2, ensure_ascii=False))


# ─────────────────────────── sondas API (KPI-7) ────────────────────────────
def ejecutar_sonda(sonda: dict, base: str, intentos: int = 2) -> dict:
    import urllib.request
    url = base.rstrip("/") + sonda["ruta"]
    ultimo = ""
    for i in range(intentos):
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Preureal canario/1.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                status = r.status
                body = r.read(2_000_000)
            ms = int((time.time() - t0) * 1000)
            extra = {}
            if status == 200 and body:
                try:
                    js = json.loads(body.decode("utf-8", "replace"))
                    if "zmrt" in js:
                        extra["llista"] = (js.get("zmrt") or {}).get("llista")
                    if sonda["id"] == "zones_a" and isinstance(js.get("zones"), list):
                        extra["n_zones"] = len(js["zones"])
                except Exception:
                    extra["json"] = "no-parseable"
            ok = status == sonda["espera_status"]
            if sonda["id"] == "zones_a":
                ok = ok and extra.get("llista") == "A"
            if sonda["id"] == "zones_b":
                ok = ok and extra.get("llista") == "B"
            return {"id": sonda["id"], "url": sonda["ruta"], "status": status,
                    "ms": ms, "ok": ok, **extra}
        except Exception as e:  # noqa: BLE001
            ultimo = f"{type(e).__name__}: {e}"
            if i < intentos - 1:
                time.sleep(3)
    return {"id": sonda["id"], "url": sonda["ruta"], "status": None, "ms": None,
            "ok": False, "error": ultimo}


# ─────────────────────────── KPIs de BD (solo SELECT) ──────────────────────
def kpis_bd() -> tuple[dict | None, str | None]:
    """Ejecuta los KPI-1/2/3/4/6 del Plan (SQL de la tabla 21). Nunca escribe."""
    url = dsn()
    if not url:
        return None, "DATABASE_URL no definida — canario solo-sondas"
    try:
        import psycopg2
        conn = psycopg2.connect(url, connect_timeout=20)
        cur = conn.cursor()
        kpis: dict = {}

        cur.execute("""SELECT source, max("createdAt")::date,
                              current_date - max("createdAt")::date
                         FROM "ImportRun" WHERE status IN ('OK','PARTIAL')
                        GROUP BY source ORDER BY 3 DESC""")
        kpis["kpi1_frescura"] = [{"source": s, "ultima_ok": str(f), "dias": d}
                                 for s, f, d in cur.fetchall()]

        cur.execute("""SELECT round(100.0 * count(*) FILTER (WHERE status = 'ERROR')
                              / greatest(count(*), 1), 1)
                         FROM "ImportRun"
                        WHERE "createdAt" > now() - interval '90 days'""")
        kpis["kpi3_error_rate_90d"] = float(cur.fetchone()[0] or 0)

        cur.execute("""SELECT (SELECT count(*) FROM "Municipality"),
                              (SELECT count(*) FROM "Municipality" WHERE "isTense"),
                              (SELECT count(*) FROM "Municipality"
                                WHERE "rentLatest" IS NOT NULL),
                              (SELECT count(*) FROM geo.dim_building_rent_estimation),
                              (SELECT count(*) FROM geo.dades_lloguer_agregades)""")
        munis, zmrt_m, renta, dim, agregats = cur.fetchone()
        kpis["kpi2_estructural"] = {
            "municipios": munis, "zmrt_municipality": zmrt_m, "con_renta": renta,
            "dim_edificios": dim, "agregats": agregats,
        }

        cur.execute("""SELECT tense_llista, count(*) FROM geo.municipis
                        WHERE zmrt GROUP BY 1 ORDER BY 1""")
        kpis["zmrt_geo"] = {l: n for l, n in cur.fetchall()}
        cur.execute("SELECT count(*) FROM geo.municipis")
        kpis["geo_municipis"] = cur.fetchone()[0]

        cur.execute("""SELECT (SELECT count(*) FROM geo.geo_illes WHERE NOT ST_IsValid(geom)),
                              (SELECT count(*) FROM geo.geo_seccions WHERE NOT ST_IsValid(geom))""")
        inv_illes, inv_secc = cur.fetchone()
        kpis["kpi4_geometrias_invalidas"] = {"geo_illes": inv_illes, "geo_seccions": inv_secc}

        cur.execute("""SELECT (SELECT count(*) FROM geo.dades_lloguer_agregades)::float
                              / greatest((SELECT count(*) FROM geo.seccions_censals)::float, 1.0)""")
        kpis["kpi6_cobertura_agregats"] = round(float(cur.fetchone()[0]) * 100, 1)

        cur.execute("""SELECT max(any_referencia) FROM geo.dades_lloguer_agregades""")
        kpis["agregats_ultimo_any"] = cur.fetchone()[0]

        conn.close()
        return kpis, None
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__} (BD enmascarada: {mask_url(url)})"


# ─────────────────────── clasificación de alertas (A1-A10) ─────────────────
def clasificar(sondas: list[dict], estado_prev: dict, kpis: dict | None,
               error_kpis: str | None, semanal: bool) -> tuple[list[dict], dict]:
    """Aplica la matriz de alertas del Plan (tabla 8) → (alertas, estado nuevo)."""
    alertas: list[dict] = []
    estado = {"sondas": {}, "fecha": ahora()}

    for s in sondas:
        prev = (estado_prev.get("sondas") or {}).get(s["id"], {})
        consec = 0 if s["ok"] else int(prev.get("fallos_consecutivos", 0)) + 1
        estado["sondas"][s["id"]] = {"fallos_consecutivos": consec if not s["ok"] else 0,
                                     "ultima_ok": s["ok"], "fecha": ahora()}
        if not s["ok"]:
            if consec >= A1_UMBRAL_CRITICA:
                alertas.append({
                    "nivel": "CRITICA", "codigo": "A1",
                    "titulo": f"Sonda {s['id']} falla {consec} veces consecutivas",
                    "accion": "Runbook P-05: revisar BD y despliegue; posible rollback",
                })
            else:
                alertas.append({
                    "nivel": "MEDIA", "codigo": "A1-pre",
                    "titulo": f"Sonda {s['id']} falla ({consec}/{A1_UMBRAL_CRITICA} consecutivas)",
                    "accion": "Observar; si falla la 3ª vez seguida escala a CRÍTICA",
                })

    if kpis is None and error_kpis:
        alertas.append({"nivel": "MEDIA", "codigo": "A7-db",
                        "titulo": f"KPIs de BD no disponibles: {error_kpis}",
                        "accion": "Verificar DATABASE_URL / conexión (alerta A7)"})

    if kpis:
        est = kpis.get("kpi2_estructural") or {}
        # A2 conteos fuera de rango → CRÍTICA
        if est.get("municipios") != BASELINE["municipios"]:
            alertas.append({"nivel": "CRITICA", "codigo": "A2",
                            "titulo": f"Municipios {est.get('municipios')} ≠ {BASELINE['municipios']}",
                            "accion": "Bloquear import; restaurar backup si vino de una import"})
        zg = kpis.get("zmrt_geo") or {}
        total_z = sum(zg.values())
        if total_z != BASELINE["zmrt_total"] or any(
                zg.get(k) != v for k, v in BASELINE["zmrt"].items()):
            alertas.append({"nivel": "CRITICA", "codigo": "A2",
                            "titulo": f"ZMRT {total_z} {zg} ≠ 302 (A 118 · B 131 · C 53)",
                            "accion": "Protección v69: auditar geo.municipis (protocolo NO MODIFICAR/NO DUPLICAR)"})
        if est.get("con_renta") is not None and est["con_renta"] < 600:
            alertas.append({"nivel": "MEDIA", "codigo": "A8",
                            "titulo": f"Completitud municipal {est['con_renta']} < 600",
                            "accion": "Revisar Excel descargado y purga de filas 9999xx"})
        # A4 geometrías inválidas → CRÍTICA
        inv = kpis.get("kpi4_geometrias_invalidas") or {}
        if inv.get("geo_illes") or inv.get("geo_seccions"):
            alertas.append({"nivel": "CRITICA", "codigo": "A4",
                            "titulo": f"ST_IsValid: {inv.get('geo_illes')} illes + "
                                      f"{inv.get('geo_seccions')} seccions inválidas",
                            "accion": "Detener promoción; reejecutar ST_Multi/make_valid"})
        # A5 frescura > SLA → MEDIA
        for f in kpis.get("kpi1_frescura", []):
            sla = SLA_FUENTES.get(f["source"])
            if sla and f["dias"] > sla:
                alertas.append({"nivel": "MEDIA", "codigo": "A5",
                                "titulo": f"{f['source']}: frescura {f['dias']} d > SLA {sla} d",
                                "accion": "Ejecutar la importación pendiente de esa fuente"})
        # KPI-3 error rate 90 d (A6 semanal)
        er = kpis.get("kpi3_error_rate_90d", 0)
        if semanal and er > 10:
            alertas.append({"nivel": "MEDIA", "codigo": "A6",
                            "titulo": f"Tasa de error de importación 90 d = {er} % > 10 %",
                            "accion": "Análisis de causa raíz; revisar conectores y umbrales"})
        elif er > 10:
            alertas.append({"nivel": "BAJA", "codigo": "A6",
                            "titulo": f"Error rate 90 d = {er} % (revisión semanal)",
                            "accion": "Incluido en el digest semanal"})
    return alertas, estado


# ─────────────────────────────── envío ─────────────────────────────────────
def enviar(nivel: str, asunto: str, cuerpo_html: str, acciones: str,
           enlace: str, dry_run: bool) -> None:
    """Envía por Resend a través de envia_alerta.py (modo seco si no hay clave)."""
    cmd = [sys.executable, str(NOTIFICA), "--nivel", nivel, "--asunto", asunto,
           "--var", f"CUERPO={cuerpo_html}", "--var", f"ACCIONES={acciones}",
           "--var", f"ENLACE={enlace}"]
    if dry_run:
        cmd.append("--dry-run")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        out = (r.stdout or "").strip()
        if out:
            print(out)
        if r.returncode != 0:
            print(f"⚠ envia_alerta devolvió {r.returncode}: {(r.stderr or '').strip()[:300]}")
    except Exception as e:  # noqa: BLE001
        print(f"⚠ no se pudo invocar envia_alerta: {e}")


def tabla_html(titulo: str, filas: list[list[str]], cabecera: list[str]) -> str:
    th = "".join(f"<th style='text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb;'>{h}</th>" for h in cabecera)
    trs = "".join(
        "<tr>" + "".join(f"<td style='padding:6px 8px;border-bottom:1px solid #f1f3f5;'>{c}</td>" for c in fila) + "</tr>"
        for fila in filas)
    return (f"<h3 style='font-family:Arial,sans-serif;font-size:14px;margin:18px 0 6px;'>{titulo}</h3>"
            f"<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;'>"
            f"<tr>{th}</tr>{trs}</table>")


def construir_digest(kpis: dict | None, sondas: list[dict], alertas: list[dict],
                     semanal: bool) -> str:
    """Cuerpo HTML del digest (plantilla DIGEST + tablas de resultado)."""
    chip = {"OK": "🟢 OK", "MEDIA": "🟠 MEDIA", "CRITICA": "🔴 CRÍTICA"}
    nivel_global = "CRITICA" if any(a["nivel"] == "CRITICA" for a in alertas) else (
        "MEDIA" if any(a["nivel"] == "MEDIA" for a in alertas) else "OK")

    filas_sondas = [[s["id"], s["url"],
                     "OK" if s["ok"] else "FALLO",
                     f"{s.get('status') or '—'} · {s.get('ms') or '—'} ms",
                     s.get("llista") or ""] for s in sondas]
    html = tabla_html("Sondas API (KPI-7)", filas_sondas,
                      ["Sonda", "Ruta", "Resultado", "HTTP · latencia", "LLISTA"])

    if kpis:
        est = kpis.get("kpi2_estructural") or {}

        def fmt(n) -> str:
            return f"{n:,}".replace(",", ".") if isinstance(n, int) else "—"

        filas_kpi = [
            ["KPI-1 frescura", " · ".join(f"{f['source']} {f['dias']}d" for f in kpis.get("kpi1_frescura", [])[:6]) or "sin ImportRun"],
            ["KPI-2 completitud", f"{est.get('con_renta')}/{BASELINE['municipios']} municipios con renta · {kpis.get('geo_municipis')} en geo.municipis"],
            ["KPI-3 error rate 90 d", f"{kpis.get('kpi3_error_rate_90d')} %"],
            ["KPI-4 validez geo", f"{kpis.get('kpi4_geometrias_invalidas')} inválidas (debe ser 0/0)"],
            ["KPI-6 cobertura", f"{kpis.get('kpi6_cobertura_agregats')} % agregats/seccions · último año {kpis.get('agregats_ultimo_any')}"],
            ["Estructural", f"{est.get('municipios')} municipios · ZMRT {kpis.get('zmrt_geo')} · "
                            f"dim {fmt(est.get('dim_edificios'))} · agregats {fmt(est.get('agregats'))}"],
        ]
        html += tabla_html("KPIs de calidad del dato (Plan cap. 9)", filas_kpi, ["KPI", "Valor"])

    if alertas:
        filas_a = [[chip.get(a["nivel"], a["nivel"]), a["codigo"], a["titulo"], a["accion"]]
                   for a in alertas]
        html += tabla_html("Alertas activas", filas_a, ["Nivel", "Código", "Condición", "Acción prevista"])
    else:
        html += ("<p style='font-family:Arial,sans-serif;font-size:13px;color:#27845C;'>"
                 "✓ Sin alertas — digest todo verde, cero acción requerida.</p>")

    if semanal:
        html += ("<p style='font-family:Arial,sans-serif;font-size:12px;color:#6b7280;'>"
                 "Rutina semanal: backup pg_dump ejecutado junto a este digest · "
                 "revisión de error rate 90 d (A6) · recordatorio de ventanas "
                 "editoriales (ZMRT abril/octubre).</p>")
    return html


# ─────────────────────────────── selftest ──────────────────────────────────
def selftest() -> int:
    print("SELFTEST canary_diario.py (sin red, sin BD)\n")
    fallos = []

    def check(nombre: str, cond: bool) -> None:
        print(f"  {'✓' if cond else '✗'} {nombre}")
        if not cond:
            fallos.append(nombre)

    sonda_ok = {"id": "health", "url": "/api/health", "status": 200, "ms": 120, "ok": True}
    sonda_fail = {"id": "zones_a", "url": "/api/zones?muni=08019", "status": 500,
                  "ms": 300, "ok": False}

    # A1: 1-2 fallos → MEDIA · 3 consecutivos → CRÍTICA
    a1, e1 = clasificar([sonda_fail], {"sondas": {}}, None, None, False)
    check("1er fallo → MEDIA", any(a["codigo"] == "A1-pre" for a in a1))
    a2, e2 = clasificar([sonda_fail], e1, None, None, False)
    check("2º fallo consecutivo → MEDIA (2/3)",
          any("2/3" in a["titulo"] for a in a2))
    a3, _ = clasificar([sonda_fail], e2, None, None, False)
    check("3er fallo consecutivo → CRÍTICA A1",
          any(a["nivel"] == "CRITICA" and a["codigo"] == "A1" for a in a3))
    a4, _ = clasificar([sonda_ok], e2, None, None, False)
    check("recuperación resetea contador (sin alerta)", len(a4) == 0)

    # A2 conteos fuera de rango → CRÍTICA
    kpis_mal = {"kpi2_estructural": {"municipios": 171, "con_renta": 600},
                "zmrt_geo": {"A": 118, "B": 131, "C": 53},
                "kpi4_geometrias_invalidas": {"geo_illes": 0, "geo_seccions": 0},
                "kpi1_frescura": [], "kpi3_error_rate_90d": 0}
    a5, _ = clasificar([], {}, kpis_mal, None, False)
    check("municipios 171 ≠ 947 → CRÍTICA A2",
          any(a["codigo"] == "A2" and "171" in a["titulo"] for a in a5))

    # A4 geometrías inválidas → CRÍTICA
    kpis_geo = {"kpi2_estructural": {"municipios": 947, "con_renta": 692},
                "zmrt_geo": {"A": 118, "B": 131, "C": 53},
                "kpi4_geometrias_invalidas": {"geo_illes": 3, "geo_seccions": 0},
                "kpi1_frescura": [], "kpi3_error_rate_90d": 0}
    a6, _ = clasificar([], {}, kpis_geo, None, False)
    check("ST_IsValid inválido → CRÍTICA A4",
          any(a["codigo"] == "A4" for a in a6))

    # A5 frescura > SLA → MEDIA
    kpis_fresh = {"kpi2_estructural": {"municipios": 947, "con_renta": 692},
                  "zmrt_geo": {"A": 118, "B": 131, "C": 53},
                  "kpi4_geometrias_invalidas": {"geo_illes": 0, "geo_seccions": 0},
                  "kpi1_frescura": [{"source": "INCASOL_MUNICIPIS", "dias": 104,
                                     "ultima_ok": "2026-08-06"}],
                  "kpi3_error_rate_90d": 4.2}
    a7, _ = clasificar([], {}, kpis_fresh, None, False)
    check("frescura Incasòl 104 d > SLA 100 → MEDIA A5",
          any(a["codigo"] == "A5" and "104" in a["titulo"] for a in a7))

    # digest todo verde sin alertas
    kpis_ok = dict(kpis_fresh)
    kpis_ok["kpi1_frescura"] = [{"source": "INCASOL_MUNICIPIS", "dias": 38, "ultima_ok": "2026-11-12"}]
    a8, _ = clasificar([sonda_ok], {}, kpis_ok, None, False)
    check("estado sano → 0 alertas", len(a8) == 0)

    html = construir_digest(kpis_ok, [sonda_ok], a8, False)
    check("digest contiene KPIs y sondas", "Sondas API" in html and "KPI-2" in html)

    print()
    if fallos:
        print(f"SELFTEST FALLIDO: {fallos}")
        return 1
    print("SELFTEST OK — lógica A1/A2/A4/A5 y digest correctas")
    return 0


# ─────────────────────────────── main ──────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Canario diario de datos — Fase P0")
    ap.add_argument("--site", default=os.environ.get("SITE_URL", "https://preureal.com"))
    ap.add_argument("--sin-db", action="store_true", help="solo sondas API (sin KPIs de BD)")
    ap.add_argument("--digest", action="store_true", help="envía el digest por email")
    ap.add_argument("--semanal", action="store_true", help="modo digest semanal (A6 + backup)")
    ap.add_argument("--sin-email", action="store_true", help="no envía nada (solo stdout/informe)")
    ap.add_argument("--out", help="ruta del informe JSON")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    print(f"Canario diario PreuReal · {ahora()} · site={args.site}")
    estado_prev = cargar_estado()

    sondas = [ejecutar_sonda(s, args.site) for s in SONDAS]
    for s in sondas:
        marca = "✓" if s["ok"] else "✗"
        extra = f" · llista {s['llista']}" if s.get("llista") else ""
        print(f"  {marca} {s['id']:<10} {s['url']:<28} "
              f"{s.get('status') or 'ERR'} · {s.get('ms') or '—'} ms{extra}")

    kpis, error_kpis = (None, None) if args.sin_db else kpis_bd()
    if kpis:
        est = kpis.get("kpi2_estructural") or {}
        print(f"  KPIs: municipios {est.get('municipios')} · ZMRT {kpis.get('zmrt_geo')} · "
              f"renta {est.get('con_renta')}/{BASELINE['municipios']} · dim {est.get('dim_edificios'):,} "
              f"· error90d {kpis.get('kpi3_error_rate_90d')} %".replace(",", "."))
    elif not args.sin_db:
        print(f"  ⚠ KPIs de BD no disponibles ({error_kpis})")

    alertas, estado = clasificar(sondas, estado_prev, kpis, error_kpis, args.semanal)
    guardar_estado(estado)
    if alertas:
        for a in alertas:
            print(f"  [{'CRÍTICA' if a['nivel'] == 'CRITICA' else a['nivel']}] "
                  f"{a['codigo']}: {a['titulo']}")
    else:
        print("  ✓ Sin alertas (digest verde)")

    informe = {
        "script": "scripts/canary_diario.py", "fecha": ahora(), "site": args.site,
        "sondas": sondas, "kpis": kpis, "error_kpis": error_kpis,
        "alertas": alertas, "semanal": args.semanal,
        "baseline": BASELINE, "modo_db": "sondas" if args.sin_db else "completo",
    }
    INFORMES_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ruta = args.out or (INFORMES_DIR / f"canario_{stamp}.json")
    ruta.write_text(json.dumps(informe, indent=2, ensure_ascii=False))
    print(f"Informe: {ruta}")

    hay_critica = any(a["nivel"] == "CRITICA" for a in alertas)
    if not args.sin_email:
        nivel = "CRITICA" if hay_critica else ("MEDIA" if any(a["nivel"] == "MEDIA" for a in alertas) else "OK")
        cuerpo = construir_digest(kpis, sondas, alertas, args.semanal)
        accion = ("Abrir #/admin → Datos y fuentes · revisar informe JSON adjunto al digest"
                  if alertas else "Nada: digest verde")
        enviar(nivel, f"[PreuReal][{'CRÍTICA' if hay_critica else nivel}] "
                      f"canario diario · {len(alertas)} alerta(s) · {ahora()}",
               cuerpo, accion, args.site + "/#/admin", dry_run=False)
    return 1 if hay_critica else 0


if __name__ == "__main__":
    sys.exit(main())
