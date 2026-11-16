/**
 * F4 (redisseny de la Home) — QA integral: tests de qualitat del redisseny.
 *
 * Coberta d'aquest fitxer:
 *  1. RGPD a nivell de RUTA: POST /api/estima mai accepta, guarda ni retorna
 *     dades personals (adreça, referència catastral, email, notes) — amb
 *     mocks del patró audit_v23.test.ts (next/server, db, rate-limit,
 *     security, indicators-data). També: el registre anònim d'ús (Event)
 *     només conté municipi, m² arrodonits, zona tensada i nivell.
 *  2. Invariants del motor N1/N2 sobre bateria de casos (rang positiu,
 *     min ≤ central ≤ max, nivell real mai inflat, determinisme).
 *  3. Informe de VIABILITAT A/B/C (la «porta» F0 formalitzada): contingut
 *     i coherència amb la regla d'or (només les A es demanen i s'apliquen;
 *     el N3 mai simulat).
 *  4. Guarda del CI: tots els fitxers de tests són BLOQUEJANTS (cap
 *     continue-on-error que deixi passar regressions en silenci).
 */
import { describe, expect, test, mock } from "bun:test";
import {
  buildEstimation,
  ESTIMA_VIABILITY,
  type EstimationResult,
} from "../src/lib/estima";
import { VAL_REF_M2 } from "../src/lib/territorial";

// ── 1. RGPD: ruta /api/estima amb mocks (patró audit_v23.test.ts) ───────────

const dbCalls: Array<[string, unknown]> = [];
const state: { muni: Record<string, unknown> | null; rateOk: boolean } = {
  muni: {
    code: "081136",
    name: "Manresa",
    comarca: "Bages",
    province: "Barcelona",
    rentLatest: 750.5,
    rentPeriod: "2025",
    rentHistory: JSON.stringify({ "2024": 741.2, "2025": 750.5 }),
    contractsLatest: 1468,
    comarcaRefLatest: 700,
    comarcaRefPeriod: "2025",
    rentSource: "INCASOL",
    isTense: false,
  },
  rateOk: true,
};

mock.module("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
  // mateixa superfície que el mock d'audit_v23: mai un export de menys que
  // pugui trencar reimportacions d'altres fitxers (bug bun re-vinculació)
  after: () => {},
}));

// db amb Proxy: les rutes d'aquest test (municipality.findUnique,
// event.create) van als nostres handlers; qualsevol altra consulta de la
// gràfia de mòduls obté un objecte genèric inofensiu (mai explota a l'import).
const genericModel = () =>
  new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === "findUnique") return async () => null;
      if (prop === "create") return async () => ({});
      return async () => ({});
    },
  });
const fakeDb = new Proxy(
  {
    municipality: {
      findUnique: async (args: unknown) => {
        dbCalls.push(["municipality.findUnique", args]);
        return state.muni;
      },
    },
    event: {
      create: async (args: unknown) => {
        dbCalls.push(["event.create", args]);
        return {};
      },
    },
  },
  {
    get: (target, prop: string) =>
      prop in target
        ? (target as Record<string, unknown>)[prop]
        : genericModel(),
  },
);

mock.module("@/lib/db", () => ({ db: fakeDb }));

mock.module("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: state.rateOk, used: 1, limit: 20 }),
}));

mock.module("@/lib/security", () => ({
  // COPIA COMPLETA (patró audit_v23.test.ts): si el mock d'aquest fitxer
  // guanyés la re-vinculació de bun, cap fitxer posterior no pot quedar-se
  // sense un export del mòdul real (audit, escapeHtml, htmlToText…).
  audit: async () => ({}),
  clientIp: () => "203.0.113.9",
  hashIp: () => "h",
  escapeHtml: (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  htmlToText: (html: string) =>
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  maskEmail: (e: string) => e,
  sanitizeName: (n: string) => n,
}));

mock.module("@/lib/indicators-data", () => ({
  getMuniRentRows: async () => [], // sense pool → l'horquilla cau a la sèrie històrica
}));

// imports de la ruta DESPRÉS dels mock.module (obligatori amb bun)
const { POST: estimaPOST } = await import("../src/app/api/_impl/estima/route");

/** Payload amb dades personals que la ruta ha d'IGNORAR completament. */
function requestWithPII(): Request {
  return new Request("http://localhost/api/estima", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      municipalityCode: "081136",
      surfaceM2: 85,
      address: "Carrer del Pi 5, 2-1",
      refCatastral: "9876701BG4567S0001WX",
      email: "joan.pujol@example.com",
      notes: "visita dissabte al matí, telefonar abans",
      rooms: 3,
      estat: "REFORMADA",
    }),
  });
}

