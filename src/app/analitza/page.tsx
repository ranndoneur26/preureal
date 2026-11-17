import type { Metadata } from "next";
import HashBridge from "@/components/HashBridge";

export const metadata: Metadata = {
  title: "Consulta el preu real registrat",
  description:
    "Compara estadísticament el preu de l'anunci amb la referència oficial registrada (municipi, preu, superfície, tipus de contracte) i obté un informe gratuït i transparent: comparació amb les fiances Incasòl, comprovació normativa de la zona (àrees tensades, límits de renda, SERPAVI, IRAV), serveis propers i llista de comprovació abans de signar. Comparació estadística: no és una taxació oficial de l'habitatge.",
  robots: { index: true },
};

export default function Page() {
  return <HashBridge to="/#/analitza" />;
}
