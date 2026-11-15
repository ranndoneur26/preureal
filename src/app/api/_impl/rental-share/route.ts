import { NextResponse } from "next/server";
import { getRentalShareDetail, RENTAL_SHARE_METODOLOGIA } from "@/lib/rental-share";

/**
 * GET /api/rental-share?muni=:code — v41: indicador «% estimat d'alquiler
 * sobre el parc residencial» d'un municipi + referència censal (Cens 2021) +
 * flux anual de fiances (referència de mercat). PÚBLIC i sense gating:
 * transparència metodològica, no revela dades de pagament.
 * Sense dada → null amb estat explicatiu (mai inventat).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = String(url.searchParams.get("muni") || "").slice(0, 10);
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "BAD_MUNI", message: "Paràmetre ?muni= amb codi censal de 6 dígits." }, { status: 400 });
  }
  let detail;
  try {
    detail = await getRentalShareDetail(code);
  } catch (e) {
    console.error("rental-share:", code, e);
    return NextResponse.json(
      { error: "RS_ERROR", detail: String(e instanceof Error ? e.message : e).slice(0, 200) },
      { status: 500 }
    );
  }
  if (!detail.muni) return NextResponse.json({ error: "MUNICIPALITY_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(
    {
      ok: true,
      ...detail,
      metodologia: RENTAL_SHARE_METODOLOGIA,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
