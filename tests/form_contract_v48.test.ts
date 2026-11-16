/**
 * v48 — retirada del selector «Tipus de contracte» del formulari de consulta
 * (Home compact + /analitza full).
 *
 * Motiu (decisió de producte, dades honestes): de les 3 opcions ofertades
 * (HABITATGE / TEMPORADA / HABITACIO) només «Vivienda habitual» té dades
 * oficials aplicables — la referència registrada de fiances Incasòl — i el
 * motor de comparació compara sempre amb aquesta referència. Oferir Temporada
 * i «Habitació (compartir piso)» suggeria un càlcul que no existeix: s'eliminen
 * del formulari i el SERVIDOR coacciona qualsevol valor llegat a HABITATGE
 * (esborranys sessionStorage anteriors, clients vells: mai 400, mai crash).
 * L'assumpció queda documentada a l'informe («Tipus de contracte: Habitatge
 * habitual») i el motor normatiu manté les branques TEMPORADA/HABITACIO per
 * robustesa defensiva (tests existents a analitza.test.ts).
 *
 * Guardes:
 *  F1-F2 — el formulari mai torna a oferir el selector ni enviar contractType;
 *          l'esborrany llegat es saneja (mai es restaura contractType).
 *  A1    — la whitelist del servidor és exactament ["HABITATGE"].
 *  B1-B5 — comportament REAL de la ruta: TEMPORADA / HABITACIO / absent /
 *          HABITATGE → sempre HABITATGE a la sortida, i la lectura normativa
 *          pren el camí d'habitatge habitual (mai el camí TEMPORADA_FORA_LIMIT).
 *  M1    — l'avís ciutadà del mapa (classificació del report a /api/reports)
 *          manté el SEU selector intacte: és una altra feature amb dades reals.
 *  R1    — l'informe continua documentant l'assumpció a l'usuari.
 *
 * Avalúa CODI sense comentaris (línia + blocs JSX {/* *\/}) — igual que les
 * guardes de consulta_v47: la documentació històrica mai pot passar la guarda.
 */
import { describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Codi sense comentaris de línia NI blocs JSX — la guarda comprova CODI real. */
const codeOnly = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

describe("v48 — el formulari de consulta sense «Tipus de contracte»", () => {
  const form = codeOnly(readSrc("../src/components/analitza/AnalitzaForm.tsx"));

  test("F1. el selector i les opcions sense dades oficials mai tornen", () => {
    expect(form).not.toContain('id="analitza-tipus"');
    expect(form).not.toContain("Tipus de contracte");
    expect(form).not.toContain("Tipo de contrato");
    expect(form).not.toContain('value="TEMPORADA"');
    expect(form).not.toContain('value="HABITACIO"');
    expect(form).not.toContain("ContractType");
  });

  test("F2. el body no envia contractType i l'esborrany llegat es saneja", () => {
    expect(form).not.toContain("contractType: vals.contractType");
    expect(form).not.toContain('contractType: "HABITATGE"');
    // els esborranys < v48 poden portar contractType: mai es restaura
    expect(form).toContain("delete (filled as { contractType?: unknown }).contractType");
  });
});

describe("v48 — el servidor fixa HABITATGE (coacció de valors llegats)", () => {
  test("A1. la whitelist de /api/analitza és exactament [\"HABITATGE\"]", () => {
    const route = readSrc("../src/app/api/_impl/analitza/route.ts");
    const line = route.split("\n").find((l) => l.includes("const CONTRACT_TYPES"));
    expect(line).toBeDefined();
    expect(line!.trim()).toBe('const CONTRACT_TYPES: ContractType[] = ["HABITATGE"];');
    // la coacció (qualsevol valor fora de la whitelist → HABITATGE) roman al sanitize
    expect(route).toContain('? (ctRaw as ContractType) : "HABITATGE"');
  });

  test("M1. l'avís ciutadà del mapa manté el seu propi selector (feature separada)", () => {
    const map = readSrc("../src/components/views/MapView.tsx");
    // HABITATGE_COMPARTIT / LOCAL / ALTRE classifiquen el report de l'usuari a
    // /api/reports: dades reals de ciutadans, res a veure amb la referència Incasòl
    expect(map).toContain('value="HABITATGE_COMPARTIT"');
    expect(map).toContain('value="LOCAL"');
    expect(map).toContain('value="ALTRE"');
  });

  test("R1. l'informe documenta l'assumpció: «Tipus de contracte: Habitatge habitual»", () => {
    const html = readSrc("../src/lib/analitza-html.ts");
    expect(html).toContain('"Tipus de contracte"');
    expect(html).toContain('HABITATGE: { ca: "Habitatge habitual", es: "Vivienda habitual" }');
  });
});

// ── Comportament real de la ruta (harness mínim, patró email_first) ──────────

mock.module("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
}));

