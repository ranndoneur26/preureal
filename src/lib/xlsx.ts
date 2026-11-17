/**
 * PreuReal — generador mínim de fitxers XLSX (v60), SENSE dependències.
 *
 * Encàrrec: exportació estructurada (.xlsx) per a analistes i professionals.
 * El paquet npm `xlsx` (SheetJS) no passa l'auditoria (GHSA conegudes a la
 * versió publicada al registry), així que implementem directament el mínim
 * OOXML: contenidor ZIP amb entrades STORED (sense compressió) + parts XML.
 * Excel, LibreOffice i Google Sheets l'obren correctament (comprovat via
 * tests: signatura ZIP, CRC32, parts i contingut de cel·les).
 *
 * Característiques:
 *  - Capçaleres en NEGRETA (estil s=1) a la primera fila de cada full.
 *  - Strings inline (sense sharedStrings), números com a números reals.
 *  - Escapament XML complet (anti-injecció) + noms de full sanejats (31 chars,
 *    sense []:*?/\).
 *  - Cap escriptura al disc, cap dependència: funciona a serverless.
 */

// ── API pública ──────────────────────────────────────────────────────────────

export type XlsxCell = string | number | null | undefined;
export interface XlsxSheet {
  /** Nom del full (màx. 31 caràcters; se saneja). */
  name: string;
  /** Files: la primera és la capçalera (sortirà en negreta). */
  rows: XlsxCell[][];
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Construeix un fitxer .xlsx complet (ZIP+OOXML) amb els fulls donats. */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const safe = sheets.length > 0 ? sheets : [{ name: "Dades", rows: [[]] }];
  const parts: Array<{ name: string; data: Uint8Array }> = [];
  const add = (name: string, xml: string) => parts.push({ name, data: bytes(xml) });

  // fulls sanejats + XML de cada worksheet
  const usedNames = new Set<string>();
  const sheetXmls: Array<{ name: string; xml: string; nCols: number }> = [];
  safe.forEach((s, i) => {
    const name = sanitizeSheetName(s.name, usedNames);
    const { xml, nCols } = sheetXml(s.rows);
    sheetXmls.push({ name, xml, nCols });
    add(`xl/worksheets/sheet${i + 1}.xml`, xml);
  });

  add("[Content_Types].xml", contentTypes(sheetXmls.length));
  add("_rels/.rels", rootRels());
  add("xl/workbook.xml", workbook(sheetXmls.map((s) => s.name)));
  add("xl/_rels/workbook.xml.rels", workbookRels(sheetXmls.length));
  add("xl/styles.xml", stylesXml());

  return zipStore(parts);
}

// ── Helpers de cells i fulls ────────────────────────────────────────────────

/** Lletra de columna (0→A, 25→Z, 26→AA…). */
export function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xmlEscape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // caràcters de control il·legals en XML 1.0 (excepte tab/CR/LF)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function sheetXml(rows: XlsxCell[][]): { xml: string; nCols: number } {
  let nCols = 0;
  const rowsXml = rows.map((row, ri) => {
    const cells: string[] = [];
    row.forEach((cell, ci) => {
      if (ci + 1 > nCols) nCols = ci + 1;
      const ref = `${colName(ci)}${ri + 1}`;
      if (typeof cell === "number" && Number.isFinite(cell)) {
        cells.push(`<c r="${ref}"${ri === 0 ? ' s="1"' : ""}><v>${cell}</v></c>`);
      } else if (cell != null && String(cell) !== "") {
        const t = xmlEscape(String(cell));
        cells.push(`<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${t}</t></is></c>`);
      }
      // null/"" → cel·la absent (sparse): Excel ho accepta
    });
    return `<row r="${ri + 1}">${cells.join("")}</row>`;
  });
  const colsRef = nCols > 0 ? `<dimension ref="A1:${colName(nCols - 1)}${Math.max(rows.length, 1)}"/>` : "";
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `${colsRef}<sheetData>${rowsXml.join("")}</sheetData></worksheet>`;
  return { xml, nCols };
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  let clean = String(name || "Full")
    .replace(/[[\]:*?/\\]/g, "-")
    .slice(0, 31)
    .trim();
  if (!clean) clean = "Full";
  let out = clean;
  let i = 2;
  while (used.has(out)) {
    const suffix = ` (${i++})`;
    out = clean.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(out);
  return out;
}

