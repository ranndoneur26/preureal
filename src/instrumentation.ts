// PreuReal.cat — instrumentació d'arrencada (Next.js instrumentation hook).
//
// Amb PostgreSQL la BD ja no viu al sistema de fitxers local; això només
// fa un log de connectivitat en cold start (útil per diagnosticar el
// serverless de Vercel sense obrir logs complets).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const url = process.env.DATABASE_URL || "";
  const scheme = url.startsWith("postgres") ? "postgresql" : url ? url.split(":")[0] : "(no definit)";
  console.log(`[instrumentation] arrencada · BD: ${scheme}`);
}
