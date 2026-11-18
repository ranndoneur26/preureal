/**
 * v66 — endpoints del pipeline geoespacial (F3): /api/geo/illes i
 * /api/geo/edifici.
 *
 *  I1-I4  — /api/geo/illes: validació del muni, agregat per illa amb nota
 *           obligatòria («no és una taxació oficial»), degradació honesta
 *           DATA_NOT_READY (503) si les taules del esquema geo encara no
 *           existeixen, i cap geometria WKT al payload (atributs + centroid).
 *  E1-E5  — /api/geo/edifici: 401 anònim, 403 Gratuït (PLAN_REQUIRED),
 *           200 Premium/Pro amb IC95% + grau, 404 fora d'abast, 400 refcat
 *           invàlida (format 14 o muni5_refcat14).
 *  R1     — cap ruta existent canvia: les dues rutes són NOVA a _impl/geo.
 *
 * Tests de RUTA amb mock.module (patró form_contract_v48): codi real de la
 * ruta contra mock dels ports (db, auth, plans, rate-limit, security).
 */
import { describe, expect, test, mock } from "bun:test";

// ---- ports mockejats --------------------------------------------------------
const rawQueries: string[] = [];
let queryRawImpl: (q: unknown) => Promise<unknown[]> = async () => [];

mock.module("@/lib/db", () => ({
  db: {
    $queryRaw: async (q: unknown) => {
      rawQueries.push(String(q));
      return queryRawImpl(q);
    },
  },
}));
mock.module("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true, used: 1, limit: 30 }),
}));
mock.module("@/lib/security", () => ({
  audit: async () => ({}),
  clientIp: () => "203.0.113.9",
  hashIp: () => "h",
  escapeHtml: (s: string) => s,
  htmlToText: (s: string) => s,
  maskEmail: (e: string) => e,
  sanitizeName: (n: string) => n,
}));
let userPlan: "FREE" | "PREMIUM" | "PRO" | null = "FREE";
mock.module("@/lib/auth", () => ({
  requireVerifiedUser: async () => {
    if (userPlan === null) throw new Error("UNAUTHENTICATED");
    return { id: "u1", email: "t@example.com", plan: userPlan };
  },
  isEmailNotVerifiedError: () => false,
}));
mock.module("@/lib/plans", () => ({
  getPlanSettings: async () => ({ FREE: {}, PREMIUM: {}, PRO: {} }),
}));

const illaRow = {
  id_illa: "08019_12301",
  muni5: "08019",
  n_edificios: 12,
  num_viviendas: 210,
  renta_m2_media: 11.42,
  calidad_media: 0.71,
  lat: 41.39,
  lon: 2.17,
};
const edificiRow = {
  id_edificio: "CAT_000100300DF19C",
  id_illa: "08001_00010",
  ref_catastral: "08001_000100300DF19C",
  id_seccio: "08001801007",
  num_viviendas: 1,
  sup_media_m2: 61.2,
  antiguedad: 61,
  anyo_construccion: 1963,
  renta_serpavi_inf: 6.683,
  renta_serpavi_sup: 9.042,
  renta_estimada_edificio: 427.4,
  renta_m2_mes: 6.984,
  renta_ic95_edificio_inf: 341.2,
  renta_ic95_edificio_sup: 535.5,
  calidad_estimacion: 0.602,
  calidad_grado: "B",
  procedencia: "20% INCASÒL / 80% SERPAVI-OSM",
  fuera_rango_serpavi: false,
  anio_referencia: 2025,
  metodologia_version: "v1.0-2026-11",
};

const { GET: getIlles } = await import("../src/app/api/_impl/geo/illes/route");
const { GET: getEdifici } = await import("../src/app/api/_impl/geo/edifici/route");
const { cacheClear } = await import("../src/lib/cache");

const req = (url: string) => new Request(`http://localhost${url}`);

