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
export const REPORT_PAGES = 10; // v45: +1 pàgina «Anàlisi del mercat» (v42 sèries creuades)

/**
 * v45 — Anàlisi del mercat (sèries creuades) per al capítol nou del PDF.
 * Origen: /api/analisi/muni/[code] (src/lib/analisi.ts) → report-data.ts.
 * Tot opcional/null: sense sèries importades el capítol ho diu explícitament.
 */
export interface ReportMarket {
  contracts: {
    serie: Array<{ year: string; value: number }>;
    latest: number | null;
    latestYear: string | null;
    g5Pct: number | null;
    seriesFromImport: boolean;
  } | null;
  volume: { serie: Array<{ year: string; value: number }> } | null; // mediana × 12 × contractes (aproximació)
  census: { pct: number | null; year: string | null; catalunyaPct: number | null } | null;
  contractsPer1k: { value: number | null; year: string | null } | null;
  interpretacio: string[]; // lectures descriptives, sense causalitat
}

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

/**
 * v39 — Context demogràfic i territorial del municipi (IDESCAT).
 * Tot opcional/null: sense dada oficial el capítol ho diu explícitament.
 */
export interface ReportDemo {
  poblacio: {
    actual: number | null;
    any: string | null;
    serie: Array<{ year: string; value: number }>;
    var5Pct: number | null;
    var10Pct: number | null;
    homes: number | null;
    dones: number | null;
  };
  edats: {
    g0_14: number | null;
    g15_64: number | null;
    g65_84: number | null;
    g85_mes: number | null;
    any: string | null;
    pct65: number | null;
    pct0_14: number | null;
  };
  llars: {
    total: number | null;
    totalAny: string | null;
    midaMitjana: number | null;
    midaAny: string | null;
    distribucioPct: Record<string, number> | null;
  };
  estrangera: { valor: number | null; pct: number | null; any: string | null; pctCat: number | null };
  territori: { superficieKm2: number | null; densitat: number | null; densitatCat: number | null };
  comarca: { poblacioActual: number | null; densitat: number | null; pct65: number | null; comarca: string | null };
  cat: { poblacioActual: number | null; pct65: number | null };
  interpretacio: string[]; // regles sobre dades; sense causalitat
}

export interface ReportInput {
  mun: ReportMun;
  building: ReportBuilding | null;
  ind: ReportIndicators | null;
  demo: ReportDemo | null; // v39: context demogràfic (null = sense dades importades)
  market: ReportMarket | null; // v45: anàlisi del mercat (null = sèries no importades)
  aids: ReportAid[];
  subscriberMasked: string;
  planLabel: string;
  genDate: string; // "11 de novembre de 2026"
}

const fmt0 = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

// Fix 2026-11-11 — pdf-lib amb StandardFonts (WinAnsi) NO pot codificar
// símbols matemàtics presents a dades oficials reals (p. ex. «discapacitat
// ≥ 33 %», «ingressos ≤ 25.200 €/any» del catàleg d'ajuts): widthOfTextAtSize
// llançava «WinAnsi cannot encode "≥"» i l'informe retornava 500 per a TOTS
// els usuaris (reproduït i confirmat amb Postgres local + seed real).
// Sanegem TOTA l'entrada: símbols coneguts → equivalent ASCII; qualsevol
// caràcter fora del repertori WinAnsi → «?».
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const WINANSI_MAP: Record<string, string> = {
  "≥": ">=", "≤": "<=", "≈": "~", "≠": "!=",
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "⇐": "<=",
  "−": "-", "‑": "-", "‒": "-", "∕": "/", "⁄": "/",
  "\u2009": " ", "\u2005": " ", "\u2007": " ", "\u202f": " ", "\u00a0": " ",
  "\ufeff": "", "\u200b": "", "\u200c": "", "\u200d": "",
  "∞": "infinit",
};
export function winAnsi(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch in WINANSI_MAP) {
      out += WINANSI_MAP[ch];
      continue;
    }
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x20 && c <= 0x7e) { out += ch; continue; } // ASCII
    if (c >= 0xa0 && c <= 0xff) { out += ch; continue; } // Latin-1 (à ç ñ €…)
    if (WINANSI_EXTRA.includes(ch)) { out += ch; continue; } // 0x80-0x9F WinAnsi
    if (ch === "\n" || ch === "\t") { out += ch; continue; }
    out += "?";
  }
  return out;
}

