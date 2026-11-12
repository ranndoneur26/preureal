// Preureal — instrumentació d'arrencada (Next.js instrumentation hook).
//
// Log de connectivitat en cold start: indica quin tipus de BD s'ha configurat
// (útil per diagnosticar el serverless de Vercel sense obrir els logs complets).
// La BD és sempre PostgreSQL (Neon/Supabase o local via Docker); aquest hook
// no arrenca ni modifica res.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const url = process.env.DATABASE_URL || "";
  const scheme = url.startsWith("postgres") ? "postgresql" : url ? url.split(":")[0] : "(no definit)";
  console.log(`[instrumentation] arrencada · BD: ${scheme}`);
  if (url && !url.startsWith("postgres")) {
    console.error(
      "[instrumentation] DATABASE_URL no és PostgreSQL: l'esquema de Prisma requereix postgresql://"
    );
  }
}
