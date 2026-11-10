// PreuReal — Generador del documento: Propuesta técnica de ampliación (docx)
// Receta de portada R1 (design-system) + 3 secciones (portada / índice romano / cuerpo arábigo)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  LevelFormat, TableOfContents, SectionType, TableLayoutType,
} = require("docx");
const fs = require("fs");
const path = require("path");

const contentA = require("./content_a.js");
const contentB = require("./content_b.js");
const ALL = [...contentA, ...contentB];

// ---------- Paleta PreuReal (identidad propia, estructura de tokens del design-system) ----------
const P = {
  primary: "0F2E21",           // verde oscuro de marca (títulos)
  accent: "E8673C",            // naranja de marca
  body: "000000",
  secondary: "666666",
  cover: {
    bg: "0F2E21", titleColor: "FFFFFF", subtitleColor: "D7E2DC",
    metaColor: "B9C8C0", accent: "E8673C", footerColor: "8FA79B",
  },
  table: { headerBg: "E8673C", headerText: "FFFFFF", innerLine: "E8D8CF", surface: "F8F0EB" },
};

const FONT_HEAD = { ascii: "Arial", eastAsia: "SimHei" };
const FONT_BODY = { ascii: "Times New Roman", eastAsia: "SimSun" };

const allNoBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};

// ---------- Utilidades de portada (design-system, cálculo latin-aware) ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  // Latin bold ≈ 0.55 em → pt * 11 twips por carácter (con margen: * 12)
  const charWidth = (pt) => pt * 12;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ---------- Receta R1: portada de párrafos puros (alineada a la izquierda) ----------
function buildCoverR1(config) {
  const C = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: C.accent, font: { ascii: "Arial" }, characterSpacing: 40 })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: C.titleColor, font: { ascii: "Arial", eastAsia: "SimHei" } })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: C.subtitleColor, font: { ascii: "Arial", eastAsia: "Microsoft YaHei" } })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200, right: padR }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: C.metaColor, font: { ascii: "Arial" } })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: C.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: C.footerColor, font: { ascii: "Arial" } }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ---------- Constructores de cuerpo ----------
function heading(text, level) {
  const conf = {
    1: { size: 32, before: 360, after: 180 },
    2: { size: 28, before: 280, after: 140 },
    3: { size: 24, before: 220, after: 120 },
  }[level];
  return new Paragraph({
    heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1],
    spacing: { before: conf.before, after: conf.after, line: 312 },
    children: [new TextRun({ text, bold: true, size: conf.size, color: P.primary, font: FONT_HEAD })],
  });
}

function bodyPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 140 },
    children: [new TextRun({ text, size: 24, color: P.body, font: FONT_BODY, ...opts })],
  });
}

function numItem(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 100 },
    children: [new TextRun({ text, size: 24, color: P.body, font: FONT_BODY })],
  });
}

function caption(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 220, after: 90, line: 280 },
    children: [new TextRun({ text, bold: true, size: 20, color: "555555", font: { ascii: "Arial" } })],
  });
}

