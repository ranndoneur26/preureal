import { defineConfig, devices } from "@playwright/test";

/**
 * E2E dels fluxos crítics (v38.3).
 *
 * Ús:
 *   npx playwright install chromium        # només la 1a vegada
 *   PLAYWRIGHT_BASE_URL=https://www.preureal.com npm run test:e2e
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Sense PLAYWRIGHT_BASE_URL arranca `next dev` (cal DATABASE_URL real al .env).
 * Cobertura: landing → preus (visibilitat pricing), mapa (Leaflet + cerca),
 * fitxa pública SEO i registre (validació de formulari).
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e-ui",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "ca-ES",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
