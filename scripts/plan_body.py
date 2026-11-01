#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PreuReal.cat · Plan de negocio (cuerpo ReportLab, paleta Template 07 Crystal Blue)."""
import os, sys, hashlib

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, KeepTogether, CondPageBreak, Image)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ---------- Fuentes (solo las permitidas) ----------
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback
install_font_fallback()

# ---------- Paleta fija Template 07 (Crystal Blue, cuerpo claro) ----------
PAGE_BG    = colors.HexColor("#f5f8fc")
SECTION_BG = colors.HexColor("#edf2f9")
CARD_BG    = colors.HexColor("#e4ecf5")
STRIPE     = colors.HexColor("#eef3fa")
HEADER_FILL= colors.HexColor("#1a4a7a")
BORDER     = colors.HexColor("#c0d0e2")
ACCENT     = colors.HexColor("#2d7ab3")
TEXT       = colors.HexColor("#142840")
MUTED      = colors.HexColor("#5a7a96")

M = 0.9 * inch
AVAIL = A4[0] - 2 * M
avail_h = A4[1] - 2 * M

# ---------- Estilos ----------
def st(name, **kw):
    base = dict(fontName="FreeSerif", fontSize=10.5, leading=16, textColor=TEXT,
                alignment=TA_JUSTIFY, spaceBefore=0, spaceAfter=8)
    base.update(kw)
    return ParagraphStyle(name, **base)

S_H1   = st("H1", fontSize=20, leading=25, alignment=TA_LEFT, spaceBefore=18, spaceAfter=4, textColor=HEADER_FILL)
S_H2   = st("H2", fontSize=14, leading=19, alignment=TA_LEFT, spaceBefore=14, spaceAfter=6, textColor=HEADER_FILL)
S_H3   = st("H3", fontSize=11.5, leading=16, alignment=TA_LEFT, spaceBefore=10, spaceAfter=5, textColor=TEXT)
S_BODY = st("Body", spaceAfter=9)
S_LEAD = st("Lead", fontSize=11.5, leading=18, textColor=TEXT, spaceAfter=10)
S_BUL  = st("Bullet", leftIndent=14, spaceAfter=5, alignment=TA_LEFT)
S_CAP  = st("Caption", fontSize=8.5, leading=12, textColor=MUTED, alignment=TA_CENTER, spaceAfter=0, spaceBefore=0)
S_QUOTE= st("Quote", fontName="FreeSerif-Italic", fontSize=11, leading=17, leftIndent=24,
            textColor=MUTED, alignment=TA_LEFT, spaceAfter=10)
S_TH   = st("TH", fontSize=9.5, leading=13, textColor=colors.white, alignment=TA_CENTER, spaceAfter=0)
S_TC   = st("TC", fontSize=9.5, leading=13, alignment=TA_LEFT, spaceAfter=0)
S_TCC  = st("TCC", fontSize=9.5, leading=13, alignment=TA_CENTER, spaceAfter=0)
S_TCR  = st("TCR", fontSize=9.5, leading=13, alignment=TA_RIGHT, spaceAfter=0)
S_STAT = st("Stat", fontName="FreeSerif-Bold", fontSize=20, leading=24, textColor=ACCENT, alignment=TA_CENTER, spaceAfter=0)
S_STATL= st("StatL", fontSize=8.5, leading=11, textColor=MUTED, alignment=TA_CENTER, spaceAfter=0)

# ---------- Plantilla con TOC ----------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            # solo capítulos (H1) en el índice: los H2 largos lo desbordan
            if level == 0:
                text = getattr(flowable, "bookmark_text", "")
                key = getattr(flowable, "bookmark_key", "")
                self.notify("TOCEntry", (level, text, self.page, key))

TOC_PAGES = 1  # se verifica tras la build

def on_page(canv, doc):
    canv.saveState()
    page = canv.getPageNumber()
    # cabecera: título + regla
    canv.setFont("FreeSerif", 7.5)
    canv.setFillColor(MUTED)
    canv.drawString(M, A4[1] - 0.55 * inch, "PreuReal.cat · Plan de negocio")
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(1.2)
    canv.line(M, A4[1] - 0.62 * inch, A4[0] - M, A4[1] - 0.62 * inch)
    # pie: autor + número (portada oculta; índice romano; cuerpo arábigo desde 1)
    canv.setFont("FreeSerif", 7.5)
    canv.setFillColor(MUTED)
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.5)
    canv.line(M, 0.62 * inch, A4[0] - M, 0.62 * inch)
    canv.drawString(M, 0.45 * inch, "Documento interno del promotor")
    if page <= TOC_PAGES:
        num = ["i", "ii", "iii", "iv"][page - 1]
    else:
        num = str(page - TOC_PAGES)
    canv.drawRightString(A4[0] - M, 0.45 * inch, num)
    canv.restoreState()

def H(text, level=0, style=S_H1):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1(story, text):
    story.append(CondPageBreak(avail_h * 0.25))
    story.append(H(text, 0, S_H1))
    story.append(HR())

def HR():
    t = Table([[""]], colWidths=[AVAIL], rowHeights=[2])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.2, ACCENT),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t

def bullets(story, items):
    for it in items:
        story.append(Paragraph(f'<font color="#2d7ab3">•</font>  {it}', S_BUL))
    story.append(Spacer(1, 4))

