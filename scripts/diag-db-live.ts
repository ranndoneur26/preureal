/**
 * Diagnóstico EN VIVO (solo lectura) del estado de la BD de producción:
 *  - conectividad y esquema real (¿migración v19 aplicada?)
 *  - últimos usuarios (¿llegó el registro del usuario?)
 *  - últimos EmailLog (estado de los correos)
 *  - últimos eventos SIGNUP y tokens
 * Nunca imprime la cadena de conexión (solo el host).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

if (!process.env.DATABASE_URL) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
  if (m) process.env.DATABASE_URL = m[1].trim();
}
if (process.env.DATABASE_URL) {
  try {
    const host = new URL(process.env.DATABASE_URL).host;
    console.log("BD host:", host);
  } catch {
    console.log("BD host: (no parseable)");
  }
}

const prisma = new PrismaClient();
const mask = (t: string) => {
  const [user, domain] = String(t).split("@");
  if (!domain) return String(t).slice(0, 3) + "***";
  return `${user.slice(0, 5)}***@${domain}`;
};

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  console.log("✓ Conexión OK");

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`;
  console.log("\n— Tablas:", tables.map((t) => t.table_name).join(", "));

  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns WHERE table_name='EmailLog' ORDER BY ordinal_position`;
  const colNames = cols.map((c) => c.column_name);
  console.log("\n— Columnas EmailLog:", colNames.join(", "));
  const need = ["type", "userid", "providermessageid", "attempts", "sentat", "nextretryat", "idempotencykey", "updatedat"];
  const missing = need.filter((n) => !colNames.map((c) => c.toLowerCase()).includes(n));
  console.log(missing.length === 0 ? "  ✓ MIGRACIÓN v19 APLICADA" : `  ✗ MIGRACIÓN v19 NO APLICADA — faltan: ${missing.join(", ")}`);

  const [{ total: users }] = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT count(*)::int AS total FROM "User"`;
  console.log(`\n— Usuarios totales: ${users}`);

  const lastUsers = await prisma.$queryRaw<Array<{ id: string; email: string; name: string | null; locale: string; verified: boolean; created: Date }>>`
    SELECT id, email, name, locale, ("emailVerifiedAt" IS NOT NULL) AS verified, "createdAt" AS created
    FROM "User" ORDER BY "createdAt" DESC LIMIT 6`;
  console.log("— Últimos usuarios:");
  for (const u of lastUsers) {
    console.log(`   ${u.created.toISOString()} | ${mask(u.email)} | name=${u.name ?? "—"} | locale=${u.locale} | verificado=${u.verified} | id=${u.id}`);
  }

  const lastTokens = await prisma.$queryRaw<Array<{ total: bigint; last: Date | null }>>`
    SELECT count(*)::int AS total, max("createdAt") AS last FROM "EmailToken"`;
  console.log(`\n— EmailToken: total=${lastTokens[0].total}, último=${lastTokens[0].last ? lastTokens[0].last.toISOString() : "—"}`);

  const lastLogs = await prisma.$queryRaw<Array<{ to: string; subject: string; status: string; type: string; provider: string; pmid: string | null; attempts: number; error: string | null; created: Date }>>`
    SELECT "to", subject, status, type, provider, "providerMessageId" AS pmid, attempts, left(error, 200) AS error, "createdAt" AS created
    FROM "EmailLog" ORDER BY "createdAt" DESC LIMIT 12`;
  console.log(`\n— Últimos EmailLog (${lastLogs.length}):`);
  for (const r of lastLogs) {
    console.log(`   ${r.created.toISOString()} | ${r.provider} | ${r.status} | type=${r.type} | intentos=${r.attempts} | ${mask(r.to)} | ${r.subject.slice(0, 40)}${r.pmid ? ` | resend=${r.pmid}` : ""}`);
    if (r.error) console.log(`      ERROR -> ${r.error}`);
  }

  const signups = await prisma.$queryRaw<Array<{ created: Date }>>`
    SELECT "createdAt" AS created FROM "Event" WHERE type='SIGNUP' ORDER BY "createdAt" DESC LIMIT 5`;
  console.log("\n— Últimos eventos SIGNUP:", signups.map((s) => s.created.toISOString()).join(", ") || "—");
}

main()
  .catch((e) => {
    console.error("DB_ERROR:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
