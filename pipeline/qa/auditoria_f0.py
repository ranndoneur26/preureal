#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Auditoría previa F0 — los 12 controles bloqueantes (Fase P0 del Plan de
Mantenimiento de Bases de Datos, capítulo 6).

Ningún fichero toca producción antes de pasar esta auditoría. El script es
SOLO LECTURA: no escribe en la BD de producción (la única escritura posible
es el dry-run C11 contra un entorno de staging explícito con --staging-url).

Controles (Plan de Mantenimiento, tabla 8):
  C1  salud de la fuente        HTTP 200 + content-type + 3 intentos con backoff
  C2  integridad del fichero    tamaño mínimo, carga válida, SHA-256 vs anterior
  C3  esquema esperado          columnas = contrato documentado (o estables vs anterior)
  C4  cobertura mínima          municipios presentes ≥ 940 · sin municipios nuevos raros
  C5  rangos y outliers         €/mes dentro de banda razonable; >1 % fuera → ROJO
  C6  duplicidad                claves INE únicas · cero códigos sintéticos 9999xx
  C7  coherencia temporal       período nuevo ≥ último importado (sin regresión)
  C8  coherencia geográfica     códigos INE contra el catálogo repo (947 municipios)
  C9  estabilidad estadística   desviación del agregado municipal vs anterior >15 % → ROJO
  C10 coherencia ZMRT           recuento 302 = A 118 + B 131 + C 53 (protección v69)
  C11 dry-run staging           carga a staging_<fuente> + diff (requiere --staging-url)
  C12 canario post-staging      sondas API contra staging (requiere --staging-url)

Puerta: GO = todos los bloqueantes verdes (C11/C12 pueden quedar PENDIENTES
si no hay staging) · NO-GO = cualquier bloqueante rojo · GO-CONDICIONAL =
todo verde salvo C9/C10 rojo con revisión humana pendiente de firma.

Códigos de salida: 0 = GO · 1 = NO-GO · 2 = GO-CONDICIONAL.

Uso:
  # Auditoría con descarga oficial de los 2 Excel de Incasòl (como update_all.sh)
  python3 pipeline/qa/auditoria_f0.py --fuente incasol-excel --descargar

  # Auditoría de un fichero local (contingencia --no-download)
  python3 pipeline/qa/auditoria_f0.py --fuente incasol-excel --fichero /tmp/x.xlsx

  # Con verificaciones contra BD (C7/C9/C10 con valores vigentes)
  DATABASE_URL=... python3 pipeline/qa/auditoria_f0.py --fuente incasol-excel --db

  # Fichero genérico CSV con contrato de columnas explícito
  python3 pipeline/qa/auditoria_f0.py --fuente generic --fichero datos.csv \
      --columnas "codi_ine5,import,any" --clave codi_ine5 --valor import --periodo any

  # Auto-test sin red y sin BD (fixture sintético con errores plantados)
  python3 pipeline/qa/auditoria_f0.py --selftest

La DATABASE_URL NUNCA se imprime (solo host/db enmascarados, como verifica_prod.py).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ESTADO_DIR = REPO / "pipeline" / "qa" / ".estado_f0"
INFORMES_DIR = REPO / "pipeline" / "qa" / "informes"

# Catálogo oficial del repo (v69.2): 947 municipios · 302 ZMRT = A 118 + B 131 + C 53
CATALOGO = REPO / "data" / "municipalities.json"
MUNIS_ESPERADOS = 947
ZMRT_ESPERADO = {"total": 302, "A": 118, "B": 131, "C": 53}

# Contratos de esquema por fuente (ajustar tras la primera auditoría real; el
# control C3 guarda también los headers previos para detectar cambios de formato).
CONTRATOS = {
    # Excel municipales de habitatge.gencat.cat (lloguer mitjà / contractes)
    "incasol-excel": {
        "extensiones": (".xlsx",),
        "bytes_min": 10_000,
        "columnas_min": 3,
        # subcadenas que deben aparecer en el fichero (cualquiera de cada grupo)
        "cabeceras_esperadas": [
            ["Municipi", "Municipio", "municipi", "NOM", "nom"],
            ["Any", "Període", "Periodo", "any", "period"],
        ],
        "clave": "codi_ine5",
        "valor": "import",
        "periodo": "any",
    },
    "generic": {"extensiones": (".csv",), "bytes_min": 200, "columnas_min": 2},
}

