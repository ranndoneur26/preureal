import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

/**
 * Fase 6 (v34) — Constructor de l'INFORME PROFESSIONAL DE 8 PÀGINES.
 * Funció PURA: no toca BD ni auth; rep les dades ja reunides i validades per
 * la ruta /api/reports/pdf i retorna els bytes del PDF. Així el contingut és
 * testable amb bun test (src/lib/pdf-report.ts + tests/pdf_report.test.ts).
 *
 * Regla del producte: cada dada cita font i període; on no hi ha dada
 * oficial s'ho diu explícitament (— o «no disponible») i mai s'inventa.
 */

const DARK = rgb(0.059, 0.18, 0.129);   // #0f2e21
const ACCENT = rgb(0.91, 0.4, 0.235);   // #e8673c
const GRAY = rgb(0.42, 0.45, 0.42);
const LIGHT = rgb(0.96, 0.95, 0.93);
const WHITE = rgb(1, 1, 1);
const BAND = rgb(0.87, 0.85, 0.94);     // lila suau per a la banda P25-P75
const W = 595; // A4
const H = 842;
export const REPORT_PAGES = 8;

export interface ReportMun {
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

export interface ReportBuilding {
  nom: string | null;
  refcat: string | null;
  tipus: string | null;
  altura: number | null;
  yearBuilt: number | null;
  avgRentEurMonth: number | null;
  sampleSize: number | null;
  source: string;
}

export interface ReportAid {
  title: string;
  amount: string | null;
  audience: string | null;
  source: string;
  url: string;
  reviewed: string;
}

export interface ReportIndicators {
  band: { p25: number; p50: number; p75: number; n: number; totalWeight: number } | null;
  effortHogar: { pct: number; rentEurMonth: number; rentPeriod: string | null; rentaAnual: number; rentaPeriod: string } | null;
  rentaHogarLatest: { value: number; period: string } | null;
  ipvaCat: { latestAnual: { value: number; period: string } | null; acum2015: { value: number } | null } | null;
}

export interface ReportInput {
  mun: ReportMun;
  building: ReportBuilding | null;
  ind: ReportIndicators | null;
  aids: ReportAid[];
  subscriberMasked: string;
  planLabel: string;
  genDate: string; // "11 de novembre de 2026"
}

const fmt0 = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export async function buildReportPdf(input: ReportInput): Promise<Uint8Array> {
  const { mun, building, ind, aids } = input;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // la primera pàgina la crea newPage(true) — mai pre-crear-la (pàgina òrfena)
  let page!: PDFPage;
  let pageNo = 0;
  let y = 0;

  const text = (s: string, size = 10, color = rgb(0.09, 0.11, 0.09), b = false, x = 40) => {
    page.drawText(s, { x, y, size, font: b ? bold : font, color });
  };
  const line = (s: string, size = 10, color = rgb(0.09, 0.11, 0.09), b = false, x = 40, max = 515) => {
    const words = s.split(" ");
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
    page.drawText(`PreuReal.cat · generat el ${input.genDate} · dades: ${mun.rentPeriod || "—"}`, { x: 40, y: 11, size: 8, font, color: GRAY });
    const pn = `Pàgina ${pageNo} de ${REPORT_PAGES}`;
    page.drawText(pn, { x: W - 40 - font.widthOfTextAtSize(pn, 8), y: 11, size: 8, font, color: GRAY });
  };
  const newPage = (first = false) => {
    if (!first) footer();
    page = pdf.addPage([W, H]);
    pageNo++;
    y = H - 60;
    if (!first) {
      page.drawRectangle({ x: 0, y: H - 26, width: W, height: 26, color: DARK });
      page.drawText("PreuReal.cat", { x: 40, y: H - 18, size: 10, font: bold, color: WHITE });
      page.drawText(".cat", { x: 40 + bold.widthOfTextAtSize("PreuReal", 10), y: H - 18, size: 10, font: bold, color: ACCENT });
      page.drawText(`Informe de lloguer · ${mun.name}`, { x: 200, y: H - 18, size: 9, font, color: rgb(0.79, 0.83, 0.8) });
    }
  };

  // ---------- P1 · PORTADA ----------
  newPage(true);
  page.drawRectangle({ x: 0, y: H - 262, width: W, height: 262, color: DARK });
  page.drawText("PreuReal.cat", { x: 40, y: H - 96, size: 34, font: bold, color: WHITE });
  page.drawText(".cat", { x: 40 + bold.widthOfTextAtSize("PreuReal", 34), y: H - 96, size: 34, font: bold, color: ACCENT });
  page.drawText("Informe professional de lloguer · 8 pàgines", { x: 40, y: H - 126, size: 12, font, color: rgb(0.79, 0.83, 0.8) });
  page.drawText(`Generat el ${input.genDate}`, { x: 40, y: H - 146, size: 10, font, color: rgb(0.79, 0.83, 0.8) });

  // el contingut comença SOTA el bloc fosc de marca (el bloc arriba fins a H-262)
  y = H - 262 - 40;
  text(mun.name, 26, DARK, true);
  y -= 10;
  line(`${mun.comarca || "—"} · ${mun.province || "—"} · Codi municipal ${mun.code}`, 11, GRAY);
  if (building) {
    y -= 6;
    text(building.nom || building.refcat || "Edifici", 18, DARK, true);
    y -= 6;
    line(
      `${building.tipus === "ind" ? "Nau industrial · " : ""}Ref. catastral ${building.refcat || "no coneguda"} · Font geomètrica: ${building.source}`,
      9, GRAY
    );
  }
  y -= 12;
  page.drawRectangle({ x: 40, y: y - 74, width: 515, height: 84, color: LIGHT });
  text("Lloguer mitjà registrat oficialment (fiances Incasòl)", 9, GRAY);
  y -= 32;
  const bigRent = mun.rentLatest != null ? `${fmt0(mun.rentLatest)} €/mes` : "No disponible";
  text(bigRent, 24, DARK, true);
  text(`· període ${mun.rentPeriod || "—"}`, 10, GRAY, false, 40 + bold.widthOfTextAtSize(bigRent, 24) + 8);
  y -= 20;
  text(mun.isTense ? "Municipi declarat ÀREA DE MERCAT RESIDENCIAL TENSAT" : "No consta com a àrea de mercat residencial tensat", 9.5, mun.isTense ? ACCENT : GRAY, true);
  y = y - 74 - 22; // sota la caixa KPI
  text("Contingut de l'informe", 11, DARK, true);
  y -= 18;
  [
    "1. Portada i identificació de l'informe",
    "2. Resum executiu amb xifres clau",
    "3. Evolució del lloguer mitjà (sèrie històrica Incasòl)",
    "4. Referència oficial: banda P25-P75, esforç, renda i IPVA",
    building ? "5. Edifici/illa analitzat i relació amb la dada municipal" : "5. Com llegir aquest mercat (interpretació de la mitjana)",
    "6. Regulació: zona tensada, índex de referència i contractes",
    "7. Ajudes al lloguer vigents (fonts oficials)",
    "8. Metodologia, fonts, limitacions estadístiques i avís legal",
  ].forEach((s) => {
    line(s, 10);
    y -= 2;
  });
  y -= 10;
  line(`Subscrit: ${input.subscriberMasked} · Pla ${input.planLabel}. Document informatiu generat automàticament amb dades oficials; no és una valoració immobiliària ni assessorament jurídic.`, 8.5, GRAY);

  // ---------- P2 · RESUM EXECUTIU ----------
  newPage();
  section("Resum executiu");
  const deltaPct = mun.rentLatest != null && mun.rentPrevYear != null ? ((mun.rentLatest - mun.rentPrevYear) / mun.rentPrevYear) * 100 : null;
  const boxes: Array<[string, string, string]> = [
    ["Lloguer mitjà (fiances)", mun.rentLatest != null ? `${fmt0(mun.rentLatest)} €/mes` : "—", `període ${mun.rentPeriod || "—"}`],
    ["Variació vs any anterior", deltaPct != null ? `${deltaPct > 0 ? "+" : ""}${fmt1(deltaPct)}%` : "—", `període anterior ${mun.rentPrevPeriod || "—"}`],
    ["Contractes amb fiança", mun.contractsLatest != null ? fmt0(mun.contractsLatest) : "—", "mostre municipal de referència"],
    ["Àrea tensada", mun.isTense ? `SÍ (llista ${mun.tenseList || "—"})` : "NO", mun.isTense ? "TER/3739 i TER/3740/2026" : "sense índex de referència"],
  ];
  const bw = 250, bh = 64;
  boxes.forEach(([label, value, sub], i) => {
    const bx = 40 + (i % 2) * (bw + 15);
    const by = y - bh - Math.floor(i / 2) * (bh + 12);
    page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: LIGHT });
    page.drawText(label, { x: bx + 10, y: by + bh - 18, size: 8.5, font, color: GRAY });
    page.drawText(value, { x: bx + 10, y: by + 20, size: 17, font: bold, color: i === 3 && mun.isTense ? ACCENT : DARK });
    page.drawText(sub, { x: bx + 10, y: by + 8, size: 7.5, font, color: GRAY });
  });
  y -= 2 * (bh + 12) + 18;
  line(
    `${mun.name} (${mun.comarca || "comarca no registrada"}) registra un lloguer mitjà de ${mun.rentLatest != null ? `${fmt0(mun.rentLatest)} €/mes` : "sense dada oficial al període actual"} segons les fiances dipositades a Incasòl (període ${mun.rentPeriod || "—"}), amb ${mun.contractsLatest != null ? fmt0(mun.contractsLatest) : "un nombre no conegut de"} contractes de referència. ` +
    (deltaPct != null
      ? `Respecte del període anterior (${mun.rentPrevPeriod || "—"}) la variació és d'un ${deltaPct > 0 ? "+" : ""}${fmt1(deltaPct)}%. `
      : "No hi ha període previ comparable publicat. ") +
    (mun.isTense
      ? `El municipi ESTÀ declarat àrea de mercat residencial tensat (llista ${mun.tenseList === "A" ? "A — TER/3739/2026" : "C — TER/3740/2026"}), de manera que els contractes nous hi poden aplicar l'índex de referència de lloguers.`
      : "El municipi NO consta a les resolucions d'àrees tensades vigents (DOGC 19-10-2026)."),
    10
  );
  y -= 10;
  line("Important: la xifra és una MITJANA MUNICIPAL de fiances registrades. No descriu cap edifici concret ni la variabilitat interior del municipi. Per a naus i edificis industrials (lloguer per €/m² i mes) aquesta estadística NO és aplicable.", 9, GRAY);
  if (building) {
    y -= 12;
    section("Edifici analitzat");
    line(`${building.nom || building.refcat || "Edifici"} — ${building.tipus === "ind" ? "NAU INDUSTRIAL (tipus ICGC \"ind\"): el preu municipal de referència és el de lloguer d'habitatges i no correspon a naus; el lloguer industrial es pacta per €/m² i mes." : `Edifici tipus \"${building.tipus || "—"}\" de la cartografia ICGC.`}`, 10);
    if (building.avgRentEurMonth != null) {
      line(`Dada a nivell d'edifici/illa (importació pròpia de fiances): mitjana ${fmt0(building.avgRentEurMonth)} €/mes amb ${building.sampleSize ?? "?"} mostres.`, 10);
    } else {
      line("Aquest edifici no té dada pròpia importada: la referència de l'informe és la mitjana municipal agregada.", 9, GRAY);
    }
  }

  // ---------- P3 · EVOLUCIÓ ----------
  newPage();
  section("Evolució del lloguer mitjà");
  const hist: Array<[string, number]> = mun.rentHistory
    ? Object.entries(JSON.parse(mun.rentHistory as string)).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [k, Number(v)])
    : [];
  if (hist.length > 1) {
    const maxVal = Math.max(...hist.map(([, v]) => v), 1);
    const chartTop = y - 8;
    const chartH = 150;
    const barW = 495 / hist.length;
    hist.forEach(([year, v], i) => {
      const h = Math.max(2, (v / maxVal) * chartH);
      page.drawRectangle({ x: 50 + i * barW, y: chartTop - h, width: Math.max(3, barW - 5), height: h, color: i === hist.length - 1 ? ACCENT : DARK });
      page.drawText(String(year).slice(2), { x: 50 + i * barW + (barW - 10) / 2, y: chartTop - h - 11, size: 6.5, font, color: GRAY });
      if (hist.length <= 14 || i % 2 === 0) {
        const vs = String(Math.round(v));
        page.drawText(vs, { x: 50 + i * barW + Math.max(0, (barW - 6 - font.widthOfTextAtSize(vs, 6)) / 2), y: chartTop - h - 20, size: 6, font, color: GRAY });
      }
    });
    y = chartTop - chartH - 34;
    line(`Sèrie completa ${hist[0][0]}–${hist[hist.length - 1][0]} · Font: fiances dipositades a Incasòl (habitatge.gencat.cat). L'últim any (taronja) és el període vigent.`, 8.5, GRAY);
    y -= 12;
    text("Valors de la sèrie (€/mes)", 10, DARK, true);
    y -= 14;
    const cols = 4;
    const rowsPerCol = Math.ceil(hist.length / cols);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rowsPerCol; r++) {
        const idx = c * rowsPerCol + r;
        if (idx >= hist.length) break;
        page.drawText(`${hist[idx][0]}`, { x: 40 + c * 130, y: y - r * 13, size: 8.5, font: bold, color: DARK });
        page.drawText(`${fmt0(hist[idx][1])} €`, { x: 78 + c * 130, y: y - r * 13, size: 8.5, font, color: GRAY });
      }
    }
    y -= rowsPerCol * 13 + 8;
  } else {
    line("Aquest municipi no té sèrie històrica suficient publicada (menys de dos períodes). No s'inventa cap valor.", 9, GRAY);
    y -= 14;
  }

  // ---------- P4 · REFERÈNCIA OFICIAL ----------
  newPage();
  section("Referència oficial i context (INE + mercat registrat)");
  const band = ind?.band ?? null;
  if (band) {
    text("Banda del mercat registrat (illes/edificis amb fiances importades)", 10, DARK, true);
    y -= 10;
    const bx = 60, bwd = 475, by = y - 40;
    page.drawRectangle({ x: bx, y: by, width: bwd, height: 26, color: BAND });
    const span = Math.max(band.p75 - band.p25, 1);
    const midX = bx + Math.min(Math.max(((band.p50 - band.p25) / span) * bwd, 0), bwd);
    page.drawRectangle({ x: midX - 1.5, y: by - 4, width: 3, height: 34, color: ACCENT });
    page.drawText(`P25: ${fmt0(band.p25)} €`, { x: bx, y: by - 14, size: 8, font, color: GRAY });
    page.drawText(`Mediana: ${fmt0(band.p50)} €`, { x: bx + bwd / 2 - 40, y: by + 30, size: 9, font: bold, color: DARK });
    page.drawText(`P75: ${fmt0(band.p75)} €`, { x: bx + bwd - 70, y: by - 14, size: 8, font, color: GRAY });
    y = by - 30;
    line(`Construïda amb ${band.n} illes/edificis del municipi amb dada importada (${band.totalWeight} contractes ponderats). Base: fiances Incasòl.`, 8.5, GRAY);
    y -= 8;
  } else {
    line("Banda P25-P75: no disponible (mostres municipals insuficients; no s'estima).", 9, GRAY);
    y -= 10;
  }
  const effort = ind?.effortHogar ?? null;
  if (effort) {
    text("Esforç econòmic estimat", 10, DARK, true);
    y -= 14;
    line(`El lloguer mitjà municipal (${fmt0(effort.rentEurMonth)} €/mes, període ${effort.rentPeriod || "—"}) suposa un ${fmt1(effort.pct)}% de la renda neta mitjana per llar del municipi (${fmt0(effort.rentaAnual)} €/any, Atlas ${effort.rentaPeriod}).`, 9.5);
    y -= 8;
  }
  const renta = ind?.rentaHogarLatest ?? null;
  if (renta) {
    text("Renda neta mitjana per llar", 10, DARK, true);
    y -= 14;
    line(`${fmt0(renta.value)} €/any (Atlas de distribució de renda — INE, ${renta.period}). Font: INE, via StatObservation.`, 9.5);
    y -= 8;
  }
  const ipva = ind?.ipvaCat ?? null;
  if (ipva?.latestAnual) {
    text("Índex de Preus de Vivienda en Alquiler (IPVA)", 10, DARK, true);
    y -= 14;
    line(`Catalunya: variació anual oficial ${ipva.latestAnual.value > 0 ? "+" : ""}${fmt1(ipva.latestAnual.value)}% (${ipva.latestAnual.period})${ipva.acum2015 ? ` · acumulat des de 2015 (base 100): ${fmt1(ipva.acum2015.value)}` : ""}. Font: INE (IPVA).`, 9.5);
    y -= 8;
  }
  if (!band && !effort && !renta && !ipva) {
    line("Cap indicador oficial complementari disponible per a aquest municipi en aquest moment.", 9, GRAY);
    y -= 10;
  }
  y -= 6;
  line("Tots els indicadors d'aquesta pàgina provenen de fonts oficials citades (Incasòl, INE). PreuReal no els modifica ni els extrapola; on no hi ha dada, s'ho diu.", 8.5, GRAY);

  // ---------- P5 · EDIFICI / LECTURA DEL MERCAT ----------
  newPage();
  if (building) {
    section("Edifici / illa analitzat");
    text(building.nom || building.refcat || "Edifici", 13, DARK, true);
    y -= 16;
    const rows: Array<[string, string]> = [
      ["Tipus (ICGC RTT)", building.tipus === "ind" ? "Nau industrial (\"ind\")" : building.tipus === "ill" ? "Illa de cases (\"ill\")" : building.tipus === "edi" ? "Edifici (\"edi\")" : building.tipus || "—"],
      ["Any de construcció", building.yearBuilt != null ? String(building.yearBuilt) : "No disponible (Cadastre)"],
      ["Ref. catastral", building.refcat || "No coneguda"],
      ["Altura estimada", building.altura != null ? `${fmt1(building.altura)} m` : "—"],
      ["Dada de fiances de l'illa", building.avgRentEurMonth != null ? `${fmt0(building.avgRentEurMonth)} €/mes (${building.sampleSize ?? "?"} mostres, importació pròpia)` : "No disponible"],
      ["Municipi de referència", `${mun.name} (mitjana ${mun.rentLatest != null ? fmt0(mun.rentLatest) + " €/mes" : "sense dada"})`],
    ];
    for (const [k, v] of rows) {
      text(k, 9.5, GRAY);
      text(v, 9.5, DARK, true, 190);
      y -= 15;
    }
    y -= 4;
    if (building.tipus === "ind") {
      line("Nota (nau industrial): les estadístiques oficials de fiances cobreixen lloguer d'HABITATGES. El lloguer de naus i edificis industrials es pacta per €/m² i mes i NO està representat per la mitjana municipal d'aquest informe. PreuReal no publica encara estadística industrial oficial.", 9, GRAY);
      y -= 6;
    }
    line("Quan la dada municipal i la dada de l'illa divergeixen, la de l'illa descriu millor aquest immoble; la municipal resta com a context agregat. Cap de les dues és una valoració de l'immoble concret.", 9, GRAY);
  } else {
    section("Com llegir aquest mercat");
    [
      "Què és la mitjana: el promig de les fiances dipositades a Incasòl pels contractes d'habitatge del municipi en el període citat. És la millor referència oficial disponible.",
      "Què no és: no és un preu màxim ni mínim, no distingeix barris, antiguitat ni estat, i no val com a taxació d'un pis concret.",
      "Variabilitat: dins del municipi hi ha illes molt per sobre i per sota de la mitjana; la banda P25-P75 de la pàgina 4 mostra aquesta dispersió on hi ha mostres.",
      "Mostra: amb pocs contractes de fiança la mitjana és més inestable entre períodes; compara tendències, no decimals.",
      "Actualització: les fiances es dipositen al signar el contracte, de manera que la sèrie reflecteix contractes NOUS (i renovacions registrades), no el parc complet.",
    ].forEach((s) => {
      line("• " + s, 9.5);
      y -= 3;
    });
  }

  // ---------- P6 · REGULACIÓ ----------
  newPage();
  section("Regulació: zona tensada i contractes");
  if (mun.isTense) {
    line(`Aquest municipi està declarat ÀREA DE MERCAT RESIDENCIAL TENSAT per la Generalitat (llista ${mun.tenseList === "A" ? "A — Resolució TER/3739/2026" : "C — Resolució TER/3740/2026"}, DOGC 19-10-2026).`, 10, DARK, true);
    y -= 8;
    line("En els municipis tensats, els CONTRACTES NOUS d'habitatge poden aplicar l'índex de referència de lloguers publicat pel Ministeri per a la zona, que serveix de sostre orientatiu per a la renda inicial (Reglament estatal de lloguer urbà, aplicat per la normativa catalana).", 9.5);
  } else {
    line("Aquest municipi NO consta a les resolucions d'àrees de mercat residencial tensat vigents (TER/3739/2026 i TER/3740/2026, DOGC 19-10-2026). No s'hi aplica l'índex de referència de lloguers com a sostre de nous contractes; segueixen aplicant les regles generals de la LAU.", 9.5);
  }
  y -= 10;
  [
    "Actualització de renda en contracte vigent: amb contracte d'habitatge d'ús principal, l'actualització anual no pot superar l'IPC (agregat estatal) durant el període legal vigent; les clàusules que remeten a altres índexs s'adapten a aquest límit.",
    "Renovació: en la pròrroga anual, la renda només s'actualitza segons el pactat dins dels límits legals; en municipis tensats hi ha límits additius a l'alçada de la renda en renovació.",
    "Fiança: obligatòria i equivalent a una mensualitat; s'ha de dipositar a Incasòl (és la font d'aquest informe). La garantia addicional no pot superar dues mensualitats en habitatge.",
    "Despeses: les despeses i tributs derivats de l'immoble són del propietari; els serveis individuals es pacten a part.",
  ].forEach((s) => {
    line("• " + s, 9.5);
    y -= 3;
  });
  y -= 6;
  line("Avís: aquest resum és orientatiu i no substitueix el text legal vigent ni l'assessorament professional. Consulta les fonts a la pàgina 8.", 8.5, GRAY);

  // ---------- P7 · AJUDES ----------
  newPage();
  section("Ajudes al lloguer vigents (fonts oficials)");
  if (aids.length > 0) {
    for (const a of aids) {
      text(a.title, 10.5, DARK, true);
      y -= 13;
      if (a.amount) line(`Import: ${a.amount}`, 9, DARK);
      if (a.audience) line(`A qui va dirigit: ${a.audience}`, 9);
      line(`Font oficial: ${a.source} · darrera revisió: ${a.reviewed} · ${a.url}`, 8, GRAY);
      y -= 8;
    }
  } else {
    line("Catàleg d'ajudes no disponible en aquest moment. Consulta habitatge.gencat.cat.", 9, GRAY);
    y -= 10;
  }
  line("Informació orientativa: els requisits i terminis canvien. Verifica sempre la convocatòria a la font oficial abans de prendre decisions.", 8.5, GRAY);

  // ---------- P8 · METODOLOGIA I LEGAL ----------
  newPage();
  section("Fonts i metodologia");
  [
    "Lloguer mitjà per municipi i sèrie històrica: fiances dipositades a Incasòl (Agència de l'Habitatge de Catalunya), via habitatge.gencat.cat. Mitjana municipal de contractes registrats; no descriu cap immoble concret.",
    "Geometria d'edificis i illes: ICGC, Mapa Topogràfic (RTT), llicència CC-BY 4.0. Referència catastral: ICGC/Cadastre.",
    "Banda P25-mediana-P75: construcció pròpia sobre illes del municipi amb dada de fiances importada, ponderada pel nombre de contractes (quartils tipus 7).",
    "Renda neta mitjana i esforç: Atlas de Distribució de Renda dels Llars (INE). IPVA: Índex de Preus de Vivienda en Alquiler (INE), base 2015=100.",
    "Àrees tensades: Resolucions TER/3739/2026 i TER/3740/2026 del DOGC (19-10-2026).",
    "Ajudes al lloguer: catàleg editorial propi amb verificació de la font oficial i data de darrera revisió (pàgina 7).",
  ].forEach((s) => {
    line("• " + s, 9);
    y -= 2;
  });
  y -= 6;
  section("Limitacions estadístiques");
  [
    "La mitjana municipal no reflecteix la variabilitat dins del municipi ni la qualitat de cada immoble.",
    `Mida de mostra municipal: ${mun.contractsLatest ?? "—"} contractes amb fiança al període vigent. Mostres petites impliquen més incertesa.`,
    "Les dades declarades pels usuaris (crowdsourcing) NO es barregen amb les oficials en aquest informe.",
    "On no hi ha dada oficial, l'informe ho diu explícitament i no inventa cap valor.",
  ].forEach((s) => {
    line("• " + s, 9);
    y -= 2;
  });
  y -= 6;
  section("Avís legal");
  line("Informe generat automàticament per PreuReal.cat amb dades oficials públiques. Ús exclusivament informatiu: no constitueix valoració immobiliària formal, assessorament financer ni jurídic. Les fonts citades són els propietaris de les seves dades. Consulta l'avís legal i la política de privacitat a www.preureal.com.", 9);
  y -= 10;
  text(`Informe v34 (Fase 6) · generat el ${input.genDate} · subscrit: ${input.subscriberMasked} · pla ${input.planLabel}`, 8.5, GRAY);
  footer();

  return pdf.save();
}
