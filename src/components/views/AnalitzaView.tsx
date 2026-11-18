"use client";

import { useEffect, useRef, useState } from "react";
import { WandSparkles } from "lucide-react";
import { useApp } from "@/components/app-context";
import AnalitzaForm from "@/components/analitza/AnalitzaForm";
import AnalitzaReport from "@/components/analitza/AnalitzaReport";
import { GateLockedPanel } from "@/components/emailfirst/EmailFirst";
import { ORIENTATION_DISCLAIMER } from "@/lib/analitza";
import type { AnalitzaReportData } from "@/lib/analitza-html";

/**
 * F1 (redisseny de la Home) — Vista #/analitza: «Consulta el preu real
 * registrat»: mapa ICGC + comparació ESTADÍSTICA del preu de l'anunci amb la
 * referència oficial (fiances Incasòl) + normativa + serveis + checklist.
 * Mai una valoració individualitzada: vegeu ORIENTATION_DISCLAIMER.
 */
export default function AnalitzaView() {
  const { locale, auth, navigate } = useApp();
  const ca = locale === "ca";
  const [report, setReport] = useState<AnalitzaReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // v67 — deep link del buscador invers («Verificar un edifici concret en
  // aquesta zona» → /#/analitza?muni=<6 dígits>&mn=<nom>): prefil additiu
  // del municipi; sense els dos paràmetres vàlids, cap canvi de comportament.
  const initialMunicipi = (() => {
    if (typeof window === "undefined") return undefined;
    const q = window.location.hash.split("?")[1] || "";
    const p = new URLSearchParams(q);
    const code = p.get("muni") || "";
    const name = p.get("mn") || "";
    if (!/^\d{6}$/.test(code) || !name) return undefined;
    return { code, name: name.slice(0, 80) };
  })();

  // ---- mapa Leaflet (mateix patró i mateixes capes ICGC que MapView) ----
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // el contenidor viu dins el formulari (variant full): espera fins que existeixi
      let tries = 0;
      while (!document.getElementById("analitza-map") && !cancelled && tries < 20) {
        await new Promise((r) => setTimeout(r, 250));
        tries += 1;
      }
      const div = document.getElementById("analitza-map");
      if (cancelled || !div || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L;
      const map = L.map(div, {
        center: [41.723, 1.886],
        zoom: 7,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer("https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic-gris/MON3857NW/{z}/{x}/{y}.png", {
        attribution: 'Base: <a href="https://www.icgc.cat">ICGC</a> (CC-BY 4.0)',
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        setPoint({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) });
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, []);

  // sincronitza el marcador quan canvia el punt (adreça triada o clic al mapa)
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (point) {
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:18px;height:18px;border-radius:9999px;background:#e2582a;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      if (markerRef.current) {
        markerRef.current.setLatLng([point.lat, point.lng]);
      } else {
        markerRef.current = L.marker([point.lat, point.lng], { icon }).addTo(map);
      }
      map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  }, [point, loading]); // reintent suau quan el formulari munta el mapa

  return (
    <div className="w-full bg-cream">
      <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        {/* capçalera */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-semibold mb-4">
            <WandSparkles className="w-4 h-4 text-mint" />
            {ca ? "Nou · gratuït amb registre Free" : "Nuevo · gratuito con registro Free"}
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {ca ? "Consulta el preu real registrat" : "Consulta el precio real registrado"}
          </h1>
          <p className="mt-3 text-moss leading-relaxed">
            {ca
              ? "Compara el preu de l'anunci amb la referència oficial registrada (fiances Incasòl) i obtens un informe transparent abans de signar: comparació estadística del preu, comprovacions normatives de la zona i serveis propers. Dades oficials i càlculs orientatius sempre separats i explicats. Aquesta eina NO valora el teu habitatge."
              : "Compara el precio del anuncio con la referencia oficial registrada (fianzas Incasòl) y obtén un informe transparente antes de firmar: comparación estadística del precio, comprobaciones normativas de la zona y servicios próximos. Datos oficiales y cálculos orientativos siempre separados y explicados. Esta herramienta NO valora tu vivienda."}
          </p>
          <p className="mt-2 text-xs text-stone leading-relaxed">
            {ca ? ORIENTATION_DISCLAIMER.ca : ORIENTATION_DISCLAIMER.es}
          </p>
        </div>

        <div className="mt-8 grid lg:grid-cols-2 gap-8 items-start">
          {/* formulari + mapa */}
          <div className="rounded-2xl border border-line bg-card p-5 md:p-6 shadow-xl shadow-black/5">
            <h2 className="font-extrabold text-lg mb-1">{ca ? "Les dades de l'habitatge" : "Los datos de la vivienda"}</h2>
            <p className="text-xs text-stone mb-4">{ca ? "Només el municipi i el preu són obligatoris — la resta millora la precisió." : "Solo el municipio y el precio son obligatorios — el resto mejora la precisión."}</p>
            <AnalitzaForm
              variant="full"
              initialMunicipi={initialMunicipi}
              onResult={(d) => {
                setReport(d as AnalitzaReportData);
                setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
              }}
              onLoadingChange={setLoading}
              onPointChange={(p) => setPoint(p)}
              externalPoint={point}
            />
          </div>

          {/* informe */}
          <div ref={reportRef} className="lg:sticky lg:top-20">
            {report ? (
              <AnalitzaReport data={report} variant="full" />
            ) : !auth.user ? (
              // v46 — el panell de resultats NEIX BLOQUEJAT sense compte:
              // «Registra't primer» (el bloqueig real és al servidor: 401)
              <GateLockedPanel ca={ca} onSignup={() => navigate("/registre")} />
            ) : (
              <div className="rounded-2xl border border-line bg-card p-6 text-sm text-stone leading-relaxed">
                <p className="font-semibold text-moss">
                  {ca ? "Aquí veuràs l'informe amb quatre apartats:" : "Aquí verás el informe con cuatro apartados:"}
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  <li><b>{ca ? "A. Preu" : "A. Precio"}</b> — {ca ? "€/m², diferència amb la referència oficial, evolució i municipis propers." : "€/m², diferencia con la referencia oficial, evolución y municipios próximos."}</li>
                  <li><b>{ca ? "B. Normativa" : "B. Normativa"}</b> — {ca ? "zona tensada, límits de renta, gran tenedor i SERPAVI, amb estats clars." : "zona tensionada, límites de renta, gran tenedor y SERPAVI, con estados claros."}</li>
                  <li><b>{ca ? "C. Ubicació" : "C. Ubicación"}</b> — {ca ? "transport, salut, educació, comerç i zones verdes propers." : "transporte, salud, educación, comercio y zonas verdes próximos."}</li>
                  <li><b>{ca ? "D. Abans de signar" : "D. Antes de firmar"}</b> — {ca ? "llista de comprovació marcable amb fonts." : "lista de comprobación marcable con fuentes."}</li>
                </ul>
                <p className="mt-3 text-xs">
                  {ca ? "Gratuït amb registre Free: el resultat ve de fonts oficials (Incasòl, DOGC, MIVAU) i dades obertes (OpenStreetMap), sempre amb la font, la data i les limitacions. L'e-mail només identifica el compte i aplica la quota (3 consultes detallades al mes)." : "Gratuito con registro Free: el resultado viene de fuentes oficiales (Incasòl, DOGC, MIVAU) y datos abiertos (OpenStreetMap), siempre con la fuente, la fecha y las limitaciones. El e-mail solo identifica la cuenta y aplica la cuota (3 consultas detalladas al mes)."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
