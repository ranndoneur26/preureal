/**
 * Test del guardia site-url.ts — reprodueix l'error real de Vercel
 * (NEXT_PUBLIC_SITE_URL="https//preureal.vercel.app", ERR_INVALID_URL)
 * i comprova que getSiteUrl() mai llança i retorna sempre URL vàlida.
 *
 * Executar: npx tsx scripts/test_site_url.ts
 */
import { getSiteUrl, getSiteUrlOrigin } from "../src/lib/site-url";

const CASES: Array<[string | undefined, string]> = [
  // [valor de l'env var, host esperat]
  ["https://preureal.vercel.app", "preureal.vercel.app"], // valor correcte
  ["https//preureal.vercel.app", "www.preureal.com"], // EL CAS REAL DEL BUILD TRENCAT
  ["preureal.vercel.app", "preureal.vercel.app"], // oblidar l'esquema
  ["https://www.preureal.com/", "www.preureal.com"], // amb barra final
  ["https://localhost:3000", "localhost:3000"], // desenvolupament local (manté el port)
  ["", "www.preureal.com"], // buida (fallback v20: domini canònic viu)
  [undefined, "www.preureal.com"], // no definida
  ["   ", "www.preureal.com"], // només espais
  ["https://www.preureal.com", "www.preureal.com"], // netejant espais laterals
];

let failures = 0;
for (const [value, expectedHost] of CASES) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = value;

  let host = "";
  try {
    host = getSiteUrl().host;
  } catch (e) {
    console.error(`✗ FALLA: amb valor=${JSON.stringify(value)} va llançar:`, e);
    failures++;
    continue;
  }
  const ok = host === expectedHost;
  if (!ok) failures++;
  console.log(
    `${ok ? "✓" : "✗"} env=${JSON.stringify(value)} → ${host}` +
      (ok ? "" : ` (esperat ${expectedHost})`),
  );
}

// L'origen també ha de ser estable
process.env.NEXT_PUBLIC_SITE_URL = "https//trencat";
console.log(`\ngetSiteUrlOrigin() amb valor trencat → ${getSiteUrlOrigin()}`);

console.log(failures === 0 ? "\n✓ TOTS ELS TESTS PASSEN" : `\n✗ ${failures} tests fallats`);
process.exit(failures === 0 ? 0 : 1);
