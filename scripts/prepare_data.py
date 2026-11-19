#!/usr/bin/env python3
"""Preureal — Preparació de dades reals obertes.

Fonts (totes oficials):
- Municipis: dataset "Municipis Catalunya Geo" (analisi.transparenciacatalunya.cat, 9aju-tpwc),
  font Idescat/ICGC.
- Lloguer mitjà mensual i contractes (fiances Incasòl): Excels oficials de
  habitatge.gencat.cat "Lloguers per àmbits geogràfics".
- Àrees de mercat residencial tensat vigents: Resolucions TER/3739/2026 (pròrroga)
  i TER/3740/2026 (municipis nous), DOGC 19-10-2026 (llistes TENSE_A i TENSE_C
  més avall). Històric: TER/800/2024 i TER/2408/2024.

Sortida: data/municipalities.json (llista de municipis amb històric de lloguer).
"""
import json
import os
import re
import urllib.request
from collections import OrderedDict

import openpyxl

BASE = "/tmp"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(OUT, exist_ok=True)

# --- 1. Municipis (Socrata 9aju-tpwc) -------------------------------------
municipis = []
off = 0
while True:
    url = f"https://analisi.transparenciacatalunya.cat/resource/9aju-tpwc.json?$limit=1000&$offset={off}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    batch = json.load(urllib.request.urlopen(req, timeout=60))
    if not batch:
        break
    municipis.extend(batch)
    off += 1000
print("municipis descarregats:", len(municipis))
# el dataset inclou files artificials ("999998 No consta", "999999 Altres/Diversos")
# amb lat/lng 0,0 — es filtren per no contaminar el cercador
municipis = [m for m in municipis if not m["codi"].startswith("9999")]
print("municipis reals (sense filtres artificials):", len(municipis))

PROVINCE_BY_CODE = {
    "08": "Barcelona", "17": "Girona", "25": "Lleida", "43": "Tarragona",
}

