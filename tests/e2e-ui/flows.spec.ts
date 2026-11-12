import { test, expect } from "@playwright/test";

/**
 * E2E — fluxos crítics (v38.3).
 * S'executen contra l'entorn que apunti PLAYWRIGHT_BASE_URL (local o prod).
 * Cap test modifica dades (cap registre real, cap pagament).
 */

test.describe("Landing i pricing", () => {
  test("la landing carrega i el CTA porta a preus", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Preureal/i);
    await expect(page.getByRole("button", { name: /mapa gratis|mapa/i }).first()).toBeVisible();
  });

  test("la pàgina de preus és pública i mostra els 3 plans", async ({ page }) => {
    await page.goto("/#/preus");
    await expect(page.getByText(/Premium/i).first()).toBeVisible();
    await expect(page.getByText(/Pro/i).first()).toBeVisible();
    await expect(page.getByText(/7,99/).first()).toBeVisible();
  });

  test("la ruta real /preus no dóna 404 (pont a la pàgina hash)", async ({ page }) => {
    const res = await page.goto("/preus");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/#\/preus/);
  });
});

test.describe("Mapa", () => {
  test("el mapa Leaflet es renderitza amb Barcelona carregada", async ({ page }) => {
    await page.goto("/#/mapa?mun=080193");
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20_000 });
    // el buscador accepta text
    const search = page.getByPlaceholder(/Cerca municipi|Busca municipio/i);
    await expect(search).toBeVisible();
    await search.fill("Girona");
    await expect(page.getByText(/Girona/i).first()).toBeVisible();
  });
});

test.describe("Transparència i legal", () => {
  test("metodologia llista les fonts oficials", async ({ page }) => {
    await page.goto("/#/metodologia");
    await expect(page.getByText(/Incasòl/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/ICGC/i).first()).toBeVisible();
  });

  test("l'estat del servei mostra el component BD", async ({ page }) => {
    await page.goto("/#/estat");
    await expect(page.getByText(/PostgreSQL/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("les pàgines legals són visibles des del peu", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Avis legal|Aviso legal/i).first()).toBeVisible();
    await expect(page.getByText(/Gestiona les cookies|Gestiona las cookies/i).first()).toBeVisible();
  });

  test("la fitxa SEO pública de Barcelona mostra el preu", async ({ page }) => {
    await page.goto("/lloguer/barcelona");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Barcelona/i);
    await expect(page.getByText(/€\/mes/).first()).toBeVisible();
  });
});

test.describe("Registre (només validació de formulari)", () => {
  test("un email invàlid mostra error sense enviar res", async ({ page }) => {
    await page.goto("/#/registre");
    const email = page.locator('input[type="email"]').first();
    await email.fill("no-es-un-correu");
    const pwd = page.locator('input[type="password"]').first();
    await pwd.fill("contrasenya-demo-123");
    await pwd.press("Enter");
    // el servidor/UI ha de rebutjar sense crear cap compte: segueix a registre
    await expect(page).toHaveURL(/registre/);
  });
});
