import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { getIllesByMuni, isGeoNotReady } from "@/lib/geo";

/**
 * GET /api/geo/illes?muni=08019 — estimaciones a nivel ILLA (manzana) del
 * pipeline ETL geoespacial + ML (PASO 3/4 del encargo). Dato AGREGADO por
 * illa derivado de fuentes oficiales (Catastro + SERPAVI + INCASÒL): nivel de
 * detalle de manzana, nunca por vivienda. Ruta NUEVA y aditiva: no altera
 * ningún endpoint ni diseño existente.
 *
 * Degradación honesta: si el pipeline no se ha cargado en esta BD → 503
 * DATA_NOT_READY (jamás se inventa cobertura).
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`geo-illes:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const muni = new URL(req.url).searchParams.get("muni") || "";
  if (!/^\d{5}$/.test(muni)) {
    return NextResponse.json(
      { error: "BAD_MUNI", message: "muni ha de ser el codi INE de 5 dígits (p. ex. 08019)" },
      { status: 400 },
    );
  }

  try {
    const illes = await getIllesByMuni(muni);
    return NextResponse.json(
      {
        ok: true,
        muni,
        n_illes: illes.length,
        illes: illes,
        nota: "Estimació estadística per illa (manzana) derivada de fonts oficials (Catastro, SERPAVI, Incasòl). Comparació estadística, no és una taxació oficial.",
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    if (isGeoNotReady(e)) {
      return NextResponse.json(
        { error: "DATA_NOT_READY", message: "el pipeline geoespacial encara no s'ha carregat en aquesta BD" },
        { status: 503 },
      );
    }
    console.error("geo/illes:", muni, e);
    return NextResponse.json(
      { error: "GEO_ERROR", detail: String(e instanceof Error ? e.message : e).slice(0, 200) },
      { status: 500 },
    );
  }
}
