/**
 * v56 — guardes de la revisió lingüística (BLOQUE E del PROMPT MASTER):
 *
 * Decisió terminològica del PROPIETARI (obligatòria): «estima/estimar» →
 * «valora/valorar» a AMBDUES llengües; a català «vivenda» → «habitatge» i
 * «renta» → «renda». Els disclaimers s'han reformulat per no contradir-se
 * («no és una valoració...» → «no és una taxació oficial...»).
 *
 * Aquestes guardes comproven CODI REAL (sense comentaris) i garanteixen:
 *  - cap string user-facing amb «vivenda», «Renta del contracte» (ca) ni
 *    arrel «estima» als fitxers clau (coherent amb el criteri d'acceptació
 *    «cero strings residuales»; els identificadors de codi — ruta /estima,
 *    claus estima.*, camp estimation, source=estimat — són noms tècnics
 *    documentats i NO són strings user-facing);
 *  - les redaccions noves oblíigatories són presents (Valora..., renda,
 *    habitatge, taxació oficial) a ca i es.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Codi sense comentaris (bloc, línia i JSX) — la guarda comprova CODI real. */
const codeOnly = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

describe("v56 — BLOQUE E: renombrado «Valora» + ca net (vivenda/renta/estima)", () => {
  // fitxers clau amb strings user-facing (ca/es)
  const files = {
    i18n: codeOnly(readSrc("../src/lib/i18n.ts")),
    landing: codeOnly(readSrc("../src/components/views/LandingView.tsx")),
    // v67 — el mòdul «Consulta el preu real registrat» (i el seu teaser creuat
    // cap a estima) passa de la portada a la pàgina pròpia /#/consulta; les
    // guardes evolucionen JUSTIFICADAMENT amb ell (mateixos texts, nova ubicació)
    consulta: codeOnly(readSrc("../src/components/views/ConsultaView.tsx")),
    estimaView: codeOnly(readSrc("../src/components/views/EstimaView.tsx")),
    estimaIntro: codeOnly(readSrc("../src/components/analitza/EstimaIntro.tsx")),
    estimaReport: codeOnly(readSrc("../src/components/estima/EstimaReport.tsx")),
    analitzaForm: codeOnly(readSrc("../src/components/analitza/AnalitzaForm.tsx")),
    analitzaHtml: codeOnly(readSrc("../src/lib/analitza-html.ts")),
    analitza: codeOnly(readSrc("../src/lib/analitza.ts")),
    estima: codeOnly(readSrc("../src/lib/estima.ts")),
    metodologia: codeOnly(readSrc("../src/components/views/MetodologiaView.tsx")),
    guia: codeOnly(readSrc("../src/components/views/GuiaView.tsx")),
    appshell: codeOnly(readSrc("../src/components/AppShell.tsx")),
    pageEstima: codeOnly(readSrc("../src/app/estima/page.tsx")),
  };
  const all = Object.values(files).join("\n");

  test("E1. cap «vivenda» a strings user-facing (ca usa «habitatge»)", () => {
    expect(all).not.toContain("vivenda");
    // ca normatiu present
    expect(files.analitzaForm).toContain("Adreça de l'habitatge (opcional)");
    expect(files.i18n).toContain("Renda típica orientativa per a aquesta superfície");
    expect(files.estima).toContain("de l'habitatge típic registrada a Incasòl");
  });

  test("E2. cap «renta» en ca (es manté «renta» correcta)", () => {
    expect(all).not.toContain("Renta del contracte");
    expect(files.analitzaForm).toContain("Renda del contracte anterior (€/mes)");
    expect(files.analitzaHtml).toContain("la renda d'un contracte nou es pot acordar lliurement");
    // es correcte i intacte
    expect(files.analitzaForm).toContain("Renta del contrato anterior (€/mes)");
  });

  test("E3. renombrado «Valora» present a ca i es (mai «Estima el lloguer»)", () => {
    expect(all).not.toContain("Estima el lloguer del teu habitatge");
    expect(files.landing).toContain("Valora el lloguer del teu habitatge");
    expect(files.landing).toContain("Valora el alquiler de tu vivienda");
    expect(files.estimaView).toContain('ca ? "Valora el lloguer del teu habitatge" : "Valora el alquiler de tu vivienda"');
    expect(files.appshell).toContain('link("/estima", "Valora")');
    expect(files.pageEstima).toContain("Valora el lloguer del teu habitatge");
    // nav i CTA (v67: el CTA creuat viu a /consulta des que el mòdul va sortir de la portada)
    expect(files.consulta).toContain('Obre «Valora el lloguer del teu habitatge»');
    expect(files.estimaIntro).toContain("Obre el valorador complet");
  });

  test("E4. disclaimers legals coherents («taxació oficial», mai «no és una valoració»)", () => {
    expect(all).not.toContain("no és una valoració del teu habitatge");
    expect(all).not.toContain("no es una valoración de tu vivienda");
    expect(files.analitza).toContain(
      "Rang orientatiu calculat amb dades oficials: no és una taxació oficial ni una avaluació individualitzada de l'habitatge.",
    );
    expect(files.analitza).toContain(
      "Rango orientativo calculado con datos oficiales: no es una tasación oficial ni una evaluación individualizada de la vivienda.",
    );
    expect(files.consulta).toContain("no és una taxació oficial; és una referència orientativa basada en dades oficials");
    expect(files.i18n).toContain("No és una taxació oficial d'un habitatge concret ni assessorament jurídic");
    expect(files.i18n).toContain("No es una tasación oficial de una vivienda concreta ni asesoramiento jurídico");
  });

  test("E5. marcas estadístiques amb «aproximació» (mai «estimació» a strings)", () => {
    expect(all).not.toContain("(estimació");
    expect(all).not.toContain("(estimación");
    expect(all).not.toContain("% estimat de lloguer");
    expect(all).not.toContain("estimació ponderada");
    expect(files.i18n).toContain("Referència de comarca (aproximació)");
    expect(files.i18n).toContain("Referencia de comarca (aproximación)");
    expect(files.estimaReport).toContain("Valoració orientativa per a un habitatge de");
    expect(files.metodologia).toContain("El valorador progressiu (#/estima) treballa en dos nivells");
    // la fórmula amb el terme ca correcte
    expect(files.metodologia).toContain("N1: renda orientativa (m²) = fiança municipal vigent");
  });

  test("E6. NO regressions: motor, quota, illa de cases i features intactes", () => {
    // el nom tècnic de la ruta/API és un identificador de codi i es CONSERVA
    expect(files.appshell).toContain('link("/estima", "Valora")');
    // el motor i els coeficients no canvien (regla 3 del PROMPT MASTER)
    const motor = codeOnly(readSrc("../src/lib/territorial.ts"));
    expect(motor).toContain("VAL_BETA_SUPERFICIE");
    // feature dormida illa de cases intacta (exclòs del renombrat)
    const report = codeOnly(readSrc("../src/lib/pdf-report.ts"));
    expect(report).toContain('Illa de cases');
    // quota server-side intacta
    const route = codeOnly(readSrc("../src/app/api/_impl/estima/route.ts"));
    expect(route).toContain("gateDetailedQuery");
  });
});
