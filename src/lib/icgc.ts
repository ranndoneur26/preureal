import { db } from "@/lib/db";

/**
 * Cliente del API Territorial de l'ICGC (dades obertes, llicència CC-BY 4.0).
 * https://api.icgc.cat/territorial/
 *
 * Capes utilitzades:
 *  - construccions-rtt: polígons d'edificis, illes de cases i naus industrials
 *    (màx 50 ha/consulta; v33: tipus edi/ill/ind)
 *  - parcelles-cadastre: parcel·la catastral per punt (refcat real)
 *  - municipis: límit municipal + CODIMUNI
 */

const BASE = "https://api.icgc.cat/territorial";
const UA = "PreuReal.cat/1.0 (dades obertes ICGC)";

export async function icgcGet(pathAndQuery: string, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${pathAndQuery}`, {
      headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ICGC ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function bboxAreaHa(b: BBox): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const w = (b.east - b.west) * rad * R * Math.cos((((b.north + b.south) / 2) * rad));
  const h = (b.north - b.south) * rad * R;
  return (w * h) / 10000;
}

/**
 * Divideix una bbox en mosaics d'≈ maxHa hectàrees cadascun (límit de la
 * capa ICGC: 50 ha per consulta). Retorna max 9 mosaics.
 */
export function splitBbox(b: BBox, maxHa = 40): BBox[] {
  const total = bboxAreaHa(b);
  if (total <= maxHa) return [b];
  const side = Math.sqrt(maxHa) / 10; // km per costat
  const latMid = (b.north + b.south) / 2;
  const kmPerDegX = 111.32 * Math.cos((latMid * Math.PI) / 180);
  const kmPerDegY = 110.57;
  const cols = Math.min(3, Math.ceil(((b.east - b.west) * kmPerDegX) / side));
  const rows = Math.min(3, Math.ceil(((b.north - b.south) * kmPerDegY) / side));
  const out: BBox[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      out.push({
        west: b.west + ((b.east - b.west) * i) / cols,
        east: b.west + ((b.east - b.west) * (i + 1)) / cols,
        south: b.south + ((b.north - b.south) * j) / rows,
        north: b.south + ((b.north - b.south) * (j + 1)) / rows,
      });
    }
  }
  return out;
}

/** Llegim edificis d'una bbox (la capa limita l'àrea a 50 ha). */
export async function fetchBuildingsBbox(b: BBox) {
  if (bboxAreaHa(b) > 50) throw new Error("BBOX_MASSA_GRAN");
  const url = `/collections/construccions-rtt/items?bbox=${b.west},${b.south},${b.east},${b.north}&limit=3000`;
  const d = await icgcGet(url);
  const out: Array<{
    externalId: string;
    tipus: string | null;
    estat: string | null;
    altura: number | null;
    nom: string | null;
    polygonJson: string;
    centroidLat: number;
    centroidLng: number;
  }> = [];
  for (const f of d.features || []) {
    const p = f.properties || {};
    // v33 — "ind" = construcció industrial (nau): s'ha d'incloure per poder
    // diferenciar-la visualment i avisar que les estadístiques de lloguer
    // (fiances Incasòl) són d'habitatges i no cobreixen naus.
    if (!["edi", "ill", "ind"].includes(p.tipus)) continue;
    const geom = f.geometry;
    let ring: number[][] | null = null;
    if (geom?.type === "Polygon") ring = geom.coordinates[0];
    else if (geom?.type === "MultiPolygon") ring = geom.coordinates?.[0]?.[0];
    if (!ring || ring.length < 3) continue;
    let cx = 0, cy = 0;
    for (const [x, y] of ring) { cx += x; cy += y; }
    cx /= ring.length; cy /= ring.length;
    out.push({
      externalId: `RTT-${p.id}`,
      tipus: p.tipus ?? null,
      estat: p.estat ?? null,
      altura: typeof p.altura === "number" ? p.altura : null,
      nom: p.nom || null,
      polygonJson: JSON.stringify(ring),
      centroidLat: cy,
      centroidLng: cx,
    });
  }
  return out;
}

/** Parcel·la catastral (refcat real) que conté el punt donat. */
export async function fetchParcelAt(lat: number, lng: number): Promise<string | null> {
  try {
    const d = await icgcGet(`/elements/parcelles-cadastre/${lng},${lat}`, 12000);
    const f = d?.features?.[0];
    const ref = f?.properties?.refcadp ?? f?.properties?.refcad ?? null;
    return ref ? String(ref) : null;
  } catch {
    return null;
  }
}

/**
 * Buscador per referència catastral (2026-11-11): localitza QUALSEVOL parcel·la
 * de Catalunya a partir de la seva RC, sense necessitar municipi ni província.
 * La capa OGC `parcelles-cadastre` admet el filtre OGC API - Features Part 3:
 *   ?filter=refcadp='<RC de parcel·la (14)>'
 * Retorna el polígon i el centroid. Degradació elegant: si la capa no respon o
 * la RC no existeix → null (mai trenca la resposta de la API, mai s'inventa).
 */
export async function fetchParcelByRefcat(refcat: string): Promise<{
  refcat: string;
  ring: number[][];
  centroidLat: number;
  centroidLng: number;
} | null> {
  const rc = refcat.replace(/\s+/g, "").toUpperCase().slice(0, 14);
  if (!/^[0-9A-Z]{14}$/.test(rc)) return null;
  try {
    const d = await icgcGet(
      `/collections/parcelles-cadastre/items?limit=1&filter=${encodeURIComponent(`refcadp='${rc}'`)}`,
      12000
    );
    const f = d?.features?.[0];
    const geom = f?.geometry;
    let ring: number[][] | null = null;
    if (geom?.type === "Polygon") ring = geom.coordinates[0];
    else if (geom?.type === "MultiPolygon") ring = geom.coordinates?.[0]?.[0];
    if (!ring || ring.length < 3) return null;
    let cx = 0, cy = 0;
    for (const [x, y] of ring) { cx += x; cy += y; }
    cx /= ring.length; cy /= ring.length;
    return {
      refcat: String(f.properties?.refcadp || rc),
      ring,
      centroidLat: cy,
      centroidLng: cx,
    };
  } catch {
    return null;
  }
}

/** Límit municipal (GeoJSON simplificat) + CODIMUNI pel punt donat. */
export async function fetchMunicipalityBoundary(
  lat: number,
  lng: number
): Promise<{ code: string; name: string; boundary: string } | null> {
  try {
    const d = await icgcGet(`/elements/municipis/${lng},${lat}`, 15000);
    const f = d?.features?.[0];
    if (!f) return null;
    const code = String(f.properties?.CODIMUNI || "");
    const name = String(f.properties?.NOMMUNI || "");
    if (!code) return null;
    // simplifiquem el polígon (cada 4 punts) per estalviar espai
    const simplify = (ring: number[][]) => ring.filter((_, i) => i % 4 === 0 || i === ring.length - 1);
    const g = f.geometry;
    let geo: any;
    if (g.type === "MultiPolygon") {
      geo = { type: "MultiPolygon", coordinates: g.coordinates.map((poly: any) => poly.map(simplify)) };
    } else {
      geo = { type: "Polygon", coordinates: g.coordinates.map(simplify) };
    }
    return { code, name, boundary: JSON.stringify(geo) };
  } catch {
    return null;
  }
}

const munCache = new Map<string, string>();

/** Resol el CODIMUNI (Gencat) del punt mitjançant ICGC, amb cau de memòria. */
export async function resolveMunicipalityCode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (munCache.has(key)) return munCache.get(key)!;
  try {
    const d = await icgcGet(`/elements/municipis/${lng},${lat}`, 12000);
    const code = d?.features?.[0]?.properties?.CODIMUNI;
    if (!code) return null;
    munCache.set(key, String(code));
    if (munCache.size > 2000) munCache.clear();
    return String(code);
  } catch {
    return null;
  }
}

/** Obté (i posa en memòria cau a la BD) els edificis d'una bbox. */
export async function getOrFetchBuildings(b: BBox) {
  // 1) a la caché?
  const cached = await db.building.findMany({
    where: {
      centroidLat: { gte: b.south - 0.002, lte: b.north + 0.002 },
      centroidLng: { gte: b.west - 0.003, lte: b.east + 0.003 },
      cachedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    },
    take: 4000,
  });
  if (cached.length > 0) {
    // retorna també els sense municipi (es resolen a sota si cal)
    const missingMun = cached.some((c) => !c.municipalityCode);
    if (missingMun) {
      const lat = (b.north + b.south) / 2;
      const lng = (b.west + b.east) / 2;
      const code = await resolveMunicipalityCode(lat, lng);
      if (code) {
        await db.building.updateMany({
          where: {
            id: { in: cached.filter((c) => !c.municipalityCode).map((c) => c.id) },
          },
          data: { municipalityCode: code },
        });
        for (const c of cached) if (!c.municipalityCode) c.municipalityCode = code;
      }
    }
    // v33 — lots encauats abans d'incloure naus industrials ("ind"): un únic
    // rescan del mosaic les afegeix i refresca cachedAt de tot el lot per no
    // repetir el rescan (autorreparació del cau, 1 crida ICGC per mosaic com a
    // màxim un cop).
    if (!cached.some((c) => c.tipus === "ind")) {
      try {
        const feats = await fetchBuildingsBbox(b);
        const naus = feats.filter((f) => f.tipus === "ind");
        for (const f of naus) {
          await db.building.upsert({
            where: { externalId: f.externalId },
            create: {
              ...f,
              source: "ICGC_RTT",
              municipalityCode: cached.find((c) => c.municipalityCode)?.municipalityCode ?? null,
            },
            update: {
              tipus: f.tipus,
              estat: f.estat,
              altura: f.altura,
              nom: f.nom,
              polygonJson: f.polygonJson,
              centroidLat: f.centroidLat,
              centroidLng: f.centroidLng,
              cachedAt: new Date(),
            },
          });
        }
        await db.building.updateMany({
          where: { id: { in: cached.map((c) => c.id) } },
          data: { cachedAt: new Date() },
        });
        if (naus.length > 0) {
          const refreshed = await db.building.findMany({
            where: {
              centroidLat: { gte: b.south - 0.002, lte: b.north + 0.002 },
              centroidLng: { gte: b.west - 0.003, lte: b.east + 0.003 },
            },
            take: 4000,
          });
          return { buildings: refreshed, fromCache: true };
        }
      } catch {
        // degradació elegant: si el rescan falla servim el lot encauat tal com és
      }
    }
    return { buildings: cached, fromCache: true };
  }

  // 2) ICGC + persistència (el municipi es resol pel centre del mosaic)
  const lat = (b.north + b.south) / 2;
  const lng = (b.west + b.east) / 2;
  const munCode = await resolveMunicipalityCode(lat, lng);
  const feats = await fetchBuildingsBbox(b);
  for (const f of feats) {
    await db.building.upsert({
      where: { externalId: f.externalId },
      create: { ...f, source: "ICGC_RTT", municipalityCode: munCode },
      update: {
        tipus: f.tipus,
        estat: f.estat,
        altura: f.altura,
        nom: f.nom,
        polygonJson: f.polygonJson,
        centroidLat: f.centroidLat,
        centroidLng: f.centroidLng,
        municipalityCode: munCode ?? undefined,
        cachedAt: new Date(),
      },
    });
  }
  const rows = await db.building.findMany({
    where: {
      centroidLat: { gte: b.south - 0.002, lte: b.north + 0.002 },
      centroidLng: { gte: b.west - 0.003, lte: b.east + 0.003 },
    },
    take: 4000,
  });
  return { buildings: rows, fromCache: false };
}