const muni = {
  code: "081136",
  name: "Manresa",
  comarca: "Bages",
  province: "Barcelona",
  lat: 41.7243,
  lng: 1.8289,
  rentLatest: 750.5,
  rentPeriod: "2025",
  rentHistory: JSON.stringify({ "2024": 741.2, "2025": 750.5 }),
  contractsLatest: 1468,
  comarcaRefLatest: 700,
  comarcaRefPeriod: "2025",
  rentSource: "INCASOL",
  isTense: false,
  tenseList: null,
};

const events: Array<Record<string, unknown>> = [];

const fakeDb = {
  municipality: {
    findUnique: async () => muni,
    findMany: async () => [],
  },
  event: {
    create: async (args: { data: Record<string, unknown> }) => {
      events.push(args.data);
      return {};
    },
  },
};

mock.module("@/lib/db", () => ({ db: fakeDb }));
mock.module("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true, used: 1, limit: 20 }),
}));
// COPIA COMPLETA dels exports de security (patró audit_v23): si el mock guanya
// la re-vinculació, cap mòdul real importat després no es queda sense export.
mock.module("@/lib/security", () => ({
  audit: async () => ({}),
  clientIp: () => "203.0.113.9",
  hashIp: () => "h",
  escapeHtml: (s: string) => s,
  htmlToText: (s: string) => s,
  maskEmail: (e: string) => e,
  sanitizeName: (n: string) => n,
}));
mock.module("@/lib/consulta-gate", () => ({
  gateDetailedQuery: async () => ({
    ok: true as const,
    user: { id: "test-user", email: "test@example.com", plan: "FREE" as const },
  }),
  registratPrimerResponse: () => new Response("{}", { status: 401 }),
}));
mock.module("@/lib/indicators-data", () => ({
  getMuniRentRows: async () => [],
}));

// import DESPRÉS dels mock.module (obligatori amb bun)
const { POST } = await import("../src/app/api/_impl/analitza/route");

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/analitza", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const base = { municipalityCode: "081136", priceEurMonth: 950, surfaceM2: 65, rooms: 2 };

describe("v48 — coacció server-side: la sortida sempre és habitatge habitual", () => {
  test("B1. contractType=TEMPORADA (valor llegat) → HABITATGE a l'entrada de l'informe", async () => {
    const res = await post({ ...base, contractType: "TEMPORADA" });
    expect(res.status).toBe(200);
    const d = (await res.json()) as { ok: boolean; input: { contractType: string }; normative: { checks: Array<{ id: string; state: string; detail: string }> } };
    expect(d.ok).toBe(true);
    expect(d.input.contractType).toBe("HABITATGE");
  });

  test("B2. contractType=HABITACIO (valor llegat) → HABITATGE", async () => {
    const res = await post({ ...base, contractType: "HABITACIO" });
    expect(res.status).toBe(200);
    const d = (await res.json()) as { input: { contractType: string } };
    expect(d.input.contractType).toBe("HABITATGE");
  });

  test("B3. sense contractType (v48: el formulari ja no l'envia) → HABITATGE", async () => {
    const res = await post({ ...base });
    expect(res.status).toBe(200);
    const d = (await res.json()) as { input: { contractType: string } };
    expect(d.input.contractType).toBe("HABITATGE");
  });

  test("B4. contractType=HABITATGE es manté", async () => {
    const res = await post({ ...base, contractType: "HABITATGE" });
    expect(res.status).toBe(200);
    const d = (await res.json()) as { input: { contractType: string } };
    expect(d.input.contractType).toBe("HABITATGE");
  });

  test("B5. la lectura normativa pren el camí d'habitatge habitual (mai TEMPORADA_FORA_LIMIT)", async () => {
    // amb TEMPORADA l'antic codi retornava LIMIT_RENTA_ART172 NA amb detall
    // TEMPORADA_FORA_LIMIT; coaccionat a HABITATGE i sense zona tensada el
    // detall és NO_TENSAT_LLIURE (lloguer lliure d'habitatge fora de zona tensada)
    const res = await post({ ...base, contractType: "TEMPORADA" });
    const d = (await res.json()) as { normative: { checks: Array<{ id: string; state: string; detail: string }> } };
    const chk = d.normative.checks.find((c) => c.id === "LIMIT_RENTA_ART172");
    expect(chk).toBeDefined();
    expect(chk!.detail).toBe("NO_TENSAT_LLIURE");
  });
});
