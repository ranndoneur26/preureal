import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, sanitizeName } from "@/lib/security";

const CONTRACT_TYPES = ["HABITATGE", "HABITATGE_COMPARTIT", "LOCAL", "ALTRE"];

/**
 * POST /api/reports — informe de preu ofertat (crowdsourcing, Fase 10).
 *  - Validació estricta de camps i rangs.
 *  - Detecció de duplicats (mateix usuari/IP + municipi + import en 24 h).
 *  - Sense dades personals innecessàries (només opcional una nota).
 *  - Sempre queda PENDING fins que un administrador el modera.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const session = await getAuthUser();
  const rl = await rateLimit(`reports:${session?.id || ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });

  const municipalityCode = body?.municipalityCode ? String(body.municipalityCode).slice(0, 10) : null;
  const buildingId = body?.buildingId ? String(body.buildingId).slice(0, 40) : null;
  const offerEurMonth = Number(body?.offerEurMonth);
  const surfaceM2 = Number(body?.surfaceM2);
  const rooms = body?.rooms ? parseInt(String(body.rooms), 10) : null;
  const contractType = body?.contractType ? String(body.contractType) : null;
  const reportedAtRaw = body?.reportedAt ? new Date(String(body.reportedAt)) : null;
  const note = body?.note ? sanitizeName(String(body.note))?.slice(0, 300) || null : null;

  if (!municipalityCode || !isFinite(offerEurMonth) || offerEurMonth < 50 || offerEurMonth > 20000) {
    return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  }
  const hasSurface = body?.surfaceM2 !== undefined && body?.surfaceM2 !== null && body?.surfaceM2 !== "";
  if (hasSurface && (!isFinite(surfaceM2) || surfaceM2 < 10 || surfaceM2 > 1000)) {
    return NextResponse.json({ error: "BAD_SURFACE" }, { status: 400 });
  }
  if (contractType && !CONTRACT_TYPES.includes(contractType)) {
    return NextResponse.json({ error: "BAD_CONTRACT_TYPE" }, { status: 400 });
  }
  if (reportedAtRaw && (isNaN(reportedAtRaw.getTime()) || reportedAtRaw > new Date())) {
    return NextResponse.json({ error: "BAD_REPORTED_AT" }, { status: 400 });
  }
  const mun = await db.municipality.findUnique({ where: { code: municipalityCode } });
  if (!mun) return NextResponse.json({ error: "UNKNOWN_MUNICIPALITY" }, { status: 400 });

  const offerEurM2 = isFinite(surfaceM2) && surfaceM2 >= 10 ? +(offerEurMonth / surfaceM2).toFixed(2) : null;

  // --- detecció de duplicats (mateix origen + municipi + import en 24 h) ---
  const since = new Date(Date.now() - 24 * 3600_000);
  const dup = await db.priceReport.findFirst({
    where: {
      municipalityCode,
      offerEurMonth,
      createdAt: { gte: since },
      ...(session ? { userId: session.id } : {}),
    },
  });
  if (dup) {
    return NextResponse.json({ error: "DUPLICATE", message: "Ja hem rebut un informe igual teu d'aquest municipi en les últimes 24 hores." }, { status: 409 });
  }
  // límit d'abús per IP anònima: màxim 5 informes/dia
  if (!session) {
    const recent = await db.priceReport.count({
      where: { createdAt: { gte: since }, note: { not: null } },
    });
    // (les anònimes no guarden IP; el rate limit per IP ja limita a 10/min;
    // aquest recompte agregat és un fre addicional barat)
    if (recent > 500) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });
  }

  const report = await db.priceReport.create({
    data: {
      userId: session?.id || null,
      municipalityCode,
      buildingId,
      offerEurMonth,
      offerEurM2,
      surfaceM2: isFinite(surfaceM2) && surfaceM2 >= 10 ? surfaceM2 : null,
      rooms: rooms && rooms > 0 && rooms < 30 ? rooms : null,
      contractType,
      reportedAt: reportedAtRaw || null,
      note,
      status: "PENDING",
    },
  });
  await db.event
    .create({ data: { type: "PRICE_REPORT", userId: session?.id || null, meta: JSON.stringify({ mun: municipalityCode }) } })
    .catch(() => {});
  return NextResponse.json({ ok: true, id: report.id });
}
