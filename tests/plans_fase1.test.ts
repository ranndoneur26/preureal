/**
 * FASE 1 (plans migració progressiva) — Gratuït: punts nous amb badge, mai
 * substituint res; historial de consultes amb TTL de 7 dies.
 *
 *  P1 — historialAccess(): gate pur per pla (full / ttlDies), amb el
 *       comportament vigent INTACTE (Premium amb historial=false a la BD
 *       continua veient l'upsell; Pro el manté il·limitat).
 *  P2 — historialCutoff(): data de retallada del TTL (mai llança).
 *  P3 — i18n: simetria ca/es dels bullets del Gratuït, textos existents
 *       conservats LITERALMENT (prefix), bullets nous presents, Premium i Pro
 *       sense cap canvi (no-regressió estricta).
 *  P4 — cablejament: API history amb finestra TTL al servidor, cron de purga
 *       RGPD, vercel.json, migració SQL additiva (només FREE), UI (badge +
 *       enllaç a l'eina Consulta, pestanya historial desblocada al Gratuït).
 *  P5 — guardes lingüístiques dels textos nous (cero «vivenda», cero «estima»).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { historialAccess, historialCutoff, PLANS } from "../src/lib/plans";
import { STRINGS } from "../src/lib/i18n";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const PLANS_FREE_FEATURES = PLANS.FREE.features;
const PLANS_PRO_FEATURES = PLANS.PRO.features;

describe("P1 — historialAccess(): gate pur del TTL de l'historial", () => {
  test("Gratuït: 7 dies (Nou de la FASE 1)", () => {
    expect(historialAccess({ ...PLANS_FREE_FEATURES })).toEqual({
      full: false,
      ttlDies: 7,
    });
  });

  test("Pro (default de codi): historial complet, sense límit de temps", () => {
    expect(historialAccess(PLANS_PRO_FEATURES)).toEqual({ full: true, ttlDies: -1 });
  });

  test("Premium amb la BD que té historial=false (config vigent): upsell intacte", () => {
    // això és el que ara mateix torna /api/plans en producció per a PREMIUM
    const premiumProd: Record<string, unknown> = {
      comparador: true,
      exportCsv: false,
      historial: false,
      pdfMonth: false,
      valoracionsMonth: 5,
    };
    expect(historialAccess(premiumProd as never)).toEqual({ full: false, ttlDies: 0 });
  });

  test("TTL no finit, negatiu o zero mai activa la finestra", () => {
    for (const ttl of [0, -1, -7, NaN]) {
      expect(historialAccess({ historial: false, historialTtlDies: ttl } as never)).toEqual({
        full: false,
        ttlDies: 0,
      });
    }
  });

  test("TTL fraccionari es retalla a dies sencers", () => {
    expect(historialAccess({ historial: false, historialTtlDies: 7.9 } as never).ttlDies).toBe(7);
  });
});

describe("P2 — historialCutoff(): retallada del TTL", () => {
  const now = new Date("2026-11-18T10:00:00.000Z");
  test("7 dies → exactament ara − 7 dies", () => {
    expect(historialCutoff(now, 7)?.toISOString()).toBe("2026-11-11T10:00:00.000Z");
  });
  test("ttl 0 o negatiu → sense retallada (null)", () => {
    expect(historialCutoff(now, 0)).toBeNull();
    expect(historialCutoff(now, -1)).toBeNull();
  });
});

describe("P3 — i18n: bullets del Gratuït (ca/es simètrics, existents intactes)", () => {
  const ca = STRINGS.ca.plans.free.feats;
  const es = STRINGS.es.plans.free.feats;

  test("8 bullets a les dues llengües (els 5 existents + 3 nous)", () => {
    expect(ca.length).toBe(8);
    expect(es.length).toBe(8);
  });

  test("els textos existents es conserven LITERALMENT (prefix exacte)", () => {
    expect(ca[0]).toBe("Mapa de tota Catalunya");
    expect(es[0]).toBe("Mapa de toda Cataluña");
    // «Modificar (con cuidado)»: el bullet de les 3 consultes conserva el
    // literal original i només S'AFEGEIX el subtexto de l'encàrrec
    expect(ca[1]!.startsWith("Fins a 3 consultes detallades cada mes")).toBe(true);
    expect(es[1]!.startsWith("Hasta 3 consultas detalladas cada mes")).toBe(true);
    expect(ca[2]).toBe("Preu mitjà real per municipi");
    expect(ca[3]).toBe("Marcador d'àrea tensada");
    expect(ca[4]).toBe("Comparador fins a 2 municipis");
    expect(es[4]).toBe("Comparador hasta 2 municipios");
  });

  test("subtexto del bullet 3 consultes: eina Consulta (A–D) + Anàlisi (4 gràfics)", () => {
    expect(ca[1]).toContain("Consulta (A–D)");
    expect(ca[1]).toContain("4 gràfics");
    expect(es[1]).toContain("Consulta (A–D)");
    expect(es[1]).toContain("4 gráficos");
  });

  test("3 punts nous amb el contingut de l'encàrrec", () => {
    expect(ca[5]).toBe("Checklist pre-firma e informe imprimible bàsic (blocs A–D)");
    expect(es[5]).toBe("Checklist pre-firma e informe imprimible básico (bloques A–D)");
    expect(ca[6]).toBe("Historial de consultes guardat 7 dies");
    expect(es[6]).toBe("Historial de consultas guardado 7 días");
    expect(ca[7]).toBe("Sense targeta: registre només amb e-mail");
    expect(es[7]).toBe("Sin tarjeta: registro solo con e-mail");
  });

  test("featsNou = [5, 6, 7] a les dues llengües; Premium i Pro no en tenen", () => {
    expect([...STRINGS.ca.plans.free.featsNou]).toEqual([5, 6, 7]);
    expect([...STRINGS.es.plans.free.featsNou]).toEqual([5, 6, 7]);
    expect(Object.keys(STRINGS.ca.plans.premium)).not.toContain("featsNou");
    expect(Object.keys(STRINGS.ca.plans.pro)).not.toContain("featsNou");
  });

  test("NO-regressió: Premium (7) i Pro (6) bullets idèntics, en l'ordre original", () => {
    expect([...STRINGS.ca.plans.premium.feats]).toEqual([
      "Consultes il·limitades",
      "Banda de referència P25–P75 i posició del teu preu",
      "Indicadors oficials INE: IPVA, renda i esforç econòmic",
      "Històric de lloguer per municipi (2005–2025)",
      "Comparador fins a 6 municipis amb columnes avançades",
      "Informe PDF professional de 10 pàgines (5/mes)",
      "Suport prioritari",
    ]);
    expect([...STRINGS.ca.plans.pro.feats]).toEqual([
      "Tot el de Premium",
      "Exportació CSV de dades per municipi",
      "Informes PDF de 10 pàgines amb anàlisi del mercat, també d'edifici (30/mes)",
      "Ideal per a agents i gestors",
      "Accés prioritari a noves dades",
      "Factura nominal",
    ]);
    expect([...STRINGS.es.plans.premium.feats]).toEqual([
      "Consultas ilimitadas",
      "Banda de referencia P25–P75 y posición de tu precio",
      "Indicadores oficiales INE: IPVA, renta y esfuerzo económico",
      "Histórico de alquiler por municipio (2005–2025)",
      "Comparador hasta 6 municipios con columnas avanzadas",
      "Informe PDF profesional de 10 páginas (5/mes)",
      "Soporte prioritario",
    ]);
    expect([...STRINGS.es.plans.pro.feats]).toEqual([
      "Todo lo de Premium",
      "Exportación CSV de datos por municipio",
      "Informes PDF de 10 páginas con análisis del mercado, también de edificio (30/mes)",
      "Ideal para agentes y gestores",
      "Acceso prioritario a nuevos datos",
      "Factura nominal",
    ]);
  });
});

describe("P4 — cablejament FASE 1 (API + cron + migració + UI)", () => {
  const history = readSrc("../src/app/api/_impl/history/route.ts");
  const cron = readSrc("../src/app/api/_impl/cron/history-ttl/route.ts");
  const vercel = readSrc("../vercel.json");
  const migration = readSrc(
    "../prisma/migrations/20261118120000_plans_fase1_historial_ttl/migration.sql"
  );
  const panel = readSrc("../src/components/views/PanelView.tsx");
  const pricing = readSrc("../src/components/views/PricingView.tsx");
  const plans = readSrc("../src/lib/plans.ts");

  test("API history: finestra TTL AL SERVIDOR + mateix 403 per als plans sense historial", () => {
    expect(history).toContain("historialAccess");
    expect(history).toContain("historialCutoff");
    expect(history).toContain("PLAN_REQUIRED");
    expect(history).toContain("windowDies");
    expect(history).toContain('kind: "DETAIL"');
  });

  test("cron de purga RGPD: només FREE + DETAIL, auth CRON_SECRET, idempotent", () => {
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toContain('kind: "DETAIL"');
    expect(cron).toContain('plan: "FREE"');
    expect(cron).toContain("deleteMany");
    expect(cron).not.toContain('plan: "PREMIUM"');
    expect(cron).not.toContain('plan: "PRO"');
  });

  test("vercel.json programa el cron diari (abans del resum de les 04:00)", () => {
    expect(vercel).toContain("/api/cron/history-ttl");
    expect(vercel).toContain("50 3 * * *");
  });

  test("migració SQL additiva: només toca la fila FREE, mai Premium/Pro", () => {
    expect(migration).toContain("historialTtlDies");
    expect(migration).not.toContain("WHERE \"plan\" = 'PREMIUM'");
    expect(migration).not.toContain("WHERE \"plan\" = 'PRO'");
    expect(migration).toContain("WHERE \"plan\" = 'FREE'");
    // l'invers documentat (rollback) hi és
    expect(migration).toContain("- 'historialTtlDies'");
  });

  test("plans.ts: defaults amb TTL 7/0/-1 i helpers exportats", () => {
    expect(plans).toContain("historialTtlDies: 7");
    expect(plans).toContain("historialTtlDies: 0");
    expect(plans).toContain("historialTtlDies: -1");
    expect(plans).toContain("export function historialAccess");
    expect(plans).toContain("export function historialCutoff");
  });

  test("UI: badge «Nou» + enllaç a l'eina Consulta + pestanya historial desblocada", () => {
    expect(pricing).toContain("nouFeats");
    expect(pricing).toContain('to: "/analitza"');
    expect(panel).not.toContain('(id === "historial" || id === "preferits")');
    expect(panel).toContain('id === "preferits" && u.plan === "FREE"');
  });
});

describe("P5 — guardes lingüístiques dels textos nous de la FASE 1", () => {
  const nous = [...STRINGS.ca.plans.free.feats.slice(5), ...STRINGS.es.plans.free.feats.slice(5)];
  test("cero «vivenda» i cero arrel «estima» als textos nous", () => {
    for (const t of nous) {
      expect(t.toLowerCase()).not.toContain("vivenda");
      expect(t.toLowerCase()).not.toContain("estima");
    }
  });
});