describe("v66 — /api/geo/illes (agregat per illa, públic)", () => {
  test("I1 — 400 BAD_MUNI si el codi municipal no és de 5 dígits", async () => {
    cacheClear();
    for (const m of ["0801", "abcde", "080193", ""]) {
      const res = await getIlles(req(`/api/geo/illes?muni=${m}`));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_MUNI");
    }
  });

  test("I2 — 200 amb agregats per illa + nota de transparència", async () => {
    queryRawImpl = async () => [illaRow];
    const res = await getIlles(req("/api/geo/illes?muni=08019"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.muni).toBe("08019");
    expect(j.n_illes).toBe(1);
    expect(j.illes[0].renta_m2_media).toBe(11.42);
    expect(j.nota).toContain("no és una taxació oficial");
  });

  test("I3 — degradació honesta: taules geo absents → 503 DATA_NOT_READY", async () => {
    cacheClear();
    queryRawImpl = async () => {
      throw new Error(`error: relation "geo.geo_illes" does not exist (SQLSTATE 42P01)`);
    };
    const res = await getIlles(req("/api/geo/illes?muni=08019"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("DATA_NOT_READY");
  });

  test("I4 — el SELECT consulta geo.geo_illes i filtra per muni", async () => {
    cacheClear();
    queryRawImpl = async () => [];
    await getIlles(req("/api/geo/illes?muni=08101"));
    expect(rawQueries.at(-1)).toContain("geo.geo_illes");
    expect(rawQueries.at(-1)).toContain("muni5");
  });
});

describe("v66 — /api/geo/edifici (nivell edifici, Premium/Pro)", () => {
  test("E1 — 401 sense sessió", async () => {
    cacheClear();
    userPlan = null;
    queryRawImpl = async () => [edificiRow];
    const res = await getEdifici(req("/api/geo/edifici?refcat=08001_000100300DF19C"));
    expect(res.status).toBe(401);
    userPlan = "FREE";
  });

  test("E2 — 403 PLAN_REQUIRED al Gratuït (mai dades de pagament al pla Free)", async () => {
    userPlan = "FREE";
    queryRawImpl = async () => [edificiRow];
    const res = await getEdifici(req("/api/geo/edifici?refcat=08001_000100300DF19C"));
    expect(res.status).toBe(403);
    const j = await res.json();
    expect(j.error).toBe("PLAN_REQUIRED");
    expect(j.plan).toBe("PREMIUM");
  });

  test("E3 — 200 Premium amb IC95%, grau i nota legal", async () => {
    cacheClear();
    userPlan = "PREMIUM";
    queryRawImpl = async () => [edificiRow];
    const res = await getEdifici(req("/api/geo/edifici?refcat=08001_000100300DF19C"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.edifici.renta_m2_mes).toBe(6.984);
    expect(j.edifici.renta_ic95_edificio_sup).toBe(535.5);
    expect(j.edifici.calidad_grado).toBe("B");
    expect(j.nota).toContain("no és una taxació oficial");
    userPlan = "PRO";
    const res2 = await getEdifici(req("/api/geo/edifici?refcat=000100300DF19C"));
    expect(res2.status).toBe(200);
  });

  test("E4 — 400 BAD_REFCAT amb format invàlid", async () => {
    cacheClear();
    userPlan = "PREMIUM";
    for (const r of ["XXXX", "08001_XX", "12345678901234567890", ""]) {
      const res = await getEdifici(req(`/api/geo/edifici?refcat=${r}`));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("BAD_REFCAT");
    }
  });

  test("E5 — 404 EDIFICI_NOT_FOUND fora d'abast (mai inventat) i 503 si no hi ha pipeline", async () => {
    cacheClear();
    userPlan = "PREMIUM";
    queryRawImpl = async () => [];
    const res = await getEdifici(req("/api/geo/edifici?refcat=08001_000100300DF19C"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("EDIFICI_NOT_FOUND");
    cacheClear(); // el null del 404 no ha de tapar la prova d'error BD
    queryRawImpl = async () => {
      throw new Error(`relation "geo.dim_building_rent_estimation" does not exist (SQLSTATE 42P01)`);
    };
    const res2 = await getEdifici(req("/api/geo/edifici?refcat=08001_000100300DF19C"));
    expect(res2.status).toBe(503);
    expect((await res2.json()).error).toBe("DATA_NOT_READY");
  });
});
