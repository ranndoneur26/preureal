import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * GET /api/rental-share/ranking?order=desc|asc&limit=20&source=census|estimat
 * v41: rànquing municipal de l'indicador «% estimat de lloguer sobre el parc
 * residencial». Per defecte ordre censal (Cens 2021 — dada oficial disponible
 * per a 615 municipis); source=estimat només retorna municipis amb el càlcul
 * compost complet (numerador stock + denominador catastral), que avui és
 * buit fins que les fonts oficials publiquin les dades pendents.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`rs-ranking:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const url = new URL(req.url);
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
  const source = url.searchParams.get("source") === "estimat" ? "estimat" : "census";
  const limitRaw = Number(url.searchParams.get("limit") || 20);
  const limit = Math.min(Math.max(Math.trunc(Number.isFinite(limitRaw) ? limitRaw : 20), 1), 100);

  const field = source === "estimat" ? "rentalPercentage" : "censusRentalPercentage";
  const rows = await db.rentalShareObservation.findMany({
    where: { [field]: { not: null } },
    orderBy: { [field]: order },
    take: limit,
    select: {
      municipalityCode: true,
      municipalityName: true,
      rentalPercentage: true,
      censusRentalPercentage: true,
      censusMainRental: true,
      censusMainTotal: true,
      censusYear: true,
      dataStatus: true,
      methodologyVersion: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      source,
      order,
      count: rows.length,
      rows: rows.map((r, i) => ({
        position: i + 1,
        municipalityCode: r.municipalityCode,
        name: r.municipalityName,
        pct: source === "estimat" ? r.rentalPercentage : r.censusRentalPercentage,
        censusMainRental: r.censusMainRental,
        censusMainTotal: r.censusMainTotal,
        censusYear: r.censusYear,
        dataStatus: r.dataStatus,
      })),
      note:
        source === "estimat"
          ? "Només municipis amb numerador (fiances vigentes) i denominador (parc catastral) oficials complets."
          : "Cens de població i habitatges 2021 (Idescat/INE): % de viviendas principales en alquiler. Referència censal oficial; no equival al % sobre el parc catastral.",
    },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
