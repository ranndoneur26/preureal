import { db } from "@/lib/db";

/**
 * v38.6/v38.7 — agregat PÚBLIC i ANÒNIM dels informes ciutadans de preu
 * (crowdsourcing de la fitxa «Estàs pagant de més?»).
 *
 * Funció compartida per:
 *  - GET /api/reports/summary?mun=CODE (fitxa del mapa)
 *  - POST /api/comparator (comparador de municipis, camp `community` per MUNI)
 *
 * Regles (les dues rutes les mateixes, sempre):
 *  - Finestra: últims 12 mesos · contractes d'HABITATGE · estat != REJECTED
 *    (PENDING i ACCEPTED compten: la moderació no pot verificar cap preu real,
 *    la UI sempre ho etiqueta com a «no verificat»).
 *  - PRIVACITAT: medianes només si n >= 3 (evita reidentificació en mostres
 *    petites: amb 1-2 informes la mediana és el preu d'un concret). n sempre
 *    es retorna (és l'únic camp agregat segur), les medianes venen a null.
 *  - Mai edificis, notes, ni cap dada individual: el resultat és l'ÚNICA cosa
 *    que surt d'una consulta agregada.
 */

export interface CommunitySummary {
  n: number;
  median: number | null;
  medianEurM2: number | null;
}

const WINDOW_MS = 365 * 24 * 3600_000;
export const COMMUNITY_PRIVACY_MIN_N = 3;

function medianOfSorted(s: number[]): number {
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function getCommunitySummary(municipalityCode: string): Promise<CommunitySummary> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db.priceReport.findMany({
    where: {
      municipalityCode,
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
  const offers = rows
    .map((r) => r.offerEurMonth as number)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (n < COMMUNITY_PRIVACY_MIN_N || offers.length < COMMUNITY_PRIVACY_MIN_N) {
    return { n, median: null, medianEurM2: null };
  }

  const median = +medianOfSorted(offers).toFixed(0);

  const eurM2 = rows
    .map((r) => r.offerEurM2)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const medianEurM2 =
    eurM2.length >= COMMUNITY_PRIVACY_MIN_N ? +medianOfSorted(eurM2).toFixed(2) : null;

  return { n, median, medianEurM2 };
}
