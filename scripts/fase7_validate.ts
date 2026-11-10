/**
 * Fase 7 — Validació final (només LECTURA: cap escriptura a producció).
 *
 * PART A — Sondes en producció: disponibilitat, seguretat (401/402/403/405),
 *          capçaleres de seguretat i temps de resposta dels endpoints clau.
 * PART B — Qualitat de dades derivada de sondes PÚBLIQUES (la BD de
 *          producció només és accessible des de Vercel, per disseny):
 *          cobertura, rangs plausibles, zones tensades, naus (v33),
 *          catàleg d'ajudes i traçabilitat de fonts.
 *
 * Ús: bun scripts/fase7_validate.ts
 */

const BASE = process.env.FASE7_BASE ?? "https://www.preureal.com";

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, extra?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
function note(msg: string) {
  console.log(`  · ACCIÓ PENDENT / NOTA: ${msg}`);
}

async function timedFetch(path: string, init?: RequestInit, timeoutMs = 25000) {
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs), ...init });
  } catch (e) {
    return { ms: performance.now() - t0, res: null as Response | null, err: String(e) };
  }
  return { ms: performance.now() - t0, res, err: null as string | null };
}

async function jsonProbe(
  label: string,
  path: string,
  init?: RequestInit,
  validate?: (j: any) => boolean,
): Promise<any> {
  const { ms, res, err } = await timedFetch(path, init);
  if (!res) {
    ok(false, `${label}`, `xarxa: ${err}`);
    return null;
  }
  let j: any = null;
  try {
    j = await res.json();
  } catch {
    /* no JSON */
  }
  const good = res.status === 200 && (!validate || validate(j));
  ok(good, `${label}`, `${res.status} · ${Math.round(ms)} ms`);
  return good ? j : null;
}

