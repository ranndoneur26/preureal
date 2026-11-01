#!/usr/bin/env node
// PreuReal.cat — guardia anti-repositorio-mezclado (falla rápido y claro).
//
// La estructura canónica del proyecto es src/app/. Si en la raíz existe
// TAMBIÉN una carpeta app/, Next.js compila la de la raíz y falla con
// "Can't resolve './globals.css'" (error críptico). Pasa cuando el repo de
// GitHub se creó con contenido viejo o parcial. Este guardia se ejecuta al
// inicio del build (ver package.json) y explica la solución.
import { existsSync } from "node:fs";

if (existsSync("app")) {
  console.error(`
✗ Carpeta "app/" en la raíz del proyecto — repositorio mezclado o antiguo.
  Next.js compilaría "app/" (raíz) y fallaría con: Can't resolve './globals.css'

  Solución: el repo debe contener SOLO la estructura de preureal-vercel-v4.zip
  (src/, prisma/, public/, package.json…, sin ninguna carpeta app/ raíz).
  Vuelve a subir el contenido íntegro del ZIP con un historial nuevo:

    unzip -o preureal-vercel-v4.zip -d preureal && cd preureal
    git init && git add -A && git commit -m "PreuReal.cat v4"
    git branch -M main
    git remote add origin <URL-de-tu-repo>   # si aún no existe
    git push -uf origin main
`);
  process.exit(1);
}

if (!existsSync("src/app")) {
  console.error(
    '✗ Falta "src/app/" — el repo no tiene la estructura del proyecto (src/).',
  );
  process.exit(1);
}
