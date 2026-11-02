#!/usr/bin/env node
// PreuReal.cat — guardia anti-repositorio-mezclado/incompleto (falla rápido y claro).
//
// Diagnostica los 4 casos conocidos de repo roto ANTES de que Next.js falle
// con errores crípticos:
//
//   1. Carpeta app/ en la raíz (repo antiguo mezclado) → Next.js compilaría
//      la de la raíz y fallaría con "Can't resolve './globals.css'".
//   2. Un archivo .zip subido al repo → GitHub NO descomprime ZIPs.
//   3. Todo el proyecto anidado en una subcarpeta (p. ej. preureal/src/app)
//      → Vercel no encuentra package.json/utilidades en la raíz.
//   4. Subida web parcial: GitHub falla silenciosamente a partir de ~100
//      ficheros por arrastre; src/ (125 ficheros) no llega → falta src/app.
//
// Además valida que prisma/schema.prisma sea PostgreSQL (el esquema antiguo
// sqlite produce el críptico "P1012: Environment variable not found: DATABASE_URL").
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function fallo(msg) {
  console.error(`\n${msg}\n`);
  process.exit(1);
}

const AYUDA_GIT = `
  La forma FIABLE de subir el proyecto (son 152 ficheros; la web de GitHub
  falla silenciosamente a partir de ~100 ficheros por arrastre):

    unzip PreuReal-cat-Vercel-v12.zip -d preureal && cd preureal
    git init && git add -A && git commit -m "PreuReal.cat v12"
    git branch -M main
    git remote add origin <URL-de-tu-repo>   # si aún no existe
    git push -uf origin main                 # -f sustituye el contenido viejo

  En Vercel, el deploy se relanza solo al terminar el push.
`;

// ── 1. Carpeta app/ antigua en la raíz ──────────────────────────────
if (existsSync("app")) {
  fallo(`✗ Carpeta "app/" en la raíz del proyecto — repositorio mezclado o antiguo.
  Next.js compilaría "app/" (raíz) y fallaría con: Can't resolve './globals.css'
${AYUDA_GIT}`);
}

// ── 2. ZIP subido sin descomprimir ──────────────────────────────────
const zips = readdirSync(".").filter((n) => n.toLowerCase().endsWith(".zip"));
if (zips.length > 0) {
  fallo(`✗ Hay un archivo ZIP en el repositorio (${zips.join(", ")}) — GitHub NO descomprime ZIPs.
  El repo contiene el .zip como archivo binario, no el código.
${AYUDA_GIT}`);
}

// ── 3/4. Falta src/app/ — distinguir anidado vs subida parcial ──────
if (!existsSync("src/app")) {
  // 3. ¿Proyecto anidado en una subcarpeta? (buscar <dir>/src/app a nivel 1)
  const anidadas = readdirSync(".").filter((n) => {
    try {
      return statSync(n).isDirectory() && n !== "node_modules" && n !== ".next"
        && existsSync(join(n, "src", "app"));
    } catch { return false; }
  });
  if (anidadas.length === 1) {
    fallo(`✗ Proyecto ANIDADO: el código está en la subcarpeta "${anidadas[0]}/",
  no en la raíz del repo (Vercel compila la raíz). Detecté "${anidadas[0]}/src/app".
  Solución: mueve el CONTENIDO de "${anidadas[0]}/" a la raíz del repo
  (o vuelve a subir el ZIP extrayéndolo antes: unzip, no arrastres la carpeta).
${AYUDA_GIT}`);
  }
  if (anidadas.length > 1) {
    fallo(`✗ Proyecto ANIDADO en varias subcarpetas (${anidadas.join(", ")}).
  El repo debe tener src/ directamente en la raíz, no dentro de subcarpetas.
${AYUDA_GIT}`);
  }

  // 4. Subida web parcial: hay ficheros de configuración pero falta src/
  const hayConfig = existsSync("package.json") && existsSync("scripts");
  if (hayConfig) {
    const enSrc = existsSync("src") ? readdirSync("src") : [];
    fallo(`✗ Subida web PARCIAL: hay package.json y scripts/ pero falta src/app/
  (src/ tiene ${enSrc.length ? `solo ${enSrc.length} elementos: ${enSrc.join(", ")}` : "0 ficheros"}).
  Causa: la web de GitHub solo admite ~100 ficheros por arrastre y src/ tiene 125 —
  la carpeta src/ NO se subió (GitHub no avisa).
${AYUDA_GIT}`);
  }

  fallo(`✗ Falta "src/app/" — el repo no tiene la estructura del proyecto.
${AYUDA_GIT}`);
}

// ── Esquema Prisma correcto (PostgreSQL) ─────────────────────────────
if (!existsSync("prisma/schema.prisma")) {
  fallo(`✗ Falta "prisma/schema.prisma" — falta la carpeta prisma/ del proyecto.
${AYUDA_GIT}`);
}
const schema = readFileSync("prisma/schema.prisma", "utf8");
if (/provider\s*=\s*"sqlite"/.test(schema)) {
  fallo(`✗ prisma/schema.prisma usa provider = "sqlite" — es el esquema ANTIGUO.
  El build fallaría con: P1012 Environment variable not found: DATABASE_URL
  (con el esquema PostgreSQL correcto, prisma generate funciona sin esa variable).
${AYUDA_GIT}`);
}
if (!/provider\s*=\s*"postgresql"/.test(schema)) {
  fallo(`✗ prisma/schema.prisma no declara provider = "postgresql".
${AYUDA_GIT}`);
}

const lockPath = "prisma/migrations/migration_lock.toml";
if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, "utf8");
  if (/provider\s*=\s*"sqlite"/.test(lock)) {
    fallo(`✗ prisma/migrations/migration_lock.toml = "sqlite" — migraciones antiguas.
  Debe ser "postgresql" (migración 20261102000000_init_postgres).
${AYUDA_GIT}`);
  }
}

console.log("✓ check_repo: estructura del repositorio correcta (src/app/, Prisma PostgreSQL).");
