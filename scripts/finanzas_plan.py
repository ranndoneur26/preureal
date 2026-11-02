#!/usr/bin/env python3
"""PreuReal.cat — Modelo financiero (cálculos verificados para el plan de negocio)."""
import json

# ---------- Unit economics ----------
PREMIUM = 7.99
PRO = 19.99
STRIPE_PCT = 0.015   # tarjeta EEE estándar (stripe.com/es/pricing)
STRIPE_FIX = 0.25

def net(price):
    fee = price * STRIPE_PCT + STRIPE_FIX
    return round(price - fee, 2), round(fee, 2)

p_net, p_fee = net(PREMIUM)
pro_net, pro_fee = net(PRO)
print(f"Premium {PREMIUM} -> fee {p_fee} -> net {p_net} ({p_net/PREMIUM*100:.1f}%)")
print(f"Pro      {PRO} -> fee {pro_fee} -> net {pro_net} ({pro_net/PRO*100:.1f}%)")

# ---------- Costes fijos mensuales (sin gastos no autorizados) ----------
# Escenario arranque (tiers gratuitos):
#  - Dominio .cat: ~15 €/año -> 1.25 €/mes
#  - Hosting: capa gratuita (Vercel hobby o VPS propio ya existente) -> 0 €
#  - Email: Resend free 3.000/mes -> 0 €
#  - Datos: Gencat/Incasòl/ICGC/Cadastre servicios públicos -> 0 €
# Escenario consolidado (si hay tráfico): VPS 5 €/mes o Vercel Pro 20 €/mes
domain_month = 15 / 12
fixed_launch = domain_month          # 1.25 €/mes
fixed_growth_vps = domain_month + 5  # dominio + VPS
fixed_growth_vercel = domain_month + 20

print(f"\nFijo arranque: {fixed_launch:.2f} €/mes")
print(f"Fijo crecimiento (VPS): {fixed_growth_vps:.2f} €/mes")
print(f"Fijo crecimiento (Vercel Pro): {fixed_growth_vercel:.2f} €/mes")

# ---------- Punto de equilibrio ----------
def breakeven(fixed, mix_premium_share=0.85):
    """n subs necesarias con un mix dado (resto Pro)."""
    avg_net = mix_premium_share * p_net + (1 - mix_premium_share) * pro_net
    import math
    n = fixed / avg_net
    return math.ceil(n), avg_net

for label, fixed in [("arranque", fixed_launch), ("VPS", fixed_growth_vps), ("Vercel Pro", fixed_growth_vercel)]:
    n, avg = breakeven(fixed)
    print(f"Break-even {label}: {n} suscriptores (neto medio {avg:.2f} €/mes)")

# ---------- Escenarios ----------
print("\nEscenarios mensuales (mix 85% Premium / 15% Pro):")
for subs in [5, 10, 25, 50, 100, 200]:
    prem = round(subs * 0.85)
    pro = subs - prem
    rev = prem * PREMIUM + pro * PRO
    fees = prem * p_fee + pro * pro_fee
    net_rev = rev - fees
    profit_launch = net_rev - fixed_launch
    profit_vps = net_rev - fixed_growth_vps
    print(f"  {subs:4d} subs ({prem}P/{pro}Pro): brut {rev:8.2f} € | fees {fees:5.2f} € | neto {net_rev:8.2f} € | beneficio arranque {profit_launch:8.2f} € | con VPS {profit_vps:8.2f} €")

# ---------- Coste de adquisición orgánico ----------
# canal gratuito: no hay CAC de pago; tiempo estimado del fundador (no gasto en caja)
print("\nNota: sin campañas de pago, CAC en caja = 0 €; el coste es tiempo del fundador.")

# ---------- Datos del mercado (reales, de la app) ----------
d = json.load(open('/home/z/my-project/data/municipalities.json'))
d = [m for m in d if m['name'].lower() != 'no consta']
with_rent = [m for m in d if m.get('rentLatest')]
tense = [m for m in d if m.get('isTense')]
bcn = [m for m in d if m['name'] == 'Barcelona'][0]
print(f"\nDatos reales cargados: {len(d)} municipios | con lloguer: {len(with_rent)} | tensados: {len(tense)}")
print(f"Barcelona: {bcn['rentLatest']} €/mes ({bcn['rentPeriod']}), {bcn['contractsLatest']} contratos")
hist = bcn['rentHistory']
print(f"Barcelona 2015={hist.get('2015')} -> 2025={hist.get('2025')} ({(hist['2025']/hist['2015']-1)*100:.0f}% en 10 años)")
rents = sorted([m['rentLatest'] for m in with_rent])
print(f"Lloguer mediana: {rents[len(rents)//2]} €/mes | min {rents[0]} | max {rents[-1]}")
