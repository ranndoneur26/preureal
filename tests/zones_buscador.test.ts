/**
 * v67 — BUSCADOR INVERS: /api/zones + DDL + UI.
 *
 *  Z1-Z8  — /api/zones: validació del muni (5-6 dígits), 404 fora de catàleg,
 *           200 amb zmrt (DOGC) + indexReferencia + zones ordenades per
 *           compliment (ORDER BY ... DESC NULLS LAST a l'SQL), cobertura
 *           PILOT_AMB/FORA_ABAST honesta, degradació 503 DATA_NOT_READY,
 *           nota RGPD de secció censal i MAI geometria al payload.
 *  D1-D3  — DDL pipeline/sql/002: 3 taules (municipis, seccions_censals amb
 *           geometria, dades_lloguer_agregades), índex de compliment, RGPD.
 *  L1-L2  — loader f4: mètode QUOTA_EDIFICIS_ESTIMADA + mai credencials.
 *  U1-U7  — UI: BuscadorInvers (toggle switch, semàfor, CTA «Verificar un
 *           edifici concret en aquesta zona», taula ordenable amb aria-sort),
 *           LandingView amb el buscador i SENSE AnalitzaForm, ConsultaView amb
 *           el mòdul mogut, AppShell amb /consulta + menú, i18n CA/ES, prefil
 *           additiu ?muni= a AnalitzaView/AnalitzaForm.
 *
 * Tests de RUTA amb mock.module (patró geo.test.ts / form_contract_v48).
 */
import { describe, expect, test, mock } from "bun:test";
import { readFileSync } from "fs";

// ---- ports mockejats --------------------------------------------------------
const rawQueries: string[] = [];
let queryRawImpl: (q: unknown) => Promise<unknown[]> = async () => [];

const muniBCN = {
  code: "080193", ineCode: "08019", name: "Barcelona", comarca: "Barcelonès", province: "Barcelona",
  lat: 41.39, lng: 2.17, rentLatest: 1134.6, rentPeriod: "2025", rentSource: "INCASOL",
  comarcaRefLatest: null, comarcaRefPeriod: null, contractsLatest: 117,
  isTense: true, tenseList: "A",
};
const muniGirona = {
  code: "170792", ineCode: "17079", name: "Girona", comarca: "Gironès", province: "Girona",
  lat: 41.98, lng: 2.82, rentLatest: 838.4, rentPeriod: "2025", rentSource: "INCASOL",
  comarcaRefLatest: null, comarcaRefPeriod: null, contractsLatest: 60,
  isTense: true, tenseList: "A",
};

let findUniqueCalls: unknown[] = [];
let findFirstCalls: unknown[] = [];

mock.module("@/lib/db", () => ({
  db: {
    $queryRaw: async (q: unknown) => {
      rawQueries.push(String(q));
      return queryRawImpl(q);
    },
    municipality: {
      findUnique: async (args: unknown) => {
        findUniqueCalls.push(args);
        const code = (args as { where: { code: string } }).where.code;
        return code === muniBCN.code ? muniBCN : code === muniGirona.code ? muniGirona : null;
      },
      findFirst: async (args: unknown) => {
        findFirstCalls.push(args);
        const ine = (args as { where: { ineCode: string } }).where.ineCode;
        return ine === muniBCN.ineCode ? muniBCN : ine === muniGirona.ineCode ? muniGirona : null;
      },
    },
  },
}));
mock.module("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true, used: 1, limit: 30 }),
}));
mock.module("@/lib/security", () => ({
  clientIp: () => "203.0.113.9",
}));
mock.module("@/lib/analitza", () => ({
  NORM_FACTS: {
    tenseSource: "DOGC — Resolucions TER/3739/2026 i TER/3740/2026",
    tenseResolutions: ["Resolució TER/3739/2026 (pròrroga)", "Resolució TER/3740/2026 (nous)"],
  },
  ORIENTATION_DISCLAIMER: { ca: "Comparació estadística, no és una taxació oficial.", es: "Comparación estadística, no es una tasación oficial." },
}));

