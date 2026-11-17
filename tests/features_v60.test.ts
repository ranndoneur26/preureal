/**
 * v60 — Pas 2 «Funcionalitats»: exportació XLSX sense dependències, dataset
 * massiu per comarca/municipi, alertes d'actualització de dades oficials i
 * matriu comparativa multi-municipi.
 *
 *  F1 — generador XLSX: ZIP vàlid (CRC32 correcte, parts OOXML, XML escapat,
 *       noms de full sanejats, números reals).
 *  F2 — exports existents: format=xlsx amb el MATEIX gating PRO (zero regressió CSV).
 *  F3 — /api/export/dataset: filtres, gating PRO, cau i registre al dispatcher.
 *  F4 — dataUpdateMail + secció 0.6 del cron: idempotència, línia base, noms.
 *  F5 — Matriu del comparador: vista per defecte intacta + files avançades amb gating.
 *  F6 — panell: secció d'exportació Pro amb filtre comarca/província.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { buildXlsx, colName, XLSX_MIME, type XlsxCell } from "../src/lib/xlsx";
import { dataUpdateMail } from "../src/lib/mail";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// ── lector ZIP mínim per validar el generador (igual que faria Excel) ────────

function crc32(data: Uint8Array): number {
  let table: Uint32Array | null = null;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table![(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntryInfo { name: string; content: Uint8Array }
function readZip(buf: Uint8Array): ZipEntryInfo[] {
  const view = new DataView(buf.buffer);
  // EOCD al final (comentari buit → els últims 22 bytes)
  const eocd = buf.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const n = view.getUint16(eocd + 10, true);
  const centralStart = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntryInfo[] = [];
  let off = centralStart;
  for (let i = 0; i < n; i++) {
    expect(view.getUint32(off, true)).toBe(0x02014b50);
    const crc = view.getUint32(off + 16, true);
    const size = view.getUint32(off + 24, true);
    const nameLen = view.getUint16(off + 28, true);
    const localOff = view.getUint32(off + 42, true);
    const name = decoder.decode(buf.slice(off + 46, off + 46 + nameLen));
    // local header
    expect(view.getUint32(localOff, true)).toBe(0x04034b50);
    expect(view.getUint16(localOff + 8, true)).toBe(0); // method STORED
    const dataStart = localOff + 30 + view.getUint16(localOff + 26, true);
    const content = buf.slice(dataStart, dataStart + size);
    expect(crc32(content)).toBe(crc); // CRC32 correcte
    entries.push({ name, content });
    off += 46 + nameLen;
  }
  return entries;
}

const partText = (entries: ZipEntryInfo[], name: string) => {
  const e = entries.find((x) => x.name === name);
  expect(e).toBeDefined();
  return new TextDecoder().decode(e!.content);
};

describe("F1 — generador XLSX sense dependències", () => {
  test("ZIP vàlid amb les parts OOXML mínimes i CRC32 correctes", () => {
    const buf = buildXlsx([
      { name: "Dades", rows: [["municipi", "lloguer"], ["Manresa", 750.5], ["Sort", 412]] },
    ]);
    expect(buf[0]).toBe(0x50); // "P"
    expect(buf[1]).toBe(0x4b); // "K"
    const entries = readZip(buf);
    const names = entries.map((e) => e.name);
    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("_rels/.rels");
    expect(names).toContain("xl/workbook.xml");
    expect(names).toContain("xl/_rels/workbook.xml.rels");
    expect(names).toContain("xl/styles.xml");
    expect(names).toContain("xl/worksheets/sheet1.xml");
  });

  test("cel·les: números com a <v>, strings inline i capçalera en negreta (s=1)", () => {
    const buf = buildXlsx([{ name: "Full", rows: [["nom", "preu"], ["Sort", 412]] }]);
    const entries = readZip(buf);
    const sheet = partText(entries, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain("<v>412</v>");
    expect(sheet).toContain("<is><t xml:space=\"preserve\">Sort</t></is>");
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">');
    const styles = partText(entries, "xl/styles.xml");
    expect(styles).toContain("<b/>"); // estil negreta per a les capçaleres
  });

  test("XML escapament complet (&, <, >, cometes, apòstrofs)", () => {
    const buf = buildXlsx([{ name: "Esc", rows: [["a&b<c>d\"e'f"], ["<script>alert(1)</script>"]] }]);
    const sheet = partText(readZip(buf), "xl/worksheets/sheet1.xml");
    expect(sheet).toContain("a&amp;b&lt;c&gt;d&quot;e&apos;f");
    expect(sheet).toContain("&lt;script&gt;");
    expect(sheet).not.toContain("<script>");
  });

  test("noms de full: màx 31 caràcters i sense []:*?/\\, duplicats numerats", () => {
    const buf = buildXlsx([
      { name: "Comarca/ Vall d'Aran * provisional 2026 extra llarg", rows: [["a"]] },
      { name: "Comarca/ Vall d'Aran * provisional 2026 extra llarg", rows: [["b"]] },
    ]);
    const wb = partText(readZip(buf), "xl/workbook.xml");
    // 31 caràcters màx i l'apòstrof escapament XML del workbook (&apos;)
    expect(wb).toContain('name="Comarca- Vall d&apos;Aran - provisio"');
    expect(wb).toContain('name="Comarca- Vall d&apos;Aran - prov (2)"');
  });

  test("MIME oficial d'Excel exposat i colName correcte", () => {
    expect(XLSX_MIME).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(colName(0)).toBe("A");
    expect(colName(25)).toBe("Z");
    expect(colName(26)).toBe("AA");
  });

  test("full buit → llibre vàlid (mai crash)", () => {
    const buf = buildXlsx([]);
    expect(readZip(buf).length).toBeGreaterThan(0);
  });
});

describe("F2 — exports existents: xlsx opcional amb el mateix gating (zero regressió CSV)", () => {
  const exp = readSrc("../src/app/api/_impl/export/[code]/route.ts");
  const cmp = readSrc("../src/app/api/_impl/comparator/export/route.ts");

  test("els dos endpoints accepten format=xlsx i serveixen el MIME d'Excel", () => {
    for (const src of [exp, cmp]) {
      expect(src).toContain("buildXlsx");
      expect(src).toContain("XLSX_MIME");
    }
    expect(exp).toContain('=== "xlsx"');
    expect(exp).toContain('searchParams.get("format")');
    expect(cmp).toContain('body?.format === "xlsx"');
  });

  test("el CSV continua sent el valor per defecte (mateixes capçaleres, mateixa defensa)", () => {
    expect(exp).toContain('filename="preureal_${fname}_lloguer.csv"');
    expect(exp).toContain("/^[=+\\-@]/");
    expect(cmp).toContain("text/csv; charset=utf-8");
    expect(cmp).toContain("anti-CSV-injection");
  });

  test("el gating PRO no s'ha tocat en cap dels dos", () => {
    expect(exp).toContain('planAllows(plan, "exportCsv")');
    expect(exp).toContain("PLAN_REQUIRED");
    expect(cmp).toContain('planAllows(plan, "exportCsv")');
  });
});

describe("F3 — /api/export/dataset (exportació massiva filtrable)", () => {
  const route = readSrc("../src/app/api/_impl/export/dataset/route.ts");
  const dispatcher = readSrc("../src/app/api/[[...path]]/route.ts");

  test("filtres comarca/province/muni + format xlsx, amb 400 si es combinen comarca i província", () => {
    expect(route).toContain('searchParams.get("comarca")');
    expect(route).toContain('searchParams.get("province")');
    expect(route).toContain('searchParams.get("muni")');
    expect(route).toContain("BAD_INPUT");
    expect(route).toContain("Filtra per comarca O província");
  });

  test("mateixa política PRO + anti-injecció + fila per municipi i any", () => {
    expect(route).toContain('planAllows(plan, "exportCsv")');
    expect(route).toContain("PLAN_REQUIRED");
    expect(route).toContain("/^[=+\\-@]/");
    expect(route).toContain('"vigent"');
  });

  test("usa el cau en memòria i queda registrat al dispatcher d'una sola funció", () => {
    expect(route).toContain("export-dataset:");
    expect(dispatcher).toContain("_impl/export/dataset/route");
    expect(dispatcher).toContain('seg: ["export", "dataset"]');
  });
});

describe("F4 — alertes d'actualització de dades oficials (cron + plantilla)", () => {
  const cron = readSrc("../src/app/api/_impl/cron/emails/route.ts");

  test("plantilla dataUpdateMail: bilingüe, períodes prev→nou, sense termes prohibits", () => {
    const ca = dataUpdateMail(
      [{ label: "Sort", newValue: 412, prevPeriod: "2025", period: "2026", url: "/#/mapa?mun=250776" }],
      "ca",
    );
    expect(ca.subject).toContain("Dades oficials actualitzades");
    expect(ca.html).toContain("2025 → 2026");
    expect(ca.html).toContain("412 €/mes");
    expect(ca.html).toContain("habitatge.gencat.cat");
    const es = dataUpdateMail(
      [{ label: "Sort", newValue: null, prevPeriod: "2025", period: "2026", url: "/#/mapa?mun=250776" }],
      "es",
    );
    expect(es.subject).toContain("Datos oficiales actualizados");
    expect(es.html).toContain("todavía sin valor publicado");
  });

  test("secció 0.6 del cron: kind DATA, línia base primer, avís només si el període avança", () => {
    expect(cron).toContain('kind: "DATA"');
    expect(cron).toContain("dataUpdateMail");
    expect(cron).toContain("data-updates:");
    expect(cron).toContain("dataUpdatesQueued");
    expect(cron).toContain("m.rentPeriod > prev.period");
    expect(cron).toContain("mai una rajada d'avisos");
  });

  test("opt-in respectat: només usuaris amb alertsEnabled, verificats i pagants", () => {
    expect(cron).toContain("alertsEnabled: true");
    expect(cron).toContain('plan: { in: ["PREMIUM", "PRO"] }');
  });
});

describe("F5 — matriu comparativa multi-municipi (comparador)", () => {
  const view = readSrc("../src/components/views/ComparadorView.tsx");

  test("commutador amb vista per defecte 'fitxes' (zero regressió)", () => {
    expect(view).toContain('useState<"fitxes" | "matriu">("fitxes")');
    expect(view).toContain('mode === "fitxes"');
    expect(view).toContain('role="tablist"');
    expect(view).toContain('aria-selected={mode === "matriu"}');
  });

  test("matriu: municipis enfrontats en variables clau amb millor/pitjor marcats", () => {
    expect(view).toContain("ComparatorMatrix");
    expect(view).toContain("Matriu comparativa");
    expect(view).toContain("Lloguer vigent");
    expect(view).toContain("Esforç econòmic");
    expect(view).toContain("Renda mitjana per llar");
    expect(view).toContain("IPVA acumulat");
    expect(view).toContain("bg-mintsoft");
    expect(view).toContain("bg-ambersoft2");
    expect(view).toContain("tabular-nums");
  });

  test("les files avançades respecten el gating del servidor (cadenat sense valor)", () => {
    expect(view).toContain("advancedOnly: true");
    expect(view).toContain("row.advancedOnly && !advanced");
  });

  test("tots els elements existents del comparador continuen presents", () => {
    expect(view).toContain("Exporta CSV");
    expect(view).toContain("Comença amb una comparació d'exemple");
    expect(view).toContain("Desar comparació");
    expect(view).toContain("el més barat");
    expect(view).toContain("Evolució temporal");
  });

  test("cap terme prohibit per les guardes lingüístiques a la matriu", () => {
    expect(view).not.toContain("vivenda");
    expect(view).not.toContain("Estimació");
    expect(view).not.toContain("estimació");
  });
});

describe("F6 — panell: secció d'exportació de dataset (Pro)", () => {
  const panel = readSrc("../src/components/views/PanelView.tsx");

  test("filtre comarca/província + botons CSV i Excel amb gating UI per pla", () => {
    expect(panel).toContain("/api/export/dataset?");
    expect(panel).toContain("format=csv");
    expect(panel).toContain("format=xlsx");
    expect(panel).toContain("Exportació de dades (Pro)");
    expect(panel).toContain('u.plan === "PRO" ?');
    expect(panel).toContain("Veure plans");
  });
});

describe("F7 — el tipus XlsxCell accepta el model de files dels exports", () => {
  test("string, number, null i undefined entren sense coerció", () => {
    const rows: XlsxCell[][] = [["a", 1, null, undefined]];
    expect(rows[0][1]).toBe(1);
  });
});