// ───────────────────────── PART A ─────────────────────────
async function partA() {
  console.log(`\n═══ FASE 7 · PART A — Sondes en producció (${BASE}) ═══\n`);

  // ---- 1. Disponibilitat + contingut ----
  console.log("— Disponibilitat i contingut —");
  await jsonProbe("GET /api/health", "/api/health", undefined, (j) => j?.ok === true || j?.status === "ok");
  const plans = await jsonProbe("GET /api/plans", "/api/plans", undefined, (j) => Array.isArray(j?.plans) && j.plans.length >= 3);
  if (plans) {
    const prem = plans.plans.find((p: any) => p.id === "PREMIUM");
    const pro = plans.plans.find((p: any) => p.id === "PRO");
    const free = plans.plans.find((p: any) => p.id === "FREE");
    ok(prem?.features?.pdfMonth === 5, "plans: PREMIUM pdfMonth=5 (Fase 6)", String(prem?.features?.pdfMonth));
    ok(pro?.features?.pdfMonth === 30, "plans: PRO pdfMonth=30 (Fase 6)", String(pro?.features?.pdfMonth));
    ok(free?.features?.pdfMonth === 0, "plans: FREE sense PDF", String(free?.features?.pdfMonth));
    ok(prem?.priceEur === 7.99 && pro?.priceEur === 19.99, "plans: preus 7,99/19,99 €");
    ok(prem?.quotaMonth === -1 && pro?.quotaMonth === -1 && free?.quotaMonth === 3, "plans: quotes 3 / il·limitat / il·limitat");
  }
  const ine = await jsonProbe("GET /api/ine/status", "/api/ine/status", undefined, (j) => j?.ok === true && Array.isArray(j?.fuentes) && j.fuentes.length === 2);
  if (ine) {
    const atlasMuni = (ine.observaciones ?? []).find((o: any) => o.variable === "RENTA_NETA_MEDIA_HOGAR" && o.geoLevel === "MUNI");
    ok(!!atlasMuni && atlasMuni.count > 8000, "Atlas INE: sèries municipals de renda importades", `${atlasMuni?.count ?? 0} observacions`);
    const ipvaMuni = (ine.observaciones ?? []).find((o: any) => o.variable === "IPVA_INDICE" && o.geoLevel === "MUNI");
    ok(!!ipvaMuni && ipvaMuni.count > 500, "IPVA INE: sèries municipals presents", `${ipvaMuni?.count ?? 0} observacions`);
    const anyFail = (ine.ultimasImportaciones ?? []).some((r: any) => r.status === "ERROR");
    ok(!anyFail, "ine/status: cap importació INE en estat ERROR");
    for (const r of ine.ultimasImportaciones ?? []) {
      console.log(`    · run ${r.source} → ${r.status} (total=${r.rowsTotal}, ${new Date(r.createdAt).toISOString().slice(0, 10)})`);
    }
  }
  const ind = await jsonProbe(
    "GET /api/indicators/status",
    "/api/indicators/status",
    undefined,
    (j) => j?.status === "OK" && j?.canary?.effortCornella === 21.14,
  );
  if (ind) {
    ok(ind.canary.effortCornella === 21.14, "canari de fórmules: 792,7 €/45.000 € = 21,14 %");
    const bcn = ind.fumBarcelona;
    ok(!!bcn, "fum E2E Barcelona (renda+IPVA+banda)", bcn ? `renda llar=${JSON.stringify(bcn.rendaLlarUltima)} €/any` : "");
    ok(typeof bcn?.bandaDisponible === "boolean", "Barcelona: camp de banda present", `bandaDisponible=${bcn?.bandaDisponible} (null per disseny: la banda per edifici espera el conveni Incasòl/SERPAVI; la UI mostra «no disponible» amb explicació)`);
    console.log(`    · IPVA Catalunya: anual=${JSON.stringify(bcn?.ipvaCatAnual)}, acumulat 2015=${JSON.stringify(bcn?.ipvaCatAcum)}`);
    console.log(`    · cobertura: rendaMunicipis=${ind.cobertura?.rendaMunicipis}, ipvaMunicipis=${ind.cobertura?.ipvaMunicipis}, municipisTotal=${ind.cobertura?.municipisTotal}`);
    ok(ind.cobertura?.rendaMunicipis === 947 && ind.cobertura?.municipisTotal === 947, "cobertura Atlas: 947/947 municipis de Catalunya");
  }
  const prov = await jsonProbe("GET /api/provenance", "/api/provenance", undefined, (j) => Array.isArray(j?.datasets) && j.datasets.length >= 3);
  if (prov) {
    ok(prov.datasets.length >= 3, "proveniència: datasets amb font+llicència", `${prov.datasets.length} datasets`);
    for (const d of prov.datasets.slice(0, 8)) console.log(`    · ${d.id ?? d.nom}: ${String(d.font ?? "").slice(0, 70)}`);
  }
  const aid = await jsonProbe("GET /api/aid", "/api/aid", undefined, (j) => Array.isArray(j?.aids));
  if (aid) {
    const n = aid.aids.length;
    const ambFont = aid.aids.filter((a: any) => a.source && a.url && a.lastReviewedAt).length;
    ok(n >= 2 && ambFont === n, "ajudes amb font+URL+data de revisió", `${ambFont}/${n}`);
    const codes = aid.aids.map((a: any) => a.code);
    console.log(`    · visibles: ${codes.join(", ")}`);
    note("el catàleg produecció té 2 de les 4 ajudes del seed (falten AJUTS_LLOGUER_GENCAT i SERVEI_MEDIACIO_GENCAT) → prémer «Sincronitza el catàleg» a #/admin (tab Dades)");
  }

  // ---- 2. Teaser sense sessió (no filtra dades premium) ----
  console.log("\n— Teaser sense sessió —");
  const teas = await jsonProbe(
    "POST /api/lookup (teaser)",
    "/api/lookup",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: 41.3925, lng: 2.165 }) },
    (j) => j?.kind === "teaser" && !!j?.teaser,
  );
  if (teas) {
    const s = JSON.stringify(teas);
    ok(!s.includes('"avgRentEurMonth"') || teas.teaser.avgRentEurMonth === undefined, "teaser: no exposa el preu ple de l'edifici");
  }

  // ---- 3. Seguretat: accès sense sessió ha de ser 401/403/405 ----
  console.log("\n— Seguretat (sense sessió) —");
  const guarded: Array<[string, string]> = [
    ["GET /api/account", "/api/account"],
    ["GET /api/account/export", "/api/account/export"],
    ["GET /api/account/activity", "/api/account/activity"],
    ["GET /api/billing/history", "/api/billing/history"],
    ["GET /api/admin/users", "/api/admin/users"],
    ["GET /api/admin/stats", "/api/admin/stats"],
    ["GET /api/admin/audit", "/api/admin/audit"],
    ["GET /api/admin/plan-settings", "/api/admin/plan-settings"],
    ["GET /api/reports/pdf?code=08019", "/api/reports/pdf?code=08019"],
    ["GET /api/indicators/muni/080193 (gated)", "/api/indicators/muni/080193"],
  ];
  for (const [label, path] of guarded) {
    const { res } = await timedFetch(path);
    ok(!!res && [401, 403, 405].includes(res.status), `${label} → 401/403`, res ? String(res.status) : "xarxa");
  }
  for (const [label, path, body] of [
    ["POST /api/favorites", "/api/favorites", JSON.stringify({ municipalityCode: "080193" })],
    ["POST /api/subscription/change", "/api/subscription/change", JSON.stringify({ target: "PREMIUM" })],
  ] as Array<[string, string, string]>) {
    const { res } = await timedFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body });
    ok(!!res && [401, 403].includes(res.status), `${label} → 401/403`, res ? String(res.status) : "xarxa");
  }
  {
    const { res } = await timedFetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "fase7-probe@example.com", password: "contrasenya-erronia-123" }),
    });
    ok(!!res && res.status === 401, "POST /api/auth/login (credencials dolentes) → 401", res ? String(res.status) : "xarxa");
  }

  // ---- 4. Capçaleres de seguretat ----
  console.log("\n— Capçaleres de seguretat —");
  {
    const { res } = await timedFetch("/");
    if (res) {
      const h = res.headers;
      const csp = h.get("content-security-policy") ?? "";
      ok(!!h.get("strict-transport-security"), "HSTS present");
      ok((h.get("x-content-type-options") ?? "").toLowerCase() === "nosniff", "X-Content-Type-Options: nosniff");
      ok(!!h.get("referrer-policy"), "Referrer-Policy present", h.get("referrer-policy") ?? "");
      ok(!!csp || !!h.get("x-frame-options"), "CSP o X-Frame-Options present", csp ? `CSP (${csp.length} car.)` : h.get("x-frame-options") ?? "");
      if (csp) ok(/frame-ancestors/i.test(csp), "CSP inclou frame-ancestors");
      // Cookies: en pàgina pública no hi ha hagut de Set-Cookie de sessió
      const sc = h.get("set-cookie") ?? "";
      ok(!/pr_session/.test(sc), "cap cookie de sessió en pàgina pública");
    } else {
      ok(false, "capçaleres de /", "sense resposta");
    }
  }

  // ---- 5. Rendiment: 3 mostres per endpoint ----
  console.log("\n— Rendiment (3 mostres, ms) —");
  const perf: Array<[string, string, RequestInit?]> = [
    ["GET /api/health", "/api/health"],
    ["GET /api/plans", "/api/plans"],
    ["GET /api/municipalities?limit=200", "/api/municipalities?limit=200"],
    ["GET /api/ine/status", "/api/ine/status"],
    ["GET /api/indicators/status", "/api/indicators/status"],
    ["GET /api/provenance", "/api/provenance"],
    ["GET /api/aid", "/api/aid"],
    ["POST /api/lookup (teaser)", "/api/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: 41.3925, lng: 2.165 }) }],
    ["GET / (HTML)", "/"],
  ];
  const slow: string[] = [];
  for (const [label, path, init] of perf) {
    const ms: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { ms: t, err } = await timedFetch(path, init);
      if (err) break;
      ms.push(t);
    }
    if (ms.length === 0) {
      ok(false, `rendiment ${label}`, "sense resposta");
      continue;
    }
    ms.sort((a, b) => a - b);
    const med = Math.round(ms[Math.floor(ms.length / 2)]);
    const max = Math.round(ms[ms.length - 1]);
    console.log(`    · ${label}: mediana ${med} ms · màx ${max} ms`);
    if (med > 2000) slow.push(`${label} (mediana ${med} ms)`);
  }
  ok(slow.length === 0, "cap endpoint amb mediana > 2 s", slow.join("; ") || undefined);

  // ---- 6. Dominis (canònic + .cat) ----
  console.log("\n— Dominis —");
  for (const d of ["https://preureal.com", "https://preureal.cat", "https://www.preureal.cat"]) {
    try {
      const r = await fetch(`${d}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      const loc = r.headers.get("location") ?? "—";
      console.log(`    · ${d} → ${r.status}${r.status >= 300 && r.status < 400 ? ` → ${loc}` : ""}`);
      ok(r.status === 200 || (r.status >= 300 && r.status < 400), `domini ${d} respon`, String(r.status));
    } catch {
      note(`${d} no resol DNS — si es vol la marca .cat cal connectar el domini a Vercel (Settings → Domains)`);
    }
  }
}

// ───────────────────────── PART B ─────────────────────────
async function partB() {
  console.log("\n═══ FASE 7 · PART B — Qualitat de dades (sondes públiques, només lectura) ═══\n");

  // ---- 1. Fiances Incasòl: mostra de 200 municipis amb rangs plausibles ----
  console.log("— Fiances Incasòl (mostra ?limit=200) —");
  const munis = await jsonProbe("GET /api/municipalities?limit=200", "/api/municipalities?limit=200", undefined, (j) => Array.isArray(j?.municipalities) && j.municipalities.length === 200);
  if (munis) {
    const ambRenda = munis.municipalities.filter((m: any) => m.rentLatest != null);
    ok(ambRenda.length >= 120, "mostra amb dades de lloguer", `${ambRenda.length}/200`);
    const fora = ambRenda.filter((m: any) => m.rentLatest < 100 || m.rentLatest > 2500);
    ok(fora.length === 0, "tots els lloguers de la mostra en rang plausible (100–2.500 €/mes per habitatge)", fora.length ? `${fora.length} fora de rang` : `${Math.min(...ambRenda.map((m: any) => m.rentLatest))}–${Math.max(...ambRenda.map((m: any) => m.rentLatest))} €/mes`);
    const ambPeriode = ambRenda.filter((m: any) => !!m.rentPeriod);
    ok(ambPeriode.length === ambRenda.length, "cada lloguer amb el seu període visible");
    const periodos = [...new Set(ambRenda.map((m: any) => m.rentPeriod))];
    console.log(`    · períodes presents: ${periodos.sort().join(", ")}`);
    const bcn = munis.municipalities.find((m: any) => m.name === "Barcelona");
    if (bcn) console.log(`    · Barcelona: ${bcn.rentLatest} €/m² (${bcn.rentPeriod}) · contractes=${bcn.contractsLatest ?? "—"}`);
  }

  // ---- 2. Zones tensades (DOGC) ----
  const tense = await jsonProbe("GET /api/municipalities?tense=1&limit=200", "/api/municipalities?tense=1&limit=200", undefined, (j) => Array.isArray(j?.municipalities));
  if (tense) {
    ok(tense.municipalities.length === 171, "zones tensades = 171 (118 TER/3739/2026 + 53 TER/3740/2026)", String(tense.municipalities.length));
  }

  // ---- 3. Naus industrials (v33) a la Zona Franca de Barcelona ----
  console.log("\n— Naus industrials (v33) —");
  {
    // bbox petit de la Zona Franca (<400 ha); timeout llarg: mosaic fred pot trigar
    const bb = "west=2.125&south=41.348&east=2.145&north=41.363";
    {
      const { res, ms } = await timedFetch(`/api/buildings?${bb}`, undefined, 60000);
      let b: any = null;
      try {
        b = res ? await res.json() : null;
      } catch {
        /* ignore */
      }
      const good = res?.status === 200 && Array.isArray(b?.buildings);
      ok(!!good, `GET /api/buildings (Zona Franca)`, res ? `${res.status} · ${Math.round(ms)} ms` : "xarxa");
      if (good) {
        const naus = (b.buildings as any[]).filter((x) => x.tipus === "ind");
        const edis = (b.buildings as any[]).filter((x) => x.tipus === "edi" || x.tipus === "ill");
        ok(naus.length > 0, "naus industrials (tipus ind) visibles al mapa", `${naus.length} naus · ${edis.length} edificis/illes`);
        ok(naus.every((x) => x.avgRentEurMonth == null), "cap nau té preu de lloguer d'habitatges assignat (diferenciació v33 correcta)");
      }
    }
  }

  // ---- 4. Spot-check Barcelona per contrastar amb fonts oficials ----
  console.log("\n— Spot-check Barcelona (per contrastar amb fonts oficials) —");
  const ind2 = await jsonProbe("GET /api/indicators/status (fum BCN)", "/api/indicators/status", undefined, (j) => j?.status === "OK");
  if (ind2?.fumBarcelona) {
    const b = ind2.fumBarcelona;
    console.log(`    · renda neta mitjana per LLAR Barcelona: ${JSON.stringify(b.rendaLlarUltima)} €/any (font: INE Atlas)`);
    console.log(`    · esforç econòmic Barcelona: ${JSON.stringify(b.effortHogarPct)} %`);
    console.log(`    · IPVA Catalunya: anual=${JSON.stringify(b.ipvaCatAnual)} · acumulat des de 2015=${JSON.stringify(b.ipvaCatAcum)}`);
  }
  const munisB = await jsonProbe("GET /api/municipalities?code=080193", "/api/municipalities?code=080193", undefined, (j) => j?.municipalities?.length === 1);
  if (munisB) {
    const m = munisB.municipalities[0];
    console.log(`    · lloguer mitjà Barcelona (fiances Incasòl): ${m.rentLatest} €/m²·mes · període=${m.rentPeriod} · any anterior=${m.rentPrevYear ?? "—"} (${m.rentPrevPeriod ?? "—"})`);
  }
}

// ───────────────────────── MAIN ─────────────────────────
(async () => {
  const t0 = performance.now();
  await partA();
  await partB();
  console.log(`\n═══ FASE 7 VALIDACIÓ: ${pass} PASS / ${fail} FAIL — ${Math.round((performance.now() - t0) / 1000)} s ═══`);
  process.exit(fail > 0 ? 1 : 0);
})();
