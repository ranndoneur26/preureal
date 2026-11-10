#!/usr/bin/env python3
"""Limpia el markdown generado por pandoc para publicarlo en GitHub."""
import re
from pathlib import Path

SRC = Path('/home/z/my-project/docs/_raw.md')
DST = Path('/home/z/my-project/docs/PROPUESTA-ampliacion-fuentes-oficiales.md')

text = SRC.read_text(encoding='utf-8')
lines = text.split('\n')
out = []
i = 0
n = len(lines)

# 1) Saltar la portada en tabla HTML (hasta el primer </table>) y el Índice roto
state = 'cover'
for line in lines:
    if state == 'cover':
        if line.strip() == '</table>':
            state = 'toc'
        continue
    if state == 'toc':
        # el índice termina en la nota de actualización de campos
        if line.startswith('*Nota: este índice'):
            state = 'body'
        continue
    out.append(line)

body = '\n'.join(out)

# 2) Encabezados: quitar anclas y convertir negritas en headings markdown
#    "N. Título" -> "## N. Título"   |   "N.M Título" -> "### N.M Título"
def heading_repl(m):
    num, title = m.group(1), m.group(2)
    level = '##' if '.' not in num else '###'
    return f'{level} {num} {title}'

body = re.sub(
    r'<span id="_Toc\d+" class="anchor"></span>\*\*(\d+(?:\.\d+)?)\.?\s+(.+?)\*\*',
    lambda m: (f"## {m.group(1)}. {m.group(2)}" if m.group(1).count('.') == 0
               else f"### {m.group(1)} {m.group(2)}"),
    body,
)
# Anclas sueltas restantes
body = re.sub(r'<span id="[^"]*" class="anchor"></span>', '', body)

# 3) Imagen de la figura: ruta relativa media/
body = body.replace(
    '<img src="media/kvutc5_pl9bkofdqxo_8j.png" style="width:5.625in;height:2.6875in" />',
    '![Cobertura territorial de las fuentes oficiales](media/kvutc5_pl9bkofdqxo_8j.png)',
)

# 4) Cabecera limpia del documento
header = (
    '# PreuReal.cat — Ampliación de funcionalidades y fuentes de información oficial\n\n'
    '> **Auditoría de la plataforma (Fase 1) y propuesta técnica de implementación**\n\n'
    '| | |\n|---|---|\n'
    '| Plataforma | www.preureal.com / preureal.cat |\n'
    '| Documento | Propuesta pendiente de validación |\n'
    '| Fecha | 10 de noviembre de 2026 |\n\n'
    '---\n\n'
)

DST.write_text(header + body.strip() + '\n', encoding='utf-8')
print('Escrito:', DST)
print('Tamaño:', DST.stat().st_size, 'bytes')
print('Headings ##:', len(re.findall(r'^## ', DST.read_text(), flags=re.M)))
print('Headings ###:', len(re.findall(r'^### ', DST.read_text(), flags=re.M)))
print('Tablas markdown:', len(re.findall(r'^\|[-: |]+\|$', DST.read_text(), flags=re.M)))
print('Anclas restantes:', len(re.findall(r'_Toc\d+', DST.read_text())))