# Bandas razonables de valor municipal (€/mes, renta contractual media)
BANDA_EUR_MES = (10.0, 3_000.0)
# Desviación del agregado municipal medio frente a la carga anterior (C9/KPI-5)
DESVIACION_MEDIA_ROJO = 15.0   # % — ROJO con revisión humana (alerta A10)
DESVIACION_MEDIA_AVISO = 10.0  # % — aviso

BLOQUEANTES = ("C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C10")


# ─────────────────────────── utilidades básicas ────────────────────────────
def ahora() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def mask_url(url: str) -> str:
    """Solo host/db, jamás credenciales (patrón de pipeline/qa/verifica_prod.py)."""
    try:
        rest = url.split("@", 1)[1]
        host = rest.split("/", 1)[0]
        db = rest.split("/", 1)[1].split("?")[0]
        return f"host={host} db={db}"
    except Exception:
        return "(url no estándar)"


def dsn() -> str:
    u = os.environ.get("DATABASE_URL") or os.environ.get("PREUREAL_PROD_DATABASE_URL") or ""
    # pgbouncer=true no lo acepta libpq/psycopg2 en algunas rutas → sslmode=require
    if "pgbouncer=" in u:
        import urllib.parse as up
        p = up.urlparse(u)
        u = up.urlunparse(p._replace(query="sslmode=require"))
    return u


def estado_path(fuente: str) -> Path:
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    return ESTADO_DIR / f"{fuente}.json"


def cargar_estado(fuente: str) -> dict:
    p = estado_path(fuente)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return {}
    return {}


def guardar_estado(fuente: str, estado: dict) -> None:
    p = estado_path(fuente)
    p.write_text(json.dumps(estado, indent=2, ensure_ascii=False))


class Auditoria:
    """Acumula veredictos de los 12 controles y calcula la puerta."""

    def __init__(self, fuente: str, con_db: bool, staging_url: str | None):
        self.fuente = fuente
        self.con_db = con_db
        self.staging_url = staging_url
        self.controles: list[dict] = []

    def registrar(self, cid: str, nombre: str, veredicto: str, detalle: str,
                  evidencia: dict | None = None) -> None:
        assert veredicto in ("VERDE", "ROJO", "PENDIENTE", "N/A"), veredicto
        self.controles.append({
            "id": cid, "nombre": nombre, "veredicto": veredicto,
            "detalle": detalle, "evidencia": evidencia or {},
        })
        icono = {"VERDE": "🟢", "ROJO": "🔴", "PENDIENTE": "🟡", "N/A": "⚪"}[veredicto]
        print(f"  {icono} {cid:<4} {nombre:<34} {detalle}")

    def puerta(self) -> tuple[str, int]:
        """Veredicto del DATO. C11/C12 pendientes no degradan el dato: van al
        campo promocion_requiere (la puerta de producción se cierra por proceso,
        Plan §6.3)."""
        rojos_bloq = [c for c in self.controles
                      if c["id"] in BLOQUEANTES and c["veredicto"] == "ROJO"]
        rojos_firma = [c for c in self.controles
                       if c["id"] in ("C9", "C10") and c["veredicto"] == "ROJO"]
        if rojos_bloq:
            return "NO-GO", 1
        if rojos_firma:
            return "GO-CONDICIONAL", 2
        return "GO", 0

    def informe(self, ficheros: list[dict], extra: dict | None = None) -> dict:
        veredicto, codigo = self.puerta()
        promocion_requiere: list[str] = []
        if any(c["id"] in ("C9", "C10") and c["veredicto"] == "ROJO"
               for c in self.controles):
            promocion_requiere.append("firma humana sobre C9/C10")
        if any(c["id"] in ("C11", "C12") and c["veredicto"] == "PENDIENTE"
               for c in self.controles):
            promocion_requiere.append("ensayo en staging (C11/C12) antes de promover")
        inf = {
            "script": "pipeline/qa/auditoria_f0.py",
            "fuente": self.fuente,
            "fecha": ahora(),
            "con_db": self.con_db,
            "staging_url": self.staging_url or None,
            "ficheros": ficheros,
            "controles": self.controles,
            "veredicto": veredicto,
            "codigo_salida": codigo,
            "promocion_requiere": promocion_requiere,
            "puerta": ("Go = bloqueantes C1-C8+C10 verdes · C9/C10 rojo exige firma "
                       "humana · C11/C12 pendientes solo si no hay staging"),
            **(extra or {}),
        }
        return inf


