import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

/**
 * v38.8 — Informe individual de COMPARATIVA DE MUNICIPIS (pagament únic, 7,99 €).
 * Funció PURA (cap BD ni auth, testable amb bun test): rep 2-6 files de
 * municipi (dades Incasòl ja carregades per la ruta) i retorna els bytes del
 * PDF (~4 pàgines). Bilingüe ca/es segons l'idioma guardat a la compra.
 * El €/m² és DERIVAT (renta / 85 m² de l'habitatge típic, mateix model que la
 * valoració): la font oficial no publica €/m² i s'hi diu explícitament.
 */
import { winAnsi } from "@/lib/pdf-report";

const DARK = rgb(0.059, 0.18, 0.129);
const ACCENT = rgb(0.91, 0.4, 0.235);
const GRAY = rgb(0.42, 0.45, 0.42);
const LIGHT = rgb(0.96, 0.95, 0.93);
const WHITE = rgb(1, 1, 1);
const W = 595;
const H = 842;
/** Superfície de referència per derivar €/m² (VAL_REF_M2, src/lib/territorial.ts). */
export const COMPARISON_REF_M2 = 85;

export interface ComparisonMuniRow {
  name: string;
  comarca: string | null;
  province: string | null;
  code: string;
  rentLatest: number | null;
  rentPeriod: string | null;
  rentPrevYear: number | null;
  rentPrevPeriod: string | null;
  contractsLatest: number | null;
  isTense: boolean;
  tenseList: string | null;
  rentHistory: string | null; // JSON {any: €}
}

export interface ComparisonReportInput {
  munis: ComparisonMuniRow[];
  locale: "ca" | "es";
  genDate: string;
  purchaseRef: string;
}

export interface ComparisonStats {
  max: { name: string; rent: number } | null;
  min: { name: string; rent: number } | null;
  spreadPct: number | null; // (max-min)/min · 100
  tenseCount: number;
  avgRent: number | null;
}

/** Estadístiques agregades de la comparativa (pura, testable). */
export function comparisonStats(rows: ComparisonMuniRow[]): ComparisonStats {
  const withRent = rows.filter((r) => r.rentLatest != null && r.rentLatest > 0);
  if (withRent.length === 0) return { max: null, min: null, spreadPct: null, tenseCount: rows.filter((r) => r.isTense).length, avgRent: null };
  const sorted = [...withRent].sort((a, b) => a.rentLatest! - b.rentLatest!);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = withRent.reduce((s, r) => s + r.rentLatest!, 0) / withRent.length;
  return {
    max: { name: max.name, rent: max.rentLatest! },
    min: { name: min.name, rent: min.rentLatest! },
    spreadPct: ((max.rentLatest! - min.rentLatest!) / min.rentLatest!) * 100,
    tenseCount: rows.filter((r) => r.isTense).length,
    avgRent: avg,
  };
}

