import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    // 'frame-ancestors' (CSP) substitueix X-Frame-Options, que és obsolet i no
    // permet llistar orígens. Sense això, el preview del sandbox (iframe des
    // d'un altre domini) es bloqueja amb "X-Frame-Options: SAMEORIGIN".
    // - Dev/preview (NODE_ENV != production): '*' → es pot incrustar al xat
    // - Producció (NODE_ENV=production): 'self' → anti-clickjacking
    // - Configurable: FRAME_ANCESTORS="'self' https://exemple.cat" (p.ex. widget)
    const frameAncestors =
      process.env.FRAME_ANCESTORS ??
      (process.env.NODE_ENV === "production" ? "'self'" : "*");
    return [
      {
        source: "/(.*)",
        headers: [
          // Capçaleres de seguretat (V8 de l'auditoria)
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