const zoneRows = [
  //ordre DEMANAT per la BD (DESC NULLS LAST) — el test vigila que la ruta el preservi
  { id_seccio: "08019308080", nom: null, anyo: 2025, preu: 11.013, idx: 11.595, comp: 87.02, nivell_dada: "MUNICIPAL", compliment_metode: "QUOTA_EDIFICIS_ESTIMADA", num_contractes: null, n_edificis: 402, num_viviendas: 3980, estimacio: true, lat: 41.4, lon: 2.17 },
  { id_seccio: "08019308081", nom: null, anyo: 2025, preu: 10.782, idx: 11.595, comp: 86.36, nivell_dada: "MUNICIPAL", compliment_metode: "QUOTA_EDIFICIS_ESTIMADA", num_contractes: null, n_edificis: 300, num_viviendas: 2900, estimacio: true, lat: 41.4, lon: 2.18 },
  { id_seccio: "08019308082", nom: "Dreta de l'Eixample", anyo: 2025, preu: 12.9, idx: 11.595, comp: 40.5, nivell_dada: "MUNICIPAL", compliment_metode: "QUOTA_EDIFICIS_ESTIMADA", num_contractes: null, n_edificis: 120, num_viviendas: 1400, estimacio: true, lat: 41.39, lon: 2.16 },
];

const { GET: getZones } = await import("../src/app/api/_impl/zones/route");
const { cacheClear } = await import("../src/lib/cache");

const req = (url: string) => new Request(`http://localhost${url}`);
const readSrc = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf-8");
const resetCounters = () => {
  rawQueries.length = 0;
  findUniqueCalls.length = 0;
  findFirstCalls.length = 0;
};

