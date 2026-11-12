import { NextResponse } from "next/server";
import { clientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getCommunitySummary } from "@/lib/reports-summary";

/**
 * GET /api/reports/summary?mun=CODE — agregat PÚBLIC i ANÒNIM dels informes
 * ciutadans de preu (v38.6; la lògica compartida viu a src/lib/reports-summary.ts,
 * el comparador fa servir el mateix agregat des de v38.7).
 *
 *  - Finestra: últims 12 mesos · HABITATGE · estat != REJECTED.
 *  - PRIVACITAT: medianes només si n >= 3 (evita reidentificació); sense
 *    edificis, notes ni res personal.
 *  - Cost: una findMany indexada per municipalityCode amb take màxim.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`repsum:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const mun = new URL(req.url).searchParams.get("mun");
  if (!mun || !/^[0-9A-Za-z]{4,10}$/.test(mun)) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }

  const summary = await getCommunitySummary(mun);
  return NextResponse.json(summary);
}
