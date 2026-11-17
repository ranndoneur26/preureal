/**
 * PreuReal — cau en memòria per a consultes pesades (v60).
 *
 * Encàrrec: protegir PostgreSQL sota concurrència per als endpoints d'agregació
 * (indicadors, anàlisi, demografia). L'app és una única instància serverless
 * per deployment (dispatcher catch-all), així que un Map per procés amb TTL és
 * suficient i NO afegeix cap middleware ni dependència (res de Redis).
 *
 * Propietats:
 *  - TTL per entrada + LRU aproximada per inserció (Map ordena per inserció).
 *  - Coalescing: crids simultanis amb la mateixa clau comparteixen la promesa
 *    (una sola consulta a BD encara que 50 peticions arribin alhora).
 *  - Els errors NO es cauen: si fn() llança, l'entrada es descarta i l'error
 *    arriba al caller (mai respostes embotellades).
 *  - Mida màxima amb evicció FIFO; estadístiques per al probe d'observabilitat.
 */

interface Entry {
  at: number;
  ttl: number;
  value: unknown;
}

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

let hits = 0;
let misses = 0;
let evictions = 0;

/** Estadístiques del cau (per al probe /api/health o logs d'admin). */
export function cacheStats(): { size: number; hits: number; misses: number; evictions: number } {
  return { size: store.size, hits, misses, evictions };
}

/** Buida tot el cau o només les claus que comencen pel prefix donat. */
export function cacheClear(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Lectura crua (per a tests i probes): null si no hi ha entrada fresca. */
export function cacheGet(key: string): unknown | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() - e.at > e.ttl) {
    store.delete(key);
    return null;
  }
  return e.value;
}

/**
 * Cacheja el resultat de fn() per la clau durant ttl ms. Les crids concurrents
 * amb la mateixa clau comparteixen la mateixa promesa (mai duplica la consulta).
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const fresh = store.get(key);
  if (fresh && Date.now() - fresh.at <= fresh.ttl) {
    hits++;
    return fresh.value as T;
  }
  const pending = inflight.get(key);
  if (pending) {
    hits++;
    return pending as Promise<T>;
  }
  misses++;
  const p = (async () => {
    const value = await fn();
    // evicció FIFO quan el Map arriba a la mida màxima
    while (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next();
      if (oldest.done) break;
      store.delete(oldest.value);
      evictions++;
    }
    store.set(key, { at: Date.now(), ttl: ttlMs, value });
    return value;
  })().finally(() => inflight.delete(key)) as Promise<T>;
  inflight.set(key, p);
  return p;
}