export async function buildComparisonPdf(rawInput: ComparisonReportInput): Promise<Uint8Array> {
  const es = rawInput.locale === "es";
  const rows: ComparisonMuniRow[] = rawInput.munis.map((r) => ({
    ...r,
    name: winAnsi(r.name),
    comarca: r.comarca ? winAnsi(r.comarca) : null,
    province: r.province ? winAnsi(r.province) : null,
    tenseList: r.tenseList ? winAnsi(r.tenseList) : null,
  }));
  const genDate = winAnsi(rawInput.genDate);
  const purchaseRef = winAnsi(rawInput.purchaseRef);
  const stats = comparisonStats(rows);
  const fmt0 = (n: number) => n.toLocaleString(es ? "es-ES" : "ca-ES", { maximumFractionDigits: 0 });
  const fmt1 = (n: number) =>
    n.toLocaleString(es ? "es-ES" : "ca-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const eurM2 = (rent: number | null) => (rent != null && rent > 0 ? rent / COMPARISON_REF_M2 : null);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page!: PDFPage;
  let pageNo = 0;
  let y = 0;

  const text = (s: string, size = 10, color = rgb(0.09, 0.11, 0.09), b = false, x = 40) => {
    // sanitització WinAnsi aquí TAMBIÉ (literals amb símbols: defensa v34)
    page.drawText(winAnsi(s), { x, y, size, font: b ? bold : font, color });
  };
  const line = (s: string, size = 10, color = rgb(0.09, 0.11, 0.09), b = false, x = 40, max = 515) => {
    const words = winAnsi(s).split(" ");
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if ((b ? bold : font).widthOfTextAtSize(test, size) > max) {
        text(cur, size, color, b, x);
        y -= size + 4;
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) {
      text(cur, size, color, b, x);
      y -= size + 4;
    }
  };
  const section = (s: string) => {
    text(s, 13, DARK, true);
    y -= 6;
    page.drawRectangle({ x: 40, y, width: 515, height: 1.2, color: ACCENT });
    y -= 16;
  };
  const footer = () => {
    page.drawRectangle({ x: 0, y: 0, width: W, height: 30, color: LIGHT });
    page.drawText(
      es ? `Preureal · generado el ${genDate} · compra ${purchaseRef}` : `Preureal · generat el ${genDate} · compra ${purchaseRef}`,
      { x: 40, y: 11, size: 8, font, color: GRAY }
    );
    const pn = es ? `Página ${pageNo}` : `Pàgina ${pageNo}`;
    page.drawText(pn, { x: W - 40 - font.widthOfTextAtSize(pn, 8), y: 11, size: 8, font, color: GRAY });
  };
  const newPage = (first = false) => {
    if (!first) footer();
    page = pdf.addPage([W, H]);
    pageNo++;
    y = H - 60;
    if (!first) {
      page.drawRectangle({ x: 0, y: H - 26, width: W, height: 26, color: DARK });
      page.drawText("Preureal", { x: 40, y: H - 18, size: 10, font: bold, color: WHITE });
      page.drawText(
        `${es ? "Comparativa de municipios" : "Comparativa de municipis"} · ${rows.length} ${es ? "municipios" : "municipis"}`,
        { x: 200, y: H - 18, size: 9, font, color: rgb(0.79, 0.83, 0.8) }
      );
    }
  };

  // ---------- P1 · PORTADA + RESUM ----------
  newPage(true);
  page.drawRectangle({ x: 0, y: H - 262, width: W, height: 262, color: DARK });
  page.drawText("Preureal", { x: 40, y: H - 96, size: 34, font: bold, color: WHITE });
  page.drawText(es ? "Informe comparativo de municipios" : "Informe comparatiu de municipis", {
    x: 40, y: H - 126, size: 12, font, color: rgb(0.79, 0.83, 0.8),
  });
  page.drawText(`${es ? "Generado el" : "Generat el"} ${genDate}`, { x: 40, y: H - 146, size: 10, font, color: rgb(0.79, 0.83, 0.8) });

  y = H - 262 - 40;
  const titleList = rows.map((r) => r.name).join(" · ");
  line(titleList, 15, DARK, true, 40, 515);
  y -= 8;
  line(rows.map((r) => `${r.name} (${r.comarca || "—"})`).join(", "), 9, GRAY);
  y -= 12;
  page.drawRectangle({ x: 40, y: y - 74, width: 515, height: 84, color: LIGHT });
  text(es ? "Comparación de fiances medias registradas (Incasòl)" : "Comparació de fiances mitges registrades (Incasòl)", 9, GRAY);
  y -= 30;
  const kpiMax = stats.max ? `${fmt0(stats.max.rent)} €/mes · ${stats.max.name}` : "—";
  const kpiMin = stats.min ? `${fmt0(stats.min.rent)} €/mes · ${stats.min.name}` : "—";
  text(es ? "MÁS CARO:" : "MÉS CAR:", 9, GRAY, true);
  text(kpiMax, 12, DARK, true, 110);
  y -= 18;
  text(es ? "MÁS BARATO:" : "MÉS BARAT:", 9, GRAY, true);
  text(kpiMin, 12, DARK, true, 110);
  y -= 18;
  if (stats.spreadPct != null) {
    text(es ? `Diferencia entre el más caro y el más barato: ${fmt0(stats.spreadPct)}%` : `Diferència entre el més car i el més barat: ${fmt0(stats.spreadPct)}%`, 10, DARK);
  }
  if (stats.tenseCount > 0) {
    y -= 14;
    text(es ? `${stats.tenseCount} de ${rows.length} municipios son área de mercado residencial tensionado` : `${stats.tenseCount} de ${rows.length} municipis són àrea de mercat residencial tensat`, 9.5, ACCENT, true);
  }
  y = y - 74 - 22;
  line(es
    ? "Todos los valores son medias de fiances registradas a Incasòl (contratos de vivienda). El €/m² es DERIVADO (renta ÷ 85 m² de la vivienda típica): la fuente oficial no publica €/m²."
    : "Tots els valors són mitges de fiances registrades a Incasòl (contractes d'habitatge). El €/m² és DERIVAT (renda ÷ 85 m² de l'habitatge típic): la font oficial no publica €/m².",
    9, GRAY);

  // ---------- P2 · TAULA COMPARATIVA ----------
  newPage();
  section(es ? "Tabla comparativa" : "Taula comparativa");
  const colX = [40, 205, 300, 380, 455];
  const hdr = es
    ? ["Municipio", "€/mes", "Var. anual", "€/m² est.", "Contratos"]
    : ["Municipi", "€/mes", "Var. anual", "€/m² est.", "Contractes"];
  hdr.forEach((h, i) => text(h, 9, GRAY, true, colX[i]));
  y -= 6;
  page.drawRectangle({ x: 40, y, width: 515, height: 0.8, color: GRAY });
  y -= 15;
  for (const r of rows) {
    const deltaPct = r.rentLatest != null && r.rentPrevYear != null && r.rentPrevYear > 0
      ? ((r.rentLatest - r.rentPrevYear) / r.rentPrevYear) * 100
      : null;
    const em2 = eurM2(r.rentLatest);
    text(r.name.length > 27 ? r.name.slice(0, 26) + "…" : r.name, 9.5, DARK, true, colX[0]);
    text(r.rentLatest != null ? fmt0(r.rentLatest) : "—", 9.5, DARK, true, colX[1]);
    text(deltaPct != null ? `${deltaPct > 0 ? "+" : ""}${fmt1(deltaPct)}%` : "—", 9.5, deltaPct != null && deltaPct > 3 ? ACCENT : GRAY, false, colX[2]);
    text(em2 != null ? `${fmt1(em2)}` : "—", 9.5, GRAY, false, colX[3]);
    text(r.contractsLatest != null ? fmt0(r.contractsLatest) : "—", 9.5, GRAY, false, colX[4]);
    y -= 16;
    text(`${r.rentPeriod || "—"}${r.isTense ? ` · ${es ? "TENSADO" : "TENSAT"} ${r.tenseList || ""}` : ""}`, 8, GRAY, false, colX[1]);
    y -= 15;
  }
  y -= 4;
  line(es
    ? "Var. anual: variación respecto al año anterior publicado. €/m² est.: renta ÷ 85 m² (vivienda típica, derivado). Contratos: contratos con fianza registrada en el período vigente (tamaño de muestra)."
    : "Var. anual: variació respecte l'any anterior publicat. €/m² est.: renda ÷ 85 m² (habitatge típic, derivat). Contractes: contractes amb fiança registrada al període vigent (grandària de mostra).",
    8.5, GRAY);

  // ---- gràfic de barres €/mes ----
  const withRent = rows.filter((r) => r.rentLatest != null).sort((a, b) => (a.rentLatest ?? 0) - (b.rentLatest ?? 0));
  if (withRent.length >= 2) {
    y -= 8;
    text(es ? "Fianza media por municipio (€/mes, ordenado)" : "Fiança mitja per municipi (€/mes, ordenat)", 10, DARK, true);
    y -= 12;
    const chartTop = y - 6;
    const chartH = Math.min(170, Math.max(90, withRent.length * 24));
    const maxVal = Math.max(...withRent.map((r) => r.rentLatest!), 1);
    const rowH = chartH / withRent.length;
    withRent.forEach((r, i) => {
      const bw = Math.max(6, (r.rentLatest! / maxVal) * 360);
      page.drawRectangle({ x: 40, y: chartTop - (i + 1) * rowH + 2, width: bw, height: rowH - 6, color: i === withRent.length - 1 ? ACCENT : DARK });
      const lbl = `${r.name}: ${fmt0(r.rentLatest!)}`;
      page.drawText(lbl.length > 60 ? lbl.slice(0, 59) + "…" : lbl, { x: 40 + bw + 8, y: chartTop - (i + 1) * rowH + 6, size: 8, font, color: GRAY });
    });
    y = chartTop - chartH - 16;
  }

  // ---------- P3 · FITXA PER MUNICIPI ----------
  newPage();
  section(es ? "Detalle por municipio" : "Detall per municipi");
  for (const r of rows) {
    if (y < 150) {
      footer();
      page = pdf.addPage([W, H]);
      pageNo++;
      y = H - 60;
      page.drawRectangle({ x: 0, y: H - 26, width: W, height: 26, color: DARK });
      page.drawText("Preureal", { x: 40, y: H - 18, size: 10, font: bold, color: WHITE });
    }
    text(`${r.name}${r.isTense ? ` · ${es ? "ÁREA TENSADA" : "ÀREA TENSADA"} ${r.tenseList || ""}` : ""}`, 11, r.isTense ? ACCENT : DARK, true);
    y -= 15;
    const deltaPct = r.rentLatest != null && r.rentPrevYear != null && r.rentPrevYear > 0
      ? ((r.rentLatest - r.rentPrevYear) / r.rentPrevYear) * 100
      : null;
    const em2 = eurM2(r.rentLatest);
    line(es
      ? `Fianza vigente: ${r.rentLatest != null ? fmt0(r.rentLatest) + " €/mes" : "sin dato"} (${r.rentPeriod || "—"})${deltaPct != null ? ` · ${deltaPct > 0 ? "+" : ""}${fmt1(deltaPct)}% vs año anterior (${r.rentPrevPeriod || "—"})` : ""} · €/m² est.: ${em2 != null ? fmt1(em2) : "—"} · Contratos: ${r.contractsLatest != null ? fmt0(r.contractsLatest) : "—"}`
      : `Fiança vigent: ${r.rentLatest != null ? fmt0(r.rentLatest) + " €/mes" : "sense dada"} (${r.rentPeriod || "—"})${deltaPct != null ? ` · ${deltaPct > 0 ? "+" : ""}${fmt1(deltaPct)}% vs any anterior (${r.rentPrevPeriod || "—"})` : ""} · €/m² est.: ${em2 != null ? fmt1(em2) : "—"} · Contractes: ${r.contractsLatest != null ? fmt0(r.contractsLatest) : "—"}`,
      9.5);
    // mini sèrie històrica (últims 6 períodes coneguts)
    let hist: Array<[string, number]> = [];
    if (r.rentHistory) {
      try {
        hist = Object.entries(JSON.parse(r.rentHistory as string))
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([k, val]) => [k, Number(val)]);
      } catch {
        hist = [];
      }
    }
    if (hist.length > 1) {
      const last = hist.slice(-6);
      const series = last.map(([yr, val]) => `${yr}: ${fmt0(val)}`).join("  ·  ");
      line(es ? `Serie reciente (€/mes): ${series}` : `Sèrie recent (€/mes): ${series}`, 8.5, GRAY);
    } else {
      line(es ? "Sin serie histórica publicada para este municipio." : "Sense sèrie històrica publicada per a aquest municipi.", 8.5, GRAY);
    }
    y -= 10;
  }

  // ---------- P4 · METODOLOGIA I LEGAL ----------
  newPage();
  section(es ? "Fuentes y metodología" : "Fonts i metodologia");
  (es
    ? [
        "Fianza media por municipio y serie histórica: fiances depositadas en Incasòl (Agència de l'Habitatge de Catalunya), vía habitatge.gencat.cat. Media de contratos de vivienda registrados; no describe ningún inmueble concreto.",
        "€/m² estimado: DERIVADO como renta ÷ 85 m² (superficie de la vivienda típica, mismo modelo que la valoración de Preureal). La fuente oficial NO publica €/m².",
        "Variación anual: comparación con el año anterior publicado por la misma fuente.",
        "Áreas tensionadas: Resoluciones TER/3739/2026 y TER/3740/2026 del DOGC (19-10-2026); en estos municipios los nuevos contratos pueden aplicar el Índice de Referencia de Alquileres (IRL).",
      ]
    : [
        "Fiança mitja per municipi i sèrie històrica: fiances dipositades a Incasòl (Agència de l'Habitatge de Catalunya), via habitatge.gencat.cat. Mitjana de contractes d'habitatge registrats; no descriu cap immoble concret.",
        "€/m² estimat: DERIVAT com a renda ÷ 85 m² (superfície de l'habitatge típic, mateix model que la valoració de Preureal). La font oficial NO publica €/m².",
        "Variació anual: comparació amb l'any anterior publicat per la mateixa font.",
        "Àrees tensades: Resolucions TER/3739/2026 i TER/3740/2026 del DOGC (19-10-2026); en aquests municipis els contractes nous poden aplicar l'Índex de Referència de Lloguers (IRL).",
      ]
  ).forEach((s) => {
    line("• " + s, 9);
    y -= 2;
  });
  y -= 6;
  section(es ? "Limitaciones" : "Limitacions");
  (es
    ? [
        "Las medias municipales no reflejan la variabilidad dentro de cada municipio ni la calidad de cada inmueble.",
        "Con pocas fianzas la media es más inestable entre períodos: compara tendencias, no decimales.",
        "El €/m² derivado asume la vivienda típica (85 m²): para otras superficies usa la valoración individual.",
        "Donde no hay dato oficial, el informe lo dice explícitamente y no inventa ningún valor.",
      ]
    : [
        "Les mitges municipals no reflecteixen la variabilitat dins de cada municipi ni la qualitat de cada immoble.",
        "Amb poques fiances la mitja és més inestable entre períodes: compara tendències, no decimals.",
        "El €/m² derivat assumeix l'habitatge típic (85 m²): per a altres superfícies usa la valoració individual.",
        "On no hi ha dada oficial, l'informe ho diu explícitament i no inventa cap valor.",
      ]
  ).forEach((s) => {
    line("• " + s, 9);
    y -= 2;
  });
  y -= 6;
  section(es ? "Aviso legal" : "Avís legal");
  line(es
    ? "Informe generado automáticamente por Preureal con datos oficiales públicos, a partir de una compra puntual. Uso exclusivamente informativo: no constituye valoración inmobiliaria formal, asesoramiento financiero ni jurídico. Las fuentes citadas son los propietarios de sus datos. www.preureal.com."
    : "Informe generat automàticament per Preureal amb dades oficials públiques, a partir d'una compra puntual. Ús exclusivament informatiu: no constitueix valoració immobiliària formal, assessorament financer ni jurídic. Les fonts citades són els propietaris de les seves dades. www.preureal.com.",
    9);
  y -= 10;
  text(`Informe v38.8 · ${es ? "generado el" : "generat el"} ${genDate} · compra ${purchaseRef}`, 8.5, GRAY);
  footer();

  return pdf.save();
}
