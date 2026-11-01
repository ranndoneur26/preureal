import { NextResponse } from "next/server";

function check(name: string, url: string, timeout = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "PreuReal.cat/1.0" } })
    .then((r) => ({ name, ok: r.ok, status: r.status }))
    .catch((e) => ({ name, ok: false, status: String(e?.message || e) }))
    .finally(() => clearTimeout(t));
}

/**
 * GET /api/health — estado de integraciones externas.
 * Visible también en el panel de administración.
 */
export async function GET() {
  const [icgc] = await Promise.all([
    check("ICGC API Territorial", "https://api.icgc.cat/territorial/collections"),
  ]);

  // Catastro: estado de configuración (la comprobación real se hace al consultar)
  let catastro: { name: string; ok: boolean; status: string | number };
  try {
    const r = await check(
      "Cadastre",
      "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCatastro/COVCCatastro.svc/Consulta_DNPPC?RC=0801917DF3851E0001OR",
      7000
    );
    // la seu pot respondre pàgina d'error HTML: ho detectem pel contingut
    catastro = { name: "Cadastre (any construcció)", ok: r.ok, status: r.status };
  } catch (e: any) {
    catastro = { name: "Cadastre (any construcció)", ok: false, status: String(e) };
  }

  return NextResponse.json({
    status: "ok",
    integrations: {
      icgc,
      catastro,
      stripe: {
        configured: !!process.env.STRIPE_SECRET_KEY,
        demoCheckout: process.env.DEMO_CHECKOUT === "true",
      },
      email: { provider: process.env.RESEND_API_KEY ? "resend" : "sandbox" },
    },
    time: new Date().toISOString(),
  });
}
