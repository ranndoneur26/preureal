"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useApp } from "@/components/app-context";
import { Flame, MapPin, Search, X, Building2, TrendingUp, TrendingDown, Minus, Info, ExternalLink, Star, FileDown, AlertTriangle, Home, MailCheck } from "lucide-react";

interface MunLite {
  code: string;
  name: string;
  comarca: string | null;
  lat: number;
  lng: number;
  rentLatest: number | null;
  rentPeriod: string | null;
  isTense: boolean;
  tenseList?: string | null;
}

interface AddressResult {
  label: string;
  lat: number;
  lng: number;
  municipalityCode: string | null;
  municipalityName: string | null;
  comarca: string | null;
  postalCode: string | null;
  portal: string | null;
  street: string | null;
}

interface LookupResult {
  kind: "full" | "teaser";
  building?: { id?: string; refcat?: string | null; yearBuilt?: { year: number; source: string } | null; tipus?: string | null; altura?: number | null; nom?: string | null; avgRentEurMonth?: number | null; sampleSize?: number | null };
  municipality?: {
    code: string; name: string; comarca: string | null; province: string | null;
    rentLatest: number | null; rentPeriod: string | null;
    rentPrevYear: number | null; rentPrevPeriod: string | null;
    rentHistory: Record<string, number> | null;
    contractsLatest: number | null;
    isTense: boolean; tenseList: string | null;
  };
  quota?: { used: number; limit: number };
  teaser?: { hasRent: boolean; period: string | null; message: string };
  error?: string;
  email?: string; // EMAIL_NOT_VERIFIED (Fase 1): correu emmascarat del compte
}

function rentColor(rent: number | null | undefined): string {
  if (!rent) return "#9aa5a0";
  if (rent < 550) return "#63b57c";
  if (rent < 700) return "#93c47d";
  if (rent < 850) return "#e5c46a";
  if (rent < 1000) return "#e89a4b";
  return "#dd5a35";
}

/** Un text que sembla referència catastral (14+ alfanumèrics sense espais). */
function looksLikeRefcat(q: string): boolean {
  const s = q.replace(/\s+/g, "").toUpperCase();
  return /^[0-9]{7}[A-Z][A-Z0-9]{5,7}$/.test(s) || /^[0-9A-Z]{14,20}$/.test(s) && /[0-9]/.test(s) && /[A-Z]/.test(s);
}

