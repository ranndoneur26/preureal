#!/usr/bin/env python3
"""Gráficos del plan de negocio PreuReal.cat (reglas typesetting/charts.md)."""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf')
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Noto Sans SC']
plt.rcParams['axes.unicode_minus'] = False

# Paleta Template 07 (Crystal Blue body)
ACCENT = "#2d7ab3"
HEADER = "#1a4a7a"
TEXT = "#142840"
MUTED = "#5a7a96"
BORDER = "#c0d0e2"
OUT = "/home/z/my-project/data"

def style_ax(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color(BORDER)
    ax.spines['bottom'].set_color(BORDER)
    ax.tick_params(colors=MUTED, labelsize=10)
    ax.grid(True, linestyle='--', alpha=0.2, linewidth=0.5, color=MUTED)

# ---------- 1. Histórico real del lloguer a Barcelona (Incasòl) ----------
d = json.load(open(f'{OUT}/municipalities.json'))
bcn = [m for m in d if m['name'] == 'Barcelona'][0]
hist = {int(k): v for k, v in bcn['rentHistory'].items() if 2005 <= int(k) <= 2025}
years = sorted(hist)
vals = [hist[y] for y in years]

fig, ax = plt.subplots(figsize=(8.6, 3.6), constrained_layout=True)
ax.plot(years, vals, color=ACCENT, linewidth=2.5, solid_capstyle='round', zorder=3)
ax.fill_between(years, vals, min(vals) * 0.92, color=ACCENT, alpha=0.12, zorder=2)
# etiquetas solo primero / último / máximo (charts.md, estrategia 3A) con desfases
# pensados para que no colisionen cuando máximo y último están juntos
key_pts = [(years[0], vals[0], 0, 9, "center")]
mx_i = vals.index(max(vals))
if mx_i == len(vals) - 1:
    key_pts = [(years[0], vals[0], 0, 9, "center")]
key_pts.append((years[mx_i], vals[mx_i], 0, 10, "center"))
if len(vals) - 1 != mx_i:
    key_pts.append((years[-1], vals[-1], 16, -14, "right"))
for y, v, dx, dy, ha in key_pts:
    ax.scatter([y], [v], s=22, color=HEADER, zorder=4)
    ax.annotate(f"{v:,.0f} €", (y, v), textcoords="offset points",
                xytext=(dx, dy), ha=ha, fontsize=10, color=TEXT, fontweight='bold')
style_ax(ax)
ax.set_ylabel("€/mes (fianzas Incasòl)", fontsize=10, color=MUTED)
ax.set_xticks([2005, 2009, 2013, 2017, 2021, 2025])
ax.set_ylim(min(vals) * 0.9, max(vals) * 1.10)
fig.savefig(f'{OUT}/chart_bcn_hist.png', dpi=200, facecolor='white')
plt.close(fig)
print("chart_bcn_hist.png ok")

# ---------- 2. Punto de equilibrio: ingresos netos vs costes ----------
PREMIUM, PRO = 7.99, 19.99
FEE_P, FEE_PRO = 0.37, 0.55
subs = list(range(0, 61, 5))
mix_p = 0.85
net_rev = [n * (mix_p * (PREMIUM - FEE_P) + (1 - mix_p) * (PRO - FEE_PRO)) for n in subs]
fixed_launch = 1.25
fixed_vps = 6.25
fixed_vercel = 21.25

fig, ax = plt.subplots(figsize=(8.6, 3.8), constrained_layout=True)
ax.plot(subs, net_rev, color=ACCENT, linewidth=2.5, label="Ingresos netos (tras comisión Stripe)")
ax.axhline(fixed_launch, color=MUTED, linestyle='--', linewidth=1.2, label="Coste fijo arranque (1,25 €/mes)")
ax.axhline(fixed_vps, color=HEADER, linestyle=':', linewidth=1.4, label="Coste fijo con VPS (6,25 €/mes)")
ax.axhline(fixed_vercel, color="#8a5a44", linestyle='-.', linewidth=1.2, label="Coste fijo Vercel Pro (21,25 €/mes)")
# punto de equilibrio con Vercel Pro
be = fixed_vercel / (mix_p * (PREMIUM - FEE_P) + (1 - mix_p) * (PRO - FEE_PRO))
ax.scatter([be], [fixed_vercel], s=40, color="#8a5a44", zorder=5)
ax.annotate(f"equilibrio: {be:.0f} suscriptores", (be, fixed_vercel), textcoords="offset points",
            xytext=(12, 10), fontsize=10, color=TEXT, fontweight='bold')
style_ax(ax)
ax.set_xlabel("Suscriptores de pago", fontsize=10, color=MUTED)
ax.set_ylabel("€/mes", fontsize=10, color=MUTED)
leg = ax.legend(loc='upper left', bbox_to_anchor=(0, 1.02), frameon=False, fontsize=9)
for t in leg.get_texts():
    t.set_color(TEXT)
fig.savefig(f'{OUT}/chart_breakeven.png', dpi=200, facecolor='white')
plt.close(fig)
print("chart_breakeven.png ok")
