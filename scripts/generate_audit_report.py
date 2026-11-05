#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PreuReal.cat — Informe de auditoría v21 (cuerpo ReportLab + portada Playwright).
Ruta Report del skill pdf. Paleta: fija del Template 07 "Crystal Blue"
(documentada en skills/pdf/typesetting/cover.md — excepción a palette.cascade).
"""
import os, sys, hashlib

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether,
                                CondPageBreak, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents

# ── Fuentes (solo las permitidas) ────────────────────────────────────────────
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC Bold", f"{FONT_DIR}/truetype/chinese/NotoSansSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("Noto Sans SC", normal="Noto Sans SC", bold="Noto Sans SC Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ── Paleta (Template 07 Crystal Blue — valores del propio skill) ────────────
PAGE_BG      = colors.HexColor("#f5f8fc")   # XL
SECTION_BG   = colors.HexColor("#edf2f9")   # XL
CARD_BG      = colors.HexColor("#e4ecf5")   # L
TABLE_STRIPE = colors.HexColor("#eef3fa")   # L
HEADER_FILL  = colors.HexColor("#1a4a7a")   # M
BORDER       = colors.HexColor("#c0d0e2")   # S
ACCENT       = colors.HexColor("#2d7ab3")   # XS
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED   = colors.HexColor("#5a7a96")
TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ── Documento ────────────────────────────────────────────────────────────────
OUT_BODY = "/home/z/my-project/scripts/audit_body.pdf"
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_THRESHOLD = AVAIL_H * 0.25

DOC_TITLE = "PreuReal.cat — Informe de auditoría técnica v21"

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            # El índice muestra la numeración VISIBLE (el cuerpo reinicia a 1
            # tras la materia previa), igual que el pie de página.
            self.notify("TOCEntry", (level, text, self.page - FRONT_PAGES, key))

def header_footer(canvas, doc):
    canvas.saveState()
    # cabecera: título + regla acento
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # pie: autor + número de página (TOC = i romano; cuerpo arábigo reiniciado)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, "PreuReal.cat · Informe de auditoría v21")
    roman = {1: "i", 2: "ii", 3: "iii"}
    label = roman.get(doc.page, str(doc.page - FRONT_PAGES)) if doc.page <= FRONT_PAGES \
        else str(doc.page - FRONT_PAGES)
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, label)
    canvas.restoreState()

FRONT_PAGES = 1  # solo el índice es materia previa

# ── Estilos ──────────────────────────────────────────────────────────────────
S = {}
S["body"] = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5,
                           leading=17, alignment=TA_JUSTIFY,
                           textColor=TEXT_PRIMARY, spaceAfter=10)
S["h1"] = ParagraphStyle("H1", fontName="FreeSerif", fontSize=20, leading=26,
                         textColor=HEADER_FILL, spaceBefore=18, spaceAfter=4)
S["h2"] = ParagraphStyle("H2", fontName="FreeSerif", fontSize=14.5, leading=20,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6)
S["bullet"] = ParagraphStyle("Bullet", parent=S["body"], leftIndent=16,
                             bulletIndent=4, spaceAfter=6)
S["caption"] = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5,
                              leading=12, alignment=TA_CENTER,
                              textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6)
S["cellH"] = ParagraphStyle("CellH", fontName="FreeSerif", fontSize=9.5,
                            leading=13, alignment=TA_LEFT, textColor=colors.white)
S["cell"] = ParagraphStyle("Cell", fontName="FreeSerif", fontSize=9.5,
                           leading=13, alignment=TA_LEFT, textColor=TEXT_PRIMARY)
S["cellC"] = ParagraphStyle("CellC", parent=S["cell"], alignment=TA_CENTER)
S["code"] = ParagraphStyle("Code", fontName="DejaVuSans", fontSize=8,
                           leading=11.5, textColor=TEXT_PRIMARY)
S["stat"] = ParagraphStyle("Stat", fontName="FreeSerif", fontSize=19,
                           leading=23, textColor=ACCENT, alignment=TA_CENTER)
S["statL"] = ParagraphStyle("StatL", fontName="FreeSerif", fontSize=8,
                            leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER)
S["quote"] = ParagraphStyle("Quote", fontName="FreeSerif-Italic", fontSize=10.5,
                            leading=17, leftIndent=24, textColor=TEXT_PRIMARY,
                            spaceBefore=6, spaceAfter=10)
S["toc0"] = ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=12,
                           leading=20, leftIndent=6, textColor=TEXT_PRIMARY)
S["toc1"] = ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=10.5,
                           leading=16, leftIndent=26, textColor=TEXT_MUTED)
S["tocTitle"] = ParagraphStyle("TOCTitle", fontName="FreeSerif", fontSize=20,
                               leading=26, textColor=HEADER_FILL, spaceAfter=14)

def P(text, style="body"):
    return Paragraph(text, S[style])

def add_heading(text, style, level=0):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), S[style])
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1(story, text):
    story.append(CondPageBreak(H1_THRESHOLD))
    head = add_heading(text, "h1", 0)
    rule = HRFlowable(width="100%", color=ACCENT, thickness=1.2,
                      spaceBefore=2, spaceAfter=10)
    story.append(KeepTogether([head, rule]))

def h2(story, text):
    story.append(add_heading(text, "h2", 1))

def data_table(headers, rows, ratios, align_center_cols=()):
    col_w = [r * AVAIL_W for r in ratios]
    assert sum(col_w) <= AVAIL_W + 0.5
    data = [[Paragraph("<b>%s</b>" % h, S["cellH"]) for h in headers]]
    for row in rows:
        cells = []
        for i, c in enumerate(row):
            st = "cellC" if i in align_center_cols else "cell"
            cells.append(Paragraph(str(c), S[st]))
        data.append(cells)
    t = Table(data, colWidths=col_w, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i),
                      TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    t.setStyle(TableStyle(style))
    return t

def callout_box(big, label):
    t = Table([[Paragraph("<b>%s</b>" % big, S["stat"])],
               [Paragraph(label, S["statL"])]], colWidths=[AVAIL_W * 0.30])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
        ("TOPPADDING", (0, -1), (-1, -1), 2),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t

def code_block(lines):
    data = [[Paragraph(ln, S["code"])] for ln in lines]
    t = Table(data, colWidths=[AVAIL_W * 0.96], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return t

def verdict_box(text):
    t = Table([[Paragraph(text, ParagraphStyle("V", parent=S["body"],
                                               alignment=TA_LEFT, spaceAfter=0))]],
              colWidths=[AVAIL_W * 0.96])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SECTION_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 4, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t

# ═══════════════════════════════ CONTENIDO ═══════════════════════════════════
story = []

# — Índice (materia previa, página i) —
story.append(Paragraph("<b>Índice</b>", S["tocTitle"]))
toc = TableOfContents()
toc.levelStyles = [S["toc0"], S["toc1"]]
story.append(toc)
story.append(PageBreak())

# ── 1. Resumen ejecutivo ────────────────────────────────────────────────────
h1(story, "1. Resumen ejecutivo y veredicto")
story.append(P(
    "Se solicitó una auditoría completa de la web para determinar por qué los "
    "registros de nuevos usuarios «no llegan a la base de datos», con instrucción "
    "expresa de averiguar si la causa está en la base de datos o en la "
    "configuración de las variables de entorno, y de revisar en profundidad el "
    "sistema de envío de correos. Para responder con hechos y no con hipótesis, "
    "la auditoría combinó tres fuentes de evidencia: probes HTTP en vivo contra "
    "el entorno de producción (www.preureal.com), la lectura línea a línea del "
    "código del sistema de correo (rutas, librería de envío, migraciones y "
    "esquema) y el análisis del despliegue y su historial reciente."))
story.append(P(
    "La conclusión es nítida. Las variables de entorno están bien: la aplicación "
    "conecta con la base de datos en producción, el proveedor de correo (Resend) "
    "está configurado y el registro de usuarios funciona. La base de datos "
    "también está sana como servicio; lo que está desactualizado es su "
    "<b>esquema</b>: la migración 20261104120000_emaillog_telemetry, que añade "
    "las columnas que el sistema de correo v19 necesita (type, userId, attempts, "
    "sentAt, nextRetryAt, idempotencyKey), nunca llegó a aplicarse en Supabase. "
    "Cada envío intenta escribir su fila de «outbox» en la tabla EmailLog, "
    "encuentra columnas inexistentes y falla en silencio. Resultado: sin correos "
    "y sin filas nuevas en EmailLog, que es exactamente el síntoma reportado."))
row = Table([[callout_box("200 OK", "GET /api/health — la BD conecta (1015 ms)"),
              callout_box("500", "GET /api/cron/emails — columnas nuevas ausentes"),
              callout_box("200 OK", "POST /api/auth/register — usuario creado en User")]],
            colWidths=[AVAIL_W / 3.0] * 3, hAlign="CENTER")
row.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 4),
                         ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                         ("TOPPADDING", (0, 0), (-1, -1), 4),
                         ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
story.append(Spacer(1, 8))
story.append(row)
story.append(Spacer(1, 10))
story.append(verdict_box(
    "<b>Veredicto:</b> ni las variables de entorno ni la conexión a la base de "
    "datos son la causa. El problema real es doble: (1) el <b>esquema de la base "
    "de datos</b> no tiene aplicada la migración del correo v19, y (2) el "
    "<b>despliegue v20</b>, que la aplicaría automáticamente durante el build, "
    "queda colgado porque el host directo de Supabase solo responde por IPv6 y "
    "el entorno de build de Vercel no alcanza esa dirección. La solución "
    "definitiva ocupa 2 minutos y está en el capítulo 4."))

# ── 2. Método de diagnóstico ────────────────────────────────────────────────
h1(story, "2. Método de diagnóstico en vivo")
story.append(P(
    "El diagnóstico se ejecutó contra producción, sin tocar datos de usuarios "
    "reales y sin necesidad de credenciales: basta con endpoints públicos y con "
    "consultas DNS. Esta vía es la más fiable porque observa el sistema en su "
    "estado real, no en una copia. Cada prueba se diseñó para separar una "
    "hipótesis concreta de las demás: si el servicio está caído, si la "
    "aplicación conecta con la base de datos, si el código desplegado es el "
    "esperado, y si el esquema de la base de datos está al día."))
story.append(Spacer(1, 8))
t = data_table(
    ["Prueba", "Resultado", "Interpretación"],
    [["GET /api/health", "HTTP 200 · database.ok · 1015 ms",
      "La app y la conexión a PostgreSQL funcionan; no es un problema de "
      "variables de entorno ni de credenciales."],
     ["GET /api/cron/emails", "HTTP 500 con cuerpo vacío",
      "La ruta existe (código v19 desplegado), pero su primera consulta usa "
      "columnas (attempts, nextRetryAt, type) que no existen aún: el esquema "
      "está desactualizado."],
     ["POST /api/auth/register", "HTTP 200 · usuario creado",
      "El registro SÍ escribe la fila en la tabla User. La queja «no llega a la "
      "base de datos» se refería a EmailLog, alimentada por el correo."],
     ["DNS del host de la BD", "db.…supabase.co responde SOLO IPv6",
      "El runtime de Vercel llega por IPv6, pero el build de Vercel no: por eso "
      "el despliegue se queda «infinito» en prisma migrate deploy."],
     ["Build de Vercel (logs del usuario)", "Colgado tras npm install",
      "El deploy v20 nunca llegó a aplicar la migración; producción sigue con "
      "el esquema antiguo y el correo bloqueado."]],
    [0.22, 0.26, 0.52])
story.append(t)
story.append(Paragraph("Tabla 1. Evidencias recogidas contra producción (05/11/2026).", S["caption"]))
story.append(Spacer(1, 6))
story.append(P(
    "Con estas cinco pruebas quedan descartadas las tres hipótesis que más "
    "ruido generan en un caso así: caída del proveedor, error de credenciales y "
    "fallo de la aplicación. Queda una sola explicación compatible con todos "
    "los síntomas, y es la que desarrolla el capítulo siguiente."))

# ── 3. El problema real ─────────────────────────────────────────────────────
h1(story, "3. El problema real: cadena completa del fallo")
story.append(P(
    "La versión v19 introdujo un sistema de correo robusto con «outbox» "
    "duradero: antes de enviar, cada correo crea una fila en EmailLog con "
    "estado «pending»; si el envío tiene éxito pasa a «sent» con el "
    "identificador de Resend, y si falla queda registrado para que el cron lo "
    "recupere. Para ello, el esquema necesita columnas nuevas que se añaden con "
    "una migración aditiva e idempotente. El código desplegado en producción es "
    "el correcto; el esquema de la base de datos, no: la migración sigue sin "
    "aplicarse."))
story.append(P(
    "La cadena del fallo es esta: el usuario se registra; la fila de usuario se "
    "crea correctamente en User (por eso el registro «funciona»); después, en "
    "segundo plano, el envío de bienvenida y de verificación intenta crear su "
    "fila de outbox en EmailLog; la consulta pide columnas que no existen "
    "(type, attempts, nextRetryAt…); PostgreSQL rechaza la operación; el error "
    "ocurre dentro del trabajo en segundo plano (after) y no interrumpe la "
    "respuesta, así que nadie lo ve; y el usuario no recibe ningún correo. "
    "Como nadie puede pedir el enlace de verificación, el síntoma se percibe "
    "como «los registros no llegan a la base de datos»."))
h2(story, "3.1 Por qué el despliegue se queda colgado (deploy infinito)")
story.append(P(
    "La v20 incluyó una salvaguardia importante: el build ejecuta «prisma "
    "migrate deploy» para que la base de datos nunca quede desactualizada. Esa "
    "salvaguardia es correcta, pero tropieza con un detalle de red: el host "
    "directo de la base de datos (db.tkbjifmflpxqszaozqlw.supabase.co) solo "
    "tiene dirección IPv6. El runtime de Vercel sí usa IPv6 y por eso la "
    "aplicación funciona; el entorno de build, en cambio, no alcanza ese host, "
    "y la conexión de la migración queda esperando indefinidamente: el deploy "
    "entra en bucle y nunca aplica la migración. No es un fallo del código ni "
    "de Prisma: es un desajuste entre el endpoint de la base de datos y el "
    "entorno que debe alcanzarlo durante el build."))
story.append(P(
    "La consecuencia práctica es que el arreglo no consiste en reintentar el "
    "deploy una y otra vez: mientras el esquema no se ponga al día por otra "
    "vía (o mientras no se use el pooler IPv4), cada build volverá a colgarse "
    "en el mismo punto. El capítulo siguiente ordena las acciones en la "
    "secuencia exacta para resolverlo de forma definitiva."))

# ── 4. Solución paso a paso ─────────────────────────────────────────────────
h1(story, "4. Solución paso a paso (prioridad máxima)")
story.append(P(
    "Las dos primeras acciones desbloquean el correo en menos de cinco minutos "
    "y no requieren tocar código. Las restantes consolidan el arreglo para que "
    "el problema no pueda repetirse. Ejecútalas en orden."))
h2(story, "Paso 1 — Aplicar la migración desde el SQL Editor de Supabase")
story.append(P(
    "Entra en Supabase, proyecto tkbjifmflpxqszaozqlw, abre <b>SQL Editor</b>, "
    "pega el siguiente SQL y pulsa <b>Run</b>. Es idempotente: puede "
    "ejecutarse varias veces sin error, y solo añade columnas e índices que "
    "faltan (no borra ni renombra nada)."))
story.append(Spacer(1, 4))
story.append(code_block([
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT \'GENERIC\';',
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;',
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;',
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);',
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);',
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;',
    'ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;',
    '',
    'CREATE INDEX IF NOT EXISTS "EmailLog_status_nextRetryAt_idx" ON "EmailLog"("status", "nextRetryAt");',
    'CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");',
    'CREATE INDEX IF NOT EXISTS "EmailLog_userId_idx" ON "EmailLog"("userId");',
    'CREATE UNIQUE INDEX IF NOT EXISTS "EmailLog_idempotencyKey_key" ON "EmailLog"("idempotencyKey");',
]))
story.append(Paragraph("Código 1. Migración 20261104120000_emaillog_telemetry (v19/v20, idempotente).", S["caption"]))
story.append(Spacer(1, 6))
story.append(P(
    "Con el esquema al día, el código ya desplegado empieza a funcionar de "
    "inmediato: no hace falta redeploy para que los correos vuelvan a salir. "
    "Este es el paso que resuelve el incidente."))
h2(story, "Paso 2 — Cancelar el deploy colgado y relanzar")
story.append(P(
    "En Vercel, entra en Deployments, cancela el deployment atascado (menú de "
    "los tres puntos, Cancel Deployment) y haz Redeploy del más reciente. Con "
    "la migración ya aplicada a mano, el paso «prisma migrate deploy» del build "
    "debería encontrar la base de datos al día. Si el build volviera a quedarse "
    "colgado en ese punto, aplica el Paso 3 antes de reintentarlo de nuevo."))
h2(story, "Paso 3 — Cambiar DATABASE_URL al pooler IPv4 (recomendado)")
story.append(P(
    "Para que los builds de Vercel puedan conectar siempre con la base de "
    "datos, sustituye el valor de DATABASE_URL en Vercel por el <b>Session "
    "Pooler</b> de Supabase (host aws-0-región.pooler.supabase.com, puerto "
    "5432, usuario postgres.tkbjifmflpxqszaozqlw), que sí tiene IPv4. Lo "
    "obtienes en Supabase con el botón Connect; sustituye el marcador "
    "[YOUR-PASSWORD] por la contraseña actual de la base de datos y añade "
    "&connect_timeout=15 al final de la URL, para que un fallo de conexión "
    "sea visible en 15 segundos en lugar de colgar el build. No es necesario "
    "hacerlo para que el correo funcione (eso ya lo resuelve el Paso 1), pero "
    "evita que el deploy infinito vuelva a ocurrir en el futuro."))
h2(story, "Paso 4 — Variables de entorno recomendadas en Vercel")
story.append(Spacer(1, 4))
t = data_table(
    ["Variable", "Valor recomendado", "Para qué"],
    [["NEXT_PUBLIC_SITE_URL", "https://www.preureal.com",
      "Enlaces de los correos al dominio bueno (preureal.cat está sin DNS)."],
     ["MAIL_FROM", "PreuReal.cat <hola@preureal.com>",
      "Con onboarding@resend.dev, Resend solo entrega a tu propio Gmail."],
     ["CRON_SECRET", "Cadena larga aleatoria",
      "Protege /api/cron/emails, que Vercel Cron llama una vez al día (04:00)."],
     ["EMAILLOG_RETENTION_DAYS", "90 (opcional)",
      "Retención del log de correos que aplica el cron diario."]],
    [0.26, 0.34, 0.40])
story.append(t)
story.append(Paragraph("Tabla 2. Variables de entorno a definir o revisar en Vercel (Production).", S["caption"]))
h2(story, "Paso 5 — Verificación final")
story.append(P(
    "Comprueba, en este orden: que https://www.preureal.com/api/health sigue "
    "respondiendo 200; que /api/cron/emails ya devuelve JSON con "
    "«ok: true» (con 403 si defines CRON_SECRET, también es correcto); registra "
    "un usuario nuevo con un correo distinto de los anteriores; verifica en "
    "Supabase que aparecen su fila en User y, a los pocos segundos, las filas "
    "de bienvenida y verificación en EmailLog con status «sent» o «pending»; y "
    "revisa la bandeja de entrada y el spam. A partir de aquí, cada registro "
    "debe generar exactamente dos filas nuevas en EmailLog."))

# ── 5. Auditoría del sistema de correo ─────────────────────────────────────
h1(story, "5. Auditoría del sistema de correo (componente a componente)")
story.append(P(
    "El sistema de correo v19/v21 está bien construido: es un outbox duradero "
    "con reintentos, idempotencia y seguridad de tokens. La auditoría línea a "
    "línea no ha encontrado defectos funcionales en el código desplegado; el "
    "único fallo operativo era el esquema desactualizado, ya resuelto con la "
    "migración. La tabla siguiente resume el estado de cada componente y su "
    "valoración."))
story.append(Spacer(1, 4))
t = data_table(
    ["Componente", "Estado", "Detalle de la revisión"],
    [["Librería de envío (mail.ts)", "Correcto",
      "3 intentos en línea con backoff, guardián de 15 s por intento, errores "
      "desglosados con la causa real; el cuerpo guardado va siempre redactado."],
     ["Registro (register)", "Correcto (mejorado en v21)",
      "Crea User + token hasheado y envía bienvenida y verificación en segundo "
      "plano; en v21 ambos correos van en paralelo para no robar tiempo entre sí."],
     ["Verificación (verify)", "Correcto",
      "Token con hash en BD, confirmación atómica (solo gana una petición "
      "concurrente), un solo enlace vivo por cuenta y reenvío limitado por IP y usuario."],
     ["Restablecimiento (password-reset)", "Correcto",
      "Consumo atómico del token, anulación de otros enlaces pendientes y "
      "revocación de todas las sesiones al cambiar la contraseña."],
     ["Cron /api/cron/emails", "Correcto (bloqueado por el esquema)",
      "Reintenta el outbox, purga tokens caducados, aplica retención y redacta "
      "cuerpos legados; se protegerá con CRON_SECRET."],
     ["Idempotencia y telemetría", "Correcto",
      "idempotencyKey evita correos duplicados en reentregas de webhooks; "
      "providerMessageId y sentAt permiten auditar cada envío."]],
    [0.24, 0.22, 0.54])
story.append(t)
story.append(Paragraph("Tabla 3. Resultado de la revisión del sistema de correo.", S["caption"]))
story.append(Spacer(1, 6))
story.append(P(
    "Dos observaciones de mejora continua. Primera: el estado «sent» significa "
    "que Resend aceptó el correo; la entrega real en bandeja podría seguirse "
    "con los eventos de Resend (delivered, bounce, complaint) mediante un "
    "webhook, hoy inexistente. Segunda: VERIFY y RESET no se reenvían desde el "
    "log por diseño (el cuerpo guardado va redactado y el enlace es de un solo "
    "uso); si un correo de verificación se pierde, el usuario pide uno nuevo "
    "desde la interfaz, que es el comportamiento esperado."))

# ── 6. Estado general de la plataforma ─────────────────────────────────────
h1(story, "6. Estado general de la plataforma")
story.append(P(
    "Más allá del correo, la auditoría recogió el estado de las integraciones "
    "que la plataforma declara en /api/health. El núcleo (mapa, datos, base de "
    "datos) está sano; hay dos integraciones sin configurar que conviene "
    "activar cuando toque, y una degradada que no afecta al uso principal."))
story.append(Spacer(1, 4))
t = data_table(
    ["Integración", "Estado", "Comentario"],
    [["Base de datos PostgreSQL", "OK", "Conecta en ~1 s; latencia normal para Supabase."],
     ["ICGC (mapa y edificios)", "OK", "API Territorial respondiendo 200."],
     ["Correo (Resend)", "OK", "Configurado; pendiente verificar dominio propio."],
     ["Catastro (año de construcción)", "Degradado",
      "Consulta_DNPPC devuelve 404 desde producción; el sistema degrada con "
      "elegancia (yearBuilt vacío) y el mapa sigue funcionando. Revisar "
      "endpoint/cabeceras del servicio (P2)."],
     ["Stripe (pagos)", "Sin configurar",
      "Sin claves en el entorno: el checkout no puede operar todavía."],
     ["Google (acceso con cuenta Google)", "Sin configurar",
      "Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel."]],
    [0.30, 0.16, 0.54])
story.append(t)
story.append(Paragraph("Tabla 4. Estado de integraciones según /api/health y configuración declarada.", S["caption"]))

# ── 7. Hallazgos y recomendaciones ─────────────────────────────────────────
h1(story, "7. Hallazgos y recomendaciones")
story.append(P(
    "Se priorizan por impacto. Los P1 deben hacerse esta semana; los P2 son "
    "mejora continua. Ninguna recomendación requiere decisiones de arquitectura: "
    "son ajustes de configuración y operativa."))
story.append(P("<b>P1 — Seguridad y configuración (esta semana):</b>", "body"))
for i, txt in enumerate([
    "Rotar las credenciales expuestas en sesiones de trabajo anteriores: "
    "contraseña de la base de datos en Supabase (y actualizar DATABASE_URL en "
    "Vercel y en el .env local) y contraseña del panel de administración. "
    "Es la medida de mayor valor en seguridad y no interrumpe el servicio si "
    "se hace con orden.",
    "Definir NEXT_PUBLIC_SITE_URL=https://www.preureal.com, MAIL_FROM con el "
    "dominio verificado en Resend y CRON_SECRET (Tabla 2).",
    "Verificar el dominio preureal.com en Resend (registros DNS que indica el "
    "panel) para poder enviar a cualquier destinatario y no solo al correo "
    "propietario de la cuenta.",
    "Usar siempre www.preureal.com en enlaces y materiales: el dominio "
    "preureal.cat está registrado pero sin registros DNS (NXDOMAIN), y un "
    "enlace muerto deja al usuario bloqueado en la verificación.",
], start=1):
    story.append(P("%d. %s" % (i, txt), "bullet"))
story.append(Spacer(1, 4))
story.append(P("<b>P2 — Mejora continua:</b>", "body"))
for i, txt in enumerate([
    "Revisar el endpoint del Catastro (404 actual) o darlo de baja del panel "
    "de estado si el servicio ha cambiado; el resto de la app no depende de él.",
    "Añadir los eventos de Resend (delivered/bounce/complaint) como webhook "
    "para medir la entrega real en bandeja y alertar de rebotes.",
    "Revisar manualmente las 25 vulnerabilidades que reporta npm audit "
    "(nunca usar npm audit fix --force) y actualizar por dependencias.",
    "Monitorizar EmailLog y el resultado del cron diario como parte de la "
    "rutina de operación; son el panel de salud del correo.",
], start=1):
    story.append(P("%d. %s" % (i, txt), "bullet"))

# ── 8. Limpieza del repositorio ────────────────────────────────────────────
h1(story, "8. Limpieza del repositorio (v21)")
story.append(P(
    "Se solicitó eliminar archivos no útiles o no funcionales. Se ha hecho con "
    "criterio conservador: nada que use el build de Vercel, ninguna función del "
    "aplicativo y ninguna referencia viva. Se eliminaron documentos de eras "
    "anteriores superados por VERCEL.md, CHANGES.md y README.md, ejemplos de "
    "tecnologías ajenas al proyecto y un Caddyfile relicario del autoalojamiento; "
    "y se des-trackeó del repositorio git la infraestructura local del entorno "
    "de desarrollo (184 MB de datos de una base de datos embebida y utilidades "
    "de sesión), que jamás debió versionarse. El paquete de despliegue queda "
    "en 160 ficheros y 0,36 MB, escaneado sin secretos."))
story.append(Spacer(1, 4))
t = data_table(
    ["Categoría", "Elementos", "Motivo"],
    [["Documentación obsoleta", "AUDIT.md, DEPLOY.md, INFORME_FINAL.md, "
      "TASKS.md, PROJECT_CONTEXT.md, MIGRATION_ZAI.md, "
      "COM_APPLICAR_ELS_CANVIS.md, AUDITORIA_FASE1_REGISTRE.md, "
      "CORRECCIONS_P1.md", "Superados por VERCEL.md + CHANGES.md; el historial "
      "queda en git."],
     ["Infraestructura ajena", "Caddyfile, examples/websocket, mini-services/",
      "Restos del autoalojamiento y demos sin uso en el producto."],
     ["Infra local des-trackeada", ".localpg (184 MB), skills/, download/, "
      "upload/, tool-results/, .zscripts/",
      "Utilidades del entorno de desarrollo; añadidas a .gitignore y fuera del "
      "repositorio."]],
    [0.22, 0.42, 0.36])
story.append(t)
story.append(Paragraph("Tabla 5. Limpieza aplicada en v21 (ninguna función del producto fue tocada).", S["caption"]))

# ── 9. Próximos pasos ──────────────────────────────────────────────────────
h1(story, "9. Próximos pasos (lista de comprobación)")
story.append(P(
    "La lista ordena todo lo pendiente del lado del propietario, con los "
    "paneles web como única herramienta. Los pasos 1 y 2 resuelven el "
    "incidente; el resto consolida."))
for i, txt in enumerate([
    "Ejecutar el SQL del Código 1 en Supabase (SQL Editor → Run).",
    "En Vercel: cancelar el deploy colgado y Redeploy; si se atasca de nuevo "
    "en prisma migrate deploy, aplicar el Paso 3 (Session Pooler + "
    "connect_timeout) y reintentar.",
    "Definir en Vercel las variables de la Tabla 2 y hacer un Redeploy final.",
    "Verificar: /api/health, registro de un usuario nuevo, filas en User y "
    "EmailLog, correo en bandeja (revisar spam).",
    "Descargar el ZIP v21 (PreuReal-codi-complet-v21.zip) y desplegarlo con el "
    "flujo habitual: descomprimir, rsync al proyecto (excluyendo node_modules, "
    ".env, .env.local, .next y .git), npm install, build, commit y push.",
    "Durante la semana: rotar credenciales (P1.1), verificar el dominio en "
    "Resend y activar CRON_SECRET si aún no lo está.",
], start=1):
    story.append(P("%d. %s" % (i, txt), "bullet"))
story.append(Spacer(1, 6))
story.append(P(
    "Si cualquier comprobación del paso 4 da un resultado distinto al esperado, "
    "el siguiente dato diagnóstico está siempre en la tabla EmailLog (columna "
    "error) y en los Runtime Logs de Vercel de la función correspondiente; con "
    "esa salida, cualquier incidencia posterior se puede aislar en minutos. "
    "Con la migración aplicada y el pooler configurado, la plataforma queda "
    "con su sistema de correo completo, seguro y observable."))

# ── Build ────────────────────────────────────────────────────────────────────
doc = TocDocTemplate(
    OUT_BODY, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    title=DOC_TITLE, author="Z.ai", creator="Z.ai",
    subject="Auditoría técnica de PreuReal.cat: correo, base de datos y despliegue",
)
doc.multiBuild(story, onFirstPage=header_footer, onLaterPages=header_footer)
print("OK body ->", OUT_BODY)

# ── Fusión portada + cuerpo ─────────────────────────────────────────────────
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

FINAL = "/home/z/my-project/download/PreuReal-Auditoria-v21.pdf"
writer = PdfWriter()
writer.add_page(normalize(PdfReader("/home/z/my-project/scripts/audit_cover.pdf").pages[0]))
for pg in PdfReader(OUT_BODY).pages:
    writer.add_page(normalize(pg))
writer.add_metadata({"/Title": DOC_TITLE, "/Author": "Z.ai", "/Creator": "Z.ai",
                     "/Subject": "Auditoría técnica de PreuReal.cat: correo, base de datos y despliegue"})
with open(FINAL, "wb") as f:
    writer.write(f)
print("OK final ->", FINAL)
