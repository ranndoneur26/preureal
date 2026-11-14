import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { getBuildingEntorn } from "@/lib/entorn";

/**
 * GET /api/entorn/:id — v40 (Fase A): «Serveis i qualitat de l'entorn» d'un
 * edifici (certificats ICAEN per ref. catastral, equipaments propers, mobilitat
 * i recàrrega). PÚBLIC: contextualitza, no revela dades de pagament.
 *
 * Degradació elegant: cada bloc indica si té dades; «sense informació» no és
 * mai zero. Les distàncies són EN LÍNIA RECTA (haversine) i s'etiqueten així.
 * Cache HTTP 1 h + stale-while-revalidate 24 h (mateix patró que demografia).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = clientIp(req);
  const rl = await rateLimit(`entorn:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  try {
    const entorn = await getBuildingEntorn(id);
    if (!entorn) return NextResponse.json({ error: "BUILDING_NOT_FOUND" }, { status: 404 });
    return NextResponse.json(
      {
        ok: true,
        ...entorn,
        distanciesNota: "Distàncies en línia recta (haversine); no són itineraris a peu.",
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
    );
  } catch (e) {
    console.error("entorn:", id, e);
    return NextResponse.json(
      { error: "ENTORNT_ERROR", detail: String(e instanceof Error ? e.message : e).slice(0, 200) },
      { status: 500 }
    );
  }
}