export default function MapView() {
  const { t, locale, auth, navigate } = useApp();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const boundaryRef = useRef<any>(null);
  const selectedRef = useRef<any>(null);
  // v24 — enllaços "obre al mapa" des del panell: llistat d'edificis dibuixats
  // i el seu polígon per id, per poder seleccionar un edifici concret després
  // de volar al seu centroid (deep link /#/mapa?edifici=...)
  const lastBuildingsRef = useRef<any[]>([]);
  const polyByIdRef = useRef<Record<string, any>>({});

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MunLite[]>([]);
  const [addresses, setAddresses] = useState<AddressResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedMun, setSelectedMun] = useState<MunLite | null>(null);
  const [zoomHint, setZoomHint] = useState(false);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  const [coverageWarn, setCoverageWarn] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<"closed" | "loading" | "teaser" | "full" | "paywall" | "verificacio">("closed");
  const [verifySent, setVerifySent] = useState(false); // reenviament des del panell del mapa
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(auth.quota);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [favState, setFavState] = useState<"idle" | "saved" | "error" | "plan">("idle");
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);

  useEffect(() => { setQuota(auth.quota); }, [auth.quota]);

  // ---- Inicialització del mapa ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      LRef.current = L;
      if (!mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current, {
        center: [41.3925, 2.1650],
        zoom: 16,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;
      L.tileLayer("https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic-gris/MON3857NW/{z}/{x}/{y}.png", {
        attribution: 'Base: <a href="https://www.icgc.cat">ICGC</a> (CC-BY 4.0) · Edificis: ICGC RTT · Dades: Incasòl / habitatge.gencat.cat',
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      boundaryRef.current = L.layerGroup().addTo(map);

      const onMove = () => loadBuildingsInView();
      map.on("moveend", onMove);
      loadBuildingsInView();
      // v24 — deep links des del panell (/#/mapa?mun=... / ?edifici=...):
      // es consumeixen UNA vegada (es netegen de la URL per no re-aplicar-los
      // en cada visita al mapa des del menú)
      try {
        const hq = window.location.hash.split("?")[1] || "";
        const p = new URLSearchParams(hq);
        const edificiId = p.get("edifici");
        const munCode = p.get("mun");
        if (edificiId || munCode) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/mapa`);
          if (edificiId) {
            // edifici preferit/consultat: vola al centroid i reobri la consulta
            fetch(`/api/buildings/${encodeURIComponent(edificiId)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                const b0 = d?.building;
                if (!b0 || !mapRef.current) return;
                mapRef.current.flyTo([b0.lat, b0.lng], 18, { duration: 0.8 });
                // els edificis arriben amb el moveend de flyTo; re-intenta fins
                // que el polígon sigui clicable (màx ~4 s)
                const trySelect = (attempt: number) => {
                  const b = lastBuildingsRef.current.find((x: any) => x.id === edificiId);
                  const poly = polyByIdRef.current[edificiId];
                  if (b && poly) {
                    onSelectBuilding(b, b0.lat, b0.lng, poly);
                    return;
                  }
                  if (attempt < 10) setTimeout(() => trySelect(attempt + 1), 400);
                };
                setTimeout(() => trySelect(0), 900);
              })
              .catch(() => {});
          } else if (munCode) {
            // municipi preferit/consultat: mateixa UX que cercar-lo i clicar-lo
            fetch(`/api/municipalities/${encodeURIComponent(munCode)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                const m = d?.municipality;
                if (!m) return;
                selectMunicipality({
                  code: m.code,
                  name: m.name,
                  comarca: m.comarca,
                  lat: m.lat,
                  lng: m.lng,
                  rentLatest: m.rentLatest,
                  rentPeriod: m.rentPeriod,
                  isTense: m.isTense,
                  tenseList: m.tenseList,
                });
              })
              .catch(() => {});
          }
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
     
  }, []);

  const loadBuildingsInView = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !layerRef.current) return;
    const z = map.getZoom();
    if (z < 16) {
      layerRef.current.clearLayers();
      setZoomHint(true);
      setLoadingBuildings(false);
      setCoverageWarn(null);
      return;
    }
    setZoomHint(false);
    const b = map.getBounds();
    const qs = new URLSearchParams({
      west: String(b.getWest().toFixed(5)),
      south: String(b.getSouth().toFixed(5)),
      east: String(b.getEast().toFixed(5)),
      north: String(b.getNorth().toFixed(5)),
    });
    setLoadingBuildings(true);
    setBuildingsError(null);
    try {
      const res = await fetch(`/api/buildings?${qs}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.error === "BBOX_TOO_BIG") {
          layerRef.current.clearLayers();
          setBuildingsError("zoom");
        } else {
          setBuildingsError("service");
        }
        setCoverageWarn(null);
        return;
      }
      const data = await res.json();
      drawBuildings(data.buildings || []);
      // Fase 8.1: mai es presenta la vista com a completa si falten mosaics
      const cov = data.coverage;
      if (cov && cov.failed > 0) {
        setCoverageWarn(locale === "ca"
          ? `${cov.failed} de ${cov.total} zones no s'han pogut carregar: la vista NO està completa. Ampla-hi o torna-ho a provar.`
          : `${cov.failed} de ${cov.total} zonas no se pudieron cargar: la vista NO está completa. Amplía o inténtalo de nuevo.`);
      } else if (cov && cov.empty > 0) {
        setCoverageWarn(locale === "ca"
          ? `${cov.empty} de ${cov.total} zones sense edificis registrats (àrees rurals o sense dades ICGC).`
          : `${cov.empty} de ${cov.total} zonas sin edificios registrados (áreas rurales o sin datos ICGC).`);
      } else {
        setCoverageWarn(null);
      }
    } catch {
      setBuildingsError("service");
      setCoverageWarn(null);
    } finally {
      setLoadingBuildings(false);
    }
     
  }, [locale]);

  // recarrega edificis quan canvia l'idioma per refrescar colors i accés
  useEffect(() => {
    loadBuildingsInView();
     
  }, [locale]);

  const drawBuildings = useCallback((buildings: any[]) => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    polyByIdRef.current = {}; // v24: el lot nou substitueix l'anterior
    lastBuildingsRef.current = buildings;
    for (const b of buildings) {
      let color = "#9aa5a0";
      // si l'edifici té dada pròpia importada, el color ve d'aquesta dada real
      if (b.avgRentEurMonth) color = rentColor(b.avgRentEurMonth);
      else if (b.munRent) color = rentColor(b.munRent);
      const poly = L.polygon(b.ring.map((p: number[]) => [p[1], p[0]]), {
        color: "#3d4a42",
        weight: 0.7,
        fillColor: color,
        fillOpacity: 0.55,
      });
      poly.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        onSelectBuilding(b, e.latlng.lat, e.latlng.lng, poly);
      });
      poly.addTo(layer);
      if (b.id) polyByIdRef.current[b.id] = poly;
    }
     
  }, []);

  const lookupSeqRef = useRef(0);
  // recorda l'últim clic al mapa per poder repetir la consulta des del bloqueig
  // de verificació («Ja l'he verificat: comprova-ho») sense haver de reclicar
  const lastClickRef = useRef<{ b: any; lat: number; lng: number; poly: any } | null>(null);

  const onSelectBuilding = useCallback(async (b: any, lat: number, lng: number, poly: any) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (L && map) {
      if (selectedRef.current) {
        selectedRef.current.setStyle({ color: "#3d4a42", weight: 0.7, fillOpacity: 0.55 });
      }
      poly.setStyle({ color: "#e8673c", weight: 3, fillOpacity: 0.8 });
      selectedRef.current = poly;
    }
    // invalida respuestas de consultas anteriores (evita carreras fuera de orden)
    const seq = ++lookupSeqRef.current;
    lastClickRef.current = { b, lat, lng, poly };
    setPanelState("loading");
    setLookup(null);
    setDemoNotice(null);
    setFavState("idle");
    setPdfMsg(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, buildingId: b.id }),
      });
      if (seq !== lookupSeqRef.current) return; // resposta obsoleta
      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        setLookup(d);
        setPanelState("paywall");
        return;
      }
      // Fase 1: correu sense verificar → 403 del servidor (bloqueig principal)
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d?.error === "EMAIL_NOT_VERIFIED") {
          setLookup(d);
          setPanelState("verificacio");
          setVerifySent(false);
          return;
        }
      }
      const d: LookupResult = await res.json();
      if (seq !== lookupSeqRef.current) return; // resposta obsoleta
      setLookup(d);
      setPanelState(d.kind === "full" ? "full" : "teaser");
      if (d.kind === "full" && d.quota) setQuota(d.quota);
    } catch {
      if (seq === lookupSeqRef.current) setPanelState("closed");
    }
  }, []);

  // ---- Cercador: municipis + adreces (ICGC) + refcat (BD) ----
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setAddresses([]);
      return;
    }
    const id = setTimeout(async () => {
      // 1) municipis (BD local, instantani)
      try {
        const res = await fetch(`/api/municipalities?q=${encodeURIComponent(q)}&limit=8`);
        const d = await res.json();
        setResults(d.municipalities || []);
      } catch {
        setResults([]);
      }
      // 2) refcat: si sembla una referència catastral, cerca'l a la BD d'edificis
      if (looksLikeRefcat(q)) {
        try {
          const res = await fetch(`/api/lookup-refcat?rc=${encodeURIComponent(q.replace(/\s+/g, "").toUpperCase())}`);
          const d = await res.json();
          if (d.result) {
            setAddresses([{
              label: `Ref. catastral ${d.result.refcat}${d.result.nom ? " · " + d.result.nom : ""}`,
              lat: d.result.lat,
              lng: d.result.lng,
              municipalityCode: d.result.municipalityCode,
              municipalityName: null,
              comarca: null,
              postalCode: null,
              portal: null,
              street: d.result.nom || null,
            }]);
            setShowResults(true);
            return;
          }
        } catch {}
      }
      // 3) adreces (Geocodificador ICGC via proxy)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const d = await res.json();
        setAddresses(d.results || []);
      } catch {
        setAddresses([]);
      }
      setShowResults(true);
    }, 260);
    return () => clearTimeout(id);
  }, [query]);

  const selectMunicipality = useCallback(async (mun: MunLite) => {
    setShowResults(false);
    setQuery(mun.name);
    setSelectedMun(mun);
    const map = mapRef.current;
    if (!map) return;
    // límit municipal real (ICGC amb cau) + fit
    try {
      const res = await fetch(`/api/municipalities/${mun.code}`);
      const d = await res.json();
      if (d.boundary) {
        const L = LRef.current;
        boundaryRef.current?.clearLayers();
        const layer = L.geoJSON(d.boundary, {
          style: { color: "#0f2e21", weight: 2, fill: false, dashArray: "4 3" },
        });
        layer.addTo(boundaryRef.current);
        map.fitBounds(layer.getBounds().pad(0.05));
        // si ja tenim prou zoom, carreguem edificis immediatament
        if (map.getZoom() >= 16) loadBuildingsInView();
      } else {
        map.setView([mun.lat, mun.lng], 16);
        setTimeout(() => loadBuildingsInView(), 400);
      }
    } catch {
      map.setView([mun.lat, mun.lng], 16);
    }
  }, [loadBuildingsInView]);

  const selectAddress = useCallback((a: AddressResult) => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    setShowResults(false);
    setQuery(a.label);
    setSelectedMun(null);
    boundaryRef.current?.clearLayers();
    map.flyTo([a.lat, a.lng], 18, { duration: 0.8 });
    setTimeout(() => loadBuildingsInView(), 900);
  }, [loadBuildingsInView]);

  const doCheckout = async (plan: "PREMIUM" | "PRO") => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = await res.json();
      if (d.ok && d.mode === "STRIPE" && d.url) {
        window.location.href = d.url;
      } else if (d.ok && d.mode === "DEMO") {
        setDemoNotice(d.message || "Demo");
        setPanelState("full");
        await auth.refresh();
      } else {
        setDemoNotice(d.message || d.error || "Error");
      }
    } catch {
      setDemoNotice(locale === "ca" ? "Error de xarxa" : "Error de red");
    }
  };

  const toggleFavorite = async () => {
    const mun = lookup?.municipality;
    const bId = lookup?.building?.id;
    if (!mun) return;
    setFavState("idle");
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: bId || null,
          municipalityCode: bId ? null : mun.code,
          label: bId ? lookup?.building?.nom || lookup?.building?.refcat || mun.name : mun.name,
        }),
      });
      if (res.status === 403) {
        setFavState("plan");
      } else if (res.ok) {
        setFavState("saved");
      } else {
        setFavState("error");
      }
    } catch {
      setFavState("error");
    }
  };

  const downloadPdf = () => {
    const mun = lookup?.municipality;
    const bId = lookup?.building?.id;
    if (!mun) return;
    setPdfMsg(null);
    const qs = bId ? `building=${bId}` : `mun=${mun.code}`;
    fetch(`/api/reports/pdf?${qs}`).then(async (res) => {
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        setPdfMsg(d.plan === "PRO"
          ? (locale === "ca" ? "L'informe d'edifici requereix el pla Pro." : "El informe de edificio requiere el plan Pro.")
          : (locale === "ca" ? "L'informe PDF requereix el pla Premium." : "El informe PDF requiere el plan Premium."));
        return;
      }
      if (res.status === 429) {
        setPdfMsg(locale === "ca" ? "Massa descàrregues; espera un moment." : "Demasiadas descargas; espera un momento.");
        return;
      }
      if (!res.ok) {
        setPdfMsg(locale === "ca" ? "No s'ha pogut generar l'informe." : "No se pudo generar el informe.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }).catch(() => setPdfMsg(locale === "ca" ? "Error de xarxa" : "Error de red"));
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row relative md:h-[calc(100vh-4rem)] md:overflow-hidden">
      {/* MAPA */}
      <div className="relative flex-1 min-h-[55vh] md:h-full md:min-h-[520px] md:flex-none md:basis-auto md:grow">
        <div ref={mapDivRef} className="absolute inset-0 z-0" />

        {/* Cercador */}
        <div className="absolute top-3 left-3 right-3 z-[500] max-w-md">
          <div className="relative">
            <div className="bg-white rounded-xl shadow-lg border border-[#e5e1da] flex items-center px-3">
              <Search className="w-4 h-4 text-[#6b6f68] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => (results.length || addresses.length) && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 180)}
                placeholder={t.map.searchPlaceholder}
                className="w-full px-2 py-3 text-sm outline-none bg-transparent"
                aria-label={t.map.searchPlaceholder}
              />
              {query && (
                <button onClick={() => { setQuery(""); setSelectedMun(null); setAddresses([]); boundaryRef.current?.clearLayers(); }}>
                  <X className="w-4 h-4 text-[#6b6f68]" />
                </button>
              )}
            </div>
            {showResults && (results.length > 0 || addresses.length > 0) && (
              <div className="absolute mt-1 w-full bg-white rounded-xl shadow-xl border border-[#e5e1da] overflow-hidden max-h-80 overflow-y-auto pr-scroll">
                {results.length > 0 && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#6b6f68]">
                    {locale === "ca" ? "Municipis" : "Municipios"}
                  </div>
                )}
                {results.map((m) => (
                  <button
                    key={`mun-${m.code}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectMunicipality(m)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#f0ede8] flex items-center justify-between gap-2"
                  >
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-[#6b6f68] flex items-center gap-1.5">
                      {m.rentLatest ? (
                        <span className="font-bold text-[#0f2e21]">{Math.round(m.rentLatest)} €/mes</span>
                      ) : (
                        <span>—</span>
                      )}
                      {m.isTense && <Flame className="w-3.5 h-3.5 text-[#e8673c]" />}
                    </span>
                  </button>
                ))}
                {addresses.length > 0 && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#6b6f68]">
                    {locale === "ca" ? "Adreces i referències cadastrals" : "Direcciones y referencias catastrales"}
                  </div>
                )}
                {addresses.map((a, i) => (
                  <button
                    key={`addr-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectAddress(a)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#f0ede8] flex items-start justify-between gap-2"
                  >
                    <span className="text-sm flex items-start gap-1.5">
                      <Home className="w-3.5 h-3.5 mt-0.5 text-[#6b6f68] shrink-0" />
                      <span>
                        {a.label}
                        {a.postalCode && <span className="text-xs text-[#6b6f68]"> · CP {a.postalCode}</span>}
                      </span>
                    </span>
                    {a.municipalityCode && <span className="text-[10px] text-[#6b6f68] shrink-0">{a.municipalityName}</span>}
                  </button>
                ))}
                {results.length === 0 && addresses.length === 0 && (
                  <div className="px-4 py-3 text-xs text-[#6b6f68]">
                    {locale === "ca" ? "Cap resultat. Prova el nom d'un municipi, una adreça amb número o una referència catastral." : "Ningún resultado. Prueba el nombre de un municipio, una dirección con número o una referencia catastral."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {demoNotice && (
          <div className="absolute top-16 left-3 right-3 z-[500] max-w-md bg-[#0f2e21] text-white text-xs rounded-xl p-3 shadow-lg flex justify-between gap-2">
            <span>{demoNotice}</span>
            <button onClick={() => setDemoNotice(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Estats */}
        <div className="absolute bottom-3 left-3 z-[500] flex flex-col gap-2 max-w-[85%]">
          {(zoomHint || buildingsError === "zoom") && (
            <div className="bg-white/95 rounded-lg px-3 py-2 text-xs shadow border border-[#e5e1da] flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-[#e8673c]" /> {t.map.zoomHint}
            </div>
          )}
          {loadingBuildings && (
            <div className="bg-white/95 rounded-lg px-3 py-2 text-xs shadow border border-[#e5e1da] flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-[#e8673c] border-t-transparent animate-spin" />
              {t.map.loadingBuildings}
            </div>
          )}
          {buildingsError === "service" && (
            <div className="bg-[#fdeae2] rounded-lg px-3 py-2 text-xs shadow border border-[#f2c4ac] text-[#b0431c]">
              {locale === "ca"
                ? "El servei de cartografia no està disponible ara mateix. Torna-ho a provar."
                : "El servicio de cartografía no está disponible ahora mismo. Inténtalo de nuevo."}
            </div>
          )}
          {coverageWarn && !buildingsError && (
            <div className="bg-[#fff7e8] rounded-lg px-3 py-2 text-xs shadow border border-[#f2d9a4] text-[#8a6116] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {coverageWarn}
            </div>
          )}
        </div>

        {/* Llegenda */}
        <div className="absolute bottom-3 right-3 z-[500] bg-white/95 rounded-lg px-3 py-2 text-[10px] shadow border border-[#e5e1da] hidden sm:block">
          <div className="font-semibold mb-1">{t.map.legend.low} → {t.map.legend.high}</div>
          <div className="flex gap-1 items-center">
            {["#63b57c", "#93c47d", "#e5c46a", "#e89a4b", "#dd5a35"].map((c) => (
              <span key={c} className="w-5 h-3 rounded-sm inline-block" style={{ background: c }} />
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[#6b6f68]">
            <Flame className="w-3 h-3 text-[#e8673c]" /> {t.map.legend.tense}
          </div>
        </div>
      </div>

      {/* PANELL DETALL — desktop lateral, mobile fulla inferior */}
      {panelState !== "closed" && (
        <div className="md:w-[400px] md:h-full w-full max-h-[70vh] md:max-h-full bg-white border-t md:border-t-0 md:border-l border-[#e5e1da] shadow-2xl z-[600] overflow-y-auto pr-scroll shrink-0 fixed bottom-0 left-0 right-0 md:static">
          <div className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h2 className="font-extrabold text-lg leading-tight">
                {panelState === "loading" && t.common.loading}
                {lookup?.municipality?.name || "—"}
                {lookup?.municipality?.comarca && (
                  <span className="block text-xs font-normal text-[#6b6f68]">{lookup.municipality.comarca}</span>
                )}
              </h2>
              <button onClick={() => { setPanelState("closed"); if (selectedRef.current) { selectedRef.current.setStyle({ color: "#3d4a42", weight: 0.7, fillOpacity: 0.55 }); selectedRef.current = null; } }} className="p-1.5 rounded-lg hover:bg-[#f0ede8]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {panelState === "loading" && (
              <div className="py-10 flex justify-center">
                <span className="w-8 h-8 rounded-full border-4 border-[#e8673c] border-t-transparent animate-spin" />
              </div>
            )}

            {/* TEASER (sense sessió) */}
            {panelState === "teaser" && (
              <div className="space-y-4">
                {lookup?.municipality?.isTense && (
                  <TenseBadge note={t.tense.badgeEsNote} />
                )}
                <div className="rounded-xl border border-[#e5e1da] bg-[#faf9f7] p-4">
                  <div className="text-xs font-semibold text-[#6b6f68] uppercase tracking-wide">{t.map.panel.avgRent}</div>
                  <div className="mt-2 select-none blur-[7px] text-4xl font-black text-[#0f2e21]">1.134 €</div>
                  <div className="mt-1 text-xs text-[#6b6f68]">Incasòl · {lookup?.teaser?.period ?? ""}</div>
                </div>
                <div className="rounded-xl bg-[#0f2e21] text-white p-4">
                  <div className="font-bold">{t.map.teaser.title}</div>
                  <p className="text-sm mt-1 opacity-90 leading-relaxed">{t.map.teaser.desc}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button onClick={() => navigate("/registre")} className="w-full py-2.5 rounded-lg bg-[#e8673c] font-bold text-sm hover:bg-[#d95a31]">
                      {t.map.teaser.cta}
                    </button>
                    <button onClick={() => navigate("/entrada")} className="w-full py-2 rounded-lg border border-white/30 text-sm hover:bg-white/10">
                      {t.map.teaser.login}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PAYWALL (quota exhaurida) */}
            {panelState === "paywall" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-[#fdeae2] border border-[#f2c4ac] p-4 text-center">
                  <Building2 className="w-8 h-8 text-[#b0431c] mx-auto" />
                  <div className="font-bold mt-2 text-[#b0431c]">{t.map.paywall.title}</div>
                  <p className="text-sm mt-1 text-[#4b5349]">{t.map.paywall.desc}</p>
                </div>
                <button onClick={() => navigate("/preus")} className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31]">
                  {t.map.paywall.cta}
                </button>
              </div>
            )}

            {/* VERIFICACIÓ DE CORREU (Fase 1: bloqueig fins verificar) */}
            {panelState === "verificacio" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-[#fdeae2] border border-[#f2c4ac] p-4 text-center">
                  <MailCheck className="w-8 h-8 text-[#b0431c] mx-auto" />
                  <div className="font-bold mt-2 text-[#b0431c]">{t.map.verify.title}</div>
                  <p className="text-sm mt-1 text-[#4b5349]">{t.map.verify.desc}</p>
                  {lookup?.email && <p className="text-sm mt-1 font-semibold text-[#0f2e21]">{lookup.email}</p>}
                  <p className="text-xs mt-2 text-[#8a6d1a]">{t.map.verify.note}</p>
                </div>
                {/* si l'usuari ja ha verificat (potser en una altra pestanya), un clic
                    torna a llançar la MATEIXA consulta i desbloqueja el panell */}
                <button
                  onClick={() => {
                    const q = lastClickRef.current;
                    if (q) onSelectBuilding(q.b, q.lat, q.lng, q.poly);
                  }}
                  className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors"
                >
                  {t.map.verify.recheck}
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/auth/verify", { method: "POST" });
                    if (res.ok) setVerifySent(true);
                    else navigate("/revisa-correu");
                  }}
                  disabled={verifySent}
                  className="w-full py-3 rounded-xl border border-[#e5e1da] bg-white font-semibold text-[#0f2e21] hover:bg-[#faf9f7] transition-colors disabled:opacity-50"
                >
                  {verifySent ? t.map.verify.sent : t.map.verify.resend}
                </button>
                <button onClick={() => navigate("/panell")} className="w-full py-3 rounded-xl bg-[#0f2e21] text-white font-bold hover:bg-[#16402e]">
                  {t.map.verify.goToPanel}
                </button>
              </div>
            )}

            {/* FULL */}
            {panelState === "full" && lookup?.municipality && (
              <FullPanel
                lookup={lookup}
                quota={quota}
                t={t}
                navigate={navigate}
                doCheckout={doCheckout}
                toggleFavorite={toggleFavorite}
                favState={favState}
                downloadPdf={downloadPdf}
                pdfMsg={pdfMsg}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TenseBadge({ note }: { note: string }) {
  const { t } = useApp();
  return (
    <div className="rounded-xl bg-[#fdeae2] border border-[#f2c4ac] px-3 py-2.5 flex items-start gap-2">
      <Flame className="w-4 h-4 text-[#b0431c] mt-0.5 shrink-0" />
      <div>
        <div className="text-sm font-bold text-[#b0431c]">{t.tense.badgeFull}</div>
        <div className="text-xs text-[#b0431c]/80">{note}</div>
      </div>
    </div>
  );
}

function FullPanel({
  lookup, quota, t, navigate, doCheckout, toggleFavorite, favState, downloadPdf, pdfMsg,
}: {
  lookup: LookupResult;
  quota: { used: number; limit: number } | null;
  t: any;
  navigate: (r: string) => void;
  doCheckout: (p: "PREMIUM" | "PRO") => void;
  toggleFavorite: () => void;
  favState: "idle" | "saved" | "error" | "plan";
  downloadPdf: () => void;
  pdfMsg: string | null;
}) {
  const { locale, auth } = useApp();
  const mun = lookup.municipality!;
  const [yourRent, setYourRent] = useState("");
  const [yourM2, setYourM2] = useState("");
  const [contractType, setContractType] = useState("HABITATGE");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const hist = mun.rentHistory ? Object.entries(mun.rentHistory).sort() : [];
  const histShow = hist.slice(-8);
  const maxVal = Math.max(...histShow.map(([, v]) => Number(v)), 1);

  const trend =
    mun.rentLatest && mun.rentPrevYear
      ? ((mun.rentLatest - mun.rentPrevYear) / mun.rentPrevYear) * 100
      : null;

  const yourRentNum = parseFloat(yourRent);
  const delta =
    isFinite(yourRentNum) && mun.rentLatest
      ? ((yourRentNum - mun.rentLatest) / mun.rentLatest) * 100
      : null;

  const submitReport = async () => {
    setReportError(null);
    // Fase 10 (E1): només s'informa d'èxit quan el servidor ho confirma
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          municipalityCode: mun.code,
          buildingId: lookup.building?.id || null,
          offerEurMonth: yourRentNum || undefined,
          surfaceM2: parseFloat(yourM2) || undefined,
          contractType,
        }),
      });
      if (res.status === 409) {
        setReportError(locale === "ca"
          ? "Ja has enviat un informe igual en les últimes 24 hores."
          : "Ya has enviado un informe igual en las últimas 24 horas.");
        return;
      }
      if (!res.ok) {
        setReportError(locale === "ca" ? "No s'ha pogut enviar. Torna-ho a provar." : "No se pudo enviar. Inténtalo de nuevo.");
        return;
      }
      setReportSent(true);
      setReportOpen(false);
    } catch {
      setReportError(locale === "ca" ? "Error de xarxa. Torna-ho a provar." : "Error de red. Inténtalo de nuevo.");
    }
  };

  const bAvg = lookup.building?.avgRentEurMonth;
  const bSamples = lookup.building?.sampleSize;

  return (
    <div className="space-y-4">
      {mun.isTense && <TenseBadge note={t.tense.badgeEsNote} />}

      {/* PREU MITJÀ REAL */}
      <div className="rounded-xl border border-[#e5e1da] bg-[#faf9f7] p-4">
        <div className="text-xs font-semibold text-[#6b6f68] uppercase tracking-wide">{t.map.panel.avgRent}</div>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-4xl font-black text-[#0f2e21]">
            {mun.rentLatest ? `${mun.rentLatest.toFixed(0)} €` : "—"}
          </span>
          <span className="text-sm text-[#6b6f68] mb-1">{t.map.panel.perMonth}</span>
          {trend !== null && (
            <span className={`mb-1.5 ml-auto text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 ${
              trend > 0 ? "bg-[#fdeae2] text-[#b0431c]" : trend < 0 ? "bg-[#e6f4ea] text-[#1e7a41]" : "bg-[#f0ede8]"
            }`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
          )}
        </div>
        {mun.rentLatest === null && (
          <div className="mt-2 text-xs text-[#b0431c]">
            {locale === "ca" ? "Aquest municipi no té lloguer registrat al període actual (sense dades oficials; no s'inventa cap xifra)." : "Este municipio no tiene alquiler registrado en el período actual (sin datos oficiales; no se inventa ninguna cifra)."}
          </div>
        )}
        <div className="mt-2 text-xs text-[#6b6f68] space-y-0.5">
          <div>{t.map.panel.period}: <b>{mun.rentPeriod || "—"}</b></div>
          {mun.contractsLatest !== null && (
            <div>{t.map.panel.contracts}: <b>{mun.contractsLatest.toLocaleString(locale === "ca" ? "ca-ES" : "es-ES")}</b></div>
          )}
          <div className="flex items-center gap-1">
            {t.map.panel.source}
            <ExternalLink className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* EDIFICI */}
      {(lookup.building?.yearBuilt || lookup.building?.refcat || bAvg) && (
        <div className="rounded-xl border border-[#e5e1da] p-4">
          <div className="text-xs font-semibold text-[#6b6f68] uppercase tracking-wide mb-2">
            {locale === "ca" ? "Edifici" : "Edificio"}
          </div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-[#6b6f68]">{t.map.panel.yearBuilt}</span>
            <b>
              {lookup.building?.yearBuilt
                ? `${lookup.building.yearBuilt.year} (${lookup.building.yearBuilt.source === "CADASTRE_DNP" ? "Cadastre" : lookup.building.yearBuilt.source})`
                : locale === "ca" ? "No disponible" : "No disponible"}
            </b>
          </div>
          {lookup.building?.refcat && (
            <div className="flex justify-between text-sm py-1">
              <span className="text-[#6b6f68]">{t.map.panel.refcat}</span>
              <b className="font-mono text-xs">{lookup.building.refcat}</b>
            </div>
          )}
          {/* Fase 9: dada a nivell d'edifici SI EXISTEIX importació; si no, es diu clar */}
          <div className="flex justify-between text-sm py-1">
            <span className="text-[#6b6f68]">{locale === "ca" ? "Preu real de l'illa" : "Precio real de la manzana"}</span>
            <b>
              {bAvg
                ? `${bAvg.toFixed(0)} €/mes (${bSamples ?? "?"} ${locale === "ca" ? "mostres" : "muestras"})`
                : locale === "ca" ? "No disponible" : "No disponible"}
            </b>
          </div>
        </div>
      )}

      {/* COMPARADOR + ACCIONS */}
      <div className="rounded-xl border-2 border-[#0f2e21] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-[#0f2e21]">{t.map.panel.compare}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFavorite}
              title={locale === "ca" ? "Desa als preferits (Premium)" : "Guarda en favoritos (Premium)"}
              className={`p-1.5 rounded-lg hover:bg-[#f0ede8] ${favState === "saved" ? "text-[#e8673c]" : "text-[#6b6f68]"}`}
            >
              <Star className={`w-4 h-4 ${favState === "saved" ? "fill-[#e8673c]" : ""}`} />
            </button>
            <button
              onClick={downloadPdf}
              title={locale === "ca" ? "Descarrega l'informe PDF (Premium)" : "Descarga el informe PDF (Premium)"}
              className="p-1.5 rounded-lg hover:bg-[#f0ede8] text-[#6b6f68]"
            >
              <FileDown className="w-4 h-4" />
            </button>
          </div>
        </div>
        {favState === "saved" && (
          <div className="mt-2 text-xs text-[#1e7a41]">{locale === "ca" ? "Desat als preferits." : "Guardado en favoritos."}</div>
        )}
        {favState === "plan" && (
          <div className="mt-2 text-xs text-[#8a6116]">
            {locale === "ca" ? "Els preferits són del pla Premium." : "Los favoritos son del plan Premium."}{" "}
            <button onClick={() => navigate("/preus")} className="underline">{t.map.panel.upgrade}</button>
          </div>
        )}
        {favState === "error" && (
          <div className="mt-2 text-xs text-[#b0431c]">{locale === "ca" ? "No s'ha pogut desar ara mateix." : "No se pudo guardar ahora mismo."}</div>
        )}
        {pdfMsg && (
          <div className="mt-2 text-xs text-[#8a6116]">{pdfMsg}</div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-[#6b6f68]">{t.map.panel.yourRent}</label>
            <input
              value={yourRent}
              onChange={(e) => setYourRent(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
              placeholder="950"
            />
          </div>
          <div>
            <label className="text-xs text-[#6b6f68]">{t.map.panel.yourSurface}</label>
            <input
              value={yourM2}
              onChange={(e) => setYourM2(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
              placeholder="65"
            />
          </div>
        </div>
        {delta !== null && (
          <div className={`mt-3 rounded-lg p-3 text-center font-bold ${
            delta > 5 ? "bg-[#fdeae2] text-[#b0431c]" : delta < -5 ? "bg-[#e6f4ea] text-[#1e7a41]" : "bg-[#f0ede8] text-[#4b5349]"
          }`}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%{" "}
            <span className="font-normal text-sm">
              {delta > 5 ? t.map.panel.above : delta < -5 ? t.map.panel.below : t.map.panel.atMarket}
            </span>
          </div>
        )}
        {delta !== null && (
          <div className="mt-1 text-[10px] text-[#6b6f68] text-center">
            {locale === "ca" ? "Comparació amb la MITJANA municipal (dades agregades Incasòl); no és una valoració de l'immoble." : "Comparación con la MEDIA municipal (datos agregados Incasòl); no es una valoración del inmueble."}
          </div>
        )}
        <button
          onClick={() => setReportOpen((v) => !v)}
          className="mt-3 w-full py-2 rounded-lg border border-[#e5e1da] text-xs font-semibold hover:bg-[#f0ede8] flex items-center justify-center gap-1.5"
        >
          <MapPin className="w-3.5 h-3.5" />
          {reportSent ? t.map.panel.reportThanks : t.map.panel.report}
        </button>
        {reportOpen && !reportSent && (
          <div className="mt-2 space-y-2">
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#e5e1da] text-sm"
              aria-label={locale === "ca" ? "Tipus de contracte" : "Tipo de contrato"}
            >
              <option value="HABITATGE">{locale === "ca" ? "Habitatge" : "Vivienda"}</option>
              <option value="HABITATGE_COMPARTIT">{locale === "ca" ? "Habitatge compartit" : "Vivienda compartida"}</option>
              <option value="LOCAL">{locale === "ca" ? "Local comercial" : "Local comercial"}</option>
              <option value="ALTRE">{locale === "ca" ? "Altres" : "Otros"}</option>
            </select>
            <div className="flex gap-2">
              <input
                autoFocus
                value={yourRent}
                onChange={(e) => setYourRent(e.target.value.replace(/[^0-9.]/g, ""))}
                className="flex-1 px-3 py-2 rounded-lg border border-[#e5e1da] text-sm"
                placeholder={t.map.panel.yourRent}
              />
              <button onClick={submitReport} className="px-4 py-2 rounded-lg bg-[#0f2e21] text-white text-sm font-semibold">
                {t.map.panel.reportBtn}
              </button>
            </div>
            {reportError && <div className="text-xs text-[#b0431c]">{reportError}</div>}
          </div>
        )}
      </div>

      {/* HISTÒRIC */}
      {histShow.length > 1 && (
        <div className="rounded-xl border border-[#e5e1da] p-4">
          <div className="text-xs font-semibold text-[#6b6f68] uppercase tracking-wide mb-3">{t.map.panel.history}</div>
          <div className="flex items-end gap-1.5 h-24">
            {histShow.map(([year, v]) => (
              <div key={year} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[#0f2e21]/85 min-h-[3px]"
                  style={{ height: `${(Number(v) / maxVal) * 100}%` }}
                  title={`${year}: ${v} €`}
                />
                <span className="text-[9px] text-[#6b6f68]">{year.slice(2)}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-[#6b6f68] mt-2">{t.map.panel.source}</div>
        </div>
      )}

      {/* QUOTA + UPGRADE */}
      {auth.user?.plan === "FREE" && quota && (
        <div className="rounded-xl bg-[#f0ede8] p-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <b>{quota.limit - quota.used}</b> {t.map.panel.quotaLeft}
          </div>
          <button onClick={() => navigate("/preus")} className="px-3 py-2 rounded-lg bg-[#e8673c] text-white text-sm font-bold hover:bg-[#d95a31] whitespace-nowrap">
            {t.map.panel.upgrade}
          </button>
        </div>
      )}
    </div>
  );
}
