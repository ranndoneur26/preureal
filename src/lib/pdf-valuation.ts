import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";

/**
 * v38.8 — Informe individual de VALORACIÓ D'HABITATGE (pagament únic, 6,99 €).
 * Funció PURA (cap BD ni auth, testable amb bun test): rep el resultat ja
 * calculat pel motor v2 (src/lib/territorial.ts computeValuation) i els
 * paràmetres validats, i retorna els bytes del PDF (4 pàgines aproximadament).
 * Bilingüe ca/es: l'idioma es decideix a la compra (user.locale) i es guarda
 * als params de la compra.
 * Regla del producte: cada dada cita font i període; on no hi ha dada oficial
 * s'ho diu explícitament i mai s'inventa. winAnsi() saneja tot el dinàmic.
 */
import { winAnsi } from "@/lib/pdf-report";
import type { ValuationResult, EstatConservacio } from "@/lib/territorial";

const DARK = rgb(0.059, 0.18, 0.129);
const ACCENT = rgb(0.91, 0.4, 0.235);
const GRAY = rgb(0.42, 0.45, 0.42);
const LIGHT = rgb(0.96, 0.95, 0.93);
const WHITE = rgb(1, 1, 1);
const W = 595; // A4
const H = 842;

export interface ValuationReportMuni {
  name: string;
  comarca: string | null;
  province: string | null;
  code: string;
  rentLatest: number | null;
  rentPeriod: string | null;
  contractsLatest: number | null;
  isTense: boolean;
  tenseList: string | null;
}

export interface ValuationReportInput {
  muni: ValuationReportMuni;
  params: { surfaceM2: number | null; rooms: number | null; estat: EstatConservacio | null };
  valuation: ValuationResult;
  locale: "ca" | "es";
  genDate: string; // ja formatada (ca-ES / es-ES segons locale)
  purchaseRef: string; // referència curta de la compra (últims 6 caràcters)
}

const ESTAT_LABEL: Record<EstatConservacio, [string, string]> = {
  A_REFORMAR: ["A reformar", "A reformar"],
  BON_ESTAT: ["Bon estat", "Buen estado"],
  REFORMADA: ["Reformada", "Reformada"],
  OBRA_NOVA: ["Obra nova", "Obra nueva"],
};

const ADJ_LABEL: Record<string, [string, string]> = {
  AJUST_SUPERFICIE: ["Superfície", "Superficie"],
  AJUST_ESTAT: ["Estat de conservació", "Estado de conservación"],
  AJUST_HABITACIONS: ["Habitacions (densitat m²/hab)", "Habitaciones (densidad m²/hab)"],
};

const BAND_BASIS_LABEL: Record<string, [string, string]> = {
  COMARCA: ["dispersió mesurada de la comarca (mateix any)", "dispersión medida de la comarca (mismo año)"],
  PROVINCIA: ["dispersió mesurada de la província (mateix any)", "dispersión medida de la provincia (mismo año)"],
  HISTORICA: ["rang històric del municipi", "rango histórico del municipio"],
};

const CONF_LABEL: Record<string, [string, string]> = {
  ALTA: ["Alta", "Alta"],
  MITJANA: ["Mitjana", "Media"],
  BAIXA: ["Baixa", "Baja"],
};

