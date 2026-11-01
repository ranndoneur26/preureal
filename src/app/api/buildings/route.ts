import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/analytics";
import { bboxAreaHa, splitBbox, getOrFetchBuildings } from "@/lib/icgc";

/**
 * GET /api/buildings?west=&south=&east=&north=
 * Edificis reals (ICGC RTT) de la vista, amb cau a la BD.
 * La vista es divideix en mosaics ≤ 40 ha (límit ICGC 50 ha); màxim 9 mosaics
 * per petició. A zoom < 15 el client no demana res.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const west = parseFloat(searchParams.get("west") || "");
  const south = parseFloat(searchParams.get("south") || "");
  const east = parseFloat(searchParams.get("east") || "");
  const north = parseFloat(searchParams.get("north") || "");

  if ([west, south, east, north].some((v) => !isFinite(v))) {
    return NextResponse.json({ error: "BAD_BBOX" }, { status: 400 });
  }
  const view = { west, south, east, north };
  if (bboxAreaHa(view) > 400) {
    return NextResponse.json(
      { error: "BBOX_TOO_BIG", message: "Fes zoom (nivell 16+) per carregar edificis" },
      { status: 400 }
    );
  }
  const chunks = splitBbox(view, 40);

  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = rateLimit(`buildings:${ip}`, 40, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  try {
    const seen = new Map<string, any>();
    let fromCache = true;
    // fetch paral·lel dels mosaics (cortesia: màxim 9 crides ICGC per petició)
    const results = await Promise.all(
      chunks.map((chunk) => getOrFetchBuildings(chunk))
    );
    for (const { buildings, fromCache: cached } of results) {
      if (!cached) fromCache = false;
      for (const b of buildings) if (!seen.has(b.id)) seen.set(b.id, b);
    }
    const merged = [...seen.values()];
    // preu municipal real per colorear el mapa (una consulta per municipis presents)
    const codes = [...new Set(merged.map((b) => b.municipalityCode).filter(Boolean))] as string[];
    const muns = codes.length
      ? await db.municipality.findMany({
          where: { code: { in: codes } },
          select: { code: true, rentLatest: true, isTense: true },
        })
      : [];
    const munMap = new Map(muns.map((m) => [m.code, m]));

    return NextResponse.json({
      fromCache,
      chunks: chunks.length,
      buildings: merged.map((b) => {
        const m = b.municipalityCode ? munMap.get(b.municipalityCode) : undefined;
        return {
          id: b.id,
          tipus: b.tipus,
          estat: b.estat,
          altura: b.altura,
          nom: b.nom,
          yearBuilt: b.yearBuilt,
          refcat: b.refcat,
          munRent: m?.rentLatest ?? null,
          munTense: m?.isTense ?? null,
          municipalityCode: b.municipalityCode,
          ring: JSON.parse(b.polygonJson),
          lat: b.centroidLat,
          lng: b.centroidLng,
        };
      }),
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("BBOX_MASSA_GRAN")) {
      return NextResponse.json({ error: "BBOX_TOO_BIG" }, { status: 400 });
    }
    console.error("buildings", msg);
    return NextResponse.json(
      { error: "ICGC_UNAVAILABLE", message: "Servei cartogràfic temporalment no disponible" },
      { status: 502 }
    );
  }
}
