/**
 * v49 — guardes del REDESIGN PREMIUM de la portada i de l'etiqueta fixa de
 * contracte:
 *
 *  1. MINI-MAPA VIU al hero (LandingMap): els edificis ICGC colrats per la
 *     renta real registrada (Incasòl) tornen a la portada, més petits, sota
 *     el bloc de text. Guardes: existeix, usa la MATEIXA font de dades i la
 *     MATEIXA escala de color que el /mapa (mai una escala decorativa), no
 *     segresta el scroll (scrollWheelZoom desactivat), porta al mapa complet
 *     (CTA + deep link v24 per edifici) i es neteja al desmuntar.
 *  2. HERO amb el bloc de text AMUNT (items-start) i el mapa a sota de la
 *     mateixa columna, formulari a la dreta — segons el redisseny demanat.
 *  3. ETIQUETA FIXA «Habitatge habitual / Vivienda habitual» al formulari de
 *     consulta: visible i no interactiva (mai un <select>), amb l'explicació
 *     honesta (única modalitat amb dades oficials, fiances Incasòl).
 *
 * Els textos del hero ja existents (badge/títol/subtítol/CTA/trust) venen
 * d'i18n i no es toquen; les guardes L1-L2 de consulta_v47 (enllaç creuat
 * consulta → estima) continuen aplicant intactes.
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

describe("v49 — el mini-mapa viu torna al hero de la portada", () => {
  const landing = codeOnly(readSrc("../src/components/views/LandingView.tsx"));

  test("H1. LandingView munta LandingMap sota el bloc de text del hero", () => {
    expect(landing).toContain("LandingMap");
    expect(landing).toContain("<LandingMap />");
  });

  test("H2. el bloc de text queda AMUNT (items-start, segons el redisseny)", () => {
    // la graella del hero: text i mapa a l'esquerra comencen a dalt (mai
    // centrats verticalment contra el formulari)
    const gridLine = landing.split("\n").find((l) => l.includes("md:grid-cols-2") && l.includes("grid"));
    expect(gridLine).toBeDefined();
    expect(gridLine!).toContain("items-start");
  });
});

describe("v49 — LandingMap: mateixes dades i mateixa escala que el /mapa", () => {
  const map = codeOnly(readSrc("../src/components/views/LandingMap.tsx"));

  test("M1. carrega els edificis reals (mateix endpoint /api/buildings)", () => {
    expect(map).toContain("/api/buildings?");
    expect(map).toContain("avgRentEurMonth");
    expect(map).toContain("munRefRent"); // estimació per referència de comarca
  });

  test("M2. l'escala de color és EXACTAMENT la de MapView (mai decorativa)", () => {
    // els 5 colors i els 4 llindars de rentColor del /mapa
    for (const c of ["#63b57c", "#93c47d", "#e5c46a", "#e89a4b", "#dd5a35"]) {
      expect(map).toContain(c);
    }
    for (const thr of ["550", "700", "850", "1000"]) {
      expect(map).toContain(`rent < ${thr}`);
    }
  });

  test("M3. mai segresta el scroll i mai el «Map container is already initialized»", () => {
    expect(map).toContain("scrollWheelZoom: false");
    expect(map).toContain('import("leaflet")');
    expect(map).toContain("mapRef.current?.remove()"); // neteja al desmuntar
  });

  test("M4. sempre porta al mapa complet (CTA + deep link v24 per edifici)", () => {
    expect(map).toContain('navigate("/mapa")');
    expect(map).toContain("/mapa?edifici=");
    // mateixa base cartogràfica ICGC (CC-BY: l'atribució és obligatòria);
    // la URL es comprova al FITXER EN CRUDO: codeOnly talla a «//» de «https://»
    expect(readSrc("../src/components/views/LandingMap.tsx")).toContain("geoserveis.icgc.cat");
    expect(map).toContain("attributionControl: true");
  });

  test("M5. la llegenda usa la escala real amb textos i18n del /mapa", () => {
    expect(map).toContain("t.map.legend.low");
    expect(map).toContain("t.map.legend.high");
    expect(map).toContain("€/mes"); // tooltip amb la renta real de l'edifici
  });
});

describe("v49 — etiqueta FIXA «Habitatge habitual» al formulari (mai selector)", () => {
  const form = codeOnly(readSrc("../src/components/analitza/AnalitzaForm.tsx"));

  test("C1. el valor fix és VISIBLE a la portada (ca i es)", () => {
    expect(form).toContain('ca ? "Tipus de contracte" : "Tipo de contrato"');
    expect(form).toContain('ca ? "Habitatge habitual" : "Vivienda habitual"');
    // explicació honesta de per què és fixat
    expect(form).toContain("dades oficials aplicables (fiances Incasòl)");
    expect(form).toContain("datos oficiales aplicables (fianzas Incasòl)");
  });

  test("C2. l'etiqueta és NO interactiva (cap select, cap onchange de contracte)", () => {
    expect(form).not.toContain("<select");
    expect(form).not.toContain("set({ contractType");
    expect(form).not.toContain("ContractType");
  });
});