describe("F4 QA — RGPD a la ruta /api/estima (mai PII ni persistència personal)", () => {
  test("resposta 200 sense cap eco de les dades personals enviades", async () => {
    dbCalls.length = 0;
    const res = await estimaPOST(requestWithPII());
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.available).toBe(true);
    expect(body.estimation.level).toBe("N2"); // estat + habitacions aplicades
    // ni adreça ni ref. catastral ni email ni notes apareixen a la resposta
    expect(text).not.toContain("Carrer del Pi");
    expect(text).not.toContain("9876701BG4567S0001WX");
    expect(text).not.toContain("joan.pujol@example.com");
    expect(text).not.toContain("telefonar abans");
  });

  test("el registre anònim d'ús (Event) només té municipi, m², tensada i nivell", async () => {
    dbCalls.length = 0;
    const res = await estimaPOST(requestWithPII());
    expect(res.status).toBe(200);
    const createCalls = dbCalls.filter(([op]) => op === "event.create");
    expect(createCalls.length).toBe(1); // UNA sola escriptura, anònima
    const meta = JSON.parse((createCalls[0][1] as { data: { meta: string } }).data.meta);
    const keys = Object.keys(meta).sort();
    expect(keys).toEqual(["level", "m2", "mun", "tense"]);
    expect(meta.mun).toBe("081136");
    expect(meta.m2).toBe(85);
    expect(meta.level).toBe("N2");
    // cap valor de PII dins del meta
    const metaText = JSON.stringify(meta);
    expect(metaText).not.toContain("Carrer del Pi");
    expect(metaText).not.toContain("joan");
  });

  test("la consulta BD només llegeix el municipi (select sense cap camp personal)", async () => {
    dbCalls.length = 0;
    await estimaPOST(requestWithPII());
    const findCalls = dbCalls.filter(([op]) => op === "municipality.findUnique");
    expect(findCalls.length).toBe(1);
    const selectKeys = Object.keys((findCalls[0][1] as { select: Record<string, unknown> }).select).sort();
    // exactament les dades estadístiques del municipi — res de propietaris/PII
    expect(selectKeys).toEqual([
      "code", "comarca", "comarcaRefLatest", "comarcaRefPeriod", "contractsLatest",
      "isTense", "name", "province", "rentHistory", "rentLatest", "rentPeriod", "rentSource",
    ]);
    // l'única altra operació és el Event anònim: cap escriptura més
    const ops = dbCalls.map(([op]) => op).sort();
    expect(ops).toEqual(["event.create", "municipality.findUnique"]);
  });

  test("el contracte de transparència viatja sempre a la resposta", async () => {
    const res = await estimaPOST(requestWithPII());
    const body = (await res.json()) as {
      disclaimer: { ca: string; es: string };
      serpaviUrl: string;
      sources: unknown[];
      limitations: unknown[];
    };
    expect(body.disclaimer.ca).toContain("No és una taxació");
    expect(body.disclaimer.es).toContain("No es una tasación");
    expect(body.serpaviUrl).toBe("https://serpavi.mivau.gob.es/");
    expect(body.sources.length).toBeGreaterThanOrEqual(3);
    expect(body.limitations.length).toBeGreaterThanOrEqual(5);
  });

  test("rate limit → 429 i cap escriptura", async () => {
    dbCalls.length = 0;
    state.rateOk = false;
    const res = await estimaPOST(requestWithPII());
    state.rateOk = true;
    expect(res.status).toBe(429);
    expect(dbCalls.length).toBe(0);
  });

  test("municipi desconegut → 404; entrada invàlida → 400 sense escriptura", async () => {
    const original = state.muni;
    dbCalls.length = 0;
    state.muni = null;
    const res404 = await estimaPOST(requestWithPII());
    expect(res404.status).toBe(404);
    state.muni = original;
    const bad = new Request("http://localhost/api/estima", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ municipalityCode: "081136", surfaceM2: 99999 }),
    });
    const res400 = await estimaPOST(bad);
    expect(res400.status).toBe(400);
    expect(dbCalls.filter(([op]) => op === "event.create").length).toBe(0);
  });
});

// ── 2. Invariants del motor N1/N2 (bateria de casos) ─────────────────────────

const baseData = {
  rentLatest: 750,
  rentPeriod: "2025",
  contracts: 1468,
  history: null,
  comarcaValues: [600, 650, 700, 750, 800, 850, 900],
  provinciaValues: [],
  comarcaRefLatest: null,
  comarcaRefPeriod: null,
  tense: false,
};
const baseInput = { municipalityCode: "081136", municipalityName: "Manresa", surfaceM2: 85 };

