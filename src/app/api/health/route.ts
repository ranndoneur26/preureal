import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/health — estat de l'aplicació, la BASE DE DADES (Fase 4.2) i les
 * integracions externes. Visible al panell d'administració.
 */
export async function GET() {
  // --- base de dades ---
  let dbStatus: { ok: boolean; latencyMs: number | null; error?: string };
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = { ok: true, latencyMs: Date.now() - t0 };
  } catch (e: any) {
    dbStatus = { ok: false, latencyMs: null, error: String(e?.message || e).slice(0, 200) };
  }

  function check(name: string, url: string, timeout = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    return fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "PreuReal.cat/1.0" } })
      .then((r) => ({ name, ok: r.ok, status: r.status }))
      .catch((e) => ({ name, ok: false, status: String(e?.message || e) }))
      .finally(() => clearTimeout(t));
  }

  const [icgc] = await Promise.all([
    check("ICGC API Territorial", "https://api.icgc.cat/territorial/collections"),
  ]);

  // Catastro: prova REAL del servei viu (fix 2026-11-11). El servei WCF antic
  // COVCCatastro.svc/Consulta_DNPPC va ser retirat per la D.G. del Catastro
  // (404 global, WSDL inclòs); el substitut és OVCCallejero.asmx /
  // Consulta_DNPRC (Provincia + Municipio + RC, any al camp <debi><ant>).
  // RC de prova: parcel·la real de Carrer de Sants 10, Barcelona (any 1900).
  let catastro: { name: string; ok: boolean; status: string | number };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const r = await fetch(
      "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=BARCELONA&Municipio=BARCELONA&RC=8110708DF2881A",
      { signal: ctrl.signal, headers: { "User-Agent": "PreuReal.cat/1.0" }, cache: "no-store" }
    ).finally(() => clearTimeout(t));
    const text = r.ok ? await r.text() : "";
    // ok només si el servei respon XML vàlid sense <err> (errors de negoci
    // arriben amb HTTP 200; un 200 buit no seria una prova fiable)
    const ok = r.ok && text.includes("<consulta_dnp") && !text.includes("<err>");
    catastro = { name: "Cadastre (any construcció)", ok, status: r.status };
  } catch (e: any) {
    catastro = { name: "Cadastre (any construcció)", ok: false, status: String(e) };
  }

  return NextResponse.json({
    status: dbStatus.ok ? "ok" : "degraded",
    database: { ...dbStatus, provider: "postgresql" },
    integrations: {
      icgc,
      catastro,
      stripe: {
        configured: !!process.env.STRIPE_SECRET_KEY,
        demoCheckout: process.env.DEMO_CHECKOUT === "true",
      },
      email: { provider: process.env.RESEND_API_KEY ? "resend" : "sandbox" },
      google: { configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
    },
    time: new Date().toISOString(),
  });
}