def table(story, header, rows, ratios, caption=None, align_map=None):
    """Tabla con celdas Paragraph, cabecera HEADER_FILL y bandas STRIPE."""
    widths = [r * AVAIL for r in ratios]
    assert abs(sum(ratios) - 1.0) < 0.01
    data = [[Paragraph(f"<b>{h}</b>", S_TH) for h in header]]
    for r in rows:
        line = []
        for i, c in enumerate(r):
            style = S_TC
            if align_map:
                a = align_map[i]
                style = {"l": S_TC, "c": S_TCC, "r": S_TCR}[a]
            line.append(Paragraph(str(c), style))
        data.append(line)
    t = Table(data, colWidths=widths, hAlign="CENTER", repeatRows=1)
    styles = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
    ]
    for i in range(1, len(data)):
        styles.append(("BACKGROUND", (0, i), (-1, i), colors.white if i % 2 else STRIPE))
    t.setStyle(TableStyle(styles))
    story.append(Spacer(1, 12))
    story.append(t)
    if caption:
        story.append(Spacer(1, 6))
        story.append(Paragraph(caption, S_CAP))
    story.append(Spacer(1, 14))

def callout_row(story, items):
    """Fila de 2-3 métricas: UNA sola tabla de n columnas (sin anidar)."""
    n = len(items)
    big_row = []
    label_row = []
    for big, label in items:
        big_row.append(Paragraph(f"<b>{big}</b>", S_STAT))
        label_row.append(Paragraph(label, S_STATL))
    w = AVAIL / n
    t = Table([big_row, label_row], colWidths=[w] * n, hAlign="CENTER")
    styles = [
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]
    for i in range(n):
        styles.append(("BOX", (i, 0), (i, 1), 1, ACCENT))
    t.setStyle(TableStyle(styles))
    story.append(Spacer(1, 10))
    story.append(t)
    story.append(Spacer(1, 12))

def chart(story, path, caption, max_h=250):
    from PIL import Image as PILImage
    im = PILImage.open(path)
    ow, oh = im.size
    ratio = min(AVAIL / ow, max_h / oh, 1.0)
    img = Image(path, width=ow * ratio, height=oh * ratio)
    story.append(Spacer(1, 16))
    story.append(KeepTogether([img, Spacer(1, 8), Paragraph(caption, S_CAP)]))
    story.append(Spacer(1, 16))

# ============================================================
# CONSTRUCCIÓN DEL DOCUMENTO
# ============================================================
out = "/home/z/my-project/data/plan_cuerpo.pdf"
doc = TocDocTemplate(out, pagesize=A4, leftMargin=M, rightMargin=M,
                     topMargin=0.95 * inch, bottomMargin=0.85 * inch,
                     title="PreuReal.cat · Plan de negocio",
                     author="Z.ai", creator="Z.ai",
                     subject="Plan de negocio completo de la plataforma del precio real del alquiler en Cataluña")
story = []

# ---------- Índice ----------
story.append(Paragraph("<b>Índice</b>", st("TocTitle", fontSize=20, leading=25, textColor=HEADER_FILL, alignment=TA_LEFT, spaceAfter=14)))
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle(name="TOC1", fontName="FreeSerif", fontSize=11, leading=22, leftIndent=4, textColor=TEXT),
    ParagraphStyle(name="TOC2", fontName="FreeSerif", fontSize=9.5, leading=14, leftIndent=20, textColor=MUTED),
]
story.append(toc)
story.append(PageBreak())

# ---------- 1. Resumen ejecutivo ----------
h1(story, "1. Resumen ejecutivo")
story.append(Paragraph(
    "PreuReal.cat es una plataforma web que cruza, sobre un mapa interactivo, dos fuentes oficiales que hoy "
    "nadie ha unido a nivel de manzana: el registro de fianzas de alquiler del Incasòl (explotado estadísticamente "
    "por la Generalitat) y la cartografía catastral de edificios (ICGC y Cadastre). El usuario busca cualquier "
    "municipio de Cataluña, hace clic sobre un edificio real y ve el precio medio de alquiler registrado "
    "oficialmente, la referencia catastral del inmueble, el año de construcción cuando el servicio del Cadastre "
    "está accesible y si el municipio está declarado área de mercado residencial tensionado con regulación de "
    "precios vigente.", S_LEAD))
story.append(Paragraph(
    "El producto ya está construido y funcionando con datos reales: 948 municipios cargados, 692 con precio medio "
    "de alquiler (fianzas Incasòl hasta el primer trimestre de 2026), 170 municipios con la marca de zona tensada "
    "según las resoluciones vigentes del DOGC (TER/3739/2026 y TER/3740/2026, de octubre de 2026), edificios reales "
    "de la cartografía del ICGC y registro de usuarios con planes de suscripción. La web es bilingüe (catalán y "
    "castellano), está optimizada para móviles y lleva un panel de administración con el embudo de conversión completo.", S_BODY))
callout_row(story, [
    ("948", "municipios de Cataluña en la base de datos"),
    ("692", "con precio real de fianzas (Incasòl)"),
    ("170", "municipios tensados (DOGC 19-10-2026)"),
])
story.append(Paragraph(
    "El modelo de negocio es freemium híbrido: el mapa es gratuito, las consultas detalladas se limitan a tres al "
    "mes para usuarios gratuitos, el plan Premium (7,99 €/mes) las hace ilimitadas y el plan Pro (19,99 €/mes) "
    "añade exportación de datos para agentes. Con estructura de costes casi nula en la fase de arranque (capas "
    "gratuitas y datos públicos), el punto de equilibrio en caja se alcanza con un único suscriptor; incluso "
    "asumiendo un hosting de pago de unos 21 €/mes, bastarían tres. Esto no significa que la rentabilidad esté "
    "garantizada: la demanda es una hipótesis que hay que validar con usuarios reales, y este documento lo dice "
    "explícitamente en el capítulo de riesgos.", S_BODY))