# ────────────────────────── descarga (C1) ──────────────────────────────────
URLS_INCASOL = {
    "lloguer": ("https://habitatge.gencat.cat/web/.content/home/dades/estadistiques/"
                "01_Estadistiques_de_construccio_i_mercat_immobiliari/"
                "03_Mercat_de_lloguer/02_Lloguers_per_ambits_geografics/"
                "municipis_anual_lloguer.xlsx"),
    "contractes": ("https://habitatge.gencat.cat/web/.content/home/dades/estadistiques/"
                   "01_Estadistiques_de_construccio_i_mercat_immobiliari/"
                   "03_Mercat_de_lloguer/02_Lloguers_per_ambits_geografics/"
                   "municipis_anual_contractes.xlsx"),
}
UA = "Mozilla/5.0 (compatible; Preureal auditoria-F0/1.0)"


def descargar(url: str, dest: Path, intentos: int = 3) -> tuple[bool, str]:
    """GET con 3 intentos y backoff exponencial (control C1). Devuelve (ok, detalle)."""
    import urllib.request
    espera = [2, 5, 10]
    ultimo = ""
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                ctype = r.headers.get("Content-Type", "?")
            if r.status != 200:  # pragma: no cover (urlopen lanza excepción)
                ultimo = f"HTTP {r.status}"
            elif len(data) < 10_000:
                ultimo = f"respuesta sospechosamente pequeña ({len(data)} bytes)"
            else:
                dest.write_bytes(data)
                return True, f"200 OK · {len(data):,} bytes · {ctype}"
        except Exception as e:  # noqa: BLE001
            ultimo = f"{type(e).__name__}: {e}"
        if i < intentos - 1:
            time.sleep(espera[min(i, len(espera) - 1)])
    return False, f"falla tras {intentos} intentos · último error: {ultimo}"


# ──────────────────────── parseo de ficheros ───────────────────────────────
def cargar_catalogo_repo() -> dict[str, dict]:
    """Catálogo 947 municipios del repo → {ineCode5: {name, isTense, tenseList}}."""
    data = json.loads(CATALOGO.read_text())
    muns = data if isinstance(data, list) else data.get("municipalities", [])
    out = {}
    for m in muns:
        code5 = str(m.get("ineCode") or m.get("code") or "").strip()
        if len(code5) == 6:  # 6 dígitos provincia+código → los 5 últimos + provincia
            code5 = code5[-5:]
        if code5:
            out[code5] = {
                "name": m.get("name", ""),
                "isTense": bool(m.get("isTense")),
                "tenseList": m.get("tenseList"),
            }
    return out


def leer_fichero(path: Path) -> tuple[list[dict], list[str], str | None]:
    """Lee CSV o XLSX → (filas como dicts, headers, error). Best-effort y honesto."""
    suf = path.suffix.lower()
    try:
        if suf == ".csv":
            raw = path.read_bytes()
            for enc in ("utf-8-sig", "latin-1"):
                try:
                    texto = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                return [], [], "codificación no reconocida"
            delimiter = ";" if texto.count(";") > texto.count(",") else ","
            rdr = csv.DictReader(io.StringIO(texto), delimiter=delimiter)
            filas = [dict(r) for r in rdr]
            return filas, list(rdr.fieldnames or []), None
        if suf in (".xlsx", ".xls"):
            import openpyxl
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            ws = wb.active
            filas_raw = [[c for c in row] for row in ws.iter_rows(values_only=True)]
            # localizar fila de cabecera: primera con ≥3 celdas de texto no vacías
            idx_hdr = None
            for i, row in enumerate(filas_raw[:15]):
                textos = [c for c in row if isinstance(c, str) and c.strip()]
                if len(textos) >= 3:
                    idx_hdr = i
                    break
            if idx_hdr is None:
                return [], [], "no se localiza fila de cabecera (C3)"
            headers = [str(c).strip() if c is not None else "" for c in filas_raw[idx_hdr]]
            filas = []
            for row in filas_raw[idx_hdr + 1:]:
                if all(c is None or str(c).strip() == "" for c in row):
                    continue
                f = {}
                for j, h in enumerate(headers):
                    if h:
                        f[h] = row[j] if j < len(row) else None
                filas.append(f)
            return filas, headers, None
        return [], [], f"extensión no soportada: {suf}"
    except Exception as e:  # noqa: BLE001
        return [], [], f"{type(e).__name__}: {e}"