function buildTable(spec) {
  const nCols = spec.header.length;
  const widths = spec.widths && spec.widths.length === nCols
    ? spec.widths
    : Array(nCols).fill(Math.floor(100 / nCols));
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: spec.header.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: [new Paragraph({
        spacing: { line: 260 },
        children: [new TextRun({ text: h, bold: true, size: 20, color: P.table.headerText, font: { ascii: "Arial" } })],
      })],
    })),
  });
  const dataRows = spec.rows.map((row, r) => new TableRow({
    cantSplit: true,
    children: row.map((cell, i) => new TableCell({
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: r % 2 === 1 ? P.table.surface : "FFFFFF" },
      margins: { top: 60, bottom: 60, left: 110, right: 110 },
      children: [new Paragraph({
        spacing: { line: 260 },
        children: [new TextRun({ text: String(cell), size: 19, color: "1A1A1A", font: { ascii: "Times New Roman" } })],
      })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.primary },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.primary },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [headerRow, ...dataRows],
  });
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function buildImage(item) {
  const file = path.join(__dirname, item.file);
  const { w, h } = pngSize(file);
  const displayWidth = 540;
  const displayHeight = Math.round(displayWidth * h / w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
      children: [new ImageRun({ data: fs.readFileSync(file), transformation: { width: displayWidth, height: displayHeight }, type: "png" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, line: 280 },
      children: [new TextRun({ text: item.caption, size: 20, color: "555555", font: { ascii: "Arial" } })],
    }),
  ];
}

// ---------- Ensamblado del cuerpo ----------
const numberingRefs = [];
for (const it of ALL) if (it.t === "numlist") numberingRefs.push(it.ref);

const bodyChildren = [];
let firstH1 = true;
for (const it of ALL) {
  if (it.t === "h1") {
    const para = new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: !firstH1,
      spacing: { before: 360, after: 180, line: 312 },
      children: [new TextRun({ text: it.x, bold: true, size: 32, color: P.primary, font: FONT_HEAD })],
    });
    bodyChildren.push(para);
    firstH1 = false;
  } else if (it.t === "h2") {
    bodyChildren.push(heading(it.x, 2));
  } else if (it.t === "h3") {
    bodyChildren.push(heading(it.x, 3));
  } else if (it.t === "p") {
    bodyChildren.push(bodyPara(it.x));
  } else if (it.t === "numlist") {
    for (const item of it.items) bodyChildren.push(numItem(item, it.ref));
  } else if (it.t === "table") {
    bodyChildren.push(caption(it.caption));
    bodyChildren.push(buildTable(it));
    bodyChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  } else if (it.t === "img") {
    bodyChildren.push(...buildImage(it));
  }
}

// ---------- Pie de página con número ----------
function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: { ascii: "Arial" } })],
    })],
  });
}
function docHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC", space: 4 } },
      children: [new TextRun({ text: "PreuReal.cat · Propuesta de ampliación de funcionalidades y fuentes", size: 18, color: "808080", font: { ascii: "Arial" } })],
    })],
  });
}

// ---------- Documento ----------
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  creator: "PreuReal.cat",
  title: "Propuesta técnica: ampliación de funcionalidades y fuentes de información",
  styles: {
    default: {
      document: {
        run: { font: FONT_BODY, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: { run: { font: FONT_HEAD, size: 32, bold: true, color: P.primary }, paragraph: { spacing: { before: 360, after: 180, line: 312 }, outlineLevel: 0 } },
      heading2: { run: { font: FONT_HEAD, size: 28, bold: true, color: P.primary }, paragraph: { spacing: { before: 280, after: 140, line: 312 }, outlineLevel: 1 } },
      heading3: { run: { font: FONT_HEAD, size: 24, bold: true, color: P.primary }, paragraph: { spacing: { before: 220, after: 120, line: 312 }, outlineLevel: 2 } },
    },
  },
  numbering: {
    config: numberingRefs.map((ref) => ({
      reference: ref,
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 640, hanging: 360 } } },
      }],
    })),
  },
  sections: [
    // Sección 1: portada (margen 0, sin pie)
    {
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "Ampliación de funcionalidades y fuentes de información oficial",
        subtitle: "Auditoría de la plataforma (Fase 1) y propuesta técnica de implementación",
        englishLabel: "PREUREAL.CAT",
        metaLines: [
          "Plataforma: www.preureal.com / preureal.cat",
          "Documento: propuesta pendiente de validación",
          "Fecha: 10 de noviembre de 2026",
        ],
        footerLeft: "PreuReal.cat — dades oficials de lloguer a Catalunya",
        footerRight: "Noviembre 2026",
        palette: P.cover,
      }),
    },
    // Sección 2: índice (romanos)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Índice", bold: true, size: 32, color: P.primary, font: FONT_HEAD })],
        }),
        new TableOfContents("Índice", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Nota: este índice se genera mediante campos de Word. Tras editar el documento, haga clic derecho sobre el índice y elija «Actualizar campos» para refrescar los números de página.",
            italics: true, size: 18, color: "888888", font: FONT_BODY,
          })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // Sección 3: cuerpo (arábigos desde 1)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

const OUT = "/home/z/my-project/download/PreuReal_propuesta_ampliacion_fuentes.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("OK", OUT, buf.length, "bytes");
});