story.append(Paragraph(
    "Los pagos reales permanecen desactivados hasta que el promotor conecte su cuenta de Stripe y lo autorice; "
    "el proceso de compra se ha probado en modo de simulación. Ninguna campaña de pago, servicio de suscripción "
    "ni gasto se ha contratado sin autorización expresa, conforme a las reglas fijadas para este proyecto.", S_BODY))

# ---------- 2. El problema y la oportunidad ----------
h1(story, "2. El problema y la oportunidad")
story.append(H("2.1 El problema: datos públicos, experiencias imposibles", 1, S_H2))
story.append(Paragraph(
    "Toda la información que un inquilino necesita para saber si le están cobrando de más existe, pero está "
    "diseñada para estadísticos, no para personas. El Incasòl publica la explotación estadística de las fianzas "
    "de alquiler en hojas de Excel por municipio y por período, sin mapa, sin comparador y sin histórico visual. "
    "La sede del Cadastre, por su parte, es una web institucional difícil de usar para consultas rápidas, y la "
    "cartografía del ICGC es una infraestructura para profesionales. La lista de municipios con regulación de "
    "precios se publica como resoluciones en el DOGC y como páginas alfabéticas que hay que cruzar a mano.", S_BODY))
story.append(Paragraph(
    "El resultado: una persona que va a firmar un alquiler en, por ejemplo, Salt o Mataró no tiene ninguna forma "
    "rápida de responder a la pregunta «¿los 950 euros que me piden por este piso están por encima del mercado "
    "real registrado?». Los portales inmobiliarios muestran precios de oferta (lo que el propietario pide), no "
    "los precios realmente registrados en fianzas, y no muestran la media oficial de referencia del municipio.", S_BODY))
story.append(H("2.2 El contexto legal que lo hace urgente", 1, S_H2))
story.append(Paragraph(
    "Desde la Ley 12/2023, de 24 de mayo, por el derecho a la vivienda, los municipios declarados zonas de mercado "
    "residencial tensionado pueden limitar el precio de los nuevos contratos mediante el índice de referencia. "
    "La Generalitat mantiene estas declaraciones con revisiones anuales: el 19 de octubre de 2026 el DOGC publicó "
    "la prórroga para 118 municipios (Resolución TER/3739/2026) y una nueva declaración para 53 municipios "
    "(Resolución TER/3740/2026); 22 municipios de la primera lista salieron de la declaración. Cada revisión "
    "genera confusión y búsquedas masivas — exactamente el momento en que una herramienta clara gana usuarios.", S_BODY))
chart(story, "/home/z/my-project/data/chart_bcn_hist.png",
      "Figura 1. Precio medio real del alquiler en Barcelona según fianzas Incasòl (€/mes, 2005-2025). "
      "Fuente: habitatge.gencat.cat. +54 % en diez años.")
story.append(Paragraph(
    "El gráfico muestra por qué el producto conecta: el alquiler real de Barcelona ha crecido un 54 % en una "
    "década (de 735 a 1.135 €/mes según fianzas registradas). El interés por saber qué es «normal» pagar nunca "
    "ha sido mayor, y las listas de zonas tensadas vuelven al debate público cada año.", S_BODY))
story.append(H("2.3 La oportunidad", 1, S_H2))
story.append(Paragraph(
    "No existe hoy ninguna aplicación privada que cruce fianzas Incasòl y cartografía catastral manzana a "
    "manzana y lo presente con una experiencia simple y bilingüe. La oportunidad de PreuReal.cat es ocupar ese "
    "espacio con un producto gratuito de entrada, viral por diseño (cada comparación es capturable para "
    "compartir) y monetizado de forma ligera. Las barreras de entrada tecnológicas son bajas para un equipo "
    "pequeño con los datos abiertos correctos, y la ventaja competitiva se construye sobre la marca de "
    "transparencia y la ejecución continua (datos siempre actualizados).", S_BODY))

# ---------- 3. El producto ----------
h1(story, "3. El producto: qué está construido hoy")
story.append(Paragraph(
    "La primera versión es una aplicación web completa, no una maqueta. Está desplegada en un entorno de "
    "previsualización y se ha verificado de extremo a extremo: registro, mapa, consultas, cuota gratuita, muro de "
    "pago, compra simulada, panel de administración y correos automáticos. Este capítulo describe qué hace y con "
    "qué datos reales trabaja.", S_BODY))