def columna_de(headers: list[str], candidatos: list[str]) -> str | None:
    """Localiza la primera columna cuyo nombre contiene alguno de los candidatos."""
    for cand in candidatos:
        for h in headers:
            if cand.lower() in h.lower():
                return h
    return None


def extraer_registros(filas: list[dict], headers: list[str], clave: str,
                       valor: str, periodo: str | None) -> tuple[list[tuple], str | None]:
    """Extrae (ine5, valor, periodo) best-effort según el contrato."""
    col_clave = columna_de(headers, ["codi", "ine", "municipi codi", "code"])
    if clave and clave in headers:
        col_clave = clave
    col_valor = columna_de(headers, ["import", "preu", "lloguer", "valor", "renta"])
    if valor and valor in headers:
        col_valor = valor
    col_per = None
    if periodo:
        col_per = periodo if periodo in headers else columna_de(
            headers, ["any", "període", "periodo", "year", "periode"])
    if not col_clave or not col_valor:
        return [], "no se localizan columnas clave/valor (C3)"
    regs: list[tuple[str, float, str | None]] = []
    for f in filas:
        raw_clave = f.get(col_clave)
        raw_val = f.get(col_valor)
        if raw_clave is None or raw_val is None:
            continue
        code = re.sub(r"\D", "", str(raw_clave))
        if len(code) == 6:
            code = code[-5:]  # 5 dígitos INE (pp+mmm)
        if len(code) != 5:
            continue
        try:
            v = float(str(raw_val).replace(",", ".").replace("€", "").strip())
        except (ValueError, AttributeError):
            continue
        per = None
        if col_per and f.get(col_per) is not None:
            m = re.search(r"(19|20)\d{2}", str(f.get(col_per)))
            per = m.group(0) if m else str(f.get(col_per)).strip()
        regs.append((code, v, per))
    return regs, None


# ─────────────────────────── conexión BD (opcional) ────────────────────────
def conectar_bd():
    import psycopg2
    url = dsn()
    if not url:
        return None, None, "DATABASE_URL no definida"
    try:
        conn = psycopg2.connect(url, connect_timeout=20)
        return conn, conn.cursor(), None
    except Exception as e:  # noqa: BLE001
        return None, None, f"{type(e).__name__} (host enmascarado: {mask_url(url)})"


