import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { getSiteUrlOrigin } from "@/lib/site-url";

/**
 * Sitemap dinámico (v37 — reemplaza el estático public/sitemap.xml).
 * - Portada + 947 páginas públicas de municipio (/lloguer/[slug]).
 *   SOLO lista slugs que existen en la BD (nunca URLs que darían 404:
 *   si el backfill de slugs no se ha ejecutado aún, el sitemap queda con
 *   la portada únicamente y se completa al regenerarse al día siguiente).
 * - ISR: revalida 1 vez al día; si la BD no responde, devuelve el sitemap
 *   base (nunca rompe el SEO por un fallo puntual de BD).
 */
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrlOrigin().replace(/\/$/, "");
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
  ];
  try {
    const muns = await db.municipality.findMany({
      where: { slug: { not: null } },
      select: { slug: true, updatedAt: true },
      take: 5000,
      orderBy: { code: "asc" },
    });
    for (const m of muns) {
      if (!m.slug) continue;
      entries.push({
        url: `${base}/lloguer/${m.slug}`,
        lastModified: m.updatedAt ?? now,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    // BD no disponible en este momento: sitemap base, sin lanzar
  }
  return entries;
}