story.append(H("3.1 Funcionalidades implementadas", 1, S_H2))
bullets(story, [
    "<b>Mapa interactivo de Cataluña</b> con base cartográfica del ICGC y manzanas/edificios reales coloreados por el precio medio real del municipio.",
    "<b>Buscador de los 948 municipios</b> con vuelo al límite municipal real (polígono ICGC cacheado) y precios en los resultados.",
    "<b>Consulta detallada al hacer clic</b>: precio medio real (€/mes y período), número de contratos con fianza, tendencia interanual, referencia catastral real, año de construcción (si el Cadastre responde) y distintivo de zona tensada con su resolución DOGC.",
    "<b>Comparador «¿estás pagando de más?»</b>: introduce la renta ofertada y la superficie; devuelve el porcentaje por encima o por debajo de la media real.",
    "<b>Informe de precio</b>: el usuario puede reportar lo que le ofrecen (crowdsourcing para futuras fases).",
    "<b>Freemium con cuota</b>: invitados ven teaser difuminado; usuarios gratuitos tienen 3 consultas/mes; Premium y Pro ilimitadas. Muro de pago integrado en el panel.",
    "<b>Cuentas de usuario</b>: registro, entrada, restablecimiento de contraseña, sesión con JWT y contraseñas cifradas (bcrypt).",
    "<b>Suscripciones Stripe</b>: checkout y webhooks implementados; pendientes de activar con la cuenta del promotor (modo prueba disponible y claramente etiquetado).",
    "<b>Correos automáticos</b>: bienvenida, recibo y restablecimiento; en modo sandbox se archivan en el panel de administración hasta conectar proveedor.",
    "<b>Panel de administración</b>: KPIs, embudo de 30 días, gestión de usuarios y planes, log de correos, importador JSON de datos a nivel de manzana y estado de integraciones.",
    "<b>Bilingüe ca/es</b> con conmutador y textos completos en ambos idiomas; SEO (metadatos, sitemap, robots, datos estructurados) y diseño móvil con panel inferior deslizable.",
])
story.append(H("3.2 Datos reales integrados", 1, S_H2))
table(story,
      ["Fuente", "Contenido", "Licencia / acceso"],
      [
        ["Incasòl vía habitatge.gencat.cat", "Precio medio mensual por municipio y número de contratos (2005 - 2026-T1)", "Publicación estadística oficial, acceso libre"],
        ["Idescat / Gencat (dataset open data)", "Listado de municipios, comarca y centroides", "Llicència Oberta de Catalunya"],
        ["ICGC — API Territorial (RTT)", "Polígonos reales de edificios y manzanas, límites municipales", "CC-BY 4.0"],
        ["ICGC — parcelas catastrales", "Referencia catastral real por punto", "Reutilización pública"],
        ["Cadastre (servicios libres)", "Año de construcción por parcela (con degradación elegante si no responde)", "Servicios libres DGC"],
        ["DOGC — Resoluciones TER/3739/2026 y TER/3740/2026", "170 municipios con regulación vigente", "BOE/DOGC público"],
      ],
      [0.30, 0.45, 0.25],
      caption="Tabla 1. Fuentes de datos integradas en la primera versión.")
story.append(Paragraph(
    "Lo único que requiere acuerdo comercial es el dato de fianza a nivel de manzana individual (el Incasòl "
    "publica medias agregadas por municipio). El producto ya está preparado para ello: el panel de administración "
    "incluye un importador que cargará ese dato sin tocar código, y mientras tanto la media municipal oficial se "
    "presenta con su período y muestra, sin inventar nada.", S_BODY))

# ---------- 4. Público objetivo ----------
h1(story, "4. Público objetivo")
story.append(Paragraph(
    "El producto apunta a tres perfiles con la misma necesidad de fondo: contrastar un precio de alquiler con el "
    "dato oficial antes de decidir. Están ordenados por prioridad de captación.", S_BODY))
table(story,
      ["Perfil", "Quién es", "Qué necesita", "Cuándo paga"],
      [
        ["1. Buscador de piso", "25-40 años, urbano, busca en Idealista/Fotocasa y visita 5-10 pisos", "Filtrar pisos caros antes de perder tiempo; argumento para negociar", "Premium cuando la búsqueda se intensifica (2-4 semanas)"],
        ["2. Inquilino que renueva", "Ya vive en el piso; recibe la actualización de renta", "Saber si la subida propuesta es abusiva frente a la media real y al índice", "Premium puntual en el mes de renovación"],
        ["3. Agente / gestor / administrador", "Profesional que informa clientes a diario", "Dato oficial citable, histórico por municipio, exportación", "Pro recurrente como herramienta de trabajo"],
      ],
      [0.16, 0.28, 0.30, 0.26],
      caption="Tabla 2. Perfiles de cliente y momento de pago.")
story.append(Paragraph(
    "Hay dos audiencias secundarias que no pagan pero sí amplifican: periodistas locales que ilustran noticias de "
    "alquiler (el gráfico histórico por municipio es material directo) y entidades de inquilinato que usan la "
    "plataforma para asesorar. Alimentarlas con acceso gratuito y material citable es parte de la estrategia de "
    "captación del capítulo 8.", S_BODY))

# ---------- 5. Modelo de negocio y precios ----------
h1(story, "5. Modelo de negocio y precios")
story.append(H("5.1 Planes", 1, S_H2))
table(story,
      ["Plan", "Precio", "Qué incluye", "Objetivo"],
      [
        ["Gratuït", "0 €", "Mapa completo, 3 consultas detalladas/mes, comparador, marca de zona tensada", "Adquisición y viralidad; alimenta el embudo"],
        ["Premium", "7,99 €/mes", "Consultas ilimitadas, histórico 2005-2026 del municipio, tendencia, comparador avanzado", "Conversión del buscador activo"],
        ["Pro (agentes)", "19,99 €/mes", "Todo Premium + exportación CSV por municipio + acceso prioritario a nuevos datos", "B2B recurrente con baja rotación"],
      ],
      [0.12, 0.13, 0.47, 0.28],
      caption="Tabla 3. Planes de PreuReal.cat (IVA no incluido; gestiona el que corresponda).")
story.append(H("5.2 Por qué estos precios", 1, S_H2))
story.append(Paragraph(
    "El ancla psicológica del producto es el precio del alquiler que se está decidiendo: entre 600 y 1.500 €/mes. "
    "Frente a esa cifra, 7,99 € es una decisión de impulso si la herramienta responde en el momento justo (visita "
    "al piso, renovación de contrato). Un precio de entrada de 4,99 € habría generado menos margen con la misma "
    "fricción; 12 € o más exigiría justificación profesional. El plan Pro se ancla a un coste menor que una hora "
    "de trabajo del agente y se justifica con una sola exportación útil. La estructura de tres planes también "
    "establece un efecto ancla entre Premium y Pro que favorece la conversión al intermedio.", S_BODY))