describe("v67 — /api/zones (buscador invers)", () => {
  test("Z1 — 400 BAD_MUNI si el codi no és de 5-6 dígits", async () => {
    cacheClear();
    for (const m of ["0801", "abc", "0801933", ""]) {
      const res = await getZones(req(`/api/zones?muni=${m}`));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_MUNI");
    }
  });

  test("Z2 — 404 NOT_FOUND per a un municipi fora del catàleg", async () => {
    cacheClear();
    const res = await getZones(req("/api/zones?muni=99999"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("NOT_FOUND");
  });

  test("Z3 — 200 amb zmrt DOGC + índex de referència + cobertura del pilot", async () => {
    cacheClear();
    queryRawImpl = async () => zoneRows;
    const res = await getZones(req("/api/zones?muni=080193"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.municipi).toMatchObject({ code: "080193", name: "Barcelona", ineCode: "08019" });
    expect(j.zmrt.tense).toBe(true);
    expect(j.zmrt.llista).toBe("A");
    expect(j.zmrt.publicacio).toBe("DOGC 19-10-2026");
    expect(j.indexReferencia.valorEurMes).toBe(1134.6);
    expect(j.indexReferencia.municipal).toBe(true);
    expect(j.indexReferencia.estimacio).toBe(false);
    expect(j.indexReferencia.eurM2).toBe(11.595);
    expect(j.cobertura).toBe("PILOT_AMB");
    expect(j.n_zones).toBe(3);
    expect(j.anyReferencia).toBe(2025);
  });

  test("Z4 — l'SQL ordena per compliment DESC NULLS LAST i filtra per muni", async () => {
    cacheClear();
    queryRawImpl = async () => [];
    await getZones(req("/api/zones?muni=080193"));
    const sql = rawQueries.at(-1) || "";
    expect(sql).toContain("geo.dades_lloguer_agregades");
    expect(sql).toContain("geo.seccions_censals");
    expect(sql).toContain('ORDER BY d."percentatge_compliment" DESC NULLS LAST');
    expect(sql).toContain('"muni5" =');
  });

  test("Z5 — les zones conserven l'ordre del servidor i MAI porten geometria", async () => {
    cacheClear();
    queryRawImpl = async () => zoneRows;
    const res = await getZones(req("/api/zones?muni=08019"));
    const j = await res.json();
    expect(j.zones.map((z: { complimentPct: number }) => z.complimentPct)).toEqual([87.02, 86.36, 40.5]);
    expect(j.zones[0].nivellDada).toBe("MUNICIPAL");
    expect(j.zones[0].estimacio).toBe(true);
    for (const z of j.zones) {
      const keys = Object.keys(z);
      expect(keys).not.toContain("geom");
      expect(keys).not.toContain("wkt_fallback");
    }
    expect(j.nota_rgpd).toContain("secció censal");
    expect(j.nota_estimacio).toContain("QUOTA_EDIFICIS_ESTIMADA");
  });

  test("Z6 — degradació honesta: taules absents → 503 DATA_NOT_READY", async () => {
    cacheClear();
    queryRawImpl = async () => {
      throw new Error(`error: relation "geo.dades_lloguer_agregades" does not exist (SQLSTATE 42P01)`);
    };
    const res = await getZones(req("/api/zones?muni=08019"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("DATA_NOT_READY");
  });

  test("Z7 — municipi del catàleg SENSE cobertura → 200 FORA_ABAST (mai inventat)", async () => {
    cacheClear();
    queryRawImpl = async () => [];
    const res = await getZones(req("/api/zones?muni=17079")); // Girona: ZMRT, fora del pilot
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.cobertura).toBe("FORA_ABAST_PILOT");
    expect(j.n_zones).toBe(0);
    expect(j.zones).toEqual([]);
    expect(j.zmrt.tense).toBe(true);
  });

  test("Z8 — accepta codi de 5 dígits (lookup per ineCode) i de 6 (per code)", async () => {
    resetCounters();
    queryRawImpl = async () => zoneRows;
    await getZones(req("/api/zones?muni=08019"));
    expect(findFirstCalls.length).toBe(1);
    expect(findUniqueCalls.length).toBe(0);
    resetCounters();
    await getZones(req("/api/zones?muni=080193"));
    expect(findUniqueCalls.length).toBe(1);
    expect(findFirstCalls.length).toBe(0);
  });
});

describe("v67 — DDL i loader del buscador invers", () => {
  const ddl = readSrc("../pipeline/sql/002_zones_buscador_invers.sql");

  test("D1 — les 3 taules demanades amb geometria PostGIS a seccions", () => {
    expect(ddl).toContain("CREATE TABLE geo.municipis (");
    expect(ddl).toContain("CREATE TABLE geo.seccions_censals (");
    expect(ddl).toContain("CREATE TABLE geo.dades_lloguer_agregades (");
    expect(ddl).toContain("geom           geometry(MultiPolygon, 4258)");
    expect(ddl).toContain("zmrt            boolean NOT NULL DEFAULT false");
    expect(ddl).toContain("preu_real_mitja_eur_m2");
    expect(ddl).toContain("index_referencia_eur_m2");
    expect(ddl).toContain("percentatge_compliment");
  });

  test("D2 — índex optimitzat per a la consulta del buscador", () => {
    expect(ddl).toContain("idx_dades_muni_compliment");
    expect(ddl).toContain("(muni5, percentatge_compliment DESC NULLS LAST)");
    expect(ddl).toContain("USING GIST (geom)");
  });

  test("D3 — RGPD: agregació secció censal, mai edifici/vivenda", () => {
    expect(ddl).toContain("RGPD");
    expect(ddl).toContain("(unitat estadística oficial");
    expect(ddl).toContain("Mai dades a nivell");
    expect(ddl).toContain("mai edifici/vivenda");
  });

  test("L1 — loader amb mètode estimat + any + idempotència", () => {
    const py = readSrc("../pipeline/f4_zones_buscador.py");
    expect(py).toContain("QUOTA_EDIFICIS_ESTIMADA");
    expect(py).toContain("MIN_EDIFICIS_SECCIO");
    expect(py).toContain("DROP TABLE IF EXISTS geo.dades_lloguer_agregades CASCADE");
    expect(py).toContain('nivell_dada=MUNICIPAL');
  });

  test("L2 — el loader mai imprimeix la URL de connexió", () => {
    const py = readSrc("../pipeline/f4_zones_buscador.py");
    expect(py).toContain("conn.info.host");
    expect(py).not.toMatch(/print\(.*args\.url/);
    expect(py).not.toMatch(/print\(.*DATABASE_URL/);
  });
});

describe("v67 — UI del buscador invers i navegació", () => {
  const ui = readSrc("../src/components/buscador/BuscadorInvers.tsx");
  const landing = readSrc("../src/components/views/LandingView.tsx");
  const consulta = readSrc("../src/components/views/ConsultaView.tsx");
  const shell = readSrc("../src/components/AppShell.tsx");
  const i18n = readSrc("../src/lib/i18n.ts");
  const analitzaView = readSrc("../src/components/views/AnalitzaView.tsx");
  const analitzaForm = readSrc("../src/components/analitza/AnalitzaForm.tsx");

  test("U1 — autocompletat + toggle «només municipis no tensionats»", () => {
    expect(ui).toContain("Mostrar només municipis no tensionats");
    expect(ui).toContain("Mostrar solo municipios no tensionados");
    expect(ui).toContain('role="switch"');
    expect(ui).toContain("aria-checked={noTense}");
    expect(ui).toContain("/api/municipalities?q=");
  });

  test("U2 — targeta d'estat ZMRT amb semàfor i resolucions DOGC", () => {
    expect(ui).toContain("Zona de Mercat Residencial Tensionat (ZMRT)");
    expect(ui).toContain("Zona de Mercado Residencial Tensionado (ZMRT)");
    expect(ui).toContain("data-testid=\"zmrt-card\"");
    expect(ui).toContain("bg-embersoft");
    expect(ui).toContain("bg-mintsoft");
    expect(ui).toContain("DOGC 19-10-2026");
  });

  test("U3 — taula ordenable amb aria-sort i semàfor per compliment", () => {
    expect(ui).toContain("aria-sort=");
    expect(ui).toContain("complimentPct");
    expect(ui).toContain("bg-mintsoft text-pine");
    expect(ui).toContain("bg-embersoft text-ember3");
    expect(ui).toContain("toggleSort");
  });

  test("U4 — CTA «Verificar un edifici concret en aquesta zona» amb prefil del municipi", () => {
    expect(ui).toContain("Verificar un edifici concret en aquesta zona");
    expect(ui).toContain("Verificar un edificio concreto en esta zona");
    expect(ui).toContain("/analitza?muni=");
    expect(ui).toContain("&mn=");
  });

  test("U5 — RGPD i honestitat a la UI (agregació secció censal, estimació)", () => {
    expect(ui).toContain("data.nota_rgpd");
    expect(ui).toContain("data.nota_estimacio");
    expect(ui).toContain("ESTIMACIÓ");
    expect(ui).toContain("SECCIÓ CENSAL");
    expect(ui).toContain("mai dades d'edifici o vivenda");
  });

  test("U6 — LandingView acull el buscador i SENSE el formulari; ConsultaView el porta", () => {
    expect(landing).toContain("BuscadorInvers");
    expect(landing).toContain('Buscador invers: zones que compleixen l\'índex');
    expect(landing).not.toContain("AnalitzaForm");
    expect(landing).toContain('"Valora el lloguer del teu habitatge"'); // pestanya intacta
    expect(consulta).toContain("Consulta el preu real registrat");
    expect(consulta).toContain('variant="compact"');
    expect(consulta).toContain("GateLockedPanel");
  });

  test("U7 — ruta /consulta al shell FORA del menú (v68) + «Consulta» → /analitza + prefil", () => {
    expect(shell).toContain('view === "/consulta" && <ConsultaView />');
    // v68 — el propietari treu «Consulta ràpida» del menú (desktop, mòbil i
    // peu): «consulta ràpida sembla una ampliació de consulta». La pàgina
    // /consulta continua viva com a destí directe, però la navegació només
    // ofereix «Consulta» (l'eina completa /analitza amb mapa ICGC).
    expect(shell).not.toContain('link("/consulta"');
    expect(shell).not.toContain('footLink("/consulta"');
    expect(shell).toContain('link("/analitza", t.nav.analitza)');
    expect(i18n).not.toContain("consultaRapida");
    expect(analitzaView).toContain("initialMunicipi");
    expect(analitzaView).toContain('/^\\d{6}$/');
    expect(analitzaForm).toContain("initialMunicipi?: { code: string; name: string }");
  });
});
