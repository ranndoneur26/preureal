#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
staging_diff.py — Staging permanente: puerta C11 + C12 antes de producción.

Fase P2 «Automatización total» del Plan de Mantenimiento (docs/mantenimiento/
FASE_P2_STAGING.md): el ciclo trimestral ensaya la carga de Incasòl en un
entorno de STAGING (proyecto Supabase separado) ANTES de tocar producción.
Este script es la puerta: si algo falla aquí, producción queda intacta.

Controles (Plan cap. 6, auditoria_f0.py C11/C12):
  C11 · dry-run staging → diff staging ↔ producción (estructura + deltas de renta)
  C12 · canario post-staging → sondas contra staging (conteos y rangos plausibles)

Veredictos:
  OK      → staging listo, producción puede recibir la carga (exit 0)
  FALLA   → algún control en rojo: el ciclo se detiene ANTES de la carga en
            producción (exit 1) y se envía [PreuReal][CRÍTICA] desde el workflow

Honestidad del panel:
  · C12 sondea staging a nivel BD (los sondes API KPI-7 exigen un despliegue
    apuntando a staging: queda para P2.2, ver doc §9).
  · El esquema `geo` en staging se crea vacío por las migraciones; su pipeline
    de datos no forma parte del ciclo Incasòl → comprobaciones geo «n/d»
    (guarded, igual que el canario).
  · Si STAGING_DATABASE_URL no existe, el flujo anterior se mantiene intacto
    (C11/C12 PENDIENTES, promoción con verificación como hasta v70).

Uso:
  python3 scripts/staging_diff.py                      # prod=DATABASE_URL, staging=STAGING_DATABASE_URL
  python3 scripts/staging_diff.py --selftest           # offline, sin red ni BD
  python3 scripts/staging_diff.py --out ruta.json      # informe a medida

