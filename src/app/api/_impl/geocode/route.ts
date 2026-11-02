import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { icgcGeocode } from "@/lib/geocode";

/**
 * GET /api/geocode?q=... — cercador d'adreces (proxy del Geocodificador ICGC,
 * Fase 8.1). Amb cau servidor + rate limit. Retorna resultats normalitzats.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`geocode:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 160);
  if (q.length < 3) return NextResponse.json({ results: [] });

  const results = await icgcGeocode(q);
  return NextResponse.json({ results, source: "ICGC Geocodificador" });
}
