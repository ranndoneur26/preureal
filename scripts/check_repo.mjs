#!/usr/bin/env node
// PreuReal.cat — guardia anti-repositorio-mezclado (falla rápido y claro).
//
// Problema 1: la estructura canónica es src/app/. Si en la raíz existe
// TAMBIÉN una carpeta app/, Next.js compila la de la raíz y falla con
// "Can't resolve './globals.css'" (error críptico).
//
// Problema 2: si el repo contiene el prisma/schema.prisma ANTIGUO
// (provider = "sqlite"), `prisma generate` falla con el críptico
// "P1012: Environment variable not found: DATABASE_URL". El esquema
// correcto es PostgreSQL y, además, con él `prisma generate` funciona
// sin necesidad de DATABASE_URL.
//
// Este guardia se ejecuta al inicio del build (ver package.json) y
// explica la solución en ambos casos.
import { existsSync, readFileSync } from "node:fs";

function fallo(msg) {
  console.error(`
${msg}

  Solución: el repo debe contener SOLO la estructura de preureal-vercel-v6.zip
  (src/, prisma/, public/, package.json…). Vuelve a subir el contenido íntegro
  del ZIP con un historial NUEVO (no mezcles con la carpeta vieja):

    unzip preureal-vercel-v6.zip -d preureal && cd preureal
    git init && git add -A && git commit -m "PreuReal.cat v6"
    git branch -M main
    git remote add origin <URL-de-tu-repo>   # si aún no existe
    git push -uf origin main
`);
  process.exit(1);
}

if (existsSync("app")) {
  fallo(`✗ Carpeta "app/" en la raíz del proyecto — repositorio mezclado o antiguo.
  Next.js compilaría "app/" (raíz) y fallaría con: Can't resolve './globals.css'`);
}

if (!existsSync("src/app")) {
  fallo('✗ Falta "src/app/" — el repo no tiene la estructura del proyecto (src/).');
}

// ── Esquema Prisma correcto (PostgreSQL) ─────────────────────────────
if (!existsSync("prisma/schema.prisma")) {
  fallo('✗ Falta "prisma/schema.prisma" — falta la carpeta prisma/ del proyecto.');
}
const schema = readFileSync("prisma/schema.prisma", "utf8");
if (/provider\s*=\s*"sqlite"/.test(schema)) {
  fallo(`✗ prisma/schema.prisma usa provider = "sqlite" — es el esquema ANTIGUO.
  El build fallaría con: P1012 Environment variable not found: DATABASE_URL
  (con el esquema PostgreSQL correcto, prisma generate funciona sin esa variable).`);
}
if (!/provider\s*=\s*"postgresql"/.test(schema)) {
  fallo('✗ prisma/schema.prisma no declara provider = "postgresql".');
}

const lockPath = "prisma/migrations/migration_lock.toml";
if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, "utf8");
  if (/provider\s*=\s*"sqlite"/.test(lock)) {
    fallo(`✗ prisma/migrations/migration_lock.toml = "sqlite" — migraciones antiguas.
  Debe ser "postgresql" (migración 20261102000000_init_postgres).`);
  }
}
