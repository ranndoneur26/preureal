"use client";

import { useState } from "react";
import { UserRound, Building2, Newspaper, Check } from "lucide-react";
import { useApp } from "@/components/app-context";

/**
 * #/usos — Casos d'ús reals de Preureal.
 * Tres perfils amb captures reals de la web en producció (public/usos/*.jpg,
 * novembre de 2026, refrescades el 16-11 amb les noves funcions v45).
 * No inventem testimonis ni persones: descrivim com s'usa la plataforma pas a
 * pas per a cada perfil.
 */

const CAPTURES = [
  { img: "/usos/mapa-inquilino.jpg", alt: "Mapa del lloguer real amb Barcelona carregada, buscador i llegenda de preus", data: "11-11-2026" },
  { img: "/usos/comparador-agente.jpg", alt: "Comparador immobiliari amb exemples de municipis (Barcelona, Girona, Tarragona, Lleida, Sabadell, Badalona)", data: "11-11-2026" },
  { img: "/usos/fitxa-periodista.jpg", alt: "Fitxa pública de Barcelona: 1.135 €/mes, sèrie històrica 2005-2025 i marca d'àrea tensada", data: "11-11-2026" },
  { img: "/usos/analitza-inquilino.jpg", alt: "Analitzador d'una vivenda concreta: característiques, renda oferta i informe A-D (v45)", data: "16-11-2026" },
  { img: "/usos/analisi-analista.jpg", alt: "Anàlisi del mercat residencial: sèries creuades de preu, contractes, població i volum (v45)", data: "16-11-2026" },
];

