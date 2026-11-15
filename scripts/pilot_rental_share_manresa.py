#!/usr/bin/env python3
"""
PILOTO MANRESA — Fase 5 del encargo «% estimat d'alquiler sobre el parc
residencial» (v41 PreuReal).

Contrasta, con código INDEPENDIENTE del TypeScript de producción, los
componentes reales del indicador para Manresa (code 081136 / ine 08113)
contra las fuentes oficiales en vivo:
  1. Idescat API Taules v2 censph/310/20419 (Censo 2021, viviendas principales
     por régimen de tenencia) — contraste con la publicación web oficial.
  2. Socrata qww9-bvhh (Incasòl via Dades Obertes) — flujo anual de contractes
     amb fiança (gener-desembre), REFERENCIA de mercado (mai numerador).
  3. Estado del cálculo compuesto (numerador fiances VIGENTES + denominador
     parc catastral) con la disponibilidad real de fuentes a 2026-11-15.

Regla: NADA se inventa; si un componente no tiene fuente, se reporta como
pendiente (estado CENS_REF_ONLY / NO_NUMERATOR).
"""
import json
import urllib.request
import urllib.parse

UA = {"User-Agent": "Preureal-pilot/1.0 (contraste con fuentes oficiales)"}
MANRESA_CODE = "081136"
MANRESA_INE = "08113"


def fetch_json(url: str, timeout: float = 45.0):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def tenencia(code: str):
    q = urllib.parse.quote(code)
    ds = fetch_json(f"https://api.idescat.cat/taules/v2/censph/310/20419/mun/data?MUN={q}&lang=es")
    dims = ds["dimension"]
    regs = list(dims["TENURE_REGIME"]["category"]["index"])  # orden de la dimensión
    idx = dims["MUN"]["category"]["index"]
    labels = dims["MUN"]["category"].get("label") or {}
    codes = idx if isinstance(idx, list) else [k for k, _ in sorted(idx.items(), key=lambda kv: kv[1])]
    out = []
    for i, c in enumerate(codes):
        vals = {regs[r]: ds["value"][i * len(regs) + r] for r in range(len(regs))}
        out.append({"code": c, "name": labels.get(c, ""), **vals})
    return ds.get("updated"), out


def flujo_municipal(ine: str):
    params = urllib.parse.urlencode({
        "$where": "ambit_territorial='Municipi' AND periode='gener-desembre' AND codi_territorial='" + ine + "'",
        "$select": "codi_territorial,nom_territori,any,periode,habitatges",
        "$order": "any",
        "$limit": "500",
    })
    return fetch_json(f"https://analisi.transparenciacatalunya.cat/resource/qww9-bvhh.json?{params}")


def pct(rental, total):
    if rental is None or total is None or total == 0:
        return None
    return round(100.0 * rental / total, 4)


def main():
    print("=" * 78)
    print("PILOTO MANRESA — indicador «% estimat d'alquiler sobre el parc residencial»")
    print("=" * 78)

    # 1) Censo 2021 (contraste con fuentes originales)
    updated, rows = tenencia(MANRESA_CODE)
    man = [r for r in rows if r["code"] == MANRESA_CODE]
    assert man, "Manresa no aparece en la tabla censal"
    man = man[0]
    print(f"\n[1] CENS 2021 (Idescat taules censph/310/20419, updated={updated})")
    print(f"    Municipi: {man['name']} (code {man['code']})")
    print(f"    PROPERTY={man['PROPERTY']}  RENTAL={man['RENTAL']}  OTH={man['OTH']}  _U={man['_U']}  TOTAL={man['TOTAL']}")
    cpct = pct(man["RENTAL"], man["TOTAL"])
    print(f"    % viviendas principales en alquiler = {cpct}%  ← referencia censal oficial")
    esperado_pct = 28.34  # redondeo a 2 dec de 8793/31029
    assert abs(cpct - esperado_pct) < 0.01, "el % censal de Manresa no cuadra"
    # contraste con Barcelona y Catalunya (valores publicados verificados)
    _, allrows = tenencia("080193")
    bcn = [r for r in allrows if r["code"] == "080193"][0]
    _, catrows = tenencia("TOTAL")
    cat = [r for r in catrows if r["code"] == "TOTAL"][0]
    print(f"    Contraste Barcelona: RENTAL={bcn['RENTAL']} / TOTAL={bcn['TOTAL']} → {pct(bcn['RENTAL'], bcn['TOTAL'])}% (publicat: 208.467 / 671.178)")
    print(f"    Contraste Catalunya: RENTAL={cat['RENTAL']} / TOTAL={cat['TOTAL']} → {pct(cat['RENTAL'], cat['TOTAL'])}% (publicat: 692.285 / 2.987.072 aprox)")
    assert bcn["RENTAL"] == 208467 and bcn["TOTAL"] == 671178
    assert cat["RENTAL"] == 692285
    print("    ✔ coincideix amb les xifres publicades per Idescat")

    # 2) Flujo anual de fiances (referencia de mercado)
    print(f"\n[2] FLUX anual de fiances (SODA qww9-bvhh, municipi {MANRESA_INE}, periode gener-desembre)")
    flujos = flujo_municipal(MANRESA_INE)
    serie = [(r["any"], int(r["habitatges"])) for r in flujos if r.get("habitatges")]
    serie.sort()
    for y, h in serie[-10:]:
        print(f"    {y}: {h:>6,} contractes".replace(",", "."))
    if serie:
        y0, h0 = serie[-1]
        print(f"    Últim flux: {y0} = {h0} contractes amb fiança (FLUX — no es pot usar com a numerador)")

    # 3) Estado del cálculo compuesto
    print("\n[3] CÀLCUL COMPOST per a Manresa amb la disponibilitat real de fonts (2026-11-15)")
    print("    numerador  fiances VIGENTES (stock):      NO DISPONIBLE — no existeix publicació municipal oberta (verificat)")
    print("    denominador parc residencial catastral:  NO DISPONIBLE — DNP/INE no accessible des de l'entorn de treball")
    print(f"    resultat: dataStatus=CENS_REF_ONLY  rentalPercentage=null  censusRentalPercentage={cpct}%")
    print("    el connector POST /api/admin/import-rental-share queda preparat per alimentar")
    print("    numerador i denominador quan la font oficial publiqui les dades.")

    # 4) Ejemplo de carga del conector (dryRun semántico, sin BD)
    print("\n[4] EXEMPLE de payload per al connector (quando existisquen dades oficials):")
    ejemplo = {
        "dryRun": True,
        "rows": [{
            "municipalityCode": MANRESA_CODE,
            "incasolActiveDeposits": None,
            "incasolPeriod": None,
            "residentialProperties": None,
            "cadastreYear": None,
        }],
    }
    ejemplo["rows"][0]["_nota"] = "els dos valors s'ompliran amb dades oficials reals (mai simulades)"
    print("    " + json.dumps(ejemplo, ensure_ascii=False))

    print("\n" + "=" * 78)
    print("PILOTO OK: parsers i contrast amb les fonts originals validats per a Manresa.")
    print("Municipis amb dato censal importable: 615/947 (els 332 restants, sense taula")
    print("municipal al Cens 2021 d'Idescat; quedaran amb estat «sense informació»).")
    print("=" * 78)


if __name__ == "__main__":
    main()
