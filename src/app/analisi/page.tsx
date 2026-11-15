import type { Metadata } from "next";
import HashBridge from "@/components/HashBridge";

export const metadata: Metadata = {
  title: "Anàlisi del mercat residencial | Preureal",
  description:
    "Creuament del preu mitjà real del lloguer (fiances Incasòl), de l'evolució de contractes amb fiança i del creixement demogràfic (Padró Idescat): volum de mercat aproximat, dinamisme per habitants i comparativa entre municipis.",
  robots: { index: false },
};

export default function Page() {
  return <HashBridge to="/#/analisi" />;
}