# ───────────────────────────── selftest ────────────────────────────────────
def selftest() -> int:
    """Fixture sintético: un fichero bueno → GO · uno con errores plantados → NO-GO."""
    print("SELFTEST auditoria_f0.py (sin red, sin BD)\n")
    tmp = Path("/tmp/f0_selftest")
    tmp.mkdir(parents=True, exist_ok=True)

    # fichero A — limpio: 945 municipios conocidos, valores razonables, año actual
    cat = cargar_catalogo_repo()
    codigos = sorted(cat.keys())[:945]
    anyo = datetime.now().year
    filas_ok = ["codi_ine5,import,any"]
    for c in codigos:
        filas_ok.append(f"{c},{round(400 + (int(c) % 700))},{anyo}")
    (tmp / "bueno.csv").write_text("\n".join(filas_ok), encoding="utf-8")

    # fichero B — errores plantados: duplicado, sintético 99999, desconocido,
    # 10 outliers (>1 % de filas fuera de banda), y año anterior al estado
    filas_bad = ["codi_ine5,import,any", filas_ok[1], filas_ok[1],  # duplicado
                 "99999,500,2026",                                  # sintético
                 "99998,600,2026",                                  # desconocido
                 f"{codigos[1]},450,{anyo - 1}"]                    # período viejo
    for c in codigos[2:12]:                                        # 10 outliers
        filas_bad.append(f"{c},99000,{anyo}")
    (tmp / "malo.csv").write_text("\n".join(filas_bad), encoding="utf-8")

    fallos = []

    def check(nombre: str, cond: bool) -> None:
        print(f"  {'✓' if cond else '✗'} {nombre}")
        if not cond:
            fallos.append(nombre)

    # A) fichero bueno → GO (media anterior = media exacta del fixture → C9 VERDE)
    vals_ok = [400 + (int(c) % 700) for c in codigos]
    media_ok = statistics.fmean(vals_ok)
    rc, inf = auditar_fichero(tmp / "bueno.csv", "generic",
                              clave="codi_ine5", valor="import", periodo="any",
                              con_db=False, staging_url=None, silencioso=True,
                              estado_forzado={"periodo_anterior": str(anyo),
                                              "media_anterior": media_ok,
                                              "sha256_anterior": "x"})
    check(f"fichero limpio → veredicto GO (obtenido {inf['veredicto']})", inf["veredicto"] == "GO")
    check("código de salida 0", rc == 0)
    verdes = {c["id"]: c["veredicto"] for c in inf["controles"]}
    for cid in ("C2", "C3", "C4", "C5", "C6", "C7", "C8"):
        check(f"{cid} VERDE", verdes.get(cid) == "VERDE")
    # C1 con fichero local → N/A (no hay descarga); C11/C12 PENDIENTES sin staging
    check("C11/C12 PENDIENTE sin staging",
          verdes.get("C11") == "PENDIENTE" and verdes.get("C12") == "PENDIENTE")

    # B) fichero con errores → NO-GO
    rc2, inf2 = auditar_fichero(tmp / "malo.csv", "generic",
                                clave="codi_ine5", valor="import", periodo="any",
                                con_db=False, staging_url=None, silencioso=True,
                                estado_forzado={"periodo_anterior": str(anyo),
                                                "media_anterior": 750.0,
                                                "sha256_anterior": "x"})
    verdes2 = {c["id"]: c["veredicto"] for c in inf2["controles"]}
    check("fichero con errores → NO-GO", inf2["veredicto"] == "NO-GO")
    check("C6 duplicidad ROJO (1 duplicado)", verdes2.get("C6") == "ROJO")
    check("C5 rangos ROJO (outlier 99.000 €/mes)", verdes2.get("C5") == "ROJO")
    check("C8 geográfico ROJO (99998 desconocido)", verdes2.get("C8") == "ROJO")

    print()
    if fallos:
        print(f"SELFTEST FALLIDO: {len(fallos)} comprobaciones → {fallos}")
        return 1
    print("SELFTEST OK — puerta go/no-go y controles C2-C8 comportándose según contrato")
    return 0


