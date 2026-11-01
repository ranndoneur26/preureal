import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logEvent, rateLimit } from "@/lib/analytics";

/** POST /api/reports — informe de preu ofertat (crowdsourcing fase 2). */
export async function POST(req: Request) {
  const rl = rateLimit("reports", 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const session = await getSession();
  const body = await req.json().catch(() => null);
  const municipalityCode = body?.municipalityCode ? String(body.municipalityCode) : null;
  const buildingId = body?.buildingId ? String(body.buildingId) : null;
  const offerEurMonth = Number(body?.offerEurMonth);
  const surfaceM2 = Number(body?.surfaceM2);
  const rooms = body?.rooms ? parseInt(String(body.rooms), 10) : null;
  const note = body?.note ? String(body.note).slice(0, 300) : null;

  if (!municipalityCode || !isFinite(offerEurMonth) || offerEurMonth <= 0) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }
  const offerEurM2 = isFinite(surfaceM2) && surfaceM2 > 10 ? +(offerEurMonth / surfaceM2).toFixed(2) : null;

  const report = await db.priceReport.create({
    data: {
      userId: session?.userId || null,
      municipalityCode,
      buildingId,
      offerEurMonth,
      offerEurM2,
      surfaceM2: isFinite(surfaceM2) ? surfaceM2 : null,
      rooms,
      note,
    },
  });
  await logEvent("PRICE_REPORT", session?.userId || null, { mun: municipalityCode });
  return NextResponse.json({ ok: true, id: report.id });
}
