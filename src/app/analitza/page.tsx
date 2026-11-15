import type { Metadata } from "next";
import HashBridge from "@/components/HashBridge";

export const metadata: Metadata = {
  title: "Analitza el teu futur lloguer | Preureal",
  description:
    "Introdueix les dades de la vivenda que estàs pensant d'alquilar (municipi, preu, superfície, tipus de contracte) i obté un informe gratuït i transparent: preu de l'anunci davant la referència oficial de fiances Incasòl, comprovació normativa de la zona (àrees tensades, límits de renta, SERPAVI, IRAV), serveis propers i llista de comprovació abans de signar.",
  robots: { index: true },
};

export default function Page() {
  return <HashBridge to="/#/analitza" />;
}