// ── Parts OOXML mínimes ──────────────────────────────────────────────────────

function contentTypes(nSheets: number): string {
  const overrides = Array.from({ length: nSheets }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    overrides +
    `</Types>`
  );
}

function rootRels(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`
  );
}

function workbook(sheetNames: string[]): string {
  const sheets = sheetNames
    .map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheets}</sheets></workbook>`
  );
}

function workbookRels(nSheets: number): string {
  const rels = Array.from({ length: nSheets }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  const stylesRel = `<Relationship Id="rId${nSheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    rels +
    stylesRel +
    `</Relationships>`
  );
}

/** Estils mínims: font 0 normal + font 1 en negreta (cellXf s=1). */
function stylesXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs>` +
    `</styleSheet>`
  );
}

// ── Contenidor ZIP (entrades STORED, sense compressió) ──────────────────────

const encoder = new TextEncoder();

function bytes(s: string): Uint8Array {
  return encoder.encode(s);
}

/** Taula CRC-32 (polinomi 0xEDB88320, IEEE) generada un cop per procés. */
let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
}

/**
 * Muntatge d'un ZIP vàlid amb method 0 (stored): cap dependència de zlib,
 * mida exacta coneguda abans d'escriure (serverless friendly).
 */
function zipStore(parts: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  // hora/fecha DOS fixos (2026-01-01 00:00): determinisme per a tests i cachés
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  const entries: ZipEntry[] = parts.map((p) => ({
    name: encoder.encode(p.name),
    data: p.data,
    crc: crc32(p.data),
  }));

  let total = 0;
  for (const e of entries) total += 30 + e.name.length + e.data.length; // locals
  const centralSize = entries.reduce((acc, e) => acc + 46 + e.name.length, 0);
  const buf = new Uint8Array(total + centralSize + 22);
  const view = new DataView(buf.buffer);
  let off = 0;

  const centralOffsets: number[] = [];
  for (const e of entries) {
    centralOffsets.push(off);
    view.setUint32(off, 0x04034b50, true); // local file header
    view.setUint16(off + 4, 20, true); // version needed
    view.setUint16(off + 6, 0, true); // flags (sense UTF8: noms ASCII)
    view.setUint16(off + 8, 0, true); // method stored
    view.setUint16(off + 10, dosTime, true);
    view.setUint16(off + 12, dosDate, true);
    view.setUint32(off + 14, e.crc, true);
    view.setUint32(off + 18, e.data.length, true); // compressed = stored
    view.setUint32(off + 22, e.data.length, true); // uncompressed
    view.setUint16(off + 26, e.name.length, true);
    view.setUint16(off + 28, 0, true); // extra len
    off += 30;
    buf.set(e.name, off);
    off += e.name.length;
    buf.set(e.data, off);
    off += e.data.length;
  }

  const centralStart = off;
  entries.forEach((e, i) => {
    view.setUint32(off, 0x02014b50, true); // central directory
    view.setUint16(off + 4, 20, true); // version made by
    view.setUint16(off + 6, 20, true); // version needed
    view.setUint16(off + 8, 0, true);
    view.setUint16(off + 10, 0, true);
    view.setUint16(off + 12, dosTime, true);
    view.setUint16(off + 14, dosDate, true);
    view.setUint32(off + 16, e.crc, true);
    view.setUint32(off + 20, e.data.length, true);
    view.setUint32(off + 24, e.data.length, true);
    view.setUint16(off + 28, e.name.length, true);
    view.setUint16(off + 30, 0, true); // extra
    view.setUint16(off + 32, 0, true); // comment
    view.setUint16(off + 34, 0, true); // disk number
    view.setUint16(off + 36, 0, true); // internal attrs
    view.setUint32(off + 38, 0, true); // external attrs
    view.setUint32(off + 42, centralOffsets[i], true); // local header offset
    off += 46;
    buf.set(e.name, off);
    off += e.name.length;
  });

  view.setUint32(off, 0x06054b50, true); // EOCD
  view.setUint16(off + 4, 0, true);
  view.setUint16(off + 6, 0, true);
  view.setUint16(off + 8, entries.length, true);
  view.setUint16(off + 10, entries.length, true);
  view.setUint32(off + 12, centralSize, true);
  view.setUint32(off + 16, centralStart, true);
  view.setUint16(off + 20, 0, true);
  off += 22;

  return buf.slice(0, off);
}
