import type { Metadata } from "next";
import "./globals.css";
import { getSiteUrl } from "@/lib/site-url";

/**
 * SEO: metadades bilingües (ca principal, es secundari), Open Graph i
 * JSON-LD. El sitemap i robots estan a public/.
 * metadataBase usa el helper segur: un NEXT_PUBLIC_SITE_URL mal escrit
 * mai més no pot aturar el build (cau a la URL oficial per defecte).
 */
export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Preureal — Preu real del lloguer a Catalunya, illa a illa",
    template: "%s | Preureal",
  },
  description:
    "Consulta el preu mitjà real del lloguer registrat oficialment (fiances Incasòl) a qualsevol municipi de Catalunya, l'any de construcció de l'edifici i si la zona és àrea de mercat residencial tensat. Mapa interactiu amb dades oficials.",
  keywords: [
    "preu lloguer Catalunya",
    "precio alquiler Cataluña",
    "fiances Incasòl",
    "fianzas alquiler",
    "àrea tensada",
    "zona tensionada alquiler",
    "índex referència lloguer",
    "mapa lloguer Barcelona",
    "any de construcció edifici",
  ],
  authors: [{ name: "Preureal" }],
  alternates: {
    canonical: "/",
    languages: { "ca": "/", "es": "/" },
  },
  openGraph: {
    title: "Preureal — Sap si et cobren de més de lloguer",
    description:
      "El preu mitjà real del lloguer registrat oficialment (fiances Incasòl) sobre el mapa de Catalunya. 947 municipis, dades oficials.",
    url: "/",
    siteName: "Preureal",
    type: "website",
    locale: "ca_ES",
    alternateLocale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: "Preureal — Preu real del lloguer a Catalunya",
    description:
      "Preu mitjà real (fiances Incasòl), àrees tensades i any de construcció, sobre el mapa.",
  },
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Preureal",
  applicationCategory: "RealEstateApplication",
  operatingSystem: "Web",
  description:
    "Mapa del preu mitjà real del lloguer registrat oficialment (fiances Incasòl) per municipi a Catalunya, amb àrees de mercat residencial tensat i any de construcció.",
  offers: [
    { "@type": "Offer", price: "0", priceCurrency: "EUR", name: "Gratuït" },
    { "@type": "Offer", price: "7.99", priceCurrency: "EUR", name: "Premium" },
    { "@type": "Offer", price: "19.99", priceCurrency: "EUR", name: "Pro" },
  ],
  inLanguage: ["ca", "es"],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Anti-FOUC del tema: aplica .dark abans del primer pintat seguint
  // localStorage "pr_theme" o prefers-color-scheme (v38.2).
  const themeInit = `(function(){try{var t=localStorage.getItem("pr_theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;
  return (
    <html lang="ca" suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