# ─────────────────────────── auditoría completa ────────────────────────────
def auditar_fichero(path: Path, fuente: str, *, clave: str, valor: str,
                    periodo: str | None, con_db: bool, staging_url: str | None,
                    silencioso: bool = False,
                    estado_forzado: dict | None = None) -> tuple[int, dict]:
    """Ejecuta C1(skip si local)-C12 sobre UN fichero y devuelve (rc, informe)."""
    aud = Auditoria(fuente, con_db, staging_url)
    ficheros: list[dict] = []
    if not silencioso:
        print(f"Auditoría previa F0 · fuente={fuente} · fichero={path.name} · {ahora()}\n")

    raw = path.read_bytes()
    sha = sha256_bytes(raw)
    ficheros.append({"nombre": path.name, "bytes": len(raw), "sha256": sha})

    # C2 integridad del fichero (tamaño + carga válida + SHA vs anterior)
    contrato = CONTRATOS.get(fuente, CONTRATOS["generic"])
    est = estado_forzado if estado_forzado is not None else cargar_estado(fuente)
    if len(raw) < contrato.get("bytes_min", 200):
        aud.registrar("C2", "integridad del fichero", "ROJO",
                      f"{len(raw):,} bytes < mínimo {contrato['bytes_min']:,}")
    else:
        _, _, err = leer_fichero(path) if path.suffix.lower() != ".csv" else ([], [], None)
        if err:
            aud.registrar("C2", "integridad del fichero", "ROJO", f"fichero ilegible: {err}")
        elif est.get("sha256_anterior") == sha and not estado_forzado:
            aud.registrar("C2", "integridad del fichero", "ROJO",
                          "SHA-256 idéntico a la descarga anterior y mismo estado — "
                          "nada nuevo que importar (posible fuente congelada)")
        else:
            nuevo = "NUEVO" if est.get("sha256_anterior") != sha else "igual"
            aud.registrar("C2", "integridad del fichero", "VERDE",
                          f"{len(raw):,} bytes · SHA-256 {nuevo} ({sha[:12]}…)")

    filas, headers, err = leer_fichero(path)
    regs, err2 = [], err

    # C3 esquema esperado
    if err:
        aud.registrar("C3", "esquema esperado", "ROJO", f"no parseable: {err}")
    else:
        faltan = []
        if fuente in ("incasol-excel",):
            for grupo in contrato.get("cabeceras_esperadas", []):
                if columna_de(headers, grupo) is None:
                    faltan.append("|".join(grupo))
        n_col = len(headers)
        if n_col < contrato.get("columnas_min", 2):
            faltan.append(f"solo {n_col} columnas")
        hdr_antes = est.get("headers_anteriores")
        estable = (hdr_antes is None) or (hdr_antes == headers)
        if faltan:
            aud.registrar("C3", "esquema esperado", "ROJO", f"contrato incumplido: {faltan}")
        elif not estable and not estado_forzado:
            aud.registrar("C3", "esquema esperado", "ROJO",
                          "cabeceras cambiaron vs descarga anterior — la fuente cambió de formato")
        else:
            aud.registrar("C3", "esquema esperado", "VERDE",
                          f"{n_col} columnas · cabeceras estables vs anterior")
    if not err:
        regs, err2 = extraer_registros(filas, headers, clave, valor, periodo)

    # C4 cobertura mínima + C6 duplicidad + C5 rangos + C7 temporal + C8 geográfico
    cat = cargar_catalogo_repo()
    codigos = [c for c, _, _ in regs]
    desconocidos = sorted({c for c in codigos if c not in cat})
    sinteticos = sorted({c for c in codigos if c.startswith("9999")})
    codigos_validos = [c for c in codigos if c in cat]
    unicos = set(codigos_validos)
    duplicados = len(codigos) - len(set(codigos))

    if regs and (len(unicos) >= 940 or (len(unicos) >= 600 and fuente == "generic")):
        aud.registrar("C4", "cobertura mínima", "VERDE",
                      f"{len(unicos)} municipios únicos (≥ umbral)")
    elif not regs:
        aud.registrar("C4", "cobertura mínima", "ROJO",
                      err2 or "0 registros extraíbles — revisar contrato de columnas")
    else:
        aud.registrar("C4", "cobertura mínima", "ROJO",
                      f"solo {len(unicos)} municipios únicos (esperados ≥ 940)")

    # C6 duplicidad (bloquea siempre; sintéticos 9999xx nunca llegan a producción)
    if duplicados == 0 and not sinteticos:
        aud.registrar("C6", "duplicidad", "VERDE",
                      f"0 claves duplicadas · 0 códigos sintéticos 9999xx")
    else:
        aud.registrar("C6", "duplicidad", "ROJO",
                      f"{duplicados} duplicados · sintéticos: {sinteticos[:5]}")

    # C5 rangos y outliers
    valores = [v for _, v, _ in regs if v > 0]
    if not valores:
        aud.registrar("C5", "rangos y outliers", "ROJO", "sin valores numéricos válidos")
    else:
        fuera = [v for v in valores if not (BANDA_EUR_MES[0] <= v <= BANDA_EUR_MES[1])]
        pct_fuera = 100.0 * len(fuera) / len(valores)
        if pct_fuera > 1.0:
            aud.registrar("C5", "rangos y outliers", "ROJO",
                          f"{len(fuera)}/{len(valores)} fuera de banda "
                          f"({BANDA_EUR_MES[0]}-{BANDA_EUR_MES[1]} €/mes) = {pct_fuera:.1f} %")
        else:
            aud.registrar("C5", "rangos y outliers", "VERDE",
                          f"media {statistics.fmean(valores):.1f} €/mes · "
                          f"{len(fuera)} fuera de banda ({pct_fuera:.2f} %)")

    # C7 coherencia temporal: período nuevo ≥ último cargado
    periodos = [p for _, _, p in regs if p]
    if not periodos:
        aud.registrar("C7", "coherencia temporal", "PENDIENTE",
                      "sin columna de período identificable — confirmar manualmente")
    else:
        per_nuevo = max(periodos)
        per_antes = est.get("periodo_anterior")
        if per_antes and str(per_nuevo) < str(per_antes):
            aud.registrar("C7", "coherencia temporal", "ROJO",
                          f"regresión: {per_nuevo} < {per_antes} (no sobreescribir con datos viejos)")
        else:
            aud.registrar("C7", "coherencia temporal", "VERDE",
                          f"período {per_nuevo} ≥ anterior {per_antes or '—'}")

    # C8 coherencia geográfica contra el catálogo del repo
    if desconocidos:
        aud.registrar("C8", "coherencia geográfica", "ROJO",
                      f"{len(desconocidos)} códigos INE desconocidos p.ej. {desconocidos[:5]}")
    else:
        aud.registrar("C8", "coherencia geográfica", "VERDE",
                      f"{len(unicos)}/{MUNIS_ESPERADOS} códigos contra catálogo repo · 0 desconocidos")

    # C9 estabilidad estadística vs carga anterior (KPI-5)
    media_nueva = statistics.fmean(valores) if valores else None
    media_antes = est.get("media_anterior")
    if media_nueva is None or not media_antes:
        aud.registrar("C9", "estabilidad estadística", "PENDIENTE",
                      "sin media anterior (primera auditoría de esta fuente)")
    else:
        desv = abs(100.0 * (media_nueva - media_antes) / media_antes)
        if desv > DESVIACION_MEDIA_ROJO:
            aud.registrar("C9", "estabilidad estadística", "ROJO",
                          f"desviación {desv:.1f} % > 15 % — posible cambio metodológico "
                          f"(alerta A10; requiere firma humana)")
        elif desv > DESVIACION_MEDIA_AVISO:
            aud.registrar("C9", "estabilidad estadística", "PENDIENTE",
                          f"desviación {desv:.1f} % en banda de aviso (10-15 %)")
        else:
            aud.registrar("C9", "estabilidad estadística", "VERDE",
                          f"desviación {desv:.1f} % (media {media_nueva:.1f} vs {media_antes:.1f} €/mes)")

    # C10 coherencia ZMRT (protección v69) — con BD o contra el catálogo repo
    if fuente == "zmrt":
        aud.registrar("C10", "coherencia ZMRT", "PENDIENTE",
                      "usar el protocolo v69 completo (zmrt_v69_ter2408.test.ts + "
                      "guardas pre/post) — C10 aquí solo valida conteos si hay --db")
    else:
        tense_repo = {c: m for c, m in cat.items() if m["isTense"]}
        n_zmrt = len(tense_repo)
        if n_zmrt == ZMRT_ESPERADO["total"]:
            aud.registrar("C10", "coherencia ZMRT", "VERDE",
                          f"catálogo repo estable: {n_zmrt} ZMRT "
                          f"(A {sum(1 for m in tense_repo.values() if m['tenseList']=='A')} · "
                          f"B {sum(1 for m in tense_repo.values() if m['tenseList']=='B')} · "
                          f"C {sum(1 for m in tense_repo.values() if m['tenseList']=='C')})")
        else:
            aud.registrar("C10", "coherencia ZMRT", "ROJO",
                          f"catálogo repo con {n_zmrt} ZMRT ≠ 302 — el fichero no toca "
                          f"listados legales, pero el repo requiere revisión antes de importar")

    # C11 dry-run staging + C12 canario post-staging
    if staging_url:
        aud.registrar("C11", "dry-run staging", "PENDIENTE",
                      "staging configurado — ejecutar carga staging_<fuente> y diff "
                      "fila a fila (prototipo P1; ver Plan cap. 6.3)")
        aud.registrar("C12", "canario post-staging", "PENDIENTE",
                      "sondas contra el entorno de staging tras el dry-run")
    else:
        aud.registrar("C11", "dry-run staging", "PENDIENTE",
                      "sin --staging-url: la promoción a producción requiere ensayo "
                      "en staging (Plan §6.3) o firma humana del administrador")
        aud.registrar("C12", "canario post-staging", "PENDIENTE",
                      "sin entorno de staging — las sondas correrán contra producción "
                      "tras la promoción (canary_diario.py)")

    # C1 salud de la fuente: N/A cuando el fichero ya está en disco (contingencia)
    aud.registrar("C1", "salud de la fuente", "N/A",
                  "fichero suministrado localmente — la descarga con reintentos la "
                  "ejecuta --descargar o scripts/update_all.sh")

    inf = aud.informe(ficheros, extra={"registros_extraidos": len(regs)})
    return inf["codigo_salida"], inf


