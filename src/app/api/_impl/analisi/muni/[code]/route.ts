import { NextResponse } from "next/server";
import { getMuniAnalisi } from "@/lib/analisi";

/**
 * GET /api/analisi/muni/:code — v42: creuament de les tres sèries oficials
 * del mercat residencial d'un municipi (preu mitjà de fiances Incasòl, flux
 * anual de contractes, població IDESCAT) + contrast censal 2021 + lectures
 * descriptives. PÚBLIC i sense gating: descriptiu, no revela dades de
 * pagament. Sense dada → null amb nota (mai inventat, mai interpolat).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "es" ? "es" : "ca";
  let payload: Awaited<ReturnType<typeof getMuniAnalisi>>;
  try {
    payload = await getMuniAnalisi(code, lang);
  } catch (e) {
    console.error("analisi muni:", code, e);
    return NextResponse.json(
      { error: "ANALISI_ERROR", detail: String(e instanceof Error ? e.message : e).slice(0, 200) },
      { status: 500 }
    );
  }
  if (!payload) return NextResponse.json({ error: "MUNICIPALITY_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(
    payload,
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
