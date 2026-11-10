import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * v37 — límit de connexions contra el pooler de Supabase (Supavisor).
 *
 * Síntoma vist en producció (2026-11-11): 500 intermitents amb
 * «FATAL: (EMAXCONNSESSION) max clients reached in session mode - max
 * clients are limited to pool_size: 15». Amb serverless, cada instància
 * de funció obre el seu propi pool Prisma (per defecte num_cpus*2+1
 * connexions) i entre instàncies calentes se superen els 15 clients del
 * pooler en mode sessió.
 *
 * Mitigació sense tocar cap variable d'entorn: pool petit per instància
 * (4) i temps d'espera (15 s) perquè les peticions facin cua en lloc de
 * fallar. `pgbouncer=true` desactiva els prepared statements i fa el
 * client compatible també amb el mode transacció del pooler (port 6543),
 * per si més endavant es canvia a Vercel. Les transaccions del projecte
 * són totes batch (array), compatibles amb ambdós modes.
 *
 * Només s'aplica a PostgreSQL: el sandbox local usa SQLite (file:) i no
 * té pooler. Mai llança: si la URL fos rara, es deixa tal qual.
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;
  if (!/^postgres(ql)?:\/\//i.test(raw)) return raw; // SQLite local: no es toca
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "4");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "15");
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    return u.toString();
  } catch {
    return raw;
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: datasourceUrl() })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