story.append(H("5.3 Economía unitaria", 1, S_H2))
callout_row(story, [
    ("7,62 €", "neto por suscriptor Premium/mes (95,4 % tras comisión Stripe)"),
    ("19,44 €", "neto por suscriptor Pro/mes (97,2 %)"),
    ("0 €", "coste variable por consulta (capas gratuitas de datos)"),
])
story.append(Paragraph(
    "Las comisiones usadas (1,5 % + 0,25 € por pago con tarjeta del EEE) son las tarifas estándar publicadas por "
    "Stripe para España. No hay coste variable por consulta: los servicios de datos usados (Gencat, ICGC, "
    "Cadastre) son públicos y gratuitos en los volúmenes previstos, y la caché propia reduce las llamadas "
    "repetidas. El margen bruto por suscriptor es, por tanto, del orden del 95-97 %.", S_BODY))

# ---------- 6. Costes, márgenes y punto de equilibrio ----------
h1(story, "6. Costes, márgenes y punto de equilibrio")
story.append(H("6.1 Estructura de costes", 1, S_H2))
table(story,
      ["Concepto", "Arranque (hoy)", "Crecimiento moderado", "Nota"],
      [
        ["Dominio .cat", "1,25 €/mes (15 €/año)", "1,25 €/mes", "Único gasto casi seguro; requiere autorización para comprarlo"],
        ["Hosting", "0 € (capa gratuita)", "5-21 €/mes (VPS o Vercel Pro)", "Sube cuando el tráfico lo exija"],
        ["Correo transaccional", "0 € (modo sandbox)", "0 € hasta 3.000 envíos/mes (Resend free)", "Proveedor por conectar; requiere autorización"],
        ["Datos (Gencat, ICGC, Cadastre)", "0 €", "0 €", "Servicios públicos; convenio solo para datos a nivel de manzana"],
        ["Stripe", "0 € fijo", "0 € fijo", "Solo comisión por cobro (1,5 % + 0,25 €)"],
        ["Publicidad", "0 €", "0 €", "Prohibido gastar sin autorización expresa"],
      ],
      [0.24, 0.20, 0.26, 0.30],
      caption="Tabla 4. Estructura de costes por escenario. El promotor autoriza cualquier gasto antes de contratarlo.")
story.append(H("6.2 Punto de equilibrio", 1, S_H2))
chart(story, "/home/z/my-project/data/chart_breakeven.png",
      "Figura 2. Ingresos netos mensuales frente a costes fijos por escenario, con mix 85 % Premium / 15 % Pro.",
      max_h=265)
story.append(Paragraph(
    "Con costes fijos de arranque de apenas 1,25 €/mes (el dominio), un solo suscriptor Premium cubre el gasto en "
    "caja. Con un plan de hosting de pago tipo Vercel Pro (21,25 €/mes con dominio) el equilibrio llega con 3 "
    "suscriptores. Esto es una consecuencia directa de minimizar la inversión inicial, no una promesa de ventas: "
    "conseguir el primer suscriptor exige ejecutar la estrategia del capítulo 8 con disciplina.", S_BODY))
story.append(H("6.3 Escenarios de ingresos", 1, S_H2))
table(story,
      ["Suscriptores", "Bruto/mes", "Comisiones", "Neto/mes", "Beneficio con VPS"],
      [
        ["5", "51,95 €", "2,03 €", "49,92 €", "43,67 €"],
        ["10", "103,90 €", "4,06 €", "99,84 €", "93,59 €"],
        ["25", "247,75 €", "9,97 €", "237,78 €", "231,53 €"],
        ["50", "495,50 €", "19,94 €", "475,56 €", "469,31 €"],
        ["100", "979,00 €", "39,70 €", "939,30 €", "933,05 €"],
        ["200", "1.958,00 €", "79,40 €", "1.878,60 €", "1.872,35 €"],
      ],
      [0.18, 0.20, 0.18, 0.20, 0.24],
      caption="Tabla 5. Escenarios con mix 85 % Premium / 15 % Pro. Cifras antes de impuestos del promotor.",
      align_map=["c", "r", "r", "r", "r"])
story.append(Paragraph(
    "Estos escenarios son cálculos aritméticos, no previsiones de demanda. Su utilidad es doble: dimensionar "
    "cuándo el negocio cubre costes crecientes (por ejemplo, a 200 suscriptores conviene pasar a un hosting más "
    "robusto, que sigue siendo marginal) y decidir con datos si invertir en captación de pago cuando el promotor "
    "lo autorice.", S_BODY))

# ---------- 7. Datos y marco legal ----------
h1(story, "7. Datos y marco legal")
story.append(H("7.1 Qué dato necesita acuerdo y cuál no", 1, S_H2))
story.append(Paragraph(
    "Todo lo que muestra hoy la plataforma procede de fuentes públicas con reutilización legítima y citada: "
    "estadística de fianzas publicada por la Generalitat, cartografía ICGC con licencia CC-BY 4.0, referencia "
    "catastral vía servicios públicos y listados del DOGC. El paso siguiente del producto — el precio medio por "
    "manzana individual — requiere un dato que el Incasòl no publica de forma abierta a ese nivel. El camino es "
    "solicitar el dato agregado (sin datos personales: medias por manzana con un número mínimo de contratos para "
    "evitar reidentificación) mediante acuerdo o convenio con Incasòl / Departament d'Habitatge. El importador de "
    "datos del panel de administración ya está construido para esa fase.", S_BODY))