export async function buildReportPdf(rawInput: ReportInput): Promise<Uint8Array> {
  // Fix 2026-11-11 — sanegat WinAnsi de TOTS els camps de text de l'entrada
  // (cobreix drawText directes, helpers text()/line() i capsçaleres/peus).
  const ns = (v: string | null | undefined) => (v == null ? null : winAnsi(v));
  const input: ReportInput = {
    mun: {
      ...rawInput.mun,
      name: winAnsi(rawInput.mun.name),
      comarca: ns(rawInput.mun.comarca),
      province: ns(rawInput.mun.province),
      tenseList: ns(rawInput.mun.tenseList),
      rentHistory: ns(rawInput.mun.rentHistory),
    },
    building: rawInput.building
      ? {
          ...rawInput.building,
          nom: ns(rawInput.building.nom),
          refcat: ns(rawInput.building.refcat),
          tipus: ns(rawInput.building.tipus),
          source: winAnsi(rawInput.building.source),
        }
      : null,
    ind: rawInput.ind
      ? {
          band: rawInput.ind.band,
          effortHogar: rawInput.ind.effortHogar
            ? { ...rawInput.ind.effortHogar, rentPeriod: ns(rawInput.ind.effortHogar.rentPeriod), rentaPeriod: winAnsi(rawInput.ind.effortHogar.rentaPeriod) }
            : null,
          rentaHogarLatest: rawInput.ind.rentaHogarLatest
            ? { ...rawInput.ind.rentaHogarLatest, period: winAnsi(rawInput.ind.rentaHogarLatest.period) }
            : null,
          ipvaCat: rawInput.ind.ipvaCat
            ? {
                latestAnual: rawInput.ind.ipvaCat.latestAnual
                  ? { ...rawInput.ind.ipvaCat.latestAnual, period: winAnsi(rawInput.ind.ipvaCat.latestAnual.period) }
                  : null,
                acum2015: rawInput.ind.ipvaCat.acum2015,
              }
            : null,
        }
      : null,
    // v39: el context demogràfic també passa pel sanejament WinAnsi
    demo: rawInput.demo
      ? {
          ...rawInput.demo,
          comarca: {
            ...rawInput.demo.comarca,
            comarca: ns(rawInput.demo.comarca.comarca),
          },
          interpretacio: rawInput.demo.interpretacio.map(winAnsi),
        }
      : null,
    // v45: les sèries de mercat (anàlisi) també passen pel sanejament WinAnsi
    market: rawInput.market
      ? {
          contracts: rawInput.market.contracts
            ? {
                serie: rawInput.market.contracts.serie,
                latest: rawInput.market.contracts.latest,
                latestYear: ns(rawInput.market.contracts.latestYear),
                g5Pct: rawInput.market.contracts.g5Pct,
                seriesFromImport: rawInput.market.contracts.seriesFromImport,
              }
            : null,
          volume: rawInput.market.volume ? { serie: rawInput.market.volume.serie } : null,
          census: rawInput.market.census
            ? {
                pct: rawInput.market.census.pct,
                year: ns(rawInput.market.census.year),
                catalunyaPct: rawInput.market.census.catalunyaPct,
              }
            : null,
          contractsPer1k: rawInput.market.contractsPer1k
            ? { value: rawInput.market.contractsPer1k.value, year: ns(rawInput.market.contractsPer1k.year) }
            : null,
          interpretacio: rawInput.market.interpretacio.map(winAnsi),
        }
      : null,
    aids: rawInput.aids.map((a) => ({
      title: winAnsi(a.title),
      amount: ns(a.amount),
      audience: ns(a.audience),
      source: winAnsi(a.source),
      url: winAnsi(a.url),
      reviewed: winAnsi(a.reviewed),
    })),
    subscriberMasked: winAnsi(rawInput.subscriberMasked),
    planLabel: winAnsi(rawInput.planLabel),
    genDate: winAnsi(rawInput.genDate),
  };
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
    page.drawText(`Preureal · generat el ${input.genDate} · dades: ${mun.rentPeriod || "—"}`, { x: 40, y: 11, size: 8, font, color: GRAY });
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
      page.drawText("Preureal", { x: 40, y: H - 18, size: 10, font: bold, color: WHITE });
      page.drawText(`Informe de lloguer · ${mun.name}`, { x: 200, y: H - 18, size: 9, font, color: rgb(0.79, 0.83, 0.8) });
    }
  };

  // ---------- P1 · PORTADA ----------
  newPage(true);
  page.drawRectangle({ x: 0, y: H - 262, width: W, height: 262, color: DARK });
  page.drawText("Preureal", { x: 40, y: H - 96, size: 34, font: bold, color: WHITE });
  page.drawText("Informe professional de lloguer · 10 pàgines", { x: 40, y: H - 126, size: 12, font, color: rgb(0.79, 0.83, 0.8) });
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
    "5. Contexte demogràfic i territorial (IDESCAT)",
    "6. Anàlisi del mercat: contractes, volum i dinamisme (Incasòl + Padró)",
    building ? "7. Edifici/illa analitzat i relació amb la dada municipal" : "7. Com llegir aquest mercat (interpretació de la mitjana)",
    "8. Regulació: zona tensada, índex de referència i contractes",
    "9. Ajudes al lloguer vigents (fonts oficials)",
    "10. Metodologia, fonts, limitacions estadístiques i avís legal",
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
  // Fix 2026-11-11 — JSON.parse defensiu: un rentHistory corrupte no pot
  // trencar l'informe (abans seria un 500); sense sèrie es mostra el missatge
  // de degradació de sota.
  let hist: Array<[string, number]> = [];
  if (mun.rentHistory) {
    try {
      hist = Object.entries(JSON.parse(mun.rentHistory as string))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => [k, Number(v)]);
    } catch {
      hist = [];
    }
  }
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
    line("Banda P25-P75: no disponible (mostres municipals insuficients; no s'aproxima).", 9, GRAY);
    y -= 10;
  }
  const effort = ind?.effortHogar ?? null;
  if (effort) {
    text("Esforç econòmic aproximat", 10, DARK, true);
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
  line("Tots els indicadors d'aquesta pàgina provenen de fonts oficials citades (Incasòl, INE). Preureal no els modifica ni els extrapola; on no hi ha dada, s'ho diu.", 8.5, GRAY);

  // ---------- P5 · CONTEXTE DEMOGRÀFIC I TERRITORIAL (v39, IDESCAT) ----------
  newPage();
  section("Contexte demogràfic i territorial del municipi");
  const demo = input.demo;
  if (demo && demo.poblacio.actual != null) {
    const pw = demo.poblacio;
    const ed = demo.edats;
    // KPI banda (4 caixes, patró P2)
    const dBoxes: Array<[string, string, string]> = [
      ["Població", pw.actual != null ? fmt0(pw.actual) : "—", pw.any ? `1 de gener ${pw.any}` : ""],
      ["Variació 5 anys", pw.var5Pct != null ? `${pw.var5Pct > 0 ? "+" : ""}${fmt1(pw.var5Pct)}%` : "—", "padró continu IDESCAT"],
      ["Variació 10 anys", pw.var10Pct != null ? `${pw.var10Pct > 0 ? "+" : ""}${fmt1(pw.var10Pct)}%` : "—", "creixement / estabilitat / pèrdua"],
      ["Densitat", demo.territori.densitat != null ? `${fmt0(demo.territori.densitat)} hab/km²` : "—", demo.territori.superficieKm2 != null ? `${fmt1(demo.territori.superficieKm2)} km²` : ""],
    ];
    const dbw = 125, dbh = 58;
    dBoxes.forEach(([label, value, sub], i) => {
      const bx = 40 + i * (dbw + 5);
      const by = y - dbh;
      page.drawRectangle({ x: bx, y: by, width: dbw, height: dbh, color: LIGHT });
      page.drawText(label, { x: bx + 8, y: by + dbh - 14, size: 7.5, font, color: GRAY });
      page.drawText(value, { x: bx + 8, y: by + dbh - 34, size: 13, font: bold, color: DARK });
      if (sub) page.drawText(winAnsi(sub), { x: bx + 8, y: by + 8, size: 6.5, font, color: GRAY });
    });
    y -= dbh + 16;

    // gràfic de LÍNIES vectorial: evolució de la població (últims 12 anys)
    const serie = pw.serie.slice(-12);
    if (serie.length >= 2) {
      text("Evolució de la població (1 de gener)", 10, DARK, true);
      y -= 10;
      const chartTop = y - 6;
      const chartH = 110;
      const chartX = 60;
      const chartW = 470;
      const maxV = Math.max(...serie.map((s) => s.value));
      const minV = Math.min(...serie.map((s) => s.value));
      const span = Math.max(maxV - minV, 1);
      const px = (i: number) => chartX + (i * chartW) / (serie.length - 1);
      const py = (v: number) => chartTop - 12 - ((v - minV) / span) * (chartH - 24);
      // malla lleu (màx i mín)
      page.drawText(fmt0(maxV), { x: chartX - 44, y: chartTop - 14, size: 6.5, font, color: GRAY });
      page.drawText(fmt0(minV), { x: chartX - 44, y: chartTop - chartH + 4, size: 6.5, font, color: GRAY });
      // línia + punts
      for (let i = 1; i < serie.length; i++) {
        page.drawLine({
          start: { x: px(i - 1), y: py(serie[i - 1].value) },
          end: { x: px(i), y: py(serie[i].value) },
          thickness: 1.6,
          color: DARK,
        });
      }
      serie.forEach((s, i) => {
        const isLast = i === serie.length - 1;
        page.drawCircle({ x: px(i), y: py(s.value), size: isLast ? 3.2 : 2, color: isLast ? ACCENT : DARK });
        if (serie.length <= 13 || i % 2 === 0) {
          const ys = String(s.year).slice(2);
          page.drawText(ys, { x: px(i) - 6, y: chartTop + 2, size: 6.5, font, color: GRAY });
        }
      });
      y = chartTop - chartH - 14;
      line(`Sèrie ${serie[0].year}–${serie[serie.length - 1].year} · Font: IDESCAT, Padró continu d'habitants (INE).`, 8.5, GRAY);
      y -= 8;
    }

    // distribució per grans grups d'edat (barres horitzontals oficials)
    const ageRows: Array<[string, number | null]> = [
      ["0-14 anys", ed.g0_14],
      ["15-64 anys", ed.g15_64],
      ["65-84 anys", ed.g65_84],
      ["85 anys i més", ed.g85_mes],
    ];
    const ageValid = ageRows.filter(([, v]) => v != null) as Array<[string, number]>;
    if (ageValid.length > 0 && pw.actual) {
      text("Estructura per grans grups d'edat", 10, DARK, true);
      y -= 12;
      const maxAge = Math.max(...ageValid.map(([, v]) => v));
      for (const [label, v] of ageValid) {
        const bw2 = Math.max(4, (v / maxAge) * 330);
        page.drawRectangle({ x: 130, y: y - 8, width: bw2, height: 11, color: DARK });
        const pct = (v / pw.actual) * 100;
        page.drawText(label, { x: 40, y: y - 6, size: 8.5, font, color: DARK });
        page.drawText(`${fmt0(v)} (${fmt1(pct)}%)`, { x: 136 + bw2 + 6, y: y - 6, size: 8, font, color: GRAY });
        y -= 16;
      }
      line(`Font: IDESCAT, grans grups d'edat del padró${ed.any && ed.any !== "n.d." ? ` (${ed.any})` : ""}.`, 8.5, GRAY);
      y -= 10;
    }

    // llars + estrangera + comparativa
    const llarsBits: string[] = [];
    if (demo.llars.total != null) llarsBits.push(`${fmt0(demo.llars.total)} llars al cens ${demo.llars.totalAny ?? "—"}`);
    if (demo.llars.midaMitjana != null) llarsBits.push(`grandària mitjana ${fmt1(demo.llars.midaMitjana)} persones/llar (${demo.llars.midaAny ?? "cens 2021"})`);
    if (llarsBits.length > 0) {
      text("Llars", 10, DARK, true);
      y -= 12;
      line(`El municipi té ${llarsBits.join(" i ")}. Font: IDESCAT, Censos de població i habitatges (INE). La sèrie de llars només existeix per als anys censals; no s'interpolen valors.`, 9.5);
      y -= 8;
    }
    if (demo.estrangera.pct != null) {
      text("Població de nacionalitat estrangera", 10, DARK, true);
      y -= 12;
      line(
        `${fmt0(demo.estrangera.valor ?? 0)} persones (${fmt1(demo.estrangera.pct)}% del total, ${demo.estrangera.any ?? "—"})${demo.estrangera.pctCat != null ? `; Catalunya ${fmt1(demo.estrangera.pctCat)}%` : ""}. Indicador descriptiu: no s'atribueix cap relació causal amb els preus del lloguer.`,
        9.5
      );
      y -= 8;
    }
    const cmpBits: string[] = [];
    if (demo.comarca.comarca && demo.comarca.poblacioActual != null) cmpBits.push(`${demo.comarca.comarca}: ${fmt0(demo.comarca.poblacioActual)} hab.`);
    if (demo.comarca.densitat != null) cmpBits.push(`densitat comarcal ${fmt0(demo.comarca.densitat)} hab/km²`);
    if (demo.cat.poblacioActual != null) cmpBits.push(`Catalunya: ${fmt0(demo.cat.poblacioActual)} hab.`);
    if (cmpBits.length > 0) {
      line(`Comparativa territorial — ${cmpBits.join(" · ")}.`, 9.5);
      y -= 8;
    }
    // interpretació automàtica (regles sobre dades; sense causalitat)
    if (demo.interpretacio.length > 0) {
      text("Lectura dels indicadors", 10, DARK, true);
      y -= 12;
      for (const s of demo.interpretacio.slice(0, 4)) {
        line(`• ${winAnsi(s)}`, 9);
        y -= 3;
      }
      y -= 4;
    }
    line("Aquest context demogràfic NO altera el càlcul del lloguer mitjà ni els indicadors de mercat: serveix per interpretar-los. Cada xifra cita la seva font oficial i l'any de referència; on no hi ha dada, no s'inventa.", 8.5, GRAY);
  } else {
    line("Encara no hi ha indicadors demogràfics oficials importats per a aquest municipi (IDESCAT, padró continu i censos). El sistema d'actualització els portarà automàticament; mentrestant no s'aproxima cap valor.", 9, GRAY);
    y -= 10;
  }

  // ---------- P6 · ANÀLISI DEL MERCAT (v45 — sèries creuades Incasòl/Padró/Cens) ----------
  newPage();
  section("Anàlisi del mercat: contractes, volum i dinamisme");
  const market = input.market;
  const contractsSerie = market?.contracts?.serie ?? [];
  if (contractsSerie.length >= 1) {
    // fila de KPI (4 caixes, patró de la pàgina 5)
    const g5c = market?.contracts?.g5Pct ?? null;
    const cp1k = market?.contractsPer1k ?? null;
    const census = market?.census ?? null;
    const fmtPct2 = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;
    const mkBoxes: Array<[string, string, string]> = [
      [
        "Contractes amb fiança (últim any)",
        market?.contracts?.latest != null ? fmt0(market.contracts.latest) : "—",
        market?.contracts?.latestYear && market.contracts.latestYear !== "n.d." ? `flux anual ${market.contracts.latestYear}` : "",
      ],
      ["Variació de contractes (5 anys)", g5c != null ? `${g5c > 0 ? "+" : ""}${fmt1(g5c)}%` : "—", g5c == null ? "sense sèrie comparable" : "activitat del mercat"],
      ["Contractes per 1.000 habitants", cp1k?.value != null ? cp1k.value.toFixed(2).replace(".", ",") : "—", cp1k?.year ? `any ${cp1k.year}` : "dinamisme del mercat"],
      [
        "Vivendes principals en lloguer",
        census?.pct != null ? fmtPct2(census.pct) : "—",
        census?.year ? `Cens ${census.year}${census.catalunyaPct != null ? ` · Catalunya ${fmtPct2(census.catalunyaPct)}` : ""}` : "",
      ],
    ];
    const mkw = 125, mkh = 58;
    mkBoxes.forEach(([label, value, sub], i) => {
      const bx = 40 + i * (mkw + 5);
      const by = y - mkh;
      page.drawRectangle({ x: bx, y: by, width: mkw, height: mkh, color: LIGHT });
      page.drawText(label, { x: bx + 8, y: by + mkh - 14, size: 7.5, font, color: GRAY });
      page.drawText(value, { x: bx + 8, y: by + mkh - 34, size: 13, font: bold, color: i === 0 ? ACCENT : DARK });
      if (sub) page.drawText(winAnsi(sub), { x: bx + 8, y: by + 8, size: 6.5, font, color: GRAY });
    });
    y -= mkh + 16;

    // gràfic de barres: contractes amb fiança per any (flux anual)
    text("Contractes amb fiança depositada per any (flux anual)", 10, DARK, true);
    y -= 10;
    if (contractsSerie.length >= 2) {
      const cTop = y - 6;
      const cH = 100;
      const maxC = Math.max(...contractsSerie.map((s) => s.value), 1);
      const barW = 495 / contractsSerie.length;
      contractsSerie.forEach((s, i) => {
        const h = Math.max(2, (s.value / maxC) * cH);
        page.drawRectangle({ x: 50 + i * barW, y: cTop - h, width: Math.max(3, barW - 5), height: h, color: i === contractsSerie.length - 1 ? ACCENT : DARK });
        page.drawText(String(s.year).slice(2), { x: 50 + i * barW + (barW - 10) / 2, y: cTop - h - 11, size: 6.5, font, color: GRAY });
      });
      y = cTop - cH - 26;
      line(`Sèrie ${contractsSerie[0].year}–${contractsSerie[contractsSerie.length - 1].year} · Font: Registre de fiances d'Incasòl (flux anual de contractes, ingesta mensual). L'últim any (taronja) és el vigent.`, 8.5, GRAY);
    } else {
      const s0 = contractsSerie[0];
      line(`${s0.year}: ${fmt0(s0.value)} contractes amb fiança (punt únic publicat; la sèrie completa s'activarà amb la ingesta mensual).`, 9.5);
      y -= 8;
    }
    y -= 6;

    // gràfic: volum de mercat registrat aproximat (€/any)
    const volSerie = (market?.volume?.serie ?? []).filter((v) => v.value > 0);
    if (volSerie.length >= 2) {
      text("Volum de mercat registrat aproximat (€/any)", 10, DARK, true);
      y -= 10;
      const vTop = y - 6;
      const vH = 90;
      const maxV = Math.max(...volSerie.map((s) => s.value), 1);
      const barW = 495 / volSerie.length;
      volSerie.forEach((s, i) => {
        const h = Math.max(2, (s.value / maxV) * vH);
        page.drawRectangle({ x: 50 + i * barW, y: vTop - h, width: Math.max(3, barW - 5), height: h, color: i === volSerie.length - 1 ? ACCENT : DARK });
        page.drawText(String(s.year).slice(2), { x: 50 + i * barW + (barW - 10) / 2, y: vTop - h - 11, size: 6.5, font, color: GRAY });
      });
      y = vTop - vH - 26;
      line(`Aproximació elaborada per PreuReal: mediana mensual × 12 × contractes de l'any. No és una xifra oficial: és una aproximació del volum registrat.`, 8.5, GRAY);
      y -= 6;
    }

    // lectura creuada (lectures descriptives de les sèries, sense causalitat)
    if (market && market.interpretacio.length > 0) {
      text("Lectura creuada de les sèries", 10, DARK, true);
      y -= 12;
      for (const s of market.interpretacio.slice(0, 4)) {
        line(`• ${s}`, 9);
        y -= 3;
      }
      y -= 4;
    }
    line("Totes les sèries provenen de fonts oficials citades (Incasòl, IDESCAT/INE). Les lectures són descriptives i NO estabeleixen cap relació causal; on no hi ha dada, no s'inventa.", 8.5, GRAY);
  } else {
    line("Les sèries de contractes amb fiança i de volum de mercat encara no estan importades per a aquest municipi (la ingesta mensual del Registre de fiances d'Incasòl les portarà automàticament). Mentrestant, no s'aproxima cap valor.", 9, GRAY);
    y -= 10;
  }

  // ---------- P7 · EDIFICI / LECTURA DEL MERCAT ----------
  newPage();
  if (building) {
    section("Edifici / illa analitzat");
    text(building.nom || building.refcat || "Edifici", 13, DARK, true);
    y -= 16;
    const rows: Array<[string, string]> = [
      ["Tipus (ICGC RTT)", building.tipus === "ind" ? "Nau industrial (\"ind\")" : building.tipus === "ill" ? "Illa de cases (\"ill\")" : building.tipus === "edi" ? "Edifici (\"edi\")" : building.tipus || "—"],
      ["Any de construcció", building.yearBuilt != null ? String(building.yearBuilt) : "No disponible (Cadastre)"],
      ["Ref. catastral", building.refcat || "No coneguda"],
      ["Altura aproximada", building.altura != null ? `${fmt1(building.altura)} m` : "—"],
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
      line("Nota (nau industrial): les estadístiques oficials de fiances cobreixen lloguer d'HABITATGES. El lloguer de naus i edificis industrials es pacta per €/m² i mes i NO està representat per la mitjana municipal d'aquest informe. Preureal no publica encara estadística industrial oficial.", 9, GRAY);
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

  // ---------- P8 · REGULACIÓ ----------
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
  line("Avís: aquest resum és orientatiu i no substitueix el text legal vigent ni l'assessorament professional. Consulta les fonts a la pàgina 10.", 8.5, GRAY);

  // ---------- P9 · AJUDES ----------
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

  // ---------- P10 · METODOLOGIA I LEGAL ----------
  newPage();
  section("Fonts i metodologia");
  [
    "Lloguer mitjà per municipi i sèrie històrica: fiances dipositades a Incasòl (Agència de l'Habitatge de Catalunya), via habitatge.gencat.cat. Mitjana municipal de contractes registrats; no descriu cap immoble concret.",
    "Geometria d'edificis i illes: ICGC, Mapa Topogràfic (RTT), llicència CC-BY 4.0. Referència catastral: ICGC/Cadastre.",
    "Banda P25-mediana-P75: construcció pròpia sobre illes del municipi amb dada de fiances importada, ponderada pel nombre de contractes (quartils tipus 7).",
    "Renda neta mitjana i esforç: Atlas de Distribució de Renda dels Llars (INE). IPVA: Índex de Preus de Vivienda en Alquiler (INE), base 2015=100.",
    "Contexte demogràfic i territorial (pàgina 5): IDESCAT — Padró continu d'habitants (INE), Censos de població i habitatges i «El municipi en xifres». Llicència Oberta d'Ús d'Informació — Catalunya; percentatges calculats sobre categories oficials; població estrangera = total - nacionalitat espanyola; mai s'interpolen sèries.",
    "Àrees tensades: Resolucions TER/3739/2026 i TER/3740/2026 del DOGC (19-10-2026).",
    "Anàlisi del mercat (pàgina 6): flux anual de contractes amb fiança (Registre de fiances d'Incasòl, ingesta mensual), població del Padró continu (IDESCAT/INE), % de vivendes principals en lloguer (Cens 2021, INE) i volum aproximat = mediana mensual × 12 × contractes de l'any (aproximació elaborada per PreuReal; lectures descriptives, sense causalitat).",
    "Ajudes al lloguer: catàleg editorial propi amb verificació de la font oficial i data de darrera revisió (pàgina 9).",
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
  line("Informe generat automàticament per Preureal amb dades oficials públiques. Ús exclusivament informatiu: no constitueix valoració immobiliària formal, assessorament financer ni jurídic. Les fonts citades són els propietaris de les seves dades. Consulta l'avís legal i la política de privacitat a www.preureal.com.", 9);
  y -= 10;
  text(`Informe v39 (Fase demografia) · generat el ${input.genDate} · subscrit: ${input.subscriberMasked} · pla ${input.planLabel}`, 8.5, GRAY);
  footer();

  return pdf.save();
}
