import { NextResponse } from "next/server";
import { getMuniDemografia, interpretacioDemografica } from "@/lib/demografia";

/**
 * GET /api/demografia/muni/:code — v39: context demogràfic i territorial
 * d'un municipi (IDESCAT: padró continu, censos de llars, emex). PÚBLIC i
 * sense gating: contextualitza el mercat, no revela dades de pagament.
 * Cada bloc cita font i any de referència; sense dada → null (mai inventat).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "es" ? "es" : "ca";
  const demo = await getMuniDemografia(code).catch(() => null);
  if (!demo) return NextResponse.json({ error: "MUNICIPALITY_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(
    {
      ok: true,
      code,
      locale: lang,
      ...demo,
      interpretacio: interpretacioDemografica(demo, lang),
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
