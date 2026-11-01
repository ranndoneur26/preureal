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

  // Catastro: estat de configuració (la comprobación real se hace al consultar)
  let catastro: { name: string; ok: boolean; status: string | number };
  try {
    const r = await check(
      "Cadastre",
      "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCatastro/COVCCatastro.svc/Consulta_DNPPC?RC=0801917DF3851E0001OR",
      7000
    );
    catastro = { name: "Cadastre (any construcció)", ok: r.ok, status: r.status };
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
