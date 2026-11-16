/**
 * v50 — guardes del panell demogràfic del mapa («Contexte demogràfic i
 * territorial», DemografiaPanel dins la fitxa municipal del /mapa):
 *
 * PROBLEMA (captura d'usuari, Barcelona): les 4 xifres KPI (Població,
 * Variació 5 anys, Variació 10 anys, Densitat) anaven en una FILA de 4
 * columnes (grid-cols-2 sm:grid-cols-4) dins d'una fitxa estreta: les xifres
 * llargues (1.731.649 · 16.904 hab/km²) DESBORDAVEN el requadre i se
 * solapaven amb el KPI veí.
 *
 * FIX (literal, el que demanà l'usuari): una xifra SOTA l'altra (mai al
 * costat) i requadres més grans:
 *  - el grid de KPIs és d'UNA columna (cada xifra ocupa tota l'amplada);
 *  - el requadre Kpi té padding més generós i el detall queda separat;
 *  - res més del panell canvia: títol, badges, gràfics, detall opcional,
 *    fonts i el muntatge des de MapView queden intactes.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Codi sense comentaris de línia NI blocs JSX — la guarda comprova CODI real. */
const codeOnly = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

describe("v50 — xifres del panell demogràfic apilades (una per fila)", () => {
  const panel = codeOnly(readSrc("../src/components/views/DemografiaPanel.tsx"));

  test("D1. el grid de KPIs és d'UNA columna: una xifra sota l'altra", () => {
    expect(panel).toContain('className="grid grid-cols-1 gap-2"');
    // el vell layout en fila (2+2 i 4 al sm+) mai no torna al panell
    expect(panel).not.toContain("grid-cols-2");
    expect(panel).not.toContain("grid-cols-3");
    expect(panel).not.toContain("grid-cols-4");
  });

  test("D2. requadre més gran: padding generós + detall separat del valor", () => {
    expect(panel).toContain("px-3.5 py-2.5"); // abans px-3 py-2
    expect(panel).toContain("mt-0.5"); // l'any / el detall no enganxa amb la xifra
    // la jerarquia tipografica es manté: xifra protagonista, negreta
    expect(panel).toContain("text-lg font-black leading-tight");
  });

  test("D3. les 4 xifres KPI segueixen allà, amb el seu i18n ca/es intacte", () => {
    expect(panel).toContain('"Població" : "Población"');
    expect(panel).toContain('"Variació 5 anys" : "Variación 5 años"');
    expect(panel).toContain('"Variació 10 anys" : "Variación 10 años"');
    expect(panel).toContain('"Densitat" : "Densidad"');
    expect(panel).toContain("1 de gener"); // sub de la població (ca)
    expect(panel).toContain("hab/km²"); // unitat de la densitat al valor
  });

  test("D4. la resta del panell queda intacta (títol, badges, gràfics, fonts)", () => {
    expect(panel).toContain('"Contexte demogràfic i territorial" : "Contexto demográfico y territorial"');
    expect(panel).toContain("TrendBadge"); // badge de tendència (Creixement/Pèrdua/Estable)
    expect(panel).toContain("65 anys o més"); // badge d'edats (ca)
    expect(panel).toContain("Nacionalitat estrangera"); // badge d'estrangers (ca)
    expect(panel).toContain("<LineChart"); // evolució de la població
    expect(panel).toContain("<BarChart"); // grans grups d'edat (+ llars al detall)
    expect(panel).toContain("Font"); // peu de fonts IDESCAT
  });

  test("D5. el panell continua muntat a la fitxa municipal del /mapa", () => {
    const map = codeOnly(readSrc("../src/components/views/MapView.tsx"));
    expect(map).toContain("<DemografiaPanel muniCode={mun.code} muniName={mun.name} />");
  });
});
