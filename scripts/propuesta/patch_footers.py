#!/usr/bin/env python3
"""Post-proceso del docx (compatibilidad WPS/Word):
1) Parchea el instrText del pie de página: la sección cuyo sectPr tiene
   pgNumType fmt="upperRoman" recibe  PAGE \\* ROMAN \\* MERGEFORMAT  y la de
   fmt="decimal" recibe  PAGE \\* arabic \\* MERGEFORMAT.
2) Elimina <w:pgNumType/> vacíos (portada).
"""
import re
import shutil
import sys
import zipfile

src = sys.argv[1]
tmp = src + ".tmp"

with zipfile.ZipFile(src, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

doc = data["word/document.xml"].decode("utf-8")

# 1) quitar pgNumType vacíos
doc = doc.replace("<w:pgNumType/>", "")

# 2) mapear cada sectPr -> fmt y su footerReference r:id
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_target = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

fmt_by_footer = {}
for sect in re.findall(r"<w:sectPr.*?</w:sectPr>", doc, re.S):
    m_fmt = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect)
    if not m_fmt:
        continue
    fmt = m_fmt.group(1)
    for rid in re.findall(r'<w:footerReference[^>]*r:id="([^"]+)"', sect):
        target = rid_to_target.get(rid, "")
        fname = "word/" + target.lstrip("/")
        if fmt == "upperRoman":
            fmt_by_footer[fname] = "ROMAN"
        elif fmt == "decimal":
            fmt_by_footer[fname] = "arabic"

patched = []
for fname, fmt in fmt_by_footer.items():
    if fname not in data:
        continue
    xml = data[fname].decode("utf-8")
    new_xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        r"\1 PAGE \\* " + fmt + r" \\* MERGEFORMAT \2",
        xml,
    )
    if n:
        data[fname] = new_xml.encode("utf-8")
        patched.append((fname, fmt, n))

data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, src)
print("pgNumType vacíos eliminados; pies parcheados:", patched)
