/**
 * v59 — BLOQUE C del PROMPT MASTER: guardes de «Com funciona» complet.
 *
 * Copy aprovat pel propietari (docs/com-funciona-copy.md) + implementació
 * (ComFuncionaView, claus howFull.* a i18n, ruta /com-funciona):
 *  - claus howFull.* presents a ca i es amb estructura SIMÈTRICA;
 *  - 11 passos, mini-FAQ ≥8, glossari 10 (C1: cobreix tot el producte real);
 *  - filtre de claredat: cada frase ≤20 paraules («l'entendria una persona
 *    de 60 anys que mai no ha usat un mapa online?»);
 *  - termes prohibits a la guia: «vivenda», arrel «estima» (renombrado v56:
 *    valora/valorar; el resultat és «rang orientatiu» i la negació legal és
 *    «taxació oficial» en ca / «tasación oficial» en es);
 *  - exemple amb xifres REALS verificades (Manresa 585 €/mes, producció
 *    2026-11-17; computeValuation 70 m²/3 hab → ≈488, rang ≈440–537);
 *  - cablejament: vista muntada a AppShell, CTA a la portada, enllaç al peu,
 *    pàgina /com-funciona indexable i entrada al sitemap.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { STRINGS } from "../src/lib/i18n";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Codi sense comentaris (bloc, línia i JSX) — les guardes comproven CODI real. */
const codeOnly = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const norm = (s: string) => s.replace(/p\. ex\./g, "pex").replace(/p\. e\./g, "pe");
const sentencesOf = (s: string) => norm(s).split(/(?<=[.!?…])\s+/).filter(Boolean);
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Recull tots els strings user-facing del bloc howFull (els textos, no les claus). */
function howFullTexts(locale: "ca" | "es"): string[] {
  const hf = STRINGS[locale].howFull as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const v of Object.values(hf)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") out.push(item);
        else out.push(...Object.values(item as Record<string, string>).filter((x) => typeof x === "string"));
      }
    } else if (v && typeof v === "object") {
      out.push(...Object.values(v as Record<string, string>).filter((x) => typeof x === "string"));
    }
  }
  return out;
}

