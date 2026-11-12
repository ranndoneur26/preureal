import type { MetadataRoute } from "next";
import { getSiteUrlOrigin } from "@/lib/site-url";

/**
 * robots.txt dinàmic: usa sempre l'origen canònic (NEXT_PUBLIC_SITE_URL)
 * en lloc d'una URL hardcodejada, així funciona en previews i self-host.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteUrlOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/admin", "/api/export"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
