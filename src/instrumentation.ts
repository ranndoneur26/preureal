// PreuReal.cat — instrumentació d'arrencada (Next.js instrumentation hook)
//
// A Vercel/serverless el sistema de fitxers és de només lectura excepte /tmp.
// La base de dades SQLite va incrustada al bundle (vegeu outputFileTracingIncludes
// a next.config.ts) i aquí, en cada cold start, es copia a /tmp perquè Prisma
// (DATABASE_URL=file:/tmp/custom.db) pugui llegir-la i escriure-hi.
//
// En desenvolupament local i Docker això no fa res: DATABASE_URL no apunta a /tmp.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:/tmp/")) return; // només serverless (Vercel)

  const target = url.slice("file:".length);
  try {
    const fs = await import("node:fs");
    if (fs.existsSync(target)) return; // ja copiada en aquesta instància

    const source = `${process.cwd()}/db/custom.db`;
    if (!fs.existsSync(source)) {
      console.error(
        "[instrumentation] No s'ha trobat la BD incrustada a", source,
        "— l'app funcionarà sense dades fins que es configurï DATABASE_URL."
      );
      return;
    }
    fs.copyFileSync(source, target);
    console.log("[instrumentation] BD copiada a", target);
  } catch (err) {
    console.error("[instrumentation] Error copiant la BD a /tmp:", err);
  }
}