story.append(H("7.2 Protección de datos y obligaciones web", 1, S_H2))
bullets(story, [
    "<b>RGPD</b>: se tratan solo datos de cuenta (correo, nombre opcional, hash de contraseña) con base en ejecución de contrato; analítica propia agregada por interés legítimo; no se almacenan datos de tarjeta (los procesa Stripe). Aviso de privacidad con la política completa ya publicado en la web.",
    "<b>Datos mostrados</b>: exclusivamente agregados oficiales (medias por municipio); nunca datos de contratos individuales, lo que minimiza el riesgo de reidentificación.",
    "<b>LSSI</b>: aviso legal y política de cookies publicados; quedan marcados los campos de datos del titular (razón social, NIF, domicilio) que el promotor debe completar.",
    "<b>Atribución</b>: cada dato muestra su fuente; la cartografía incluye la atribución ICGC/OSM exigida por su licencia.",
    "<b>Estado legal</b>: la marca de zona tensada usa las resoluciones vigentes (DOGC 19-10-2026) y debe reverificarse con cada nueva resolución; el script de datos lo automatiza.",
])
story.append(Paragraph(
    "Pendiente para el promotor: darse de alta como titular de la actividad (autónomo o sociedad), completar los "
    "datos legales en las páginas de aviso legal y privacidad, y revisar el tratamiento fiscal de las "
    "suscripciones (IVA). Nada de esto bloquea la validación con usuarios, pero sí debe resolverse antes de "
    "activar cobros reales.", S_BODY))

# ---------- 8. Estrategia de captación ----------
h1(story, "8. Estrategia de captación de los primeros clientes")
story.append(Paragraph(
    "La captación inicial es 100 % orgánica y de contenido: cero euros en publicidad hasta autorización expresa "
    "del promotor. La palanca principal es que cada ejemplo real («este piso está un 23 % por encima de la media "
    "registrada de su municipio») es intrínsecamente compartible y conecta con el debate público permanente "
    "sobre el alquiler.", S_BODY))
story.append(H("8.1 Canales priorizados (primeros 30 días)", 1, S_H2))
table(story,
      ["Semana", "Acción", "Canal", "Meta verificable"],
      [
        ["1", "Publicar 3 hilos/ejemplos reales con capturas del mapa (Barcelona, Salou, Mataró)", "X/Twitter, Threads, Bluesky", "500 visitas al mapa; 20 registros"],
        ["1", "Post de presentación en comunidades de vivienda y r/Barcelona, r/Catalunya, r/girona", "Reddit y grupos de Facebook", "300 visitas; feedback cualitativo"],
        ["2", "Reel/TikTok con demo de 30 segundos («mira si te están cobrando de más»)", "TikTok, Instagram Reels", "10.000 vistas; 50 registros"],
        ["2", "Contacto con 5 asociaciones de inquilinato y 3 medios digitales locales con acceso Pro gratuito", "Correo directo", "2 colaboraciones o citas en prensa"],
        ["3", "SEO base: Google Search Console, indexación, primeras páginas por municipio (fase 2 del producto)", "SEO", "Indexación de páginas clave"],
        ["4", "Primera revisión del embudo en el panel de administración y ajuste de textos", "Producto", "Conversión registro → consulta ≥ 40 %"],
      ],
      [0.09, 0.40, 0.24, 0.27],
      caption="Tabla 6. Plan de captación de 30 días sin gasto en publicidad.")
story.append(H("8.2 Bucles de producto que apoyan la captación", 1, S_H2))
bullets(story, [
    "El teaser difuminado invita a registrarse justo cuando hay curiosidad (véase el panel de invitado).",
    "El comparador produce frases compartibles («+23 % sobre la media real») listas para capturar.",
    "Cada actualización anual de las listas de zonas tensadas es un momento de prensa natural para relanzar.",
    "Los informes de precio enviados por usuarios crearán, con volumen, un diferencial de datos propio.",
])
story.append(Paragraph(
    "Criterio de éxito para autorizar la primera campaña de pago (si el promotor lo desea): coste por registro "
    "orgánico conocido, tasa de conversión a Premium medida y retención de 30 días superior al 30 %. Solo con "
    "esos números tiene sentido calcular un presupuesto de adquisición.", S_BODY))

# ---------- 9. Lanzamiento ----------
h1(story, "9. Lanzamiento: checklist, pagos y autorizaciones")
story.append(H("9.1 Pruebas realizadas (fase 4, parte 1)", 1, S_H2))
bullets(story, [
    "Recorrido completo verificado en navegador real: landing, registro, mapa, consulta de manzana, comparador, muro de pago, compra simulada y panel de administración.",
    "Verificación en escritorio y móvil (el panel pasa a hoja inferior deslizable).",
    "APIs probadas: registro/entrada, búsqueda de municipios, edificios por área (con carga en vivo para municipios nuevos), consulta con cuota, webhook simulado, exportación CSV solo para Pro.",
    "Correos de bienvenida y restablecimiento generados y archivados en modo sandbox.",
    "Datos legalmente vigentes: listas de zonas tensadas actualizadas a las resoluciones de octubre de 2026.",
])
story.append(H("9.2 Activación de cobros reales (requiere tu cuenta de Stripe)", 1, S_H2))
story.append(Paragraph(
    "Los cobros están apagados a propósito. Para encenderlos el promotor debe: (1) crear la cuenta de Stripe y "
    "verificarla; (2) crear dos precios recurrentes de 7,99 € y 19,99 €/mes y copiar sus identificadores; "
    "(3) pegar STRIPE_SECRET_KEY, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_PRO y el secreto del webhook en el archivo "
    ".env; (4) activar el webhook apuntando a /api/stripe/webhook con los eventos checkout.session.completed, "
    "customer.subscription.updated, customer.subscription.deleted e invoice.paid; (5) probar primero en modo test "
    "con tarjeta de pruebas y solo después pasar a modo live. Mientras STRIPE_SECRET_KEY esté vacío, la web "
    "muestra un mensaje claro y no cobra a nadie; la compra simulada (DEMO_CHECKOUT) solo existe en el entorno "
    "de pruebas y debe apagarse en producción.", S_BODY))
