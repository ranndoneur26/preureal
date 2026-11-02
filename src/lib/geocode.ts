/**
 * Client del Geocodificador oficial de l'ICGC (Fase 8.1).
 * https://openicgc.github.io/geocodificador-doc/ — cercador d'adreces amb
 * portal, codi postal i codi municipal compatible amb el nostre (id_municipi).
 *
 * Cau en memòria (TTL 1 h, màxim 1.000 entrades) per reduir crides.
 */

const BASE = "https://eines.icgc.cat/geocodificador";
const UA = "PreuReal.cat/1.0 (geocodificació ICGC)";

const cache = new Map<string, { at: number; data: GeocodeResult[] }>();
const CACHE_MS = 3600_000;

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  municipalityCode: string | null;
  municipalityName: string | null;
  comarca: string | null;
  postalCode: string | null;
  portal: string | null;
  street: string | null;
}

function normalize(f: any): GeocodeResult | null {
  const p = f?.properties;
  const coords = f?.geometry?.coordinates;
  if (!p || !Array.isArray(coords) || !isFinite(coords[0]) || !isFinite(coords[1])) return null;
  return {
    label: String(p.etiqueta || p.nom || "Adreça"),
    lng: Number(coords[0]),
    lat: Number(coords[1]),
    municipalityCode: p.id_municipi ? String(p.id_municipi) : null,
    municipalityName: p.municipi ? String(p.municipi) : null,
    comarca: p.comarca ? String(p.comarca) : null,
    postalCode: p.codi_postal ? String(p.codi_postal) : null,
    portal: p.portal ? String(p.portal) : null,
    street: p.nom ? String(p.nom) : null,
  };
}

export async function icgcGeocode(text: string, size = 6): Promise<GeocodeResult[]> {
  const q = text.trim().slice(0, 160);
  if (q.length < 3) return [];
  const key = `${q.toLowerCase()}|${size}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `${BASE}/cerca?text=${encodeURIComponent(q)}&size=${size}&layers=address,topo1`,
      { headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" }, signal: ctrl.signal, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`geocoder ${res.status}`);
    const d = await res.json();
    const out: GeocodeResult[] = [];
    for (const f of d?.features || []) {
      const n = normalize(f);
      if (n) out.push(n);
    }
    if (cache.size > 1000) cache.clear();
    cache.set(key, { at: Date.now(), data: out });
    return out;
  } catch {
    return []; // degradació: el cercador d'adreces no trenca el mapa
  } finally {
    clearTimeout(t);
  }
}
