/**
 * v47 — guardes del fix de la descàrrega PDF de l'Informe d'anàlisi del
 * lloguer i de l'enllaç creuat consulta → estima.
 *
 * 1. El botó «Descarrega l'informe (PDF)» era MUT: window.open amb el flag
 *    «noopener» retorna null als navegadors moderns, l'informe mai no
 *    s'escrivia i l'error s'empassava en silenci dins un catch buit. Ara
 *    s'imprimeix amb un iframe ocult fora de pantalla. La guarda avalua el
 *    codi sense comentaris i impedeix la regressió exacta (mateix patró que
 *    les guardes de font d'email_first).
 * 2. La secció «consulta» de la portada ha de tenir un CTA clar cap a
 *    «estima» amb un text RESUMIT i amb redacció pròpia (mai una còpia del
 *    text llarg de la pestanya estima), i l'informe complet un CTA a /estima.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("v47 — descàrrega PDF de l'informe (fix del botó mut)", () => {
  const report = readSrc("../src/components/analitza/AnalitzaReport.tsx");
  // codi sense els comentaris de línia: la guarda comprova el CODI real,
  // mai la documentació històrica que explica el bug original
  const code = report
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  test("P1. downloadPdf NO usa window.open amb «noopener» (retorna null i mai escriu)", () => {
    expect(code.includes('"noopener,noreferrer"')).toBe(false);
    expect(code).not.toContain('window.open("", "_blank", "noopener');
  });

  test("P2. downloadPdf imprimeix amb iframe ocult fora de pantalla", () => {
    expect(code).toContain('document.createElement("iframe")');
    expect(code).toContain("win.document.write(html)");
    expect(code).toContain("win.print()");
    expect(code).toContain("-10000px"); // fora de pantalla: mai tapa la pàgina
    // s'elimina amb marge suficient per al diàleg d'impressió (mai abans)
    expect(code).toContain("frame.remove()");
  });

  test("P3. l'informe complet té el CTA creuat cap a /estima", () => {
    expect(code).toContain('navigate("/estima")');
    expect(report).toContain("Valora el lloguer del teu habitatge");
  });
});

describe("v47 — enllaç consulta → estima (text resumit i propi)", () => {
  const landing = readSrc("../src/components/views/LandingView.tsx");
  const estima = readSrc("../src/components/views/EstimaView.tsx");

  test("L1. la pestanya consulta té un CTA que obre la pestanya estima", () => {
    expect(landing).toContain('setTab("estima")');
    expect(landing).toContain("Obre «Valora el lloguer del teu habitatge»");
  });

  test("L2. el teaser és RESUMIT i amb redacció pròpia (mai còpia del text llarg)", () => {
    expect(landing).toContain("escalada per superfície (N1)");
    expect(landing).toContain("mai una taxació");
    // les frases exactes del text llarg de la pestanya estima NO poden
    // repetir-se a la portada (el requisit és un text resumit i DIFERENT);
    // a «estima» el text llarg continua intacte
    const longPhrases = [
      "Una valoració progressiva per passos: el nivell N1 calcula un RANG orientatiu",
      "Cada xifra ve amb la seva font, el període, els contractes, els ajustos amb el seu factor i les limitacions",
      "Aquesta eina NO fa taxacions oficials ni avaluacions individualitzades",
    ];
    for (const ph of longPhrases) {
      expect(landing.includes(ph)).toBe(false);
      expect(estima.includes(ph)).toBe(true);
    }
  });
});
