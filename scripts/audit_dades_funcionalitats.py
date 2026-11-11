#!/usr/bin/env python3
"""Auditoria de dades reals per a l'informe de noves funcionalitats.
Font 1: data/municipalities.json (seed real importat a producció).
Font 2: sondes només lectura de producció (executades a part).
Només lectura — no modifica res."""
import json, collections, statistics

muns = json.load(open("/home/z/my-project/data/municipalities.json"))
print(f"TOTAL municipis al seed: {len(muns)}")

def cnt(key):
    return sum(1 for m in muns if m.get(key) not in (None, "", []))

print("\n=== COBERTURA DE CAMPS ===")
for k in ["rentLatest", "rentPeriod", "rentPrevYear", "rentHistory", "contractsLatest", "comarca", "province", "isTense"]:
    print(f"  {k}: {cnt(k)} ({cnt(k)*100//len(muns)}%)")

print("\nrentPeriod dist:", dict(collections.Counter(m.get("rentPeriod") for m in muns if m.get("rentLatest") is not None)))
print("provincia dist:", dict(collections.Counter(m.get("province") for m in muns)))

# Anàlisi de rentHistory
rows = [m for m in muns if m.get("rentHistory")]
year_counts = collections.Counter()
points, spans = [], []
for r in rows:
    h = {k: v for k, v in r["rentHistory"].items() if v is not None}
    ks = sorted(h)
    year_counts.update(ks)
    points.append(len(ks))
    if ks:
        spans.append(int(ks[-1]) - int(ks[0]))
print(f"\n=== rentHistory: {len(rows)} municipis amb sèrie històrica ===")
years = sorted(year_counts)
print(f"  rang d'anys global: {years[0]}–{years[-1]}")
print(f"  municipis per any: {years[0]}:{year_counts[years[0]]} 2010:{year_counts.get('2010',0)} 2015:{year_counts.get('2015',0)} 2018:{year_counts.get('2018',0)} 2020:{year_counts.get('2020',0)} 2022:{year_counts.get('2022',0)} 2023:{year_counts.get('2023',0)} 2024:{year_counts.get('2024',0)} 2025:{year_counts.get('2025',0)}")
print(f"  punts per municipi: min={min(points)} mediana={statistics.median(points):.0f} màx={max(points)}")
print(f"  >=3 punts: {sum(1 for p in points if p>=3)} | >=5: {sum(1 for p in points if p>=5)} | >=10: {sum(1 for p in points if p>=10)}")
print(f"  span mitjà: {statistics.mean(spans):.1f} anys")
amb_var = 0
for r in rows:
    h = [v for v in r["rentHistory"].values() if v]
    if len(h) >= 2:
        for a, b in zip(h, h[1:]):
            if abs((b - a) / a) > 0.35:
                amb_var += 1
                break
print(f"  municipis amb algun salt interanual >35% (qualitat): {amb_var}")

print("\n=== MOSTRES DESTACADES ===")
for code in ["080193", "081015", "170792", "250015", "430038"]:
    m = next((m for m in muns if m["code"] == code), None)
    if m:
        h = {k: v for k, v in (m.get("rentHistory") or {}).items() if v}
        print(f"  {m['name']}: rentLatest={m.get('rentLatest')} period={m.get('rentPeriod')} punts_hist={len(h)} contractes={m.get('contractsLatest')}")

# €/m²: el seed té preu per habitatge (no per m²). Verifiquem claus disponibles
keys = set()
for m in muns[:50]:
    keys.update(m.keys())
print("\nclaus disponibles al seed:", sorted(keys))
