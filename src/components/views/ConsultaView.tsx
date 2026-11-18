"use client";

/**
 * v67 — Vista #/consulta: «Consulta el preu real registrat».
 *
 * El mòdul del formulari que fins ara vivia a la targeta de la portada passa
 * AQUÍ (decisió del buscador invers v67: la portada acull el nou buscador
 * invers). Funcionalitat IDÈNTICA, mateix formulari compacte, mateix flux
 * email-first (resultat neix bloquejat sense compte), mateixes dades:
 * comparació ESTADÍSTICA del preu de l'anunci amb la referència oficial
 * registrada (fiances Incasòl). Mai una valoració individualitzada.
 *
 * L'eina completa (amb mapa ICGC, marcador exacte i informe de 4 blocs A–D)
 * continua a #/analitza — aquesta pàgina és la consulta ràpida.
 */
import { useState } from "react";
import { BadgeCheck, ArrowRight, WandSparkles } from "lucide-react";
import { useApp } from "@/components/app-context";
import AnalitzaForm from "@/components/analitza/AnalitzaForm";
import AnalitzaReport from "@/components/analitza/AnalitzaReport";
import { GateLockedPanel } from "@/components/emailfirst/EmailFirst";
import type { AnalitzaReportData } from "@/lib/analitza-html";

export default function ConsultaView() {
  const { locale, navigate, auth } = useApp();
  const ca = locale === "ca";
  const [report, setReport] = useState<AnalitzaReportData | null>(null);

  return (
    <div className="w-full bg-cream">
      <div className="max-w-3xl mx-auto px-4 py-10 md:py-14">
        {/* capçalera */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-semibold mb-4">
            <BadgeCheck className="w-4 h-4 text-mint" />
            {ca ? "Dades oficials · fiances Incasòl" : "Datos oficiales · fianzas Incasòl"}
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {ca ? "Consulta el preu real registrat" : "Consulta el precio real registrado"}
          </h1>
          <p className="mt-3 text-moss leading-relaxed">
            {ca
              ? "Comparació estadística del preu de l'anunci amb la referència oficial registrada (fiances Incasòl): no és una taxació oficial; és una referència orientativa basada en dades oficials."
              : "Comparación estadística del precio del anuncio con la referencia oficial registrada (fianzas Incasòl): no es una tasación oficial; es una referencia orientativa basada en datos oficiales."}
          </p>
        </div>

        {/* mòdul mogut de la portada (v67): mateix formulari, mateix flux */}
        <div className="mt-8 rounded-2xl border border-line bg-card shadow-xl shadow-black/5 overflow-hidden">
          <div className="p-5 bg-sand2">
            {/* v47 — enllaç creuat clar cap a «estima» (mateix text que tenia
                el mòdul a la portada): el text llarg viu a /estima, mai duplicat */}
            <div className="mb-3 rounded-xl border border-sand3 bg-cream p-3.5">
              <p className="text-xs text-moss leading-relaxed flex items-start gap-2">
                <WandSparkles className="w-4 h-4 text-pine shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {ca
                    ? "I si el que vols és valorar el lloguer del TEU habitatge (no comparar un anunci)? «Valora el lloguer del teu habitatge» calcula per passos un rang orientatiu: part de la base oficial de fiances (Incasòl) escalada per superfície (N1) i hi afegeix ajustos opcionals amb coeficient documentat, com l'estat de conservació o les habitacions (N2). Cada xifra amb la seva font, el seu període i les seves limitacions — mai una taxació oficial."
                    : "¿Y si lo que quieres es valorar el alquiler de TU vivienda (no comparar un anuncio)? «Valora el alquiler de tu vivienda» calcula por pasos un rango orientativo: parte de la base oficial de fianzas (Incasòl) escalada por superficie (N1) y añade ajustes opcionales con coeficiente documentado, como el estado de conservación o las habitaciones (N2). Cada cifra con su fuente, su período y sus limitaciones — nunca una tasación oficial."}
                </span>
              </p>
              <button
                type="button"
                onClick={() => navigate("/estima")}
                aria-label={ca ? "Obre «Valora el lloguer del teu habitatge»" : "Abre «Valora el alquiler de tu vivienda»"}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-pine text-white text-xs font-bold px-3.5 py-2.5 hover:bg-pine/90 transition-colors min-h-[44px]"
              >
                {ca ? "Obre «Valora el lloguer del teu habitatge»" : "Abre «Valora el alquiler de tu vivienda»"}
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            {report ? (
              <AnalitzaReport data={report} variant="compact" />
            ) : (
              <>
                <AnalitzaForm
                  variant="compact"
                  onResult={(d) => setReport(d as AnalitzaReportData)}
                />
                {!auth.user && (
                  // v46 — el panell de resultats NEIX BLOQUEJAT sense compte
                  <GateLockedPanel ca={ca} onSignup={() => navigate("/registre")} />
                )}
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-stone leading-relaxed">
          {ca
            ? "Necessites marcar el punt exacte al mapa i l'informe complet (A. Preu · B. Normativa · C. Ubicació · D. Abans de signar)? L'eina completa és a l'«eina Consulta» del menú."
            : "¿Necesitas marcar el punto exacto en el mapa y el informe completo (A. Precio · B. Normativa · C. Ubicación · D. Antes de firmar)? La herramienta completa está en la «eina Consulta» del menú."}
          <button
            type="button"
            onClick={() => navigate("/analitza")}
            className="ml-1.5 underline font-semibold text-pine hover:text-pine2"
          >
            {ca ? "Obre l'eina completa" : "Abre la herramienta completa"}
            <ArrowRight className="w-3 h-3 inline ml-0.5" aria-hidden="true" />
          </button>
        </p>
      </div>
    </div>
  );
}
