import type { Metadata } from "next";
import HashBridge from "@/components/HashBridge";

export const metadata: Metadata = {
  title: "Estima el lloguer del teu habitatge | Preureal",
  description:
    "Estimació progressiva i gratuïta del lloguer d'una habitatge a Catalunya: municipi + superfície → un RANG orientatiu amb la base oficial registrada (fiances Incasòl), escalat per superfície amb elasticitat documentada i, si vols, ajustos opcionals per estat de conservació i habitacions amb coeficient documentat (N2); horquilla de dispersió mesurada, sempre amb font, període, nº de contractes, ajustos i limitacions. Estimació estadística orientativa: no és una taxació ni una valoració individualitzada; el rang amb validesa legal només el dóna SERPAVI (MIVAU).",
  robots: { index: true },
};

export default function Page() {
  return <HashBridge to="/#/estima" />;
}
