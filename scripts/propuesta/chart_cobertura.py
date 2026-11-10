#!/usr/bin/env python3
"""PreuReal — Matriz de cobertura territorial de las fuentes oficiales (estado 10-11-2026).
2 = datos descargables/integrables hoy · 1 = parcial o solo consulta interactiva · 0 = no disponible.
Salida: /home/z/my-project/scripts/propuesta/cobertura_fuentes.png
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np

try:
    fm.fontManager.addfont("/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf")
except Exception:
    pass
plt.rcParams["font.sans-serif"] = ["DejaVu Sans", "Noto Sans SC"]
plt.rcParams["axes.unicode_minus"] = False

fuentes = [
    "SERPAVI (MIVAU)\nprecio de referencia",
    "INE · IPVA\n(índice de precios)",
    "INE · Atlas de renta\n(de los hogares)",
    "Incasòl · Fianzas\n(ya integrada en PreuReal)",
    "Gencat · Índex referència\nlloguer (consulta)",
]
niveles = ["Nacional", "C. autónoma", "Provincia", "Municipio", "Distrito", "Sección censal"]

# 2 = descargable hoy · 1 = parcial / consulta · 0 = no disponible
M = np.array([
    [2, 2, 2, 1, 0, 1],   # SERPAVI: tablas estadísticas estatales/CCAA/prov; muni solicitado (datos.gob.es); sección solo consulta por refcat
    [2, 2, 2, 1, 1, 0],   # IPVA: nacional/CCAA/prov; algunos municipios y distritos
    [2, 2, 2, 2, 1, 2],   # Atlas: todo, municipios ≥2.000 hab. para todos los indicadores, secciones 33.600+
    [0, 0, 2, 2, 0, 0],   # Incasòl: provincia (àmbits) y municipio (ya en PreuReal)
    [0, 1, 0, 1, 1, 1],   # Índex Gencat: CCAA (Catalunya), consulta por municipio/zona/sección
])

fig, ax = plt.subplots(figsize=(9.2, 4.4), constrained_layout=True)
cmap = matplotlib.colors.ListedColormap(["#F2E8E1", "#F5C9B2", "#E8673C"])
im = ax.imshow(M, cmap=cmap, vmin=0, vmax=2, aspect="auto")

ax.set_xticks(np.arange(len(niveles)), labels=niveles, fontsize=10)
ax.set_yticks(np.arange(len(fuentes)), labels=fuentes, fontsize=9.5)
ax.set_xticks(np.arange(-0.5, len(niveles), 1), minor=True)
ax.set_yticks(np.arange(-0.5, len(fuentes), 1), minor=True)
ax.grid(which="minor", color="white", linewidth=2.5)
ax.tick_params(which="minor", bottom=False, left=False)
for s in ax.spines.values():
    s.set_visible(False)

etq = {0: "No disp.", 1: "Parcial", 2: "Disponible"}
for i in range(M.shape[0]):
    for j in range(M.shape[1]):
        v = M[i, j]
        ax.text(j, i, etq[v], ha="center", va="center",
                fontsize=9, color="white" if v == 2 else "#5A4038",
                fontweight="bold" if v == 2 else "normal")

ax.set_title("Cobertura territorial de las fuentes oficiales (estado: 10-11-2026)",
             fontsize=12, fontweight="bold", color="#0F2E21", pad=12)

from matplotlib.patches import Patch
ax.legend(handles=[
    Patch(facecolor="#E8673C", label="Descargable / integrable hoy"),
    Patch(facecolor="#F5C9B2", label="Parcial o solo consulta interactiva"),
    Patch(facecolor="#F2E8E1", label="No disponible públicamente"),
], loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=3, frameon=False, fontsize=9)

out = "/home/z/my-project/scripts/propuesta/cobertura_fuentes.png"
plt.savefig(out, dpi=200)
print("OK", out)
