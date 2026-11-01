"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useApp } from "@/components/app-context";
import { Flame, MapPin, Search, X, Building2, TrendingUp, TrendingDown, Minus, Info, ExternalLink } from "lucide-react";

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

interface LookupResult {
  kind: "full" | "teaser";
  building?: { id?: string; refcat?: string | null; yearBuilt?: { year: number; source: string } | null; tipus?: string | null; altura?: number | null; nom?: string | null };
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
}

function rentColor(rent: number | null | undefined): string {
  if (!rent) return "#9aa5a0";
  if (rent < 550) return "#63b57c";
  if (rent < 700) return "#93c47d";
  if (rent < 850) return "#e5c46a";
  if (rent < 1000) return "#e89a4b";
  return "#dd5a35";
}

export default function MapView() {
  const { t, locale, auth, navigate } = useApp();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const boundaryRef = useRef<any>(null);
  const selectedRef = useRef<any>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MunLite[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedMun, setSelectedMun] = useState<MunLite | null>(null);
  const [zoomHint, setZoomHint] = useState(false);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<"closed" | "loading" | "teaser" | "full" | "paywall">("closed");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(auth.quota);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

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
        return;
      }
      const data = await res.json();
      drawBuildings(data.buildings || []);
    } catch {
      setBuildingsError("service");
    } finally {
      setLoadingBuildings(false);
    }
     
  }, []);

  // recarrega edificis quan canvia l'idioma/sessió per refrescar colors i accés
  useEffect(() => {
    loadBuildingsInView();
     
  }, [locale]);

  const drawBuildings = useCallback((buildings: any[]) => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    for (const b of buildings) {
      let color = "#9aa5a0";
      if (b.munRent) color = rentColor(b.munRent);
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
    }
     
  }, []);

  const lookupSeqRef = useRef(0);

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
    setPanelState("loading");
    setLookup(null);
    setDemoNotice(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, buildingId: b.id }),
      });
      if (seq !== lookupSeqRef.current) return; // respuesta obsoleta
      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        setLookup(d);
        setPanelState("paywall");
        return;
      }
      const d: LookupResult = await res.json();
      if (seq !== lookupSeqRef.current) return; // respuesta obsoleta
      setLookup(d);
      setPanelState(d.kind === "full" ? "full" : "teaser");
      if (d.kind === "full" && d.quota) setQuota(d.quota);
    } catch {
      if (seq === lookupSeqRef.current) setPanelState("closed");
    }
  }, []);

  // ---- Cercador de municipis ----
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/municipalities?q=${encodeURIComponent(query.trim())}&limit=8`);
        const d = await res.json();
        setResults(d.municipalities || []);
        setShowResults(true);
      } catch {}
    }, 220);
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
      setDemoNotice("Error de xarxa");
    }
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
                onFocus={() => results.length && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 180)}
                placeholder={t.map.searchPlaceholder}
                className="w-full px-2 py-3 text-sm outline-none bg-transparent"
                aria-label={t.map.searchPlaceholder}
              />
              {query && (
                <button onClick={() => { setQuery(""); setSelectedMun(null); boundaryRef.current?.clearLayers(); }}>
                  <X className="w-4 h-4 text-[#6b6f68]" />
                </button>
              )}
            </div>
            {showResults && results.length > 0 && (
              <div className="absolute mt-1 w-full bg-white rounded-xl shadow-xl border border-[#e5e1da] overflow-hidden max-h-80 overflow-y-auto pr-scroll">
                {results.map((m) => (
                  <button
                    key={m.code}
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

            {/* FULL */}
            {panelState === "full" && lookup?.municipality && (
              <FullPanel
                lookup={lookup}
                quota={quota}
                t={t}
                navigate={navigate}
                doCheckout={doCheckout}
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
  lookup, quota, t, navigate, doCheckout,
}: {
  lookup: LookupResult;
  quota: { used: number; limit: number } | null;
  t: any;
  navigate: (r: string) => void;
  doCheckout: (p: "PREMIUM" | "PRO") => void;
}) {
  const { locale, auth } = useApp();
  const mun = lookup.municipality!;
  const [yourRent, setYourRent] = useState("");
  const [yourM2, setYourM2] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);

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
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        municipalityCode: mun.code,
        buildingId: lookup.building?.id || null,
        offerEurMonth: yourRentNum || undefined,
        surfaceM2: parseFloat(yourM2) || undefined,
      }),
    });
    setReportSent(true);
    setReportOpen(false);
  };

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
      {(lookup.building?.yearBuilt || lookup.building?.refcat) && (
        <div className="rounded-xl border border-[#e5e1da] p-4">
          <div className="text-xs font-semibold text-[#6b6f68] uppercase tracking-wide mb-2">
            {locale === "ca" ? "Edifici" : "Edificio"}
          </div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-[#6b6f68]">{t.map.panel.yearBuilt}</span>
            <b>
              {lookup.building?.yearBuilt
                ? `${lookup.building.yearBuilt.year} (${lookup.building.yearBuilt.source === "CADASTRE_DNP" ? "Cadastre" : lookup.building.yearBuilt.source})`
                : lookup.building?.refcat ? t.map.panel.yearUnavailable : "—"}
            </b>
          </div>
          {lookup.building?.refcat && (
            <div className="flex justify-between text-sm py-1">
              <span className="text-[#6b6f68]">{t.map.panel.refcat}</span>
              <b className="font-mono text-xs">{lookup.building.refcat}</b>
            </div>
          )}
        </div>
      )}

      {/* COMPARADOR */}
      <div className="rounded-xl border-2 border-[#0f2e21] p-4">
        <div className="font-bold text-[#0f2e21]">{t.map.panel.compare}</div>
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
        <button
          onClick={() => setReportOpen(true)}
          className="mt-3 w-full py-2 rounded-lg border border-[#e5e1da] text-xs font-semibold hover:bg-[#f0ede8] flex items-center justify-center gap-1.5"
        >
          <MapPin className="w-3.5 h-3.5" />
          {reportSent ? t.map.panel.reportThanks : t.map.panel.report}
        </button>
        {reportOpen && !reportSent && (
          <div className="mt-2 flex gap-2">
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

      {auth.user && auth.user.plan !== "FREE" && (
        <button onClick={() => doCheckout(auth.user!.plan === "FREE" ? "PREMIUM" : "PRO")} className="hidden" />
      )}
    </div>
  );
}
