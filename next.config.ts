import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Arrel de Turbopack fixada a la carpeta del projecte: evita que Next triï un
  // package-lock.json d'una carpeta pare (p. ex. ~/package-lock.json) com a arrel.
  turbopack: { root: path.resolve(__dirname) },
  // 'standalone' només serveix per autoallotjament (Docker/VPS). A Vercel el
  // builder fa el seu propi empaquetat i el mode standalone sobta — i el
  // script build:selfhost copiaria fitxers que no existeixen. VERCEL=1 el
  // defineix la pròpia plataforma durant el build.
  output: process.env.VERCEL ? undefined : "standalone",
  reactStrictMode: false,
  async headers() {
    // 'frame-ancestors' (CSP) substitueix X-Frame-Options, que és obsolet i no
    // permet llistar orígens. Sense això, el preview del sandbox (iframe des
    // d'un altre domini) es bloqueja amb "X-Frame-Options: SAMEORIGIN".
    // - Dev/preview (NODE_ENV != production): '*' → es pot incrustar al xat
    // - Producció (NODE_ENV=production): 'self' → anti-clickjacking
    // - Configurable: FRAME_ANCESTORS="'self' https://exemple.cat" (p.ex. widget)
    const prod = process.env.NODE_ENV === "production";
    const frameAncestors =
      process.env.FRAME_ANCESTORS ?? (prod ? "'self'" : "*");

    // CSP completa en producció (v38.3). En dev es manté la mínima per no
    // trencar HMR/Turbopack.
    // - script-src 'unsafe-inline': Next.js inlineja el bootstrap d'hidratació
    //   i el JSON-LD; sense nonce per request és el compromís estàndard.
    // - img-src https:: els tiles del mapa venen d'ICGC/CARTO/OSM i Leaflet
    //   genera imatges a blob:; no carregem res més de tercers.
    // - connect-src 'self': el client només parla amb la nostra API (el
    //   backend és qui surt a Incasòl/ICGC/Catastro/Stripe/Resend).
    const csp = prod
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self'",
          "connect-src 'self'",
          "frame-src 'self' https://checkout.stripe.com https://js.stripe.com",
          "form-action 'self' https://checkout.stripe.com",
          "object-src 'none'",
          "base-uri 'self'",
          `frame-ancestors ${frameAncestors}`,
          "upgrade-insecure-requests",
        ].join("; ")
      : `frame-ancestors ${frameAncestors}`;

    const headers = [
      // Capçaleres de seguretat (V8 de l'auditoria)
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Content-Security-Policy", value: csp },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];
    if (prod) {
      headers.push({ key: "X-Frame-Options", value: "SAMEORIGIN" });
    }
    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

export default nextConfig;