describe("F4 QA — invariants del motor N1/N2 sobre bateria de casos", () => {
  const surfaces = [20, 45, 85, 120, 300, 500];
  const roomsList = [null, 0, 2, 5];
  const estats = [null, "A_REFORMAR", "BON_ESTAT", "REFORMADA", "OBRA_NOVA"] as const;

  test("rang positiu i ordenat (min ≤ central ≤ max) a tota la bateria", () => {
    for (const surfaceM2 of surfaces) {
      for (const rooms of roomsList) {
        for (const estat of estats) {
          const out = buildEstimation(baseData, { ...baseInput, surfaceM2, rooms, estat });
          if (!out.ok) continue; // la degradació es testa al seu propi bloc
          const r: EstimationResult = out.result;
          expect(r.min).toBeGreaterThan(0);
          expect(r.min).toBeLessThanOrEqual(r.central);
          expect(r.central).toBeLessThanOrEqual(r.max);
          expect(Number.isFinite(r.min) && Number.isFinite(r.max)).toBe(true);
        }
      }
    }
  });

  test("el nivell real mai s'infla: N2 ⟺ hi ha ajust de característica aplicat", () => {
    for (const surfaceM2 of surfaces) {
      for (const rooms of roomsList) {
        for (const estat of estats) {
          const out = buildEstimation(baseData, { ...baseInput, surfaceM2, rooms, estat });
          if (!out.ok) continue;
          const r = out.result;
          const hasChar = r.adjustmentKeys.some((k) => k !== "AJUST_SUPERFICIE");
          expect(r.level === "N2").toBe(hasChar);
          // i la base queda intacta com a traçabilitat
          expect(r.baseCentral).toBe(750);
        }
      }
    }
  });

  test("determinisme: mateixa entrada → mateix resultat (2 crides idèntiques)", () => {
    const a = buildEstimation(baseData, { ...baseInput, rooms: 3, estat: "REFORMADA" });
    const b = buildEstimation(baseData, { ...baseInput, rooms: 3, estat: "REFORMADA" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("l'elasticitat de superfície és decreixent en €/m² (β 0,8 < 1)", () => {
    let prevEurM2 = Number.POSITIVE_INFINITY;
    for (const s of [20, 45, 85, 120, 300]) {
      const out = buildEstimation(baseData, { ...baseInput, surfaceM2: s });
      if (!out.ok) continue;
      const eurM2 = out.result.eurM2 as number;
      expect(eurM2).toBeLessThan(prevEurM2);
      prevEurM2 = eurM2;
    }
    // i la típica de 85 m² deriva exactament de la base / 85
    const r85 = buildEstimation(baseData, baseInput);
    if (r85.ok) {
      expect(r85.result.eurM2Typical).toBe(Math.round((750 / VAL_REF_M2) * 10) / 10);
    }
  });
});

// ── 3. Informe de viabilitat A/B/C (la porta F0 formalitzada) ────────────────

describe("F4 QA — informe de viabilitat SERPAVI (classificació A/B/C)", () => {
  test("totes les variables del qüestionari oficial hi són, amb id únic i classe vàlida", () => {
    const rows = ESTIMA_VIABILITY.rows;
    expect(rows.length).toBe(11);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(rows.length);
    for (const r of rows) {
      expect(["A", "B", "C"]).toContain(r.cls);
      expect(r.variable.ca.length).toBeGreaterThan(0);
      expect(r.variable.es.length).toBeGreaterThan(0);
      expect(r.tractament.ca).not.toBe(r.tractament.es);
      expect(r.font.length).toBeGreaterThan(0);
    }
  });

  test("només les 3 variables A es demanen i s'apliquen (regla d'or)", () => {
    const aIds = ESTIMA_VIABILITY.rows.filter((r) => r.cls === "A").map((r) => r.id).sort();
    expect(aIds).toEqual(["ESTAT_CONSERVACIO", "HABITACIONS", "SUPERFICIE"]);
    // les B i C mai presenten tractament «APLICADA»
    for (const r of ESTIMA_VIABILITY.rows) {
      if (r.cls !== "A") {
        expect(r.tractament.ca.startsWith("APLICADA")).toBe(false);
        expect(r.tractament.es.startsWith("APLICADA")).toBe(false);
      }
    }
  });

  test("el N3 és C: mai simulat, sempre SERPAVI oficial", () => {
    const n3 = ESTIMA_VIABILITY.rows.find((r) => r.id === "N3_SECCIO_CENSAL");
    expect(n3).toBeDefined();
    expect(n3?.cls).toBe("C");
    expect(n3?.tractament.ca).toContain("NO SIMULAT");
    expect(n3?.font).toContain("https://serpavi.mivau.gob.es/");
  });

  test("veredicte i llegenda complets i bilingües", () => {
    expect(ESTIMA_VIABILITY.verdict.ca).toContain("VIABLE");
    expect(ESTIMA_VIABILITY.verdict.ca).toContain("mai simulada");
    expect(ESTIMA_VIABILITY.verdict.es).toContain("nunca simulada");
    for (const k of ["A", "B", "C"] as const) {
      expect(ESTIMA_VIABILITY.legend[k].ca.length).toBeGreaterThan(10);
      expect(ESTIMA_VIABILITY.legend[k].es.length).toBeGreaterThan(10);
    }
  });
});

// ── 4. Guarda del CI: cap test del redisseny corre amb continue-on-error ─────
// NOTA F4: aquestes 2 guardes van amb el commit que actualitza
// .github/workflows/ci.yml (els 10 fitxers bloquejants en un pas). Requereixen
// permís «workflows» del PAT per pushear-se; fins aleshores queden al commit
// pendents del workflow.
