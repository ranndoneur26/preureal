#!/usr/bin/env python3
"""Stampa els numeros de pagina (esquema estandard: portada oculta, cos 1..N)
i estableix els metadats del PDF de la guia PreuReal."""
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

SRC = "/home/z/my-project/download/PreuReal_Guia_V23.pdf"
OUT = "/home/z/my-project/download/PreuReal_Guia_V23.pdf"

reader = PdfReader(SRC)
n = len(reader.pages)
box = reader.pages[0].mediabox
W, H = float(box.width), float(box.height)
print(f"Pages: {n}  size: {W:.0f}x{H:.0f} pt")

writer = PdfWriter()
for i, page in enumerate(reader.pages):
    # Portada (index 0) i pagina final (index n-1) sense numero
    if 1 <= i <= n - 2:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(W, H))
        c.setFont("Helvetica", 8.5)
        c.setFillColorRGB(0.49, 0.40, 0.36)  # #7d675d aprox
        c.drawCentredString(W / 2, 16, str(i))
        c.save()
        buf.seek(0)
        overlay = PdfReader(buf).pages[0]
        page.merge_page(overlay)
    writer.add_page(page)

writer.add_metadata({
    "/Title": "PreuReal.cat — De la idea a la web en producció (Guia V23)",
    "/Author": "PreuReal.cat · equip digitalformacio",
    "/Subject": "Guia de projecte per a no programadors: del primer dia al Mac fins a la V23 en producció, just abans de connectar Stripe",
    "/Creator": "Z.ai",
})

with open(OUT, "wb") as fh:
    writer.write(fh)
print(f"OK -> {OUT}")
