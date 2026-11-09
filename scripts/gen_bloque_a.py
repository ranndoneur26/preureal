#!/usr/bin/env python3
"""Genera el BLOQUE A (recuperador estable) para la Mac de Marc.

El bloque es shell plano que Marc pega en Terminal:
  - crea ~/preureal_guia.sh (script con p1+p2 empaquetadas en gzip+base64)
  - el script: reconstruye p1/p2, rescata p3 de ~/guia_p3.html o /tmp,
    verifica los 3 sha256, ensambla, verifica el conjunto, genera el PDF
    con Chrome (si existe) o imprime el plan Firefox con inyección de
    print-color-adjust en guia_print.html.
"""
import base64, gzip, hashlib, pathlib

D = pathlib.Path("/home/z/my-project/scripts/guia_transfer")
parts = {n: (D / f"guia_p{n}.html").read_bytes() for n in (1, 2, 3)}
sha = lambda b: hashlib.sha256(b).hexdigest()

def gz_b64(b: bytes) -> str:
    return base64.encodebytes(gzip.compress(b, 9)).decode()

# ---------- script interior ----------
S = []
S.append("#!/bin/bash")
S.append("# PreuReal · Guia V23 — recuperador v2 · hogar estable: ~/preureal_guia")
S.append('DIR="$HOME/preureal_guia"')
S.append('PDF="$HOME/Desktop/PreuReal_Guia_V23.pdf"')
S.append('mkdir -p "$DIR"')
S.append("sha() {")
S.append('  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk \'{print $1}\'')
S.append('  else sha256sum "$1" | awk \'{print $1}\'; fi')
S.append("}")
S.append("")
S.append('echo "⏳ Reconstruyendo p1 y p2 (van dentro de este script)…"')
S.append('openssl base64 -d << \'B64_P1\' | gunzip > "$DIR/guia_p1.html"')
S.append(gz_b64(parts[1]).rstrip("\n"))
S.append("B64_P1")
S.append('openssl base64 -d << \'B64_P2\' | gunzip > "$DIR/guia_p2.html"')
S.append(gz_b64(parts[2]).rstrip("\n"))
S.append("B64_P2")
S.append("")
S.append('echo "⏳ Rescatando la p3 de su ubicación anterior (si sigue ahí)…"')
S.append('if [ ! -f "$DIR/guia_p3.html" ] || [ "$(sha "$DIR/guia_p3.html")" != "' + sha(parts[3]) + '" ]; then')
S.append('  for c in "$HOME/guia_p3.html" "/tmp/guia_p3.html"; do')
S.append('    if [ -f "$c" ] && [ "$(sha "$c")" = "' + sha(parts[3]) + '" ]; then')
S.append('      cp "$c" "$DIR/guia_p3.html"')
S.append('      echo "✅ p3 rescatada de $c"')
S.append("      break")
S.append("    fi")
S.append("  done")
S.append("fi")
S.append("")
S.append("ok=1")
S.append('if [ -f "$DIR/guia_p1.html" ] && [ "$(sha "$DIR/guia_p1.html")" = "' + sha(parts[1]) + '" ]; then')
S.append('  echo "✅ p1 OK (5674 bytes)"')
S.append('else echo "❌ p1 no cuadra"; ok=0; fi')
S.append('if [ -f "$DIR/guia_p2.html" ] && [ "$(sha "$DIR/guia_p2.html")" = "' + sha(parts[2]) + '" ]; then')
S.append('  echo "✅ p2 OK (9777 bytes)"')
S.append('else echo "❌ p2 no cuadra"; ok=0; fi')
S.append('if [ -f "$DIR/guia_p3.html" ] && [ "$(sha "$DIR/guia_p3.html")" = "' + sha(parts[3]) + '" ]; then')
S.append('  echo "✅ p3 OK (28197 bytes)"')
S.append('else echo "❌ FALTA LA PARTE 3"; ok=0; fi')
S.append("")
S.append('if [ "$ok" != "1" ]; then')
S.append("  echo")
S.append('  echo "→ Si arriba pone «FALTA LA PARTE 3», dime «manda la p3» y te paso su bloque blindado;"')
S.append('  echo "  lo pegas (crea ~/preureal_guia/guia_p3.html) y repites: bash ~/preureal_guia.sh"')
S.append("  exit 1")
S.append("fi")
S.append("")
S.append('echo "⏳ Ensamblando el HTML…"')
S.append('cat "$DIR/guia_p1.html" "$DIR/guia_p2.html" "$DIR/guia_p3.html" > "$DIR/guia.html"')
S.append('GOT="$(sha "$DIR/guia.html")"')
S.append('if [ "$GOT" != "' + sha(parts[1] + parts[2] + parts[3]) + '" ]; then')
S.append('  echo "❌ El conjunto no cuadra (sha: $GOT) — cópiame esta salida."')
S.append("  exit 1")
S.append("fi")
S.append('echo "✅ HTML completo verificado byte a byte"')
S.append("")
S.append('CHROME=""')
S.append('for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\')
S.append('         "/Applications/Chromium.app/Contents/MacOS/Chromium" \\')
S.append('         "$(command -v google-chrome 2>/dev/null)" \\')
S.append('         "$(command -v chromium 2>/dev/null)"; do')
S.append('  if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi')
S.append("done")
S.append("")
S.append('if [ -n "$CHROME" ]; then')
S.append('  echo "⏳ Generando el PDF con Chrome (unos segundos)…"')
S.append('  "$CHROME" --headless=new --disable-gpu --user-data-dir="$DIR/.chrome-tmp" \\')
S.append('    --no-pdf-header-footer --print-to-pdf-no-header \\')
S.append('    --print-to-pdf="$PDF" "file://$DIR/guia.html" >/dev/null 2>&1')
S.append('  if [ ! -f "$PDF" ]; then')
S.append('    "$CHROME" --headless --disable-gpu --user-data-dir="$DIR/.chrome-tmp" \\')
S.append('      --print-to-pdf="$PDF" "file://$DIR/guia.html" >/dev/null 2>&1')
S.append("  fi")
S.append('  if [ -f "$PDF" ]; then')
S.append('    echo "✅ PDF creado: $PDF"')
S.append('    open "$PDF" 2>/dev/null || true')
S.append('    echo "🎉 Ábrelo y dime si se ve bien — con esto cerramos la tarea."')
S.append("    exit 0")
S.append("  fi")
S.append('  echo "⚠️ Chrome no pudo generar el PDF — usa el plan Firefox de aquí abajo."')
S.append("fi")
S.append("")
S.append('if [ ! -f "$PDF" ]; then')
S.append("  awk '/<\\/style>/ && !d { sub(/<\\/style>/, \"html{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>\"); d=1 } { print }' \\")
S.append('    "$DIR/guia.html" > "$DIR/guia_print.html"')
S.append("  cat << 'FIREFOX'")
S.append("")
S.append("PLAN FIREFOX (2 minutos, sin Chrome):")
S.append(" 1. Finder → Inicio → carpeta «preureal_guia»")
S.append(" 2. Botón derecho en «guia_print.html» → Abrir con → Firefox")
S.append(" 3. En Firefox: Cmd+P → Destino: «Guardar como PDF»")
S.append(" 4. «Más ajustes»: Márgenes → «Ninguno» · Encabezados y pies: off · «Imprimir fondos»: on (si aparece)")
S.append(" 5. Guardar como «PreuReal_Guia_V23.pdf» en el Escritorio")
S.append("FIREFOX")
S.append("fi")
script = "\n".join(S) + "\n"
assert '$GOT' in script and "ERROR_TOKEN" not in script

# heredoc interno FIREFOX no debe colisionar; delimitadores: FIN_REC, B64_P1, B64_P2, FIREFOX
assert "FIN_REC" not in script

block = (
    'cat > "$HOME/preureal_guia.sh" << \'FIN_REC\'\n'
    + script
    + "FIN_REC\n"
)
out = D / "bloque_A.txt"
out.write_text(block)
full_sha = sha(parts[1] + parts[2] + parts[3])
print(f"bloque_A.txt: {out.stat().st_size} bytes, {block.count(chr(10))} líneas")
print(f"sha_p1={sha(parts[1])}")
print(f"sha_p2={sha(parts[2])}")
print(f"sha_p3={sha(parts[3])}")
print(f"sha_ALL={full_sha}")
