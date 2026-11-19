/**
 * FASE 2 (plans migració progressiva) — Premium: 4 punts «Nou» amb badge, mai
 * substituint res; realineació aprovada de PlanSetting amb el publicat.
 *
 *  P1 — plans.ts: defaults de Premium/Pro alineats (Valora v2 il·limitat,
 *       historial il·limitat, flags normativaCompleta/alertes, preus 8,99/24,99)
 *       i el Gratuït INTACTE (3 consultes, sense flags nous).
 *  P2 — i18n: els 4 bullets nous de Premium, simètrics ca/es + guardes
 *       lingüístiques (cero «vivenda», cero arrel «estima» al català).
 *  P3 — /api/normativa/[code]: gating Premium/Pro al servidor, fonts oficials
 *       citades (Incasòl, DOGC, INE/IRAV, SERPAVI/MIVAU) i transparència legal.
 *  P4 — /api/alertes + cron /api/cron/alertes: gating, límits, idempotència
 *       via PriceAlertLog, correu consolidat, auth CRON_SECRET, programa horari.
 *  P5 — migració 20261118130000: només PREMIUM/PRO (mai FREE), mai priceEur,
 *       quota publicada de PDFs preservada (pdfMonth 5), taula UserAlert,
 *       invers documentat. Schema.prisma amb model UserAlert.
 *  P6 — cablejament UI: badges «Nou» a la card Premium + enllaç al panell,
 *       pestanyes «Alertes»/«Normativa» amb candau FREE i deep-link saneezat.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { historialAccess, PLANS } from "../src/lib/plans";
import { STRINGS } from "../src/lib/i18n";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("P1 — plans.ts: defaults FASE 2 alineats amb el publicat (aprovat)", () => {
  test("Premium: Valora v2 il·limitat, historial il·limitat, 2 flags nous", () => {
    const f = PLANS.PREMIUM.features;
    expect(f.valoracionsMonth).toBe(-1); // Nou: Valora v2 il·limitat
    expect(f.historialTtlDies).toBe(-1); // Nou: historial il·limitat
    expect(f.historial).toBe(true);
    expect(f.normativaCompleta).toBe(true); // Nou: mòdul normatiu complet
    expect(f.alertes).toBe(true); // Nou: alertes de preu/normativa
    expect(historialAccess(PLANS.PREMIUM.features)).toEqual({ full: true, ttlDies: -1 });
  });

  test("Premium: quota publicada de PDFs PRESERVADA (5/mes) + comparador 6", () => {
    // red line 4: els límits publicats NO canvien
    expect(PLANS.PREMIUM.features.pdfMonth).toBe(5);
    expect(PLANS.PREMIUM.comparatorMax).toBe(6);
    expect(PLANS.PREMIUM.quotaMonth).toBe(-1); // «Consultes il·limitades» publicat
    expect(PLANS.PREMIUM.priceEur).toBe(8.99); // red line 1: 8,99 €/mes
  });

  test("Pro: hereda els flags nous («Tot el de Premium» publicat) i conserva els seus límits publicats", () => {
    const f = PLANS.PRO.features;
    expect(f.normativaCompleta).toBe(true);
    expect(f.alertes).toBe(true);
    expect(f.valoracionsMonth).toBe(-1); // mai un plan inferior per sobre
    expect(f.pdfMonth).toBe(30); // publicat: 30 PDFs/mes
    expect(f.exportCsv).toBe(true); // publicat: CSV per municipi
    expect(f.historialTtlDies).toBe(-1);
    expect(PLANS.PRO.priceEur).toBe(24.99); // red line 1: 24,99 €/mes
  });

  test("Gratuït INTACTE: ni Valora, ni normatiu complet, ni alertes (red line 4)", () => {
    expect(PLANS.FREE.quotaMonth).toBe(3); // 3 consultes detallades/mes publicades
    const f = PLANS.FREE.features;
    expect(f.valoracionsMonth).toBe(0);
    expect(f.historialTtlDies).toBe(7); // FASE 1 intacta
    expect(f.normativaCompleta).toBe(false);
    expect(f.alertes).toBe(false);
    expect(PLANS.FREE.priceEur).toBe(0);
  });
});

describe("P2 — i18n: 4 bullets nous de Premium (ca/es simètrics, existents intactes)", () => {
  const ca = STRINGS.ca.plans.premium.feats;
  const es = STRINGS.es.plans.premium.feats;

  test("11 bullets a les dues llengües (7 publicats + 4 nous) i featsNou [7,8,9,10]", () => {
    expect(ca.length).toBe(11);
    expect(es.length).toBe(11);
    expect([...STRINGS.ca.plans.premium.featsNou]).toEqual([7, 8, 9, 10]);
    expect([...STRINGS.es.plans.premium.featsNou]).toEqual([7, 8, 9, 10]);
  });

  test("els 4 punts nous amb el contingut de l'encàrrec", () => {
    expect(ca[7]).toBe("Valora v2 il·limitat: franja orientativa de renda per a habitatges concrets, sense quota mensual");
    expect(ca[8]).toBe("Mòdul normatiu complet: índex de referència vigent, IRAV, gran tenedor i SERPAVI");
    expect(ca[9]).toBe("Alertes de preu i normativa per municipi (fonts oficials, revisió diària)");
    expect(ca[10]).toBe("Historial de consultes il·limitat");
    expect(es[7]).toBe("Valora v2 ilimitado: franja orientativa de renta para viviendas concretas, sin cuota mensual");
    expect(es[8]).toBe("Módulo normativo completo: índice de referencia vigente, IRAV, gran tenedor y SERPAVI");
    expect(es[9]).toBe("Alertas de precio y normativa por municipio (fuentes oficiales, revisión diaria)");
    expect(es[10]).toBe("Historial de consultas ilimitado");
  });

  test("guardes lingüístiques: cero «vivenda» i cero arrel «estima» al català nou", () => {
    for (const t of ca.slice(7)) {
      expect(t.toLowerCase()).not.toContain("vivenda");
      expect(t.toLowerCase()).not.toContain("estima");
    }
    // l'espanyol conserva «viviendas» (v56: el renom ca/es només afecta el català)
    expect(es[7]).toContain("viviendas");
  });

  test("Pro sense cap canvi (6 bullets, cap featsNou) — mai substituïm res", () => {
    expect(STRINGS.ca.plans.pro.feats.length).toBe(6);
    expect(STRINGS.es.plans.pro.feats.length).toBe(6);
    expect(Object.keys(STRINGS.ca.plans.pro)).not.toContain("featsNou");
  });
});

describe("P3 — /api/normativa/[code]: mòdul normatiu complet (Nou Premium)", () => {
  const route = readSrc("../src/app/api/_impl/normativa/[code]/route.ts");

  test("gating server-side complet: auth + verificació + planAllows(normativaCompleta)", () => {
    expect(route).toContain("requireVerifiedUser");
    expect(route).toContain("planAllows(plan, \"normativaCompleta\")");
    expect(route).toContain("PLAN_REQUIRED");
    expect(route).toContain('plan: "PREMIUM"');
  });

  test("fonts oficials citades amb període (principi de traceabilitat)", () => {
    expect(route).toContain("Incasòl");
    expect(route).toContain("habitatge.gencat.cat");
    expect(route).toContain("NORM_FACTS.tenseResolutions"); // DOGC 19-10-2026 i 3-7-2024
    expect(route).toContain("tensePublicacio"); // v69: data DOGC per llista (A/B/C)
    expect(route).toContain("NORM_FACTS.iravLatestPct"); // INE
    expect(route).toContain("SERPAVI_URL"); // MIVAU
    expect(route).toContain("granTenedorSource");
    expect(route).toContain("estimaci"); // ref. de comarca mai presentada com a municipal
  });

  test("transparència legal intacta: orientació estadística, mai taxació", () => {
    expect(route).toContain("ORIENTATION_DISCLAIMER"); // la fórmula legal viu a analitza.ts
    expect(readSrc("../src/lib/analitza.ts")).toContain("no és una taxació oficial");
    expect(route).toContain("estadístic i orientatiu"); // nota SERPAVI
    expect(route).toContain("consultedAt");
  });

  test("registrat al dispatcher (101 rutes)", () => {
    const dispatcher = readSrc("../src/app/api/[[...path]]/route.ts");
    expect(dispatcher).toContain("_impl/normativa/[code]/route");
  });
});

describe("P4 — /api/alertes + cron /api/cron/alertes (Nou Premium)", () => {
  const route = readSrc("../src/app/api/_impl/alertes/route.ts");
  const cron = readSrc("../src/app/api/_impl/cron/alertes/route.ts");
  const mail = readSrc("../src/lib/mail.ts");
  const vercel = readSrc("../vercel.json");

  test("alertes: gating Premium/Pro + tipus fixos + límit d'higiene + esborrat propi", () => {
    expect(route).toContain("planAllows(plan, \"alertes\")");
    expect(route).toContain("PLAN_REQUIRED");
    expect(route).toContain('"PRICE"');
    expect(route).toContain('"TENSE"');
    expect(route).toContain('"NORMATIVA"');
    expect(route).toContain("MAX_ALERTES_ACTIVES");
    // DELETE sempre amb scope del propietari (mai fileres d'altres)
    expect(route).toContain("deleteMany({ where: { id, userId: user.id } })");
  });

  test("cron: auth CRON_SECRET, només plans de pagament, primera passada només ANCLA", () => {
    expect(cron).toContain("CRON_SECRET");
    expect(cron).toContain('plan: { in: ["PREMIUM", "PRO"] }');
    expect(cron).toContain("ancla"); // baselines sense avisos (mateix contracte v60)
    expect(cron).toContain("ultimaComprovacio");
    // les alertes FREE NO s'esborren: el cron les omet (pausa, no destructiu)
    expect(cron).not.toContain("userAlert.deleteMany");
  });

  test("cron: idempotència via PriceAlertLog (PRICE/TENSE/NORMATIVA) — mai doble avís", () => {
    expect(cron).toContain('kind: "PRICE"');
    expect(cron).toContain('kind: "TENSE"');
    expect(cron).toContain('kind: "NORMATIVA"');
    expect(cron).toContain("priceAlertLog.findFirst");
    // dedup amb el flux de preferits v37/v60 (mateixa taula, unique constraint)
    expect(cron).toContain('idempotencyKey: `alertes:${u.id}:${dayKey}`');
  });

  test("correu consolidat ca/es amb la fórmula legal («no és una taxació»)", () => {
    expect(mail).toContain("export function alertaMail");
    expect(mail).toContain("export interface AlertaEntry");
    expect(mail).toContain("no és una taxació");
    expect(mail).toContain("no es una tasación");
    expect(mail).toContain("panell → Alertes");
  });

  test("vercel.json programa el cron diari abans del resum de les 04:00", () => {
    expect(vercel).toContain("/api/cron/alertes");
    expect(vercel).toContain("15 3 * * *");
    const idxAlertes = vercel.indexOf("/api/cron/alertes");
    const idxEmails = vercel.indexOf("/api/cron/emails");
    expect(idxAlertes).toBeGreaterThan(-1);
    expect(idxEmails).toBeGreaterThan(-1);
  });
});

describe("P5 — migració 20261118130000 + model UserAlert", () => {
  const migration = readSrc("../prisma/migrations/20261118130000_plans_fase2_premium/migration.sql");
  const schema = readSrc("../prisma/schema.prisma");

  test("taula UserAlert creada (model §5 «alertes_usuari», decisió FASE 0)", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "UserAlert"');
    expect(migration).toContain("UserAlert_userId_entityKey_tipus_key");
    expect(schema).toContain("model UserAlert");
    expect(schema).toContain("@@unique([userId, entityKey, tipus])");
    expect(schema).toContain("ultimaComprovacio");
  });

  test("només toca PREMIUM i PRO (mai FREE — red line: el Gratuït queda intacte)", () => {
    expect(migration).toContain("WHERE \"plan\" = 'PREMIUM'");
    expect(migration).toContain("WHERE \"plan\" = 'PRO'");
    expect(migration).not.toContain("WHERE \"plan\" = 'FREE'");
  });

  test("mai toca el preu (red line 1) i els límits publicats es PRESERVEN (red line 4)", () => {
    expect(migration).not.toContain('SET "priceEur"');
    expect(migration).toContain('"pdfMonth": 5'); // Premium 5 PDFs/mes publicat
    expect(migration).toContain('"quotaMonth" = -1'); // «Consultes il·limitades» publicat (aprovat)
    expect(migration).toContain('"historialTtlDies": -1');
    expect(migration).toContain('"valoracionsMonth": -1');
    expect(migration).toContain('"normativaCompleta": true');
    expect(migration).toContain('"alertes": true');
    expect(migration).not.toContain('"pdfMonth": 30'); // el 30 de Pro es queda al seu lloc
  });

  test("merge jsonb additiu + idempotent + invers documentat", () => {
    expect(migration).toContain("::jsonb)::text"); // mateix patró FASE 1
    expect(migration).toContain("Invers documentat");
    expect(migration).toContain('DROP TABLE "UserAlert"');
    expect(migration).toContain("- 'normativaCompleta' - 'alertes'");
  });
});

describe("P6 — cablejament UI: badges «Nou», pestanyes i deep-link", () => {
  const pricing = readSrc("../src/components/views/PricingView.tsx");
  const panel = readSrc("../src/components/views/PanelView.tsx");

  test("PricingView: card Premium amb badge «Nou» + enllaç a la pestanya Alertes", () => {
    expect(pricing).toContain("nouFeats={t.plans.premium.featsNou}");
    expect(pricing).toContain('to: "/panell?tab=alertes"');
    // la card Pro NO té badges (FASE 3, mai substituïm res)
    const proCard = pricing.slice(pricing.indexOf("{/* PRO */}"), pricing.indexOf("ReportsShopSection"));
    expect(proCard).not.toContain("nouFeats");
  });

  test("PanelView: pestanyes «Alertes» i «Normativa» amb candau per al Gratuït", () => {
    expect(panel).toContain('["alertes"');
    expect(panel).toContain('["normativa"');
    expect(panel).toContain('id === "alertes" || id === "normativa"');
    expect(panel).toContain('id === "preferits"'); // candau v5 intacte
    expect(panel).toContain('/api/alertes');
    expect(panel).toContain('/api/normativa/');
  });

  test("PanelView: deep-link /panell?tab=alertes saneezat contra pestanyes conegudes", () => {
    expect(panel).toContain('new URLSearchParams(hq).get("tab")');
    expect(panel).toContain('"alertes", "normativa"');
  });

  test("upsells del Gratuït: mai llista buida que confon (mateix patró v5)", () => {
    expect(panel).toContain("alertsLocked");
    expect(panel).toContain("PLAN_REQUIRED");
  });
});