# --- 2. Lloguer mitjà (Excel Incasòl / Gencat) ----------------------------
def load_lloguer(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    header = None
    for i, r in enumerate(rows[:10]):
        if r and r[0] == "Codi":
            header = i
            break
    assert header is not None, f"no header a {path}"
    years = [c for c in rows[header][2:] if c is not None]
    out = {}
    for r in rows[header + 1:]:
        if not r or not r[0]:
            continue
        code = str(r[0]).strip().zfill(5)
        vals = {}
        for j, y in enumerate(years):
            v = r[2 + j]
            if isinstance(v, (int, float)) and v and v > 0:
                vals[str(int(y))] = round(float(v), 1)
        out[code] = vals
    return out

def load_contractes(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    out = {}
    header = None
    for i, r in enumerate(rows[:10]):
        if r and r[0] == "Codi":
            header = i
            break
    if header is not None:
        years = [c for c in rows[header][2:] if c is not None]
        for r in rows[header + 1:]:
            if not r or not r[0]:
                continue
            code = str(r[0]).strip().zfill(5)
            vals = {}
            for j, y in enumerate(years):
                v = r[2 + j]
                if isinstance(v, (int, float)) and v:
                    vals[str(int(y))] = int(v)
            out[code] = vals
        return out
    raise SystemExit("format inesperat a " + path)

lloguer = load_lloguer(os.path.join(BASE, "municipis_anual_lloguer.xlsx"))
contractes = load_contractes(os.path.join(BASE, "municipis_anual_contractes.xlsx"))
print("lloguer municipis:", len(lloguer), "| contractes municipis:", len(contractes))

# --- 3. Municipis tensats (estat legal VIGENT, verificat 19-11-2026) ------
# Cadena legal completa (habitatge.gencat.cat + revisió 2026):
#  · Resolució TER/800/2024 (1a tanda): 140 municipis — prorrogada per
#    TER/3739/2026 en 118 (22 fora per criteris de la revisió).
#  · Resolució TER/2408/2024, d'1 de juliol (DOGC núm. 9196, 3-7-2024;
#    vigència efectiva 10-10-2024): 2a tanda de 131 municipis — CONTINUA
#    VIGENT sense canvis a la revisió 2026 (l'apunt anterior que deia que
#    «van caducar» era un error d'anàlisi; corregit a v69).
#  · Resolució TER/3740/2026 (DOGC 19-10-2026): 53 municipis nous.
# Total vigent: 118 + 131 + 53 = 302 municipis.
TENSE_B = """Aiguafreda|Albinyana|Alcanar|Alcarràs|Alcover|Aldea, l'|Almacelles|Alpicat|Altafulla
Ametlla de Mar, l'|Ametlla del Vallès, l'|Ampolla, l'|Anglès|Arboç, l'|Arbúcies|Artés
Artesa de Segre|Bagà|Begues|Begur|Bellpuig|Bellver de Cerdanya|Besalú|Bigues i Riells del Fai
Bisbal del Penedès, la|Borges Blanques, les|Breda|Cadaqués|Calaf|Calafell|Caldes de Malavella
Calonge i Sant Antoni|Canyelles|Cassà de la Selva|Castellet i la Gornal|Castellgalí
Castelló d'Empúries|Castell d'Aro, Platja d'Aro i s'Agaró|Castellterçol|Celrà|Centelles
Creixell|Cunit|Deltebre|Dosrius|Escala, l'|Esquirol, l'|Folgueroles|Fornells de la Selva
Gelida|Gironella|Hostalric|Linyola|Llançà|Lliçà d'Amunt|Lliçà de Vall|Maçanet de la Selva
Masquefa|Moià|Monistrol de Montserrat|Montblanc|Montbrió del Camp|Mont-roig del Camp
Móra d'Ebre|Morell, el|Navàs|Òdena|Olèrdola|Olesa de Bonesvalls|Olivella|Pallejà
Palma de Cervelló, la|Pals|Peralada|Piera|Pobla de Montornès, la|Pont de Suert, el|Ponts
Prats de Lluçanès|Puig-reig|Ràpita, la|Riells i Viabrea|Riudarenes|Riudoms|Roda de Berà
Roda de Ter|Roses|Sant Antoni de Vilamajor|Sant Cebrià de Vallalta|Sant Esteve de Palautordera
Sant Feliu de Codines|Sant Hipòlit de Voltregà|Sant Jaume dels Domenys|Sant Jaume d'Enveja
Sant Joan de Vilatorrada|Sant Julià de Ramis|Sant Llorenç d'Hortons|Sant Llorenç Savall
Sant Martí Sarroca|Sant Pere de Riudebitlles|Sant Pere de Torelló|Sant Pere de Vilamajor
Sant Pere Pescador|Sant Quirze de Besora|Santa Bàrbara|Santa Coloma de Queralt
Santa Cristina d'Aro|Santa Eulàlia de Ronçana|Santa Maria de Palautordera|Santa Oliva
Santpedor|Selva del Camp, la|Sénia, la|Sentmenat|Seva|Sils|Súria|Taradell|Torrelles de Foix
Torroella de Montgrí|Tossa de Mar|Ulldecona|Vacarisses|Vallgorguina|Vidreres|Vielha e Mijaran
Viladecavalls|Vilafant|Vilanova del Vallès|Vilobí d'Onyar|Vinyols i els Arcs"""
TENSE_B = [n.strip() for n in TENSE_B.replace("\n", "|").split("|") if n.strip()]
TENSE_A = """Abrera|Alella|Amposta|Arenys de Mar|Arenys de Munt|Argentona|Badalona|Badia del Vallès|Balaguer
Barberà del Vallès|Barcelona|Bisbal d'Empordà, la|Blanes|Cabrils|Caldes de Montbui|Calella|Cambrils
Canet de Mar|Canonja, la|Cardedeu|Castellar del Vallès|Castellbisbal|Castelldefels|Cerdanyola del Vallès
Corbera de Llobregat|Cornellà de Llobregat|Cubelles|Esparreguera|Esplugues de Llobregat|Falset|Garriga, la
Gavà|Girona|Hospitalet de Llobregat, l'|Igualada|Llagosta, la|Llinars del Vallès|Lloret de Mar
Malgrat de Mar|Manlleu|Manresa|Masnou, el|Matadepera|Mataró|Molins de Rei|Mollerussa|Montcada i Reixac
Montgat|Montornès del Vallès|Móra la Nova|Olesa de Montserrat|Olot|Palafolls|Palafrugell|Palamós
Palau-solità i Plegamans|Pineda de Mar|Polinyà|Porqueres|Prat de Llobregat, el|Premià de Dalt
Premià de Mar|Puigcerdà|Ripoll|Ripollet|Roca del Vallès, la|Roquetes|Rubí|Sabadell|Salou|Salt
Sant Adrià de Besòs|Sant Andreu de Llavaneres|Sant Boi de Llobregat|Sant Celoni|Sant Cugat del Vallès
Sant Esteve Sesrovires|Sant Feliu de Guíxols|Sant Feliu de Llobregat|Sant Fost de Campsentelles
Sant Joan Despí|Sant Just Desvern|Sant Pere de Ribes|Sant Pol de Mar|Sant Quirze del Vallès
Sant Sadurní d'Anoia|Sant Vicenç de Montalt|Sant Vicenç dels Horts|Santa Coloma de Cervelló
Santa Coloma de Farners|Santa Coloma de Gramenet|Santa Perpètua de Mogoda|Santa Susanna|Sarrià de Ter
Seu d'Urgell, la|Sitges|Solsona|Sort|Tarragona|Tàrrega|Teià|Terrassa|Tiana|Tona|Torelló
Torredembarra|Torrelles de Llobregat|Tremp|Vallirana|Valls|Vendrell, el|Vic|Viladecans
Vilafranca del Penedès|Vilanova del Camí|Vilanova i la Geltrú|Vilassar de Dalt|Vilassar de Mar"""

TENSE_C = """Agramunt|Bàscara|Bellvei|Callús|Camarles|Campdevànol|Capellades|Cardona|Castellbell i el Vilar
Constantí|Crespià|Espluga de Francolí, l'|Figaró-Montmany|Hostalets de Pierola, els|Jonquera, la
Llagostera|Madremanya|Martorell|Masllorenç|Montferrer i Castellbò|Montmell, el|Navarcles|Osor
Palau-sator|Pla de Santa Maria, el|Pobla de Mafumet, la|Pobla de Segur, la|Port de la Selva, el
Prats i Sansor|Preses, les|Ribera d'Urgellet|Rosselló|Sallent|Salomó|Sant Andreu de la Barca
Sant Feliu de Pallerols|Sant Gregori|Sant Hilari Sacalm|Sant Iscle de Vallalta|Sant Joan de les Abadesses
Sant Joan les Fonts|Sant Martí de Centelles|Sant Vicenç de Castellet|Santa Eugènia de Berga
Santa Margarida i els Monjos|Torà|Tordera|Torrefarrera|Ullà|Vallfogona de Balaguer
Vandellòs i l'Hospitalet de l'Infant|Vilalba Sasserra|Vila-seca"""

TENSE_A = [n.strip() for n in TENSE_A.replace("\n", "|").split("|") if n.strip()]
TENSE_C = [n.strip() for n in TENSE_C.replace("\n", "|").split("|") if n.strip()]
print("tensades prorrogades (TER/3739/2026):", len(TENSE_A),
      "| 2a tanda vigent (TER/2408/2024):", len(TENSE_B),
      "| noves (TER/3740/2026):", len(TENSE_C))

def norm(s):
    s = s.lower().replace("'", "'").replace("'", "'").replace("·", "-")
    s = re.sub(r"\s+", " ", s)
    return s.strip()

# TENSE_*_N es defineix després de join_key()

# --- 4. Cruïlla per NOM normalitzat (el codi Socrata és Gencat 6 dígits,
#         l'Excel Incasòl és INE de 5 dígits) ------------------------------
def join_key(s):
    s = norm(s)
    # treu articles finals i punts, unifica apòstrofs
    for suf in [", la", ", l'", ", el", ", l", ", les", ", els", ", sa", ", es"]:
        if s.endswith(suf):
            s = s[: -len(suf)] + " " + suf.strip(", ")
            break
    s = s.replace("-", " ").replace("·", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s

rent_by_name = {}
for code5, hist in lloguer.items():
    pass  # no hi ha nom a l'Excel per codi; fem el join al revés

# l'Excel té la columna Municipi: la carreguem
def load_lloguer_with_names(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    header = next(i for i, r in enumerate(rows[:10]) if r and r[0] == "Codi")
    years = [c for c in rows[header][2:] if c is not None]
    rents, conts = {}, {}
    for r in rows[header + 1:]:
        if not r or not r[0] or not r[1]:
            continue
        nom = str(r[1]).strip()
        vals = {}
        for j, y in enumerate(years):
            v = r[2 + j]
            if isinstance(v, (int, float)) and v and v > 0:
                vals[str(int(y))] = round(float(v), 1)
        if vals:
            rents[join_key(nom)] = {"code": str(r[0]).strip().zfill(5), "hist": vals}
    return rents

TENSE_A_N = {join_key(n): n for n in TENSE_A}
TENSE_B_N = {join_key(n): n for n in TENSE_B}
TENSE_C_N = {join_key(n): n for n in TENSE_C}

rents_by_name = load_lloguer_with_names(os.path.join(BASE, "municipis_anual_lloguer.xlsx"))
conts_by_name = load_contractes_named = None
# contractes també amb noms
def load_contractes_with_names(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    header = next(i for i, r in enumerate(rows[:10]) if r and r[0] == "Codi")
    years = [c for c in rows[header][2:] if c is not None]
    out = {}
    for r in rows[header + 1:]:
        if not r or not r[0] or not r[1]:
            continue
        nom = str(r[1]).strip()
        vals = {}
        for j, y in enumerate(years):
            v = r[2 + j]
            if isinstance(v, (int, float)) and v:
                vals[str(int(y))] = int(v)
        out[join_key(nom)] = vals
    return out

conts_by_name = load_contractes_with_names(os.path.join(BASE, "municipis_anual_contractes.xlsx"))
print("lloguer per nom:", len(rents_by_name), "| contractes per nom:", len(conts_by_name))

# Noms que el dataset Socrata escriu diferent de l'Excel Incasòl i del DOGC.
# Sense això el municipi no es marca com a tensat ni rep lloguer.
NAME_ALIASES = {
    "Palamós i Sant Joan": "Palamós",  # TER/3739/2026 (llista A)
    # v69 — variants històriques defensives per a la 2a tanda (TER/2408/2024)
    "Castell-Platja d'Aro": "Castell d'Aro, Platja d'Aro i s'Agaró",
    "Calonge": "Calonge i Sant Antoni",
}

# Toponimia oficial de sortida (el font concatena entitats; l'INE oficial és "Palamós")
OUTPUT_NAME_FIXES = {"Palamós i Sant Joan": "Palamós"}

result = []
matched_a = matched_b = matched_c = matched_rent = unmatched_rent = 0
for m in municipis:
    code5 = m["codi"].strip()
    nom = m["nom"].strip()
    jk = join_key(NAME_ALIASES.get(nom, nom))
    rent_entry = rents_by_name.get(jk)
    hist = rent_entry["hist"] if rent_entry else {}
    contracts = conts_by_name.get(jk) or {}
    ordered = OrderedDict(sorted(hist.items()))
    rent_latest = None
    rent_period = None
    for y in sorted(ordered, reverse=True):
        if ordered[y]:
            rent_latest = ordered[y]
            rent_period = y
            break
    prev = None
    prev_period = None
    if rent_period:
        ry = int(rent_period)
        for yy in range(ry - 1, ry - 4, -1):
            ys = str(yy)
            if ys in ordered and ordered[ys]:
                prev = ordered[ys]
                prev_period = ys
                break
    contracts_latest = None
    contracts_period = None
    if contracts:
        cy = sorted(contracts, reverse=True)[0]
        contracts_latest = contracts[cy]
        contracts_period = cy

    is_tense = False
    tense_list = None
    if jk in TENSE_A_N:
        is_tense, tense_list = True, "A"
        matched_a += 1
    if jk in TENSE_B_N:  # v69: 2a tanda TER/2408/2024 — vigent, llista B
        is_tense, tense_list = True, "B" if tense_list is None else tense_list + "+B"
        matched_c += 1
    if jk in TENSE_C_N:
        is_tense, tense_list = True, "C" if tense_list is None else tense_list + "+C"
        matched_b += 1
    if rent_latest:
        matched_rent += 1

    result.append({
        "code": code5,  # codi Gencat de 6 dígits (compatible ICGC CODIMUNI)
        "ineCode": rent_entry["code"] if rent_entry else None,  # codi INE de 5 dígits
        "name": OUTPUT_NAME_FIXES.get(nom, nom),
        "comarca": m.get("nom_comarca"),
        "province": PROVINCE_BY_CODE.get(code5[:2]),
        "lat": float(m["latitud"]),
        "lng": float(m["longitud"]),
        "rentLatest": rent_latest,
        "rentPeriod": rent_period,
        "rentPrevYear": prev,
        "rentPrevPeriod": prev_period,
        "rentHistory": dict(ordered) if ordered else None,
        "contractsLatest": contracts_latest,
        "contractsPeriod": contracts_period,
        "isTense": is_tense,
        "tenseList": tense_list,
    })

print(f"cruïlla: {len(result)} municipis | amb lloguer: {matched_rent} | tensats: A={matched_a} B={matched_c} C={matched_b}")
# Control de qualitat: cada municipi de les resolucions ha de cruzar amb el dataset.
if matched_a != len(TENSE_A) or matched_b != len(TENSE_C) or matched_c != len(TENSE_B):
    _found = {join_key(NAME_ALIASES.get(m["nom"].strip(), m["nom"].strip())) for m in municipis}
    _miss = [n for n in TENSE_A + TENSE_B + TENSE_C if join_key(n) not in _found]
    print(f"⚠ Tensats sense cruïlla: A={matched_a}/{len(TENSE_A)} B={matched_c}/{len(TENSE_B)} C={matched_b}/{len(TENSE_C)} → {_miss}")
with open(os.path.join(OUT, "municipalities.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False)
print("desat a data/municipalities.json")
