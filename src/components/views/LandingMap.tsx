"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/components/app-context";
import { Expand } from "lucide-react";

/**
 * v49 — MINI-MAPA PREMIUM de la portada: la mateixa visualització que el
 * /mapa (edificis ICGC colrats per la renta real registrada, fiances Incasòl)
 * però compacta i sense panell: un mapa viu sota el bloc de text del hero.
 *
 * Lleuger per propòsit:
 *  - Centre fixat a la Dreta de l'Eixample (zoom 16, el mínim perquè l'API
 *    d'edificis serveixi la vista — mateix llindar que MapView).
 *  - Sense controls de zoom ni scroll-wheel (no segresta el scroll de la
 *    pàgina); arrossegar i dobles clic per apropriar-se.
 *  - UNA càrrega d'edificis per vista (mateix endpoint /api/buildings), amb
 *    recàrrega al moveend si l'usuari s'apropa.
 *  - Els colors i els llindars són ELS MATEIXOS que al /mapa (rentColor:
 *    550/700/850/1000 €/mes) — mai una escala decorativa diferent.
 *  - Clic a un edifici → deep link /mapa?edifici=... (v24) així el mapa petit
 *    sempre porta al mapa complet amb la fitxa oberta.
 *  - Llegenda amb l'escala real «Preu baix → Preu alt» (i18n del /mapa).
 *
 * Netegen al desmuntar: map.remove() (mai «Map container is already
 * initialized» en tornar a la portada).
 */

// Mateixa escala de color que MapView.rentColor (font única de veritat visual)
function rentColor(rent: number | null | undefined): string {
  if (!rent) return "#9aa5a0";
  if (rent < 550) return "#63b57c";
  if (rent < 700) return "#93c47d";
  if (rent < 850) return "#e5c46a";
  if (rent < 1000) return "#e89a4b";
  return "#dd5a35";
}

const NAU_FILL = "#8b7bb5";
const NAU_BORDER = "#5d5480";

export default function LandingMap() {
  const { t, navigate } = useApp();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const layerRef = useRef<{ clearLayers: () => void; addLayer: (l: unknown) => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L;
      if (!divRef.current || mapRef.current) return;
      const map = L.map(divRef.current, {
        center: [41.3945, 2.1745], // Dreta de l'Eixample (visual de la portada)
        zoom: 16,
        zoomControl: false,
        scrollWheelZoom: false, // mai segresta el scroll de la pàgina
        attributionControl: true,
      });
      mapRef.current = map as unknown as { remove: () => void };
      L.tileLayer("https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic-gris/MON3857NW/{z}/{x}/{y}.png", {
        attribution: 'Base: <a href="https://www.icgc.cat">ICGC</a> (CC-BY 4.0) · Dades: Incasòl / habitatge.gencat.cat',
        maxZoom: 19,
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer as unknown as { clearLayers: () => void; addLayer: (l: unknown) => void };

      const loadInView = async () => {
        const lyr = layerRef.current;
        if (!lyr) return;
        const z = map.getZoom();
        if (z < 16) {
          lyr.clearLayers();
          return;
        }
        const b = map.getBounds();
        const qs = new URLSearchParams({
          west: String(b.getWest().toFixed(5)),
          south: String(b.getSouth().toFixed(5)),
          east: String(b.getEast().toFixed(5)),
          north: String(b.getNorth().toFixed(5)),
        });
        try {
          const res = await fetch(`/api/buildings?${qs.toString()}`);
          if (!res.ok) {
            lyr.clearLayers();
            return;
          }
          const data = await res.json();
          lyr.clearLayers();
          for (const bld of (data.buildings || []) as Array<{
            id?: string; tipus?: string; ring: Array<[number, number]>;
            avgRentEurMonth?: number | null; munRent?: number | null; munRefRent?: number | null;
          }>) {
            const isNau = bld.tipus === "ind";
            const isRefComarca = !isNau && !bld.avgRentEurMonth && !bld.munRent && !!bld.munRefRent;
            let color = "#9aa5a0";
            if (isNau) color = NAU_FILL;
            else if (bld.avgRentEurMonth) color = rentColor(bld.avgRentEurMonth);
            else if (bld.munRent) color = rentColor(bld.munRent);
            else if (bld.munRefRent) color = rentColor(bld.munRefRent);
            const rent = bld.avgRentEurMonth || bld.munRent || bld.munRefRent || null;
            const poly = L.polygon(bld.ring.map((p) => [p[1], p[0]]), {
              color: isNau ? NAU_BORDER : "#3d4a42",
              weight: isNau ? 1 : isRefComarca ? 1 : 0.7,
              dashArray: isNau ? "4 3" : isRefComarca ? "2 3" : undefined,
              fillColor: color,
              fillOpacity: isNau ? 0.45 : isRefComarca ? 0.3 : 0.55,
            });
            if (rent) poly.bindTooltip(`≈ ${Math.round(rent)} €/mes`, { sticky: true, direction: "top", opacity: 0.9 });
            // clic → el mapa complet amb la fitxa de l'edifici oberta (deep link v24)
            if (bld.id) {
              poly.on("click", () => navigate(`/mapa?edifici=${encodeURIComponent(bld.id!)}`));
            }
            poly.addTo(layer);
          }
        } catch {
          lyr.clearLayers(); // servei no disponible: queda el mapa base ICGC
        }
      };

      map.on("moveend", () => { void loadInView(); });
      void loadInView();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={divRef} className="absolute inset-0 z-0" aria-label={t.map.legend.low + " → " + t.map.legend.high} />
      {/* CTA: el mapa petit sempre porta al mapa complet */}
      <button
        type="button"
        onClick={() => navigate("/mapa")}
        className="absolute top-3 right-3 z-[500] inline-flex items-center gap-1.5 rounded-lg bg-card/95 text-pine text-xs font-bold px-3 py-2 shadow-lg border border-line hover:bg-card transition-colors"
      >
        <Expand className="w-3.5 h-3.5" />
        {t.hero.ctaPrimary}
      </button>
      {/* Llegenda amb l'escala REAL del /mapa (mai decorativa) */}
      <div className="absolute bottom-3 left-3 z-[500] bg-card/95 rounded-lg px-3 py-2 text-[10px] shadow border border-line hidden sm:block">
        <div className="font-semibold mb-1 text-stone">{t.map.legend.low} → {t.map.legend.high}</div>
        <div className="flex gap-1 items-center">
          {["#63b57c", "#93c47d", "#e5c46a", "#e89a4b", "#dd5a35"].map((c) => (
            <span key={c} className="w-5 h-3 rounded-sm inline-block" style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}