Códigos de salida: 0 = OK (C11/C12 verdes) · 1 = FALLA (algún control rojo).
"""

import argparse
import json
import os
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
INFORMES_DIR = REPO / "pipeline" / "qa" / "informes"

# Baselines idénticas al canario (scripts/canary_diario.py — misma fuente de verdad)
BASELINE = {
    "municipios": 947,
    "zmrt_total": 302,
    "zmrt": {"A": 118, "B": 131, "C": 53},
    "completitud_verde": 690,   # KPI-2: ≥ 690 verde · 600-689 aviso · < 600 rojo
}

# Rango plausible de rentLatest en €/mes (fiances Incasòl): Barcelona ≈ 1.135,
# municipios pequeños ≈ 400-600. Fuera de rango ⇒ error de unidades típico
# (índice €/m² ≈ 11 o cèntims ≈ 83.000).
RENT_MIN, RENT_MAX = 100.0, 3000.0

# Umbral de aviso C11: mediana de variación relativa de renta staging vs prod
# (%). Un aviso NO bloquea: una tanda nueva de año sí mueve la serie entera.
AVISO_DELTA_PCT = 15.0


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


def limpiar_dsn(url: str) -> str:
    """Igual que canary_diario.dsn(): prohíbe el parámetro pgbouncer (pooler
    de sesión 5432 sin transacciones)."""
    if "pgbouncer=" in url:
        import urllib.parse as up
        p = up.urlparse(url)
        url = up.urlunparse(p._replace(query="sslmode=require"))
    return url


# ────────────────── clasificación pura (unit-testable, offline) ─────────────

def clasificar_c12(conteos: dict) -> list[dict]:
    """C12 · canario post-staging a nivel BD. `conteos`:
    municipios, con_renta, tense {A,B,C,total}, periodo, rent_min, rent_max,
    geo_municipis (None = tabla vacía/no accesible).
    Devuelve controles [{id, nombre, veredicto (VERDE/AVISO/ROJO/n-d), detalle}]."""
    c = []
    tot = conteos.get("municipios")
    c.append({
        "id": "C12.1", "nombre": "estructura municipal staging",
        "veredicto": "VERDE" if tot == BASELINE["municipios"] else "ROJO",
        "detalle": f"{tot} municipios (esperados {BASELINE['municipios']})",
    })
    cr = conteos.get("con_renta")
    if cr is None or cr < 600:
        v = "ROJO"
    elif cr < BASELINE["completitud_verde"]:
        v = "AVISO"
    else:
        v = "VERDE"
    c.append({
        "id": "C12.2", "nombre": "completitud KPI-2 staging",
        "veredicto": v,
        "detalle": f"{cr} municipios con renta (verde ≥ {BASELINE['completitud_verde']})",
    })
    t = conteos.get("tense") or {}
    t_total = t.get("total")
    t_ok = t_total == BASELINE["zmrt_total"] and all(
        t.get(k) == v for k, v in BASELINE["zmrt"].items())
    c.append({
        "id": "C12.3", "nombre": "zonas tensadas vigentes staging",
        "veredicto": "VERDE" if t_ok else "ROJO",
        "detalle": (f"ZMRT {t_total} "
                    + (f"A {t.get('A')} · B {t.get('B')} · C {t.get('C')}"
                       if t_total else "sin datos")
                    + f" (esperadas {BASELINE['zmrt_total']} = A 118 · B 131 · C 53)"),
    })
    per = conteos.get("periodo")
    c.append({
        "id": "C12.4", "nombre": "periodo máximo con renta",
        "veredicto": "ROJO" if not per else "VERDE",
        "detalle": f"último periodo: {per or 'NULO — staging sin carga'}",
    })
    rmin, rmax = conteos.get("rent_min"), conteos.get("rent_max")
    if rmin is None or rmax is None:
        v, det = "ROJO", "sin valores de renta — staging vacío o carga fallida"
    elif rmin < RENT_MIN or rmax > RENT_MAX:
        v, det = "ROJO", (f"renta fuera de rango plausible [{RENT_MIN:.0f}-{RENT_MAX:.0f}] "
                          f"€/mes: min {rmin} · max {rmax} — ¿error de unidades?")
    else:
        v, det = "VERDE", f"renta en rango plausible €/mes: min {rmin} · max {rmax}"
    c.append({"id": "C12.5", "nombre": "rango plausible de renta", "veredicto": v,
              "detalle": det})
    geo = conteos.get("geo_municipis")
    if geo is None or geo == 0:
        v, det = "n-d", ("esquema geo vacío en staging (el pipeline geo no forma "
                         "parte del ciclo Incasòl) — comprobación omitida")
    elif geo == BASELINE["zmrt_total"]:
        v, det = "VERDE", f"geo.municipis = {geo} ZMRT"
    else:
        v, det = "ROJO", f"geo.municipis = {geo} ≠ {BASELINE['zmrt_total']} ZMRT"
    c.append({"id": "C12.6", "nombre": "geo.municipis (guarded)", "veredicto": v,
              "detalle": det})
    return c


def clasificar_deltas(prod: dict, stag: dict, deltas: list[dict],
                      aviso_pct: float = AVISO_DELTA_PCT) -> list[dict]:
    """C11 · diff staging ↔ producción.
    prod/stag: {"municipios": int, "con_renta": int, "periodo": str|None}
    deltas: [{code, prod, stag, abs_delta, pct}] solo donde cambió la renta.
    La puerta es estructural: los deltas de renta se informan (un año nuevo
    mueve toda la serie legítimamente) — solo avisan, no bloquean."""
    c = []
    dm = abs(stag["municipios"] - prod["municipios"])
    c.append({
        "id": "C11.1", "nombre": "estructura municipal staging vs prod",
        "veredicto": "ROJO" if dm > 5 else ("AVISO" if dm else "VERDE"),
        "detalle": f"prod {prod['municipios']} · staging {stag['municipios']} "
                   f"(diferencia {dm})",
    })
    dcr = prod["con_renta"] - stag["con_renta"]
    if stag["con_renta"] < prod["con_renta"] - 50:
        v = "ROJO"
    elif dcr > 0:
        v = "AVISO"
    else:
        v = "VERDE"
    c.append({
        "id": "C11.2", "nombre": "completitud staging vs prod",
        "veredicto": v,
        "detalle": f"prod {prod['con_renta']} · staging {stag['con_renta']} "
                   f"({'pierde ' + str(dcr) if dcr > 0 else 'sin pérdida de cobertura'})",
    })
    pp, ps = prod.get("periodo"), stag.get("periodo")
    if ps is None or (pp and str(pp) > str(ps)):
        v = "ROJO"
    elif pp and str(ps) > str(pp):
        v = "VERDE"
    else:
        v = "VERDE"
    c.append({
        "id": "C11.3", "nombre": "periodo staging ≥ prod (sin regresión)",
        "veredicto": v,
        "detalle": f"prod {pp or 'n/d'} · staging {ps or 'nulo'}",
    })
    n = len(deltas)
    pcts = [d["pct"] for d in deltas if d["pct"] is not None]
    med = statistics.median(pcts) if pcts else 0.0
    mx = max((d["abs_delta"] for d in deltas), default=0.0)
    c.append({
        "id": "C11.4", "nombre": "deltas de renta staging vs prod",
        "veredicto": "AVISO" if (n and med > aviso_pct) else "VERDE",
        "detalle": (f"{n} municipios con valor cambiado · mediana {med:.1f} % "
                    f"(aviso > {aviso_pct:.0f} %) · máx {mx:.2f} €/mes"
                    + (" — un año nuevo mueve toda la serie: revisar antes de promocionar"
                       if n and med > aviso_pct else "")),
    })
    return c


def puerta_ok(controles: list[dict]) -> bool:
    """La puerta solo la cierran los ROJO (AVISO y n-d pasan con mensaje)."""
    return not any(x["veredicto"] == "ROJO" for x in controles)


# ─────────────────────────── recolección en BD ──────────────────────────────

def conteos_bd(dsn: str, etiqueta: str) -> tuple[dict | None, str | None]:
    """Conteos estructurales de una BD (solo SELECT, nunca escribe)."""
    try:
        import psycopg2
    except ImportError:
        return None, "psycopg2 no instalado"
    try:
        conn = psycopg2.connect(dsn, connect_timeout=15)
        cur = conn.cursor()
        out: dict = {}
        cur.execute('SELECT COUNT(*) FROM "Municipality"')
        out["municipios"] = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM "Municipality" WHERE "rentLatest" IS NOT NULL')
        out["con_renta"] = cur.fetchone()[0]
        cur.execute('SELECT "tenseList", COUNT(*) FROM "Municipality" '
                    'WHERE "isTense" = true GROUP BY "tenseList"')
        t = {r[0]: r[1] for r in cur.fetchall() if r[0]}
        t["total"] = sum(t.values())
        out["tense"] = t
        cur.execute('SELECT MAX("rentPeriod") FROM "Municipality"')
        out["periodo"] = cur.fetchone()[0]
        cur.execute('SELECT MIN("rentLatest"), MAX("rentLatest") FROM "Municipality" '
                    'WHERE "rentLatest" IS NOT NULL')
        mn, mx = cur.fetchone()
        out["rent_min"] = float(mn) if mn is not None else None
        out["rent_max"] = float(mx) if mx is not None else None
        cur.execute('SELECT COUNT(*) FROM "Building"')
        out["edificios"] = cur.fetchone()[0]
        # geo guarded: la tabla puede no existir o estar vacía en staging
        try:
            cur.execute("SELECT count(*) FROM geo.municipis")
            out["geo_municipis"] = cur.fetchone()[0]
        except Exception:
            conn.rollback()
            out["geo_municipis"] = None
        cur.close()
        conn.close()
        return out, None
    except Exception as e:
        return None, f"{etiqueta}: {type(e).__name__}: {e}"


def rentas_bd(dsn: str) -> dict[str, float]:
    import psycopg2
    conn = psycopg2.connect(dsn, connect_timeout=15)
    cur = conn.cursor()
    cur.execute('SELECT code, "rentLatest" FROM "Municipality" '
                'WHERE "rentLatest" IS NOT NULL')
    d = {r[0]: float(r[1]) for r in cur.fetchall()}
    cur.close()
    conn.close()
    return d


def calcular_deltas(rent_prod: dict, rent_stag: dict) -> list[dict]:
    """Deltas por municipio solo donde cambió el valor (+ nuevos y perdidos)."""
    deltas = []
    for code in sorted(set(rent_prod) & set(rent_stag)):
        p, s = rent_prod[code], rent_stag[code]
        if abs(s - p) > 0.001:
            deltas.append({"code": code, "prod": p, "stag": s,
                           "abs_delta": round(abs(s - p), 2),
                           "pct": (abs(s - p) / p * 100) if p else None})
    return deltas


def nuevos_perdidos(rent_prod: dict, rent_stag: dict) -> tuple[list[str], list[str]]:
    nuevos = sorted(set(rent_stag) - set(rent_prod))
    perdidos = sorted(set(rent_prod) - set(rent_stag))
    return nuevos, perdidos


# ─────────────────────────────── selftest ───────────────────────────────────

def selftest() -> int:
    """Auto-test offline (sin red ni BD) — se ejecuta en el job smoke del CI."""
    ok = 0
    total = 0

    def check(nombre: str, cond: bool) -> None:
        nonlocal ok, total
        total += 1
        print(f"  [{'✓' if cond else '✗'}] {nombre}")
        if cond:
            ok += 1

    base = {"municipios": 947, "con_renta": 693,
            "tense": {"A": 118, "B": 131, "C": 53, "total": 302},
            "periodo": "2026 I trim.", "rent_min": 350.0, "rent_max": 1134.6,
            "geo_municipis": None}
    cc = clasificar_c12(base)
    check("C12 staging perfecto → sin ROJO", puerta_ok(cc))
    check("C12.6 geo vacío → n-d (no bloquea)",
          next(x for x in cc if x["id"] == "C12.6")["veredicto"] == "n-d")

    c2 = clasificar_c12({**base, "municipios": 171})
    check("C12 municipios 171 ≠ 947 → ROJO",
          not puerta_ok(c2) and next(x for x in c2 if x["id"] == "C12.1")["veredicto"] == "ROJO")

    c3 = clasificar_c12({**base, "con_renta": 650})
    check("C12 completitud 650 (600-689) → AVISO sin bloquear",
          puerta_ok(c3) and next(x for x in c3 if x["id"] == "C12.2")["veredicto"] == "AVISO")

    c4 = clasificar_c12({**base, "con_renta": 500})
    check("C12 completitud 500 → ROJO (puerta cerrada)", not puerta_ok(c4))

    c5 = clasificar_c12({**base, "tense": {"A": 118, "B": 131, "C": 53, "total": 171}})
    check("C12 ZMRT 171 ≠ 302 → ROJO", not puerta_ok(c5))

    c6 = clasificar_c12({**base, "tense": {"A": 118, "B": 131, "C": 53, "total": 302},
                         "geo_municipis": 302})
    check("C12 geo.municipis 302 poblado → VERDE",
          next(x for x in c6 if x["id"] == "C12.6")["veredicto"] == "VERDE")

    c7 = clasificar_c12({**base, "rent_max": 83000.0})
    check("C12 renta en céntimos (83.000) → ROJO unidades",
          not puerta_ok(c7) and "unidades" in next(x for x in c7 if x["id"] == "C12.5")["detalle"])

    c8 = clasificar_c12({**base, "periodo": None})
    check("C12 periodo nulo (staging vacío) → ROJO", not puerta_ok(c8))

    prod = {"municipios": 947, "con_renta": 693, "periodo": "2025"}
    stag = {"municipios": 947, "con_renta": 693, "periodo": "2025"}
    d0 = clasificar_deltas(prod, stag, [])
    check("C11 sin cambios → VERDE", puerta_ok(d0)
          and next(x for x in d0 if x["id"] == "C11.4")["veredicto"] == "VERDE")

    stag2 = {"municipios": 947, "con_renta": 680, "periodo": "2026 I trim."}
    deltas = [{"code": "080193", "prod": 1100.0, "stag": 1200.0,
               "abs_delta": 100.0, "pct": 9.1}]
    d1 = clasificar_deltas(prod, stag2, deltas)
    check("C11 nuevo periodo + 13 pérdida cobertura → AVISO (pasa)",
          puerta_ok(d1) and next(x for x in d1 if x["id"] == "C11.2")["veredicto"] == "AVISO")

    stag3 = {"municipios": 947, "con_renta": 600, "periodo": "2025"}
    d2 = clasificar_deltas(prod, stag3, [])
    check("C11 pérdida de cobertura > 50 → ROJO", not puerta_ok(d2))

    stag4 = {"municipios": 947, "con_renta": 693, "periodo": "2024"}
    d3 = clasificar_deltas(prod, stag4, [])
    check("C11 periodo staging < prod → ROJO (regresión)", not puerta_ok(d3))

    deltas5 = [{"code": f"08{i:04d}", "prod": 500.0, "stag": 620.0,
                "abs_delta": 120.0, "pct": 24.0} for i in range(10)]
    stag5 = {"municipios": 947, "con_renta": 693, "periodo": "2026"}
    d4 = clasificar_deltas(prod, stag5, deltas5)
    check("C11 mediana deltas 24 % > 15 % → AVISO con texto explicativo",
          next(x for x in d4 if x["id"] == "C11.4")["veredicto"] == "AVISO"
          and puerta_ok(d4))

    check("mask_url oculta credenciales",
          mask_url("postgresql://user:secreto@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require")
          == "host=aws-0-eu-west-2.pooler.supabase.com:5432 db=postgres")

    n, p = nuevos_perdidos({"A": 1.0, "B": 2.0}, {"B": 2.0, "C": 3.0})
    check("nuevos/perdidos por código", n == ["C"] and p == ["A"])

    print(f"\nSelftest staging_diff: {ok}/{total} verdes")
    return 0 if ok == total else 1


# ──────────────────────────────── main ──────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Puerta C11+C12 del ensayo staging (Fase P2.1 — antes de producción)")
    ap.add_argument("--prod-url", default=os.environ.get("DATABASE_URL", ""),
                    help="DSN producción (por defecto DATABASE_URL)")
    ap.add_argument("--staging-url", default=os.environ.get("STAGING_DATABASE_URL", ""),
                    help="DSN staging (por defecto STAGING_DATABASE_URL)")
    ap.add_argument("--aviso-delta-pct", type=float, default=AVISO_DELTA_PCT,
                    help="mediana %% de cambio que dispara AVISO (no bloquea)")
    ap.add_argument("--out", help="ruta del informe JSON (por defecto pipeline/qa/informes/)")
    ap.add_argument("--selftest", action="store_true", help="auto-test sin red ni BD")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    print("=" * 66)
    print(" Puerta staging C11/C12 — ensayo antes de producción")
    print(f" {ahora()}")
    print("=" * 66)
    if not args.prod_url or not args.prod_url.startswith("postgres"):
        print("✗ DATABASE_URL (producción) no definida o no es PostgreSQL"); return 1
    if not args.staging_url or not args.staging_url.startswith("postgres"):
        print("✗ STAGING_DATABASE_URL no definida o no es PostgreSQL"); return 1
    print(f" prod    : {mask_url(args.prod_url)}")
    print(f" staging : {mask_url(args.staging_url)}")

    c12_raw, err_s = conteos_bd(limpiar_dsn(args.staging_url), "staging")
    if err_s:
        print(f"✗ {err_s}")
        informe = {"momento": ahora(), "veredicto": "FALLA",
                   "error": err_s,
                   "nota": "staging inaccesible — producción intacta"}
        guardar_informe(informe, args.out)
        return 1
    c12 = clasificar_c12(c12_raw)

    c11_raw, err_p = conteos_bd(limpiar_dsn(args.prod_url), "producción")
    if err_p:
        print(f"✗ {err_p}")
        guardar_informe({"momento": ahora(), "veredicto": "FALLA", "error": err_p}, args.out)
        return 1
    rent_prod = rentas_bd(limpiar_dsn(args.prod_url))
    rent_stag = rentas_bd(limpiar_dsn(args.staging_url))
    deltas = calcular_deltas(rent_prod, rent_stag)
    nuevos, perdidos = nuevos_perdidos(rent_prod, rent_stag)
    c11 = clasificar_deltas(
        {"municipios": c11_raw["municipios"], "con_renta": c11_raw["con_renta"],
         "periodo": c11_raw["periodo"]},
        {"municipios": c12_raw["municipios"], "con_renta": c12_raw["con_renta"],
         "periodo": c12_raw["periodo"]},
        deltas, args.aviso_delta_pct)

    controles = c11 + c12
    veredicto = "OK" if puerta_ok(controles) else "FALLA"

    print("")
    for x in controles:
        icono = {"VERDE": "✓", "AVISO": "⚠", "ROJO": "✗", "n-d": "·"}.get(x["veredicto"], "?")
        print(f" {icono} [{x['id']}] {x['nombre']}: {x['veredicto']}\n     {x['detalle']}")
    if nuevos or perdidos:
        print(f"\n · nuevos con renta en staging: {len(nuevos)}{(' ' + ', '.join(nuevos[:8])) if nuevos else ''}")
        print(f" · perdidos respecto a prod:    {len(perdidos)}{(' ' + ', '.join(perdidos[:8])) if perdidos else ''}")

    informe = {
        "momento": ahora(),
        "veredicto": veredicto,
        "prod": mask_url(args.prod_url),
        "staging": mask_url(args.staging_url),
        "conteos_prod": c11_raw,
        "conteos_staging": c12_raw,
        "controles": controles,
        "deltas_resumen": {
            "cambiados": len(deltas),
            "nuevos": nuevos,
            "perdidos": perdidos,
            "max_abs_delta": max((d["abs_delta"] for d in deltas), default=0.0),
            "top10": sorted(deltas, key=lambda d: -d["abs_delta"])[:10],
        },
    }
    guardar_informe(informe, args.out)

    print("")
    if veredicto == "OK":
        print("✓ PUERTA VERDE — staging listo; el ciclo continúa hacia producción.")
        return 0
    rojos = [x["id"] for x in controles if x["veredicto"] == "ROJO"]
    print(f"✗ PUERTA ROJA ({', '.join(rojos)}) — producción INTACTA, ciclo detenido.")
    print("  Revisa el informe JSON (artifact del job) y el runbook P-09.")
    return 1


def guardar_informe(informe: dict, out: str | None) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    destino = Path(out) if out else INFORMES_DIR / f"staging_c11c12_{ts}_{informe.get('veredicto', 'X')}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(informe, indent=2, ensure_ascii=False, default=str))
    print(f"ℹ Informe: {destino}")


if __name__ == "__main__":
    sys.exit(main())
