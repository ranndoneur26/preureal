import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/reports/summary?mun=CODE — agregat PÚBLIC i ANÒNIM dels informes
 * ciutadans de preu (v38.6).
 *
 * Abans els informes només anaven a la cua de moderació (PENDING) i cap
 * usuari no en veia el resultat: la promesa «ajudarà altres usuaris» era
 * buida. Aquest endpoint tanca el cercle amb la mateixa filosofia que la
 * resta del producte: agregació, mai dades individuals.
 *
 *  - Finestra: últims 12 mesos · contractes d'HABITATGE · estat != REJECTED
 *    (els moderats com a abús queden fora; PENDING i ACCEPTED compten,
 *    perquè la moderació no pot verificar cap preu real — es mostra com
 *    «no verificat» a la UI).
 *  - PRIVACITAT: només si n >= 3 (evita reidentificació en mostres petites:
 *    amb 1-2 informes, la mediana és el preu d'un concret). Sense edificis,
 *    sense notes, sense res personal. És l'únic camp de l'informe que surt
 *    d'una consulta agregada.
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

  const since = new Date(Date.now() - 365 * 24 * 3600_000);
  const rows = await db.priceReport.findMany({
    where: {
      municipalityCode: mun,
      contractType: "HABITATGE",
      status: { not: "REJECTED" },
      createdAt: { gte: since },
      offerEurMonth: { not: null },
    },
    select: { offerEurMonth: true, offerEurM2: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const n = rows.length;
  if (n < 3) {
    return NextResponse.json({ n, median: null, medianEurM2: null });
  }

  const offers = rows
    .map((r) => r.offerEurMonth as number)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (offers.length < 3) {
    return NextResponse.json({ n, median: null, medianEurM2: null });
  }
  const mid = Math.floor(offers.length / 2);
  const median =
    offers.length % 2 !== 0 ? offers[mid] : (offers[mid - 1] + offers[mid]) / 2;

  const eurM2 = rows
    .map((r) => r.offerEurM2)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const mid2 = Math.floor(eurM2.length / 2);
  const medianEurM2 =
    eurM2.length >= 3
      ? +(eurM2.length % 2 !== 0 ? eurM2[mid2] : (eurM2[mid2 - 1] + eurM2[mid2]) / 2).toFixed(2)
      : null;

  return NextResponse.json({ n, median: +median.toFixed(0), medianEurM2 });
}