export async function buildValuationPdf(rawInput: ValuationReportInput): Promise<Uint8Array> {
  const es = rawInput.locale === "es";
  // sanitització WinAnsi de tot el dinàmic (noms propis poden dur símbols)
  const muni: ValuationReportMuni = {
    ...rawInput.muni,
    name: winAnsi(rawInput.muni.name),
    comarca: rawInput.muni.comarca ? winAnsi(rawInput.muni.comarca) : null,
    province: rawInput.muni.province ? winAnsi(rawInput.muni.province) : null,
    tenseList: rawInput.muni.tenseList ? winAnsi(rawInput.muni.tenseList) : null,
  };
  const v = rawInput.valuation;
  const genDate = winAnsi(rawInput.genDate);
  const purchaseRef = winAnsi(rawInput.purchaseRef);

  const fmt0 = (n: number) => n.toLocaleString(es ? "es-ES" : "ca-ES", { maximumFractionDigits: 0 });
  const fmt1 = (n: number) =>
    n.toLocaleString(es ? "es-ES" : "ca-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page!: PDFPage;
  let pageNo = 0;
  let y = 0;

  const text = (s: string, size = 10, color = rgb(0.09, 0.11, 0.09), b = false, x = 40) => {
    // sanitització WinAnsi aquí TAMBIÉ: els literals del report porten símbols
    // (≈85 m², P75−P25) que StandardFonts no pot codificar (mateix fix v34)
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
      es
        ? `Preureal · generado el ${genDate} · compra ${purchaseRef}`
        : `Preureal · generat el ${genDate} · compra ${purchaseRef}`,
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
        `${es ? "Valoración de vivienda" : "Valoració d'habitatge"} · ${muni.name}`,
        { x: 200, y: H - 18, size: 9, font, color: rgb(0.79, 0.83, 0.8) }
      );
    }
  };

  // ---------- P1 · PORTADA + RESULTAT ----------
  newPage(true);
  page.drawRectangle({ x: 0, y: H - 262, width: W, height: 262, color: DARK });
  page.drawText("Preureal", { x: 40, y: H - 96, size: 34, font: bold, color: WHITE });
  page.drawText(es ? "Informe individual de valoración orientativa de alquiler" : "Informe individual de valoració orientativa de lloguer", {
    x: 40, y: H - 126, size: 12, font, color: rgb(0.79, 0.83, 0.8),
  });
  page.drawText(`${es ? "Generado el" : "Generat el"} ${genDate}`, { x: 40, y: H - 146, size: 10, font, color: rgb(0.79, 0.83, 0.8) });

  y = H - 262 - 40;
  text(muni.name, 24, DARK, true);
  y -= 10;
  line(`${muni.comarca || "—"} · ${muni.province || "—"} · Codi municipal ${muni.code}`, 10.5, GRAY);
  y -= 12;
  page.drawRectangle({ x: 40, y: y - 92, width: 515, height: 100, color: LIGHT });
  text(es ? "Renta mensual orientativa (vivienda introducida)" : "Renda mensual orientativa (habitatge introduït)", 9, GRAY);
  y -= 34;
  const central = `${fmt0(v.central)} €/mes`;
  text(central, 28, DARK, true);
  text(`· ${es ? "horquilla" : "horquilla"} ${fmt0(v.min)}–${fmt0(v.max)} €`, 11, GRAY, false, 40 + bold.widthOfTextAtSize(central, 28) + 10);
  y -= 24;
  if (v.eurM2 != null) text(`${fmt1(v.eurM2)} €/m² i mes ${es ? "(derivado de la superficie introducida)" : "(derivat de la superfície introduïda)"}`, 10.5, DARK);
  else y -= 4;
  y -= 22;
  const conf = CONF_LABEL[v.confidence]?.[es ? 1 : 0] ?? v.confidence;
  text(es ? `Confianza: ${conf}` : `Confiança: ${conf}`, 10.5, ACCENT, true);
  y = y - 92 - 24;
  line(es
    ? "Esta valoración se basa en la fianza municipal oficial vigente y ajusta el importe con los datos que has introducido. Es una referencia estadística orientativa: no es una tasación oficial ni asesoramiento."
    : "Aquesta valoració es basa en la fiança municipal oficial vigent i ajusta l'import amb les dades que has introduït. És una referència estadística orientativa: no és una taxació oficial ni assessorament.",
    9.5, GRAY);

  // ---------- P2 · DESGLOSAMENT ----------
  newPage();
  section(es ? "Desglose del cálculo (todo visible)" : "Desglossament del càlcul (tot visible)");

  const baseLabel = v.baseSource === "MUNICIPI"
    ? (es ? "Fianza municipal oficial (Incasòl)" : "Fiança municipal oficial (Incasòl)")
    : (es ? "Referencia de comarca (media ponderada Incasòl)" : "Referència de comarca (mitjana ponderada Incasòl)");
  text(es ? "Base de referencia (vivienda típica ≈85 m²)" : "Base de referència (habitatge típic ≈85 m²)", 9.5, GRAY);
  y -= 14;
  text(`${fmt0(v.baseCentral)} €/mes`, 14, DARK, true);
  text(`· ${baseLabel} · ${es ? "período" : "període"} ${muni.rentPeriod || "—"}`, 9, GRAY, false, 40 + bold.widthOfTextAtSize(`${fmt0(v.baseCentral)} €/mes`, 14) + 8);
  y -= 22;

  if (v.adjustments.length > 0) {
    text(es ? "Ajustes aplicados (multiplicadores)" : "Ajustos aplicats (multiplicadors)", 10, DARK, true);
    y -= 16;
    const colX = [40, 260, 330];
    text(es ? "Concepto" : "Concepte", 9, GRAY, true, colX[0]);
    text(es ? "Detalle" : "Detall", 9, GRAY, true, colX[1]);
    text(es ? "Factor" : "Factor", 9, GRAY, true, colX[2]);
    y -= 14;
    for (const a of v.adjustments) {
      const lbl = ADJ_LABEL[a.key]?.[es ? 1 : 0] ?? a.key;
      const detail = a.key === "AJUST_ESTAT" && a.detail in ESTAT_LABEL
        ? ESTAT_LABEL[a.detail as EstatConservacio][es ? 1 : 0]
        : winAnsi(a.detail);
      text(lbl, 9.5, DARK, false, colX[0]);
      text(detail, 9.5, GRAY, false, colX[1]);
      text(`×${fmt1(a.factor)}`, 9.5, DARK, true, colX[2]);
      y -= 15;
    }
    y -= 6;
    text(`${es ? "Resultado tras ajustes" : "Resultat després d'ajustos"}: ${fmt0(v.central)} €/mes`, 10.5, DARK, true);
    y -= 16;
  } else {
    line(es
      ? "No se ha introducido ninguna característica concreta: el resultado es el de la vivienda típica del municipio (sin ajustes)."
      : "No s'ha introduït cap característica concreta: el resultat és el de l'habitatge típic del municipi (sense ajustos).",
      9.5, GRAY);
    y -= 6;
  }

  section(es ? "Horquilla y confianza" : "Horquilla i confiança");
  const basis = BAND_BASIS_LABEL[v.bandBasis]?.[es ? 1 : 0] ?? v.bandBasis;
  line(es
    ? `La horquilla (${fmt0(v.min)}–${fmt0(v.max)} €/mes) se construye con la ${basis}, calculada sobre ${v.bandN} municipios${v.bandYear ? ` del año ${v.bandYear}` : ""} y aplicada sobre el importe central ajustado.`
    : `L'horquilla (${fmt0(v.min)}–${fmt0(v.max)} €/mes) es construeix amb la ${basis}, calculada sobre ${v.bandN} municipis${v.bandYear ? ` de l'any ${v.bandYear}` : ""} i aplicada sobre l'import central ajustat.`,
    9.5);
  y -= 6;
  const confKeysEs: Record<string, string> = {
    CONF_PERIODE_RECENT: "el período vigente es reciente",
    CONF_CONTRACTS_ALTS: "muchos contratos con fianza registrados",
    CONF_BASE_COMARCA: "la dispersión se mide con los municipios de la comarca",
    CONF_PERIODE_VELL: "el período vigente no es reciente",
    CONF_CONTRACTS_MIG: "número de contratos medio",
    CONF_BASE_AMPLA: "la dispersión se mide con un pool más amplio (provincia o histórico)",
    CONF_DADES_MIGUES: "menos datos de los deseados",
    CONF_CONTRACTS_POCS: "pocos contratos con fianza registrados",
    CONF_BASE_COMARCA_REF: "la base es la referencia de comarca (el municipio no tiene fianza publicada)",
  };
  const confKeysCa: Record<string, string> = {
    CONF_PERIODE_RECENT: "el període vigent és recent",
    CONF_CONTRACTS_ALTS: "molts contractes amb fiança registrats",
    CONF_BASE_COMARCA: "la dispersió es mesura amb els municipis de la comarca",
    CONF_PERIODE_VELL: "el període vigent no és recent",
    CONF_CONTRACTS_MIG: "nombre de contractes mitjà",
    CONF_BASE_AMPLA: "la dispersió es mesura amb un pool més ampli (província o històric)",
    CONF_DADES_MIGUES: "menys dades de les desitjables",
    CONF_CONTRACTS_POCS: "pocs contractes amb fiança registrats",
    CONF_BASE_COMARCA_REF: "la base és la referència de comarca (el municipi no té fiança publicada)",
  };
  const keyDict = es ? confKeysEs : confKeysCa;
  for (const k of v.confidenceKeys) {
    if (keyDict[k]) line(`• ${keyDict[k]}`, 9.5);
  }
  y -= 6;
  line(es
    ? `Dispersión medida del pool ((P75−P25)/P50): ${fmt1(v.relativeDispersion)} · confianza ${conf.toLowerCase()}.`
    : `Dispersió mesurada del pool ((P75−P25)/P50): ${fmt1(v.relativeDispersion)} · confiança ${conf.toLowerCase()}.`,
    9, GRAY);

  if (v.warnings.length > 0) {
    y -= 4;
    section(es ? "Avisos de habitabilidad (Decreto 141/2012)" : "Avisos d'habitabilitat (Decret 141/2012)");
    for (const w of v.warnings) {
      const lvlEs: Record<string, string> = { ILLEGAL: "ILEGAL", EXCEPCIONAL: "EXCEPCIONAL", ADVERTENCIA: "AVISO", INFO: "INFO" };
      const lvlCa: Record<string, string> = { ILLEGAL: "IL·LEGAL", EXCEPCIONAL: "EXCEPCIONAL", ADVERTENCIA: "ADVERTÈNCIA", INFO: "INFO" };
      const lvl = (es ? lvlEs : lvlCa)[w.level] ?? w.level;
      text(lvl, 9.5, ACCENT, true);
      text(winAnsi(w.detail), 9.5, DARK, false, 110);
      y -= 14;
    }
    line(es
      ? "Los avisos informan de la LEGALIDAD de la vivienda introducida y NO modifican el cálculo. Consulta el Decreto 141/2012 (DOGC 6254)."
      : "Els avisos informen de la LEGALITAT de l'habitatge introduït i NO modifiquen el càlcul. Consulta el Decret 141/2012 (DOGC 6254).",
      8.5, GRAY);
  }

  // ---------- P3 · CONTEXT DEL MUNICIPI ----------
  newPage();
  section(es ? "Contexto del municipio" : "Context del municipi");
  const rows: Array<[string, string]> = [
    [es ? "Fianza municipal vigente" : "Fiança municipal vigent", muni.rentLatest != null ? `${fmt0(muni.rentLatest)} €/mes (${es ? "período" : "període"} ${muni.rentPeriod || "—"})` : es ? "No publicada (se usa la referencia de comarca)" : "No publicada (s'usa la referència de comarca)"],
    [es ? "Contratos con fianza" : "Contractes amb fiança", muni.contractsLatest != null ? fmt0(muni.contractsLatest) : "—"],
    [es ? "Área tensionada" : "Àrea tensada", muni.isTense ? (es ? `SÍ (lista ${muni.tenseList || "—"})` : `SÍ (llista ${muni.tenseList || "—"})`) : "NO"],
    [es ? "Comarca / provincia" : "Comarca / província", `${muni.comarca || "—"} / ${muni.province || "—"}`],
    [es ? "Código municipal INE" : "Codi municipal INE", muni.code],
  ];
  for (const [k, val] of rows) {
    text(k, 9.5, GRAY);
    text(val, 9.5, DARK, true, 210);
    y -= 15;
  }
  y -= 8;
  if (muni.isTense) {
    line(es
      ? "Este municipio ESTÁ declarado área de mercado residencial tensionado: los nuevos contratos pueden tener como techo orientativo el Índice de Referencia de Alquileres (IRL) del Ministerio para la zona. Un precio muy por encima del IRL puede ser nulo de pleno derecho."
      : "Aquest municipi ESTÀ declarat àrea de mercat residencial tensat: els contractes nous hi poden tenir com a sostre orientatiu l'Índex de Referència de Lloguers (IRL) del Ministeri per a la zona. Un preu molt per sobre de l'IRL pot ser nul de ple dret.",
      9.5, DARK, true);
  } else {
    line(es
      ? "Este municipio NO consta en las resoluciones de áreas tensionadas vigentes: se aplican las reglas generales de la LAU (sin IRL como techo)."
      : "Aquest municipi NO consta a les resolucions d'àrees tensades vigents: s'hi apliquen les regles generals de la LAU (sense IRL com a sostre).",
      9.5);
  }
  y -= 10;
  section(es ? "Cómo usar esta valoración" : "Com usar aquesta valoració");
  (es
    ? [
        "Negociación: si la renta que te ofrecen supera la horquilla, pregunta por qué y usa esta página como argumento con datos oficiales.",
        "Superficie legal: introduce la superficie ÚTIL (excluye zonas con menos de 1,90 m de altura); si introduces la construida, el cálculo es prudente.",
        "Qué NO es: no es una tasación hipotecaria ni una propuesta de precio contractual; la dispersión dentro del municipio es alta.",
        "Actualización: la fianza refleja contratos NUEVOS registrados en Incasòl, no el parque completo.",
      ]
    : [
        "Negociació: si la renda que t'ofereixen supera l'horquilla, pregunta per què i usa aquesta pàgina com a argument amb dades oficials.",
        "Superfície legal: introdueix la superfície ÚTIL (exclou zones amb menys d'1,90 m d'alçada); si introdueixes la construïda, el càlcul és prudent.",
        "Què NO és: no és una taxació hipotecària ni una proposta de preu contractual; la dispersió dins del municipi és alta.",
        "Actualització: la fiança reflecteix contractes NOUS registrats a Incasòl, no el parc complet.",
      ]
  ).forEach((s) => {
    line("• " + s, 9.5);
    y -= 3;
  });

  // ---------- P4 · METODOLOGIA I LEGAL ----------
  newPage();
  section(es ? "Fuentes y metodología" : "Fonts i metodologia");
  (es
    ? [
        "Base: fianza municipal vigente publicada por Incasòl (Agència de l'Habitatge de Catalunya) vía habitatge.gencat.cat; si el municipio no la publica (muestra pequeña), referencia de comarca ponderada por contratos.",
        "Motor v2: renta(m²) = base × (m²/85)^0,8 (elasticidad renta-superficie documentada en estudios hedónicos, β=0,8); estado: a reformar ×0,8 · reformada ×1,06 · obra nueva ×1,12; habitaciones: densidad m²/hab limitada a ±5%.",
        "Horquilla: dispersión MEDIDA (cuartiles) del pool territorial el mismo año del período vigente (comarca ≥5 municipios; si no, provincia ≥10; si no, rango histórico).",
        "Áreas tensionadas: Resoluciones TER/3739/2026 y TER/3740/2026 (DOGC 19-10-2026).",
        "Habitabilidad: Decreto 141/2012, de 30 de octubre (DOGC 6254).",
      ]
    : [
        "Base: fiança municipal vigent publicada per Incasòl (Agència de l'Habitatge de Catalunya) via habitatge.gencat.cat; si el municipi no la publica (mostra petita), referència de comarca ponderada per contractes.",
        "Motor v2: renta(m²) = base × (m²/85)^0,8 (elasticitat renta-superfície documentada en estudis hedònics, β=0,8); estat: a reformar ×0,8 · reformada ×1,06 · obra nova ×1,12; habitacions: densitat m²/hab limitada a ±5%.",
        "Horquilla: dispersió MESURADA (quartils) del pool territorial el mateix any del període vigent (comarca ≥5 municipis; si no, província ≥10; si no, rang històric).",
        "Àrees tensades: Resolucions TER/3739/2026 i TER/3740/2026 (DOGC 19-10-2026).",
        "Habitabilitat: Decret 141/2012, de 30 d'octubre (DOGC 6254).",
      ]
  ).forEach((s) => {
    line("• " + s, 9);
    y -= 2;
  });
  y -= 6;
  section(es ? "Limitaciones" : "Limitacions");
  (es
    ? [
        "La valoración es una referencia estadística agregada: no describe el estado real del inmueble ni su planta, orientación o equipamiento.",
        "Con muestras municipales pequeñas la base es menos estable entre períodos.",
        "Donde no hay dato oficial, el informe lo dice explícitamente y no inventa ningún valor.",
      ]
    : [
        "La valoració és una referència estadística agregada: no descriu l'estat real de l'immoble ni la seva planta, orientació o equipament.",
        "Amb mostres municipals petites la base és menys estable entre períodes.",
        "On no hi ha dada oficial, l'informe ho diu explícitament i no inventa cap valor.",
      ]
  ).forEach((s) => {
    line("• " + s, 9);
    y -= 2;
  });
  y -= 6;
  section(es ? "Aviso legal" : "Avís legal");
  line(es
    ? "Informe generado automáticamente por Preureal con datos oficiales públicos, a partir de una compra puntual. Uso exclusivamente informativo: no constituye valoración inmobiliaria formal (tasación), asesoramiento financiero ni jurídico. Las fuentes citadas son los propietarios de sus datos. www.preureal.com."
    : "Informe generat automàticament per Preureal amb dades oficials públiques, a partir d'una compra puntual. Ús exclusivament informatiu: no constitueix valoració immobiliària formal (taxació), assessorament financer ni jurídic. Les fonts citades són els propietaris de les seves dades. www.preureal.com.",
    9);
  y -= 10;
  text(`Informe v38.8 · ${es ? "generado el" : "generat el"} ${genDate} · compra ${purchaseRef}`, 8.5, GRAY);
  footer();

  return pdf.save();
}
