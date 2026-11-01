// PreuReal.cat — instrumentació d'arrencada (Next.js instrumentation hook).
//
// 1) Amb PostgreSQL la BD ja no viu al sistema de fitxers local; es fa un log
//    de connectivitat en cold start (útil per diagnosticar el serverless de
//    Vercel sense obrir logs complets).
// 2) Sandbox/desenvolupament: la plataforma inyecta DATABASE_URL=file:… a les
//    variables d'entorn reals, que tenen prioritat sobre .env. Així doncs, si
//    detectem un DATABASE_URL local (file: o 127.0.0.1/localhost) ens assegurem
//    que el clúster incrustat del projecte (.localpg, vegeu scripts/pg_local.sh)
//    estigui en marxa i REESCRIUREM process.env.DATABASE_URL cap a ell.
//    Mai s'executa ni a Vercel ni durant el build de producció.

const LOCAL_PG_URL = "postgresql://preureal@127.0.0.1:5432/preureal";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const url = process.env.DATABASE_URL || "";
  const scheme = url.startsWith("postgres") ? "postgresql" : url ? url.split(":")[0] : "(no definit)";
  console.log(`[instrumentation] arrencada · BD: ${scheme}`);

  // Fora d'aquest entorn (Vercel serverless, build de producció) no toquem res.
  const skip = !!process.env.VERCEL || process.env.NEXT_PHASE === "phase-production-build";
  if (skip) return;

  const net = await import("node:net");
  const probe = (host: string, port: number, ms: number) =>
    new Promise<boolean>((resolve) => {
      const s = net.connect(port, host);
      s.setTimeout(ms);
      s.on("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.on("error", () => resolve(false));
      s.on("timeout", () => {
        s.destroy();
        resolve(false);
      });
    });

  const { spawn } = await import("node:child_process");
  const ensureLocalPg = async (): Promise<boolean> => {
    if (await probe("127.0.0.1", 5432, 1500)) return true;
    console.log("[instrumentation] PostgreSQL local absent → arrencant .localpg…");
    spawn("bash", ["scripts/pg_local.sh", "ensure"], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    }).unref();
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await probe("127.0.0.1", 5432, 1000)) {
        console.log("[instrumentation] PostgreSQL local llest ✓");
        return true;
      }
    }
    console.error("[instrumentation] PostgreSQL local NO ha arrencat (mira .localpg/postgres.log)");
    return false;
  };

  // Cas 1 — la plataforma inyecta un file: (SQLite vell): substitueix-lo pel
  // PostgreSQL incrustat del projecte.
  if (!url.startsWith("postgres")) {
    if (await ensureLocalPg()) {
      process.env.DATABASE_URL = LOCAL_PG_URL;
      console.log(`[instrumentation] DATABASE_URL heretada (${scheme}:) → reescrita al PostgreSQL local`);
    }
    return;
  }

  // Cas 2 — DATABASE_URL ja és PostgreSQL local: comprova que el clúster viu.
  const m = url.match(/^postgres(?:ql)?:\/\/[^@/]*@([^:/]+):(\d+)/);
  const host = m?.[1];
  const port = m?.[2] ? Number(m[2]) : 0;
  if (host && port && (host === "127.0.0.1" || host === "localhost")) {
    if (!(await probe(host, port, 1500))) {
      console.log(`[instrumentation] PostgreSQL local (${host}:${port}) no respon → arrencant…`);
      spawn("bash", ["scripts/pg_local.sh", "ensure"], {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
      }).unref();
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await probe(host, port, 1000)) {
          console.log("[instrumentation] PostgreSQL local llest ✓");
          return;
        }
      }
      console.error("[instrumentation] PostgreSQL local NO ha arrencat (mira .localpg/postgres.log)");
    }
  }
}
