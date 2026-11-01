import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Vercel/serverless: includeix la SQLite incrustada al bundle de cada funció.
  // En cold start, src/instrumentation.ts la copia a /tmp (única ruta escrivible).
  outputFileTracingIncludes: {
    "/**": ["./db/custom.db"],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