story.append(H("9.3 Publicación (requiere autorización de gastos)", 1, S_H2))
table(story,
      ["Pendiente", "Opciones", "Coste estimado", "Decisión necesaria"],
      [
        ["Dominio", "preureal.cat en cualquier registrador", "12-18 €/año", "Autorizar compra y registrar"],
        ["Hosting", "Capa gratuita actual (previsualización), Vercel free/pro o VPS (5 €/mes)", "0-21 €/mes", "Elegir y autorizar"],
        ["Correo", "Resend (3.000/mes gratis) u otro", "0 € inicial", "Autorizar alta y verificar dominio"],
        ["Entidad legal", "Alta como autónomo o sociedad; datos para el aviso legal", "Según régimen", "Decidir forma y completar textos"],
        ["Convenio de datos", "Solicitud a Incasòl / Departament d'Habitatge (dato por manzana agregado)", "Por determinar", "Autorizar la solicitud formal"],
      ],
      [0.16, 0.40, 0.20, 0.24],
      caption="Tabla 7. Autorizaciones pendientes del promotor. Nada se contrata sin su visto bueno.")
story.append(Paragraph(
    "Con el dominio contratado basta fijar NEXT_PUBLIC_SITE_URL, apuntar el DNS al hosting elegido y la web pasa "
    "de previsualización a producción con el mismo código. El checklist final de publicación está incluido en el "
    "panel de administración (estado de integraciones).", S_BODY))

# ---------- 10. Textos comerciales ----------
h1(story, "10. Textos comerciales listos para usar (CA/ES)")
story.append(Paragraph(
    "Los siguientes textos ya están integrados en la web y se reproducen aquí como material de campaña. Pueden "
    "usarse tal cual en redes, prensa y correo.", S_BODY))
story.append(H("10.1 Propuesta de valor (hero)", 1, S_H2))
story.append(Paragraph("<b>CA:</b> «Sap si et cobren de més abans de signar el lloguer. El preu mitjà real registrat "
                       "oficialment (fiances Incasòl) sobre el mapa de Catalunya.»", S_QUOTE))
story.append(Paragraph("<b>ES:</b> «Sé si te cobran de más antes de firmar el alquiler. El precio medio real registrado "
                       "oficialmente (fianzas Incasòl) sobre el mapa de Cataluña.»", S_QUOTE))
story.append(H("10.2 Publicaciones para redes", 1, S_H2))
story.append(Paragraph("<b>CA (X/Bluesky):</b> «Et demanen 1.400 € per un pis a Barcelona? La mitjana real registrada a "
                       "fiances de l'Incasòl és d'1.135 €/mes. Comprova-ho tu mateix, manzana a manzana, a "
                       "preureal.cat, amb dades oficials i no anuncis.»", S_QUOTE))
story.append(Paragraph("<b>ES (Instagram/TikTok, guion de 30 s):</b> «¿Te están cobrando de más de alquiler? Abre "
                       "preureal.cat, busca tu municipio, haz clic en tu edificio y compara lo que te piden con el "
                       "precio medio que está registrado oficialmente en fianzas. Gratis y con datos de la "
                       "Generalitat.»", S_QUOTE))
story.append(Paragraph("<b>ES (Reddit/grupos):</b> «He hecho una web gratuita que cruza las fianzas de alquiler del "
                       "Incasòl con el mapa catastral: clicas en tu manzana y ves la media oficial registrada, si "
                       "tu municipio es zona tensionada y un comparador. Me gustaría vuestro feedback y qué le "
                       "falta.»", S_QUOTE))
story.append(H("10.3 Correo de bienvenida (ya integrado)", 1, S_H2))
story.append(Paragraph("<b>CA:</b> «Ja pots consultar el preu mitjà real de lloguer registrat oficialment als municipis "
                       "de Catalunya. Tens 3 consultes detallades gratuïtes cada mes; quan s'acabin, Premium "
                       "(7,99 €/mes) les fa il·limitades.»", S_QUOTE))
story.append(Paragraph("<b>ES:</b> «Ya puedes consultar el precio medio real de alquiler registrado oficialmente en los "
                       "municipios de Cataluña. Tienes 3 consultas detalladas gratis cada mes; cuando se acaben, "
                       "Premium (7,99 €/mes) las hace ilimitadas.»", S_QUOTE))

# ---------- 11. Métricas ----------
h1(story, "11. Métricas y KPIs")
story.append(Paragraph(
    "La analítica de conversión ya está instrumentada dentro del producto (sin cookies de terceros): cada paso "
    "del embudo se registra en la base de datos y se muestra en el panel de administración. El embudo medido es: "
    "visita al mapa → teaser sin registro → registro → consultas detalladas → muro de pago → inicio de compra → "
    "suscripción activa. El panel muestra además usuarios por plan, MRR estimado y serie diaria de 30 días.", S_BODY))
