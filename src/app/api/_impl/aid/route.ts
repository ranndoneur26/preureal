import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import seedAids from "@/data/rental_aid_seed.json";

/**
 * GET /api/aid?muni=CODE — Fase 4: ajudes al lloguer vigents (Taula 8:
 * contingut GRATUÏT per a tots els plans, captació i SEO).
 *
 * Font de veritat: taula editorial RentalAid (revisió trimestral amb data,
 * font i enllaç oficial). Si la taula encara no té files (p. ex. després
 * d'un desplegament nou sense seed), respon amb el catàleg editorial
 * empaquetat a src/data/rental_aid_seed.json — el mateix contingut que el
 * seed insereix, mai inventat en calent.
 *
 * Amb ?muni= filtra àmbit estatal + la CCAA del municipi. Sense dades
 * d'usuari; orientatiu per disseny: la UI sempre diu «verifica-ho a la font
 * oficial» amb la data de darrera revisió.
 */
export async function GET(req: NextRequest) {
  const muni = new URL(req.url).searchParams.get("muni");
  let scopeCodes: (string | null)[] = [null]; // estatal sempre
  if (muni && /^\d{6}$/.test(muni)) {
    const mun = await db.municipality.findUnique({
      where: { code: muni },
      select: { province: true },
    });
    if (mun) scopeCodes = [null, "09"]; // estatal + Catalunya
  }

  let rows: Array<{
    code: string;
    title: string;
    titleEs: string | null;
    description: string;
    descriptionEs: string | null;
    scope: string;
    scopeCode: string | null;
    amount: string | null;
    audience: string | null;
    audienceEs: string | null;
    status: string;
    url: string;
    source: string;
    lastReviewedAt: string;
  }> = [];

  try {
    const dbRows = await db.rentalAid.findMany({
      where: {
        active: true,
        status: { not: "FINALIZADA" },
        // scopeCode null = estatal; els altres són codis de CCAA ("09")
        OR: [{ scopeCode: null }, ...(scopeCodes.length > 1 ? [{ scopeCode: { in: scopeCodes.filter((c): c is string => c !== null) } }] : [])],
      },
      orderBy: [{ scope: "asc" }, { code: "asc" }],
      select: {
        code: true,
        title: true,
        titleEs: true,
        description: true,
        descriptionEs: true,
        scope: true,
        scopeCode: true,
        amount: true,
        audience: true,
        audienceEs: true,
        status: true,
        url: true,
        source: true,
        lastReviewedAt: true,
      },
    });
    rows = dbRows.map((a) => ({ ...a, lastReviewedAt: a.lastReviewedAt.toISOString() }));
  } catch {
    // BD no disponible (p. ex. migració en curs): degradació elegant al catàleg editorial
  }

  if (rows.length === 0) {
    rows = seedAids.aids
      .filter((a) => scopeCodes.includes(a.scopeCode as string | null) && a.status !== "FINALIZADA")
      .map((a) => ({ ...a, lastReviewedAt: `${seedAids.revisado}T00:00:00.000Z` }));
  }

  return NextResponse.json(
    {
      aids: rows,
      avis:
        "Informació orientativa amb data de revisió: les convocatories tenen terminis i crèdits propis. Verifica sempre la font oficial abans de presentar cap sol·licitud.",
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
