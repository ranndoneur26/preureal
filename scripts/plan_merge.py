#!/usr/bin/env python3
"""Fusiona portada + cuerpo, normaliza A4 y añade metadatos."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

cover = "/home/z/my-project/data/plan_cover.pdf"
body = "/home/z/my-project/data/plan_cuerpo.pdf"
out = "/home/z/my-project/download/PreuReal_cat_Plan_de_negocio.pdf"

writer = PdfWriter()
writer.add_page(normalize(PdfReader(cover).pages[0]))
for p in PdfReader(body).pages:
    writer.add_page(normalize(p))
writer.add_metadata({
    "/Title": "PreuReal.cat — Plan de negocio",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Modelo de negocio, precios, costes, punto de equilibrio, captación y lanzamiento de la plataforma del precio real del alquiler en Cataluña",
})
with open(out, "wb") as f:
    writer.write(f)
print("final:", out, "| páginas:", len(writer.pages))