table(story,
      ["KPI", "Definición", "Objetivo mes 1", "Objetivo mes 3"],
      [
        ["Visitas al mapa", "Sesiones con interacción en el mapa", "1.000", "5.000"],
        ["Registros", "Cuentas creadas", "60", "400"],
        ["Conversión registro → consulta", "Usuarios que agotan o usan su cuota", "≥ 40 %", "≥ 50 %"],
        ["Vistas del muro de pago", "Consultas bloqueadas por cuota", "50", "400"],
        ["Suscriptores de pago", "Premium + Pro activos", "1-3", "10-25"],
        ["Retención 30 días", "Suscriptores activos tras un mes", "n/d", "≥ 70 %"],
      ],
      [0.26, 0.38, 0.18, 0.18],
      caption="Tabla 8. KPIs e hitos ilustrativos para validar demanda (no son previsiones garantizadas).",
      align_map=["l", "l", "c", "c"])
story.append(Paragraph(
    "Los hitos son órdenes de magnitud razonables para un lanzamiento orgánico; sirven para decidir con datos, no "
    "como compromiso de resultados. La regla práctica: si a los 60 días no se alcanza el 25 % del objetivo de "
    "registros, se revisa el posicionamiento y los textos antes de considerar cualquier gasto.", S_BODY))

# ---------- 12. Riesgos ----------
h1(story, "12. Riesgos y limitaciones")
table(story,
      ["Riesgo", "Impacto", "Mitigación"],
      [
        ["La demanda no se materializa", "Ingresos nulos pese al producto", "Costes casi nulos y embudo medido desde el día 1; iterar textos y canales cada 30 días sin asumir gastos"],
        ["Cambio de acceso a los datos públicos", "Pérdida de la capa de edificios o de precios", "Múltiples fuentes independientes, caché propia y convenio con Incasòl como camino estable"],
        ["Portales grandes copian la idea", "Presión competitiva", "Ejecución continua, marca de transparencia, foco Cataluña bilingüe y dato por manzana cuando llegue el convenio"],
        ["Cambios normativos de zonas tensadas", "Desactualización del distintivo", "Script de actualización automática contra el DOGC con cada nueva resolución"],
        ["Dependencia de servicios externos (ICGC, Cadastre)", "Consultas más lentas o indisponibles", "Degradación elegante (la web sigue funcionando con la media municipal), caché y tiempos de espera cortos"],
        ["Uso indebido de la información", "Reputacional", "Solo datos agregados oficiales, fuentes citadas, aviso de que no es tasación ni asesoramiento"],
      ],
      [0.26, 0.24, 0.50],
      caption="Tabla 9. Riesgos principales y mitigaciones.")
story.append(Paragraph(
    "Declaración honesta exigida por las reglas del proyecto: nada en este plan afirma que exista rentabilidad "
    "garantizada ni datos de mercado inventados. Todas las cifras de precios de alquiler proceden de fuentes "
    "oficiales citadas; todas las cifras de costes e ingresos son cálculos aritméticos verificables sobre los "
    "planes y tarifas descritos; la demanda es una hipótesis que se valida con los KPI del capítulo 11.", S_BODY))

# ---------- Anexo A ----------
def annex_block(story, title, header, rows, ratios, caption, align_map=None):
    """Anexo completo como bloque indivisible (altura bajo el tope del 40 %)."""
    blk = [H(title, 0, S_H1), HR()]
    inner = []
    table(inner, header, rows, ratios, caption=caption, align_map=align_map)
    blk.extend(inner)
    story.append(CondPageBreak(avail_h * 0.45))
    story.append(KeepTogether(blk))

annex_block(story, "Anexo A. Accesos y configuración",
      ["Elemento", "Valor / dónde"],
      [
        ["Panel de administración", "Sección Admin de la web (solo con cuenta administradora)"],
        ["Cuenta administradora", "admin@preureal.cat — contraseña inicial: PreuReal2026! (cámbiala tras el primer acceso)"],
        ["Variables de pago", "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PREMIUM, STRIPE_PRICE_PRO (en .env, hoy vacías)"],
        ["Modo de compra simulada", "DEMO_CHECKOUT=true solo en el entorno de pruebas; apagar en producción"],
        ["Correo", "RESEND_API_KEY (vacío hoy: los correos se archivan en el panel)"],
        ["URL pública", "NEXT_PUBLIC_SITE_URL (definir con el dominio definitivo)"],
        ["Datos y scripts", "scripts/prepare_data.py (actualiza fuentes), scripts/seed.ts (carga), scripts/finanzas_plan.py (modelo financiero)"],
      ],
      [0.30, 0.70],
      caption="Tabla A.1. Referencia rápida de accesos y variables.")

# ---------- Anexo B ----------
annex_block(story, "Anexo B. Fuentes de datos",
      ["Fuente", "URL"],
      [
        ["Fianzas Incasòl (Gencat), Excel por municipio", "habitatge.gencat.cat — Lloguers per àmbits geogràfics"],
        ["Municipios y comarcas (dataset abierto)", "analisi.transparenciacatalunya.cat — «Municipis Catalunya Geo» (9aju-tpwc)"],
        ["ICGC API Territorial", "api.icgc.cat/territorial (edificios RTT, parcelas catastrales, municipios)"],
        ["ICGC mapa base", "geoserveis.icgc.cat — mapa-base topográfico gris (CC-BY 4.0)"],
        ["Servicios libres del Cadastre", "catastro.hacienda.gob.es — Webservices_Libres.pdf"],
        ["Resoluciones de zonas tensadas (vigentes)", "DOGC 19-10-2026: TER/3739/2026 (prórroga, 118) y TER/3740/2026 (53 nuevos)"],
        ["Ley 12/2023 y índice de referencia", "BOE-A-2023-11936 y normativa de desarrollo"],
      ],
      [0.42, 0.58],
      caption="Tabla B.1. Fuentes utilizadas por la plataforma y citadas en el propio producto.")

doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print("cuerpo generado:", out)