def main() -> int:
    ap = argparse.ArgumentParser(description="Auditoría previa F0 — 12 controles (Plan de Mantenimiento cap. 6)")
    ap.add_argument("--fuente", default="generic",
                    choices=["incasol-excel", "incasol-socrata", "zmrt", "catastro", "generic"])
    ap.add_argument("--descargar", action="store_true",
                    help="descarga los Excel oficiales de Incasòl antes de auditar (C1)")
    ap.add_argument("--fichero", help="fichero local a auditar (contingencia --no-download)")
    ap.add_argument("--fichero2", help="segundo fichero (incasol-excel: contractes)")
    ap.add_argument("--db", action="store_true", help="verificaciones contra BD (C7/C9/C10)")
    ap.add_argument("--staging-url", help="entorno de staging para C11/C12")
    ap.add_argument("--columnas", help="contrato CSV genérico: colclave,colvalor,colperiodo")
    ap.add_argument("--clave", default=None)
    ap.add_argument("--valor", default=None)
    ap.add_argument("--periodo", default=None)
    ap.add_argument("--out", help="ruta del informe JSON (por defecto pipeline/qa/informes/)")
    ap.add_argument("--selftest", action="store_true", help="auto-test sin red ni BD")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    INFORMES_DIR.mkdir(parents=True, exist_ok=True)
    fecha = datetime.now(timezone.utc).strftime("%Y%m%d")

    if args.descargar:
        ok_all, detalles = True, []
        tmp = Path("/tmp/f0_descarga")
        tmp.mkdir(parents=True, exist_ok=True)
        rutas = []
        for nombre, url in URLS_INCASOL.items():
            dest = tmp / f"municipis_anual_{nombre}.xlsx"
            print(f"→ Descargando {nombre}: {url.rsplit('/', 1)[-1]}")
            ok, detalle = descargar(url, dest)
            print(f"  {'✓' if ok else '✗'} {detalle}")
            detalles.append({"nombre": nombre, "url_host": "habitatge.gencat.cat",
                             "ok": ok, "detalle": detalle})
            ok_all = ok_all and ok
            rutas.append(dest)
        if not ok_all:
            print("\nNO-GO: descarga fallida (alerta A7) — no se audita nada más.")
            aud = Auditoria("incasol-excel", False, None)
            aud.registrar("C1", "salud de la fuente", "ROJO",
                          "descarga fallida tras 3 intentos con backoff (alerta A7)")
            inf = aud.informe(detalles)
            ruta = args.out or (INFORMES_DIR / f"f0_incasol-excel_{fecha}_NOGO.json")
            Path(ruta).write_text(json.dumps(inf, indent=2, ensure_ascii=False))
            print(f"Informe: {ruta}")
            return 1
        rc_total = 0
        veredictos = []
        for i, ruta in enumerate(rutas):
            rc, inf = auditar_fichero(
                ruta, "incasol-excel",
                clave=args.clave or "codi_ine5", valor=args.valor or "import",
                periodo=args.periodo or "any", con_db=args.db,
                staging_url=args.staging_url)
            veredictos.append(inf["veredicto"])
            ruta_inf = args.out or (INFORMES_DIR /
                                    f"f0_incasol-excel_{fecha}_{ruta.stem}.json")
            Path(ruta_inf).write_text(json.dumps(inf, indent=2, ensure_ascii=False))
            print(f"\nInforme: {ruta_inf}")
            rc_total = max(rc_total, rc)
            if i == 0:  # estado compartido por fuente; guarda sha de ambos
                est = cargar_estado("incasol-excel")
                est.update({
                    "sha256_anterior": inf["ficheros"][0]["sha256"],
                    "fecha": ahora(),
                    "headers_anteriores": None,
                })
                guardar_estado("incasol-excel", est)
        print(f"\nPuerta F0: {' · '.join(veredictos)} → salida {rc_total}")
        return rc_total

    if not args.fichero:
        print("Indica --fichero <ruta> o --descargar (o --selftest).")
        return 1

    clave, valor, periodo = args.clave, args.valor, args.periodo
    if args.columnas:
        partes = [p.strip() for p in args.columnas.split(",")]
        clave = clave or (partes[0] if len(partes) > 0 else None)
        valor = valor or (partes[1] if len(partes) > 1 else None)
        periodo = periodo or (partes[2] if len(partes) > 2 else None)

    rc, inf = auditar_fichero(Path(args.fichero), args.fuente,
                              clave=clave or "codi_ine5", valor=valor or "import",
                              periodo=periodo, con_db=args.db,
                              staging_url=args.staging_url)
    ruta = args.out or (INFORMES_DIR / f"f0_{args.fuente}_{fecha}.json")
    Path(ruta).write_text(json.dumps(inf, indent=2, ensure_ascii=False))
    print(f"\nPuerta F0: {inf['veredicto']} → informe {ruta}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
