import type { Metadata } from "next";
import HashBridge from "@/components/HashBridge";

/**
 * v59 — BLOQUE C: pàgina real per a la guia completa «Com funciona».
 * Indexable (contingut gratuït i útil per a SEO), com /estima i /analitza;
 * la UI viu al hash-router (#/com-funciona) dins d'AppShell.
 */
export const metadata: Metadata = {
  title: "Com funciona — guia pas a pas del preu real del lloguer",
  description:
    "Guia pas a pas de Preureal en llenguatge molt fàcil: obre el mapa gratis, entén els colors, toca un edifici, compara el teu anunci, registra't (3 consultes detallades al mes) i valora el lloguer del teu habitatge amb un rang orientatiu basat en dades oficials de fiances Incasòl. Cada terme tècnic explicat, exemple amb xifres reals, límits del pla Free i glossari en català i castellà.",
  robots: { index: true },
};

export default function Page() {
  return <HashBridge to="/#/com-funciona" />;
}