export default function UsosView() {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";

  const perfiles = ca
    ? [
        {
          icon: UserRound,
          rol: "Inquilí o inquilina",
          claim: "Saber si la renda que et presenten és raonable abans de signar",
          passos: [
            "Cerques el teu municipi al mapa (els 947 de Catalunya tenen dada oficial de fiances).",
            "Fes clic sobre l'edifici concret (cartografia real de l'ICGC) i veus el preu mitjà registrat oficialment.",
            "Introdueixes la renda que t'ofereixen: la fitxa et diu en quin percentatge està per sobre o per sota del preu real.",
            "Obres l'eina de consulta d'una vivenda concreta (gratuït amb registre): preu de referència del municipi, comparativa per característiques (estimació orientativa, mai taxació), normativa aplicable (àrea tensada, índex de referència, IRAV) i serveis propers en un informe A-D imprimible.",
            "Comproves si el municipi és àrea de mercat residencial tensat (regulació de preus vigent del DOGC).",
          ],
          captures: [0, 3],
          cta: { label: "Prova la consulta del preu real", to: "/analitza" },
        },
        {
          icon: Building2,
          rol: "Agent immobiliari o gestor",
          claim: "Argumentari amb dades oficials, no impressions",
          passos: [
            "Compares fins a 6 municipis a la vegada amb el comparador (mitjanes oficials de fiances Incasòl).",
            "Generes informes PDF de 10 pàgines amb històric, indicadors INE, anàlisi del mercat (contractes, volum i dinamisme) i banda de referència per lliurar al client.",
            "Exportes les dades en CSV per treballar-les al teu CRM (pla Pro).",
            "Factura nominal per a despeses professionals.",
          ],
          captures: [1],
          cta: { label: "Obre el comparador", to: "/comparador" },
        },
        {
          icon: Newspaper,
          rol: "Periodista o analista",
          claim: "Sèries citables amb font, període i URL estable",
          passos: [
            "Cada municipi té una fitxa pública amb URL estable (p. ex. /lloguer/barcelona) amb el preu mitjà vigent.",
            "A l'eina «Anàlisi del mercat» creues el preu de les fiances amb el flux de contractes amb fiança i la població del Padró: volum aproximat, contractes per cada 1.000 habitants i lectures citables.",
            "La sèrie històrica completa (2005-2025) és visible i verificable contra la publicació oficial d'Incasòl.",
            "Cada xifra cita font, unitat i període de referència; la metodologia completa és pública a la pàgina de fonts.",
            "Les fitxes inclouen la marca d'àrea tensada amb la resolució del DOGC que la declara.",
          ],
          captures: [2, 4],
          cta: { label: "Obre l'anàlisi del mercat", to: "/analisi" },
        },
      ]
    : [
        {
          icon: UserRound,
          rol: "Inquilino o inquilina",
          claim: "Saber si la renta que te presentan es razonable antes de firmar",
          passos: [
            "Buscas tu municipio en el mapa (los 947 de Cataluña tienen dato oficial de fianzas).",
            "Haces clic sobre el edificio concreto (cartografía real del ICGC) y ves el precio medio registrado oficialmente.",
            "Introduces la renta que te ofrecen: la ficha te dice en qué porcentaje está por encima o por debajo del precio real.",
            "Abres la herramienta de consulta de una vivienda concreta (gratuito con registro): precio de referencia del municipio, comparativa por características (estimación orientativa, nunca tasación), normativa aplicable (área tensionada, índice de referencia, IRAV) y servicios cercanos en un informe A-D imprimible.",
            "Compruebas si el municipio es área de mercado residencial tensionado (regulación de precios vigente del DOGC).",
          ],
          captures: [0, 3],
          cta: { label: "Prueba la consulta del precio real", to: "/analitza" },
        },
        {
          icon: Building2,
          rol: "Agente inmobiliario o gestor",
          claim: "Argumentario con datos oficiales, no impresiones",
          passos: [
            "Compara hasta 6 municipios a la vez con el comparador (medias oficiales de fianzas Incasòl).",
            "Generas informes PDF de 10 páginas con histórico, indicadores INE, análisis del mercado (contratos, volumen y dinamismo) y banda de referencia para entregar al cliente.",
            "Exportas los datos en CSV para trabajarlos en tu CRM (plan Pro).",
            "Factura nominal para gastos profesionales.",
          ],
          captures: [1],
          cta: { label: "Abre el comparador", to: "/comparador" },
        },
        {
          icon: Newspaper,
          rol: "Periodista o analista",
          claim: "Series citables con fuente, período y URL estable",
          passos: [
            "Cada municipio tiene una ficha pública con URL estable (p. ej. /lloguer/barcelona) con el precio medio vigente.",
            "En la herramienta «Análisis del mercado» cruzas el precio de las fianzas con el flujo de contratos con fianza y la población del Padrón: volumen aproximado, contratos por cada 1.000 habitantes y lecturas citables.",
            "La serie histórica completa (2005-2025) es visible y verificable contra la publicación oficial de Incasòl.",
            "Cada cifra cita fuente, unidad y período de referencia; la metodología completa es pública en la página de fuentes.",
            "Las fichas incluyen la marca de área tensionada con la resolución del DOGC que la declara.",
          ],
          captures: [2, 4],
          cta: { label: "Abre el análisis del mercado", to: "/analisi" },
        },
      ];

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">{ca ? "Casos d'ús reals" : "Casos de uso reales"}</h1>
      <p className="mt-3 text-[15px] text-moss leading-relaxed max-w-3xl">
        {ca
          ? "Aquestes són les tres maneres més habituals d'usar Preureal, amb captures reals de la web (novembre de 2026). No publicuem testimonis inventats: el millor testimoni és provar-ho tu mateix."
          : "Estas son las tres maneras más habituales de usar Preureal, con capturas reales de la web (noviembre de 2026). No publicamos testimonios inventados: el mejor testimonio es probarlo tú mismo."}
      </p>

      <div className="mt-8 space-y-10">
        {perfiles.map((p, i) => {
          const Icon = p.icon;
          return (
            <section key={i} className="grid gap-6 lg:grid-cols-2 lg:items-start">
              <div>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-pine text-white flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="font-bold text-lg leading-tight">{p.rol}</h2>
                    <p className="text-sm text-ember font-semibold">{p.claim}</p>
                  </div>
                </div>
                <ol className="mt-4 space-y-2.5">
                  {p.passos.map((s, j) => (
                    <li key={j} className="flex gap-2.5 text-sm text-moss leading-relaxed">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-mintsoft text-mossdeep flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-4">
                  {/* v45: totes les CTA són internes (navigate) */}
                  <button onClick={() => navigate(p.cta.to)} className="inline-flex px-4 py-2 rounded-lg bg-pine text-white text-sm font-semibold hover:bg-pine2 transition-colors">
                    {p.cta.label}
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                {p.captures.map((ci) => {
                  const cap = CAPTURES[ci];
                  return (
                    <figure key={ci} className="rounded-2xl border border-line overflow-hidden bg-card shadow-sm">
                      {/* captura real servida des de /public/usos (JPEG ja optimitzat) */}
                      <img src={cap.img} alt={cap.alt} loading="lazy" className="w-full h-auto" />
                      <figcaption className="px-4 py-2.5 text-xs text-stone border-t border-line bg-cream">
                        {ca ? `Captura real de la web en producció (${cap.data})` : `Captura real de la web en producción (${cap.data})`}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
