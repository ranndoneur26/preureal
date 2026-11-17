#!/usr/bin/env python3
# Anàlisi de cobertura del GTFS agregat T-mobilitat (ATM/CGIM) vs els 947
# municipis de Preureal. Evidència real per a la matriu de fonts (BLOQUE D).
import csv, json, math, sys
from collections import Counter, defaultdict

GTFS = "/tmp/gtfs"
MUNI = "/home/z/my-project/preureal/src/data/municipalities.json"

def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(d))

# 1) stops amb coordenades
stops = {}
with open(f"{GTFS}/stops.txt", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        try:
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
        except (ValueError, KeyError):
            continue
        stops[r["stop_id"]] = (lat, lon, (r.get("stop_name") or "").strip(),
                               r.get("location_type") or "0", r.get("parent_station") or "")
print("stops amb coordenades:", len(stops), file=sys.stderr)

# 2) route_id -> (types, agency)
routes = {}
with open(f"{GTFS}/routes.txt", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        routes[r["route_id"]] = (r.get("route_type"), r.get("agency_id"), (r.get("route_short_name") or r.get("route_long_name") or "").strip())

# 3) stop_id -> {modes, agencies, línies (mostra)}
stop_modes = defaultdict(set)
stop_agencies = defaultdict(set)
stop_lines = defaultdict(list)
with open(f"{GTFS}/trips.txt", encoding="utf-8-sig") as f:
    trip2route = {}
    for t in csv.DictReader(f):
        trip2route[t["trip_id"]] = t["route_id"]
print("trips:", len(trip2route), file=sys.stderr)
with open(f"{GTFS}/stop_times.txt", encoding="utf-8-sig") as f:
    for st in csv.DictReader(f):
        rid = trip2route.get(st["trip_id"])
        if not rid: continue
        rt = routes.get(rid)
        if not rt: continue
        sid = st["stop_id"]
        stop_modes[sid].add(rt[0])
        stop_agencies[sid].add(rt[1])
        if len(stop_lines[sid]) < 12 and rt[2]:
            ln = rt[2]
            if ln not in stop_lines[sid]:
                stop_lines[sid].append(ln)
print("stops amb servei:", len(stop_modes), file=sys.stderr)

# 4) modes per parada agrupats per estació pare (si location_type=1 sense servei propi)
def modes_of(sid):
    m = set(stop_modes.get(sid, set()))
    a = set(stop_agencies.get(sid, set()))
    return m, a

# 5) municipis
munis = json.load(open(MUNI, encoding="utf-8"))
print("municipis:", len(munis), file=sys.stderr)

# llavors escanejades dins 1km (pre-càlcul) — grid hash per proximitat
def key(lat, lon):
    return (int(lat * 100), int(lon * 100))

grid = defaultdict(list)
for sid, (lat, lon, *_rest) in stops.items():
    grid[key(lat, lon)].append(sid)

def near(lat, lon, radius_km, maxgrid=8):
    out = []
    k0 = key(lat, lon)
    for dx in range(-maxgrid, maxgrid + 1):
        for dy in range(-maxgrid, maxgrid + 1):
            for sid in grid.get((k0[0] + dx, k0[1] + dy), []):
                s = stops[sid]
                d = haversine((lat, lon), (s[0], s[1]))
                if d <= radius_km * 1000:
                    out.append((d, sid, s))
    return sorted(out)

res = {
    "feed": {"publisher": "ATM/CGIM (T-mobilitat dades obertes)", "feed_version": "TMOB_GTFS_WSAGWBL", "fitxers": "agency 199 operadors · stops 41449 · routes 2453 · trips 208005 · stop_times 4073635"},
    "stops_totals": len(stops),
    "modes": {},
    "municipis_1km": 0, "municipis_2km": 0, "municipis_sense_parada_2km": [],
    "prove": {},
    "modes_hist_rutes": Counter(dict(Counter(r[0] for r in routes.values()))),
    "agencies_prefix": Counter(),
}
for rid, (t, a, _n) in routes.items():
    if a: res["agencies_prefix"][str(a).split("_")[0]] += 1
res["agencies_prefix"] = dict(res["agencies_prefix"].most_common(25))

# mode stops
mode_stops = Counter()
for sid, m in stop_modes.items():
    for t in m: mode_stops[t] += 1
res["modes"] = {t: mode_stops[t] for t in sorted(mode_stops, key=lambda x: -(0 if not x.isdigit() else int(x)))}

TESTS = {
    "Barcelona": (41.3874, 2.1686), "Girona": (41.9794, 2.8214), "Lleida": (41.6176, 0.6200),
    "Tarragona": (41.1189, 1.2445), "Manresa": (41.7271, 1.8247), "Vic": (41.9311, 2.2549),
    "Sort": (42.7183, 0.9485), "Vielha e Mijaran": (42.7007, 0.7951), "Amposta": (40.7086, 0.5796),
    "La Seu d'Urgell": (42.3540, 1.5139), "Puigcerdà": (42.4313, 1.9276), "Figueres": (42.2674, 2.9612),
    "Reus": (41.1546, 1.1077), "Sabadell": (41.5433, 2.1094), "Terrassa": (41.5625, 2.0093),
}
for nom, (lat, lon) in TESTS.items():
    ns = near(lat, lon, 1.0)
    nm, na = set(), set()
    linies = []
    for d, sid, s in ns[:60]:
        m, a = modes_of(sid)
        nm |= m; na |= a
        if linies == [] and stop_lines.get(sid): linies = [(s[2], d, stop_lines[sid][:6])]
    res["prove"][nom] = {
        "parades_1km": len(ns),
        "modes_1km": sorted(nm),
        "agencies_1km": sorted(na)[:8],
        "mostra": [{"nom": n, "m": round(d), "linies": l} for n, d, l in linies[:2]],
    }

comarca_min = {}
for mu in munis:
    lat, lon = mu["lat"], mu["lng"]
    ns = near(lat, lon, 1.0)
    ns2 = ns if ns else near(lat, lon, 2.0)
    r = 1.0 if ns else 2.0
    if ns2:
        res["municipis_1km"] += 1 if ns else 0
        res["municipis_2km"] += 1
        nm = set()
        for d, sid, s in ns2[:80]:
            nm |= modes_of(sid)[0]
        comarca_min.setdefault(mu["comarca"], []).append((mu["name"], sorted(nm), r))
    else:
        res["municipis_sense_parada_2km"].append({"name": mu["name"], "comarca": mu["comarca"]})

res["comarques"] = {c: {"n": len(v), "sense": [x[0] for x in v if x[2] > 1.0][:6], "modes": sorted({t for x in v for t in x[1]})} for c, v in sorted(comarca_min.items())}
json.dump(res, open("/home/z/my-project/preureal/docs/gtfs-cobertura-analisi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({k: res[k] for k in ["stops_totals", "modes", "municipis_1km", "municipis_2km"]}, ensure_ascii=False, indent=1))
print("sense parada 2km:", len(res["municipis_sense_parada_2km"]))
for x in res["municipis_sense_parada_2km"][:25]: print("  -", x["name"], "(", x["comarca"], ")")
print("PROVES:", json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "mostra"} for k, v in res["prove"].items()}, ensure_ascii=False)[:1600])
