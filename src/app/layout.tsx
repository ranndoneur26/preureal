import type { Metadata } from "next";
import "./globals.css";

/**
 * SEO: metadades bilingües (ca principal, es secundari), Open Graph i
 * JSON-LD. El sitemap i robots estan a public/.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://preureal.cat"),
  title: {
    default: "PreuReal.cat — Preu real del lloguer a Catalunya, illa a illa",
    template: "%s | PreuReal.cat",
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
  authors: [{ name: "PreuReal.cat" }],
  alternates: {
    canonical: "/",
    languages: { "ca": "/", "es": "/" },
  },
  openGraph: {
    title: "PreuReal.cat — Sap si et cobren de més de lloguer",
    description:
      "El preu mitjà real del lloguer registrat oficialment (fiances Incasòl) sobre el mapa de Catalunya. 947 municipis, dades oficials.",
    url: "/",
    siteName: "PreuReal.cat",
    type: "website",
    locale: "ca_ES",
    alternateLocale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: "PreuReal.cat — Preu real del lloguer a Catalunya",
    description:
      "Preu mitjà real (fiances Incasòl), àrees tensades i any de construcció, sobre el mapa.",
  },
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PreuReal.cat",
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
  return (
    <html lang="ca" suppressHydrationWarning>
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