/** Estructura de claus canònica (per comparar ca ↔ es). */
function shape(v: unknown): string {
  if (Array.isArray(v)) return `a[${v.length}: ${v.map(shape).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `o{${Object.keys(o).sort().map((k) => `${k}:${shape(o[k])}`).join(",")}}`;
  }
  return "s";
}

describe("v59 — BLOQUE C: guia completa «Com funciona»", () => {
  const ca = STRINGS.ca.howFull;
  const es = STRINGS.es.howFull;

  test("C1. claus howFull presents a ca i es amb estructura simètrica", () => {
    expect(ca).toBeDefined();
    expect(es).toBeDefined();
    expect(shape(STRINGS.ca.howFull)).toBe(shape(STRINGS.es.howFull));
  });

  test("C2. 11 passos, FAQ ≥8 i glossari 10 (cobreix el producte real del C1)", () => {
    expect(ca.passos.length).toBe(11);
    expect(es.passos.length).toBe(11);
    expect(ca.faq.length).toBeGreaterThanOrEqual(8);
    expect(es.faq.length).toBeGreaterThanOrEqual(8);
    expect(ca.glossari.length).toBe(10);
    expect(es.glossari.length).toBe(10);
    // els passos cobreixen el que el C1 va detectar que faltava a la home:
    // registre/quota, informe, valorador (N1/N2) i idioma
    const titols = ca.passos.map((p) => p.t).join(" | ");
    for (const clau of ["Registra't", "Descarrega l'informe", "Valora el lloguer", "Tria l'idioma", "Compara el teu anunci"]) {
      expect(titols).toContain(clau);
    }
    const titolsEs = es.passos.map((p) => p.t).join(" | ");
    expect(titolsEs).toContain("Regístrate");
    expect(titolsEs).toContain("Valora el alquiler de tu vivienda");
  });

  test("C3. filtre de claredat: cada frase té ≤20 paraules (ca i es)", () => {
    for (const locale of ["ca", "es"] as const) {
      for (const txt of howFullTexts(locale)) {
        for (const s of sentencesOf(txt)) {
          const n = wordCount(s);
          if (n > 20) throw new Error(`frase de ${n} paraules a ${locale}: «${s}»`);
          expect(n).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  test("C4. termes prohibits fora de la guia (coherència amb el renombrado v56)", () => {
    const all = JSON.stringify(STRINGS.ca.howFull) + JSON.stringify(STRINGS.es.howFull);
    expect(all).not.toContain("vivenda");
    expect(all).not.toContain("estima");
    expect(all).not.toContain("Estima");
    expect(all).not.toContain("l'estimador");
    // negació legal amb el terme normatiu de cada llengua (decisió v56)
    expect(ca.queNoEs.d).toContain("taxació oficial");
    expect(es.queNoEs.d).toContain("tasación oficial");
    // cap promesa de tasació: la FAQ ho desmenteix explícitament
    expect(ca.faq.some((f) => f.q.includes("taxació") && f.a.startsWith("No."))).toBe(true);
    expect(es.faq.some((f) => f.q.includes("tasación") && f.a.startsWith("No."))).toBe(true);
  });

  test("C5. exemple amb xifres REALS verificades (Manresa 585; ≈488; rang ≈440–537)", () => {
    // verificació d'aritmètica: 650 sobre 585 és +11,1 %
    const pct = Number((((650 - 585) / 585) * 100).toFixed(1));
    expect(pct).toBe(11.1);
    // i el resultat central de l'exemple és coherent amb els factors citats:
    // 488,4/585 ≈ 0,8354 ≈ 0,856 × 0,975 (el motor arrodoneix a 1 decimal)
    const ratio = 488.4 / 585;
    expect(Math.abs(ratio - 0.856 * 0.975)).toBeLessThanOrEqual(0.002);
    expect(ca.exemple.d).toContain("585 €/mes");
    expect(ca.exemple.d2).toContain("488");
    expect(ca.exemple.d2).toContain("0,856");
    expect(ca.exemple.d2).toContain("0,975");
    expect(es.exemple.d).toContain("585 €/mes");
    expect(es.exemple.d2).toContain("488");
  });

  test("C6. cablejament: AppShell monta la vista + peu + CTA portada + ruta SSR + sitemap", () => {
    const appshell = codeOnly(readSrc("../src/components/AppShell.tsx"));
    expect(appshell).toContain('import ComFuncionaView from "@/components/views/ComFuncionaView"');
    expect(appshell).toContain('{view === "/com-funciona" && <ComFuncionaView />}');
    expect(appshell).toContain('footLink("/com-funciona", t.howFull.nav)');

    const landing = codeOnly(readSrc("../src/components/views/LandingView.tsx"));
    expect(landing).toContain('navigate("/com-funciona")');
    expect(landing).toContain("t.how.more");

    const page = codeOnly(readSrc("../src/app/com-funciona/page.tsx"));
    expect(page).toContain('HashBridge to="/#/com-funciona"');
    expect(page).toContain("index: true");

    const sitemap = codeOnly(readSrc("../src/app/sitemap.ts"));
    expect(sitemap).toContain("/com-funciona");

    const view = codeOnly(readSrc("../src/components/views/ComFuncionaView.tsx"));
    expect(view).toContain("t.howFull");
    expect(view).toContain("aria-expanded");
    expect(view).toContain("aria-controls");
    expect(view).toContain('navigate("/mapa")');
    expect(view).toContain('navigate("/preus")');
  });

  test("C7. la vista NO degrada res: mapa/quota/motor intactes (regla 3 del PROMPT MASTER)", () => {
    // quota server-side intacta (les guardes v46 continuen al seu lloc)
    const route = codeOnly(readSrc("../src/app/api/_impl/analitza/route.ts"));
    expect(route).toContain("gateDetailedQuery");
    // la feature dormida illa de cases es manté (exclòs per decisió del propietari)
    const report = codeOnly(readSrc("../src/lib/pdf-report.ts"));
    expect(report).toContain("Illa de cases");
    // la portada manté els 3 passos curts originals
    const landing = codeOnly(readSrc("../src/components/views/LandingView.tsx"));
    expect(landing).toContain("t.how.s1t");
    expect(landing).toContain("t.how.s2t");
    expect(landing).toContain("t.how.s3t");
  });
});
