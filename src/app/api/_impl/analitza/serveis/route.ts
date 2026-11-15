import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { buildOverpassQuery, parseOverpassElements, type Poi, type PoiCategory } from "@/lib/analitza";

/**
 * POST /api/analitza/serveis — v44 secció C «Anàlisi d'ubicació»: serveis
 * propers (transport, salut, educació, comerç, zones verdes) des de
 * OpenStreetMap via Overpass API (servei públic i gratuït, dades ODbL).
 *
 * Independència de l'endpoint principal: l'anàlisi de preu arriba primer
 * (ràpida, BD) i els serveis s'omplen després; si Overpass cau, la secció C
 * es marca «temporalment no disponible» i res més es trenca (mai s'inventen
 * serveis ni distàncies).
 *
 * Cau en memòria per quadrícula de 3 decimals (~110 m) amb TTL de 6 h per
 * respectar la política d'ús pública d'Overpass. Distàncies en línia recta —
 * la UI les marca sempre com a aproximades.
 */

/**
 * Instàncies Overpass públiques i gratuïtes — s'intenten en ordre (la
 * principal sovint està saturada; els miralls són oficials de la comunitat).
 * Si totes fallen → ok:false sense cap dada inventada.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 15000;
const CACHE_MS = 6 * 3600_000;
const MAX_CACHE = 500;

const cache = new Map<string, { at: number; pois: Poi[] }>();

/** Màxim de POIs per categoria que s'ofereixen a l'informe (els més propers). */
const MAX_PER_CATEGORY: Record<PoiCategory, number> = {
  TRANSPORT: 8,
  SALUT: 6,
  EDUCACIO: 6,
  COMPRA: 6,
  VERD: 5,
};

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`analitza-serveis:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  // rang de Catalunya (més una mica de marge)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 40.0 || lat > 43.5 || lng < -1.5 || lng > 3.6) {
    return NextResponse.json({ error: "BAD_POINT" }, { status: 400 });
  }

  // cau: clau per quadrícula ~110 m
  const key = `${lat.toFixed(3)}|${lng.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json({ ok: true, cached: true, point: { lat, lng }, items: trimByCategory(hit.pois) });
  }

  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Preureal/1.0 (serveis propers; dades OpenStreetMap)",
        },
        body: `data=${encodeURIComponent(buildOverpassQuery(lat, lng))}`,
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`overpass ${url} → ${res.status}`);
      const data = (await res.json()) as { elements?: Array<Record<string, unknown>> };
      const pois = parseOverpassElements(data.elements, lat, lng);
      if (cache.size > MAX_CACHE) cache.clear();
      cache.set(key, { at: Date.now(), pois });
      return NextResponse.json({
        ok: true,
        cached: false,
        point: { lat, lng },
        items: trimByCategory(pois),
        source: "OpenStreetMap (Overpass API) — dades ODbL © OpenStreetMap contributors",
        distancesNote: "Distàncies en línia recta (a vol d'ocell): aproximades, no temps de trajecte.",
      });
    } catch (e) {
      lastErr = e; // prova el mirall següent
    } finally {
      clearTimeout(t);
    }
  }
  void lastErr;
  return NextResponse.json(
    { ok: false, reason: "SERVEIS_NO_DISPONIBLES", message: "El servei de dades d'entorn (OpenStreetMap/Overpass) no ha respòs en aquest moment; reintenta en uns minuts. No es fabriquen serveis ni distàncies." },
    { status: 502 },
  );
}

/** Retalla per categoria: els N més propers de cadascuna (resposta lleugera). */
function trimByCategory(pois: Poi[]): Poi[] {
  const counts: Record<string, number> = {};
  return pois.filter((p) => {
    const n = counts[p.category] ?? 0;
    if (n >= MAX_PER_CATEGORY[p.category]) return false;
    counts[p.category] = n + 1;
    return true;
  });
}
