"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Info, Printer,
  ArrowRight, FileText, Loader2, MapPin, ExternalLink,
} from "lucide-react";
import { useApp } from "@/components/app-context";
import type { AnalitzaReportData, ServeisPayload, Locale2 } from "@/lib/analitza-html";
import { buildReportHtml, verdictNote, VERDICT_LABELS, STATE_LABELS, NORM_CHECK_LABELS, CHECKLIST_LABELS, CATEGORY_LABELS } from "@/lib/analitza-html";
import { ORIENTATION_DISCLAIMER, SERPAVI_URL } from "@/lib/analitza";
import { saveEmailFirstDraft } from "@/lib/email-first";

/**
 * F1 — Informe «Consulta el preu real registrat» (blocs A-D). Comparació
 * estadística + normativa + ubicació + checklist; MAI una valoració
 * individualitzada (vegeu ORIENTATION_DISCLAIMER).
 * variant "compact": capçalera ràpida a la portada (veredicte + diferència +
 * estat normatiu + CTA a l'informe complet).
 * variant "full": informe complet amb llista de comprovació marcable i
 * descàrrega (imprimir a PDF via finestra nova amb HTML autocontingut).
 */

const CHECK_KEY = "pr_analitza_checklist";

function fmtEur(n: number, ca: boolean) {
  return `${Math.round(n).toLocaleString(ca ? "ca-ES" : "es-ES")} €`;
}
function fmtPct(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`;
}

export default function AnalitzaReport({
  data,
  variant,
}: {
  data: AnalitzaReportData;
  variant: "compact" | "full";
}) {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const [serveis, setServeis] = useState<ServeisPayload | null>(null);
  const [serveisLoading, setServeisLoading] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // C. serveis d'entorn: crida després del preu (segona petició, degradació elegant).
  // setState diferit amb await (patró MapView) per no disparar renders en cascada.
  useEffect(() => {
    if (variant !== "full") return;
    const p = data.serveisPoint;
    if (!p?.lat || !p?.lng) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setServeisLoading(true);
      try {
        const res = await fetch("/api/analitza/serveis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: p.lat, lng: p.lng }),
        });
        const d = await res.json();
        if (!cancelled) setServeis(d);
      } catch {
        if (!cancelled) setServeis({ ok: false });
      } finally {
        if (!cancelled) setServeisLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, data.serveisPoint?.lat, data.serveisPoint?.lng]);

  // D. checklist persistida localment (només booleans, sense dades personals)
  useEffect(() => {
    if (variant !== "full") return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(CHECK_KEY);
        if (raw) setChecked(JSON.parse(raw));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [variant]);
  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(CHECK_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const p = data.price;
  const i = data.input;
  const verdictLabel = p.verdict ? VERDICT_LABELS[p.verdict][locale] : ca ? "sense referència comparable" : "sin referencia comparable";
  const note = useMemo(() => verdictNote(p.verdict, locale as Locale2), [p.verdict, locale]);
  const refIsEstimate = p.referenceIsEstimate;

  const stateIcon = (s: string) =>
    s === "OK" ? <CheckCircle2 className="w-4 h-4 text-pine shrink-0" />
    : s === "PENDING" ? <CircleDashed className="w-4 h-4 text-ember3 shrink-0" />
    : s === "ALERT" ? <AlertTriangle className="w-4 h-4 text-ember3 shrink-0" />
    : s === "INFO" ? <Info className="w-4 h-4 text-pine shrink-0" />
    : <CircleSlash className="w-4 h-4 text-stone shrink-0" />;
  const stateText = (s: string) => (STATE_LABELS[s]?.[locale as Locale2] ?? s);
  const normLabel = (c: { id: string; detail: string }) => NORM_CHECK_LABELS[`${c.id}|${c.detail}`]?.[locale as Locale2] ?? c.detail;

  const openFull = () => {
    // v46 — esborrany email-first (mateixa mecànica que el flux de registre):
    // la vista full el consumeix i, amb sessió, executa la consulta sola.
    saveEmailFirstDraft("analitza", { values: { ...data.input } as never, email: "", autoRun: true });
    navigate("/analitza");
  };

  const downloadPdf = () => {
    try {
      const html = buildReportHtml(data, serveis, locale as Locale2, checked);
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (!w) return;
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    } catch {
      // finestra bloquejada: res crític, l'informe segueix a la pàgina
    }
  };

  if (variant === "compact") {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-card border border-line py-3">
            <div className="font-black text-pine text-lg leading-none">{fmtEur(i.priceEurMonth, ca)}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone mt-1">{ca ? "el teu anunci" : "tu anuncio"}</div>
          </div>
          <div className="rounded-xl bg-card border border-line py-3">
            <div className="font-black text-pine text-lg leading-none">{p.reference != null ? fmtEur(p.reference, ca) : "—"}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone mt-1">
              {refIsEstimate ? (ca ? "ref. comarca (est.)" : "ref. comarca (est.)") : (ca ? "fiança municipal" : "fianza municipal")}
            </div>
          </div>
          <div className="rounded-xl bg-card border border-line py-3">
            <div className={`font-black text-lg leading-none ${p.deltaVsReferencePct != null && p.deltaVsReferencePct > 15 ? "text-ember3" : "text-pine"}`}>{fmtPct(p.deltaVsReferencePct)}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone mt-1">{ca ? "diferència" : "diferencia"}</div>
          </div>
        </div>
        <p className="text-sm text-moss leading-relaxed">
          <b>{ca ? "Lectura:" : "Lectura:"}</b> {verdictLabel}
          {data.normative.tense && (
            <span className="inline-flex items-center gap-1 text-ember3 font-semibold"> · <AlertTriangle className="w-3.5 h-3.5 inline" />{ca ? "zona tensada" : "zona tensionada"}</span>
          )}
        </p>
        <p className="text-[11px] text-stone leading-relaxed">{ca ? ORIENTATION_DISCLAIMER.ca : ORIENTATION_DISCLAIMER.es}</p>
        <button
          onClick={openFull}
          className="w-full rounded-xl border border-line bg-card font-semibold hover:bg-sand transition-colors flex items-center justify-center gap-2 min-h-[48px]"
        >
          <FileText className="w-4 h-4" />
          {ca ? "Obre l'informe complet (normativa, ubicació, checklist)" : "Abre el informe completo (normativa, ubicación, checklist)"}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── informe complet ──
  const catItems = (cat: string) => (serveis?.items ?? []).filter((x) => x.category === cat).slice(0, 5);
  const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);

  return (
    <div className="flex flex-col gap-4">
      {/* encapçalament + descàrrega */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-lg">{ca ? "Informe d'anàlisi del lloguer" : "Informe de análisis del alquiler"}</h3>
            <p className="text-sm text-stone mt-0.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-pine" />
              {i.address ? `${i.address} · ` : ""}{i.municipalityName} ({i.comarca ?? "—"})
            </p>
          </div>
          <button onClick={downloadPdf} className="rounded-xl border border-line bg-card font-semibold hover:bg-sand transition-colors flex items-center gap-2 px-4 min-h-[44px] text-sm">
            <Printer className="w-4 h-4" />
            {ca ? "Descarrega l'informe (PDF)" : "Descarga el informe (PDF)"}
          </button>
        </div>
        <p className="text-[11px] text-stone mt-2">
          {ca ? "Generat" : "Generado"} {new Date(data.generatedAt).toLocaleString(ca ? "ca-ES" : "es-ES")} · {ca ? "informe gratuït, sense dades personals" : "informe gratuito, sin datos personales"}
        </p>
        <p className="text-[11px] text-stone mt-1.5 font-semibold">{ca ? ORIENTATION_DISCLAIMER.ca : ORIENTATION_DISCLAIMER.es}</p>
      </div>

      {/* A. PREU */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="font-extrabold text-lg">{ca ? "A. Anàlisi del preu" : "A. Análisis del precio"}</h3>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-cream border border-line py-3">
            <div className="font-black text-pine">{fmtEur(i.priceEurMonth, ca)}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone mt-1">{ca ? "preu de l'anunci" : "precio del anuncio"}</div>
          </div>
          <div className="rounded-xl bg-cream border border-line py-3">
            <div className="font-black text-pine">{p.eurM2 != null ? p.eurM2.toFixed(2).replace(".", ",") : "—"}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone mt-1">€/m²·{ca ? "mes" : "mes"}</div>
          </div>
          <div className="rounded-xl bg-cream border border-line py-3">
            <div className="font-black text-pine">{p.reference != null ? fmtEur(p.reference, ca) : "—"}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone mt-1">
              {refIsEstimate ? (ca ? "ref. comarca (estimació)" : "ref. comarca (estimación)") : (ca ? "fiança municipal oficial" : "fianza municipal oficial")}
            </div>
          </div>
          <div className="rounded-xl bg-cream border border-line py-3">
            <div className={`font-black ${p.deltaVsReferencePct != null && p.deltaVsReferencePct > 15 ? "text-ember3" : "text-pine"}`}>{fmtPct(p.deltaVsReferencePct)}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone mt-1">{ca ? "diferència" : "diferencia"}</div>
          </div>
        </div>
        <p className="text-sm mt-3 leading-relaxed">
          <b>{ca ? "Lectura:" : "Lectura:"}</b> {verdictLabel}
          {p.referencePeriod ? ` · ${ca ? "període" : "período"} ${p.referencePeriod}` : ""}
          {p.referenceContracts != null ? ` · ${p.referenceContracts} ${ca ? "contractes al període" : "contratos en el período"}` : ""}
        </p>
        {note && <p className="text-xs text-moss mt-2 leading-relaxed bg-sand2 rounded-xl p-3">{note}</p>}
        <p className="text-[11px] text-stone mt-2 leading-relaxed">
          {ca
            ? "La referència és la fiança mitjana de la vivenda TÍPICA del municipi (Incasòl): no és el preu real de l'edifici ni de la vivenda concreta."
            : "La referencia es la fianza media de la vivienda TÍPICA del municipio (Incasòl): no es el precio real del edificio ni de la vivienda concreta."}
        </p>

        {/* comparativa per característiques (estimació orientativa, mai taxació) */}
        {p.expected && (
          <div className="mt-3 rounded-xl border border-sand3 bg-cream p-4">
            <div className="text-xs font-bold text-pine">{ca ? "Comparativa per a aquestes característiques (estimació orientativa amb ajustos visibles)" : "Comparativa para estas características (estimación orientativa con ajustes visibles)"}</div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><b>{fmtEur(p.expected.central, ca)}</b> {ca ? "central orientativa" : "central orientativa"}</span>
              <span className="text-stone">{fmtEur(p.expected.min, ca)} – {fmtEur(p.expected.max, ca)} {ca ? "banda" : "banda"}</span>
              <span className="text-stone">{ca ? "confiança" : "confianza"}: <b>{p.expected.confidence}</b></span>
              {p.deltaVsExpectedPct != null && <span><b>{fmtPct(p.deltaVsExpectedPct)}</b> {ca ? "diferència amb el central" : "diferencia con el central"}</span>}
            </div>
            {p.expected.adjustments?.length > 0 && (
              <p className="text-[11px] text-stone mt-2">
                {ca ? "Ajustos aplicats:" : "Ajustos aplicados:"} {p.expected.adjustments.map((a) => `${a.key.replace("AJUST_", "").toLowerCase()} (${a.detail} ×${a.factor})`).join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* evolució */}
        {p.evolution.length >= 2 && (
          <div className="mt-3">
            <div className="text-xs font-bold text-pine mb-1">{ca ? "Evolució anual registrada (fiances Incasòl)" : "Evolución anual registrada (fianzas Incasòl)"}</div>
            <div className="flex flex-wrap gap-1.5">
              {p.evolution.slice(-8).map((e) => (
                <span key={e.year} className="text-xs rounded-lg bg-sand2 px-2 py-1"><b>{e.year}</b> {fmtEur(e.value, ca)}</span>
              ))}
            </div>
            {p.interannual.length > 0 && (
              <p className="text-[11px] text-stone mt-1.5">
                {ca ? "Variació interanual recent:" : "Variación interanual reciente:"}{" "}
                {p.interannual.slice(-3).map((x) => `${x.year}: ${fmtPct(x.pct)}`).join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* propers */}
        {p.neighbours.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-bold text-pine mb-1">{ca ? "Municipis propers amb dada oficial" : "Municipios próximos con dato oficial"}</div>
            <div className="flex flex-wrap gap-1.5">
              {p.neighbours.map((n) => (
                <span key={n.code} className="text-xs rounded-lg bg-sand2 px-2 py-1">
                  <b>{n.name}</b> {n.rentLatest != null ? `${fmtEur(n.rentLatest, ca)}` : "—"} · {n.distanceKm.toFixed(1).replace(".", ",")} km
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* B. NORMATIVA */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="font-extrabold text-lg">{ca ? "B. Comprovació normativa" : "B. Comprobación normativa"}</h3>
        <p className="text-[11px] text-stone mt-1">
          {ca
            ? "Estats informatius — mai una declaració de legalitat: el resultat depèn de dades que només tu pots confirmar (contracte anterior, gran tenedor, referència catastral)."
            : "Estados informativos — nunca una declaración de legalidad: el resultado depende de datos que solo tú puedes confirmar (contrato anterior, gran tenedor, referencia catastral)."}
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {data.normative.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5 text-sm leading-relaxed">
              {stateIcon(c.state)}
              <span>
                <span className={`font-bold ${c.state === "ALERT" ? "text-ember3" : c.state === "OK" || c.state === "INFO" ? "text-pine" : c.state === "PENDING" ? "text-ember3" : "text-stone"}`}>
                  {stateText(c.state)}
                </span>{" "}
                — {normLabel(c)}
              </span>
            </li>
          ))}
        </ul>
        {data.normative.tense && (
          <div className="mt-3 rounded-xl bg-embersoft border border-sand3 p-3.5">
            <p className="text-xs text-ember3 leading-relaxed font-semibold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {ca
                  ? "Zona tensada (Llei 12/2023, LAU art. 17.2): els nous contractes d'habitatge habitual de grans tenidors tenen el límit de renta del darrer contracte dels 5 anys anteriors; si l'habitatge porta 5 anys o més sense llogar (o és de nova construcció), el límit és el rang oficial de referència."
                  : "Zona tensionada (Ley 12/2023, LAU art. 17.2): los nuevos contratos de vivienda habitual de grandes tenedores tienen el límite de renta del último contrato de los 5 años anteriores; si la vivienda lleva 5 años o más sin alquilar (o es de nueva construcción), el límite es el rango oficial de referencia."}
              </span>
            </p>
            <a
              href={SERPAVI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-pine text-white text-xs font-bold px-3.5 py-2.5 hover:bg-pine/90 transition-colors min-h-[44px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {ca ? "Consulta el rang oficial a SERPAVI" : "Consulta el rango oficial en SERPAVI"}
            </a>
          </div>
        )}
        <div className="mt-3 text-[11px] text-stone leading-relaxed">
          <b>{ca ? "Consulta oficial:" : "Consulta oficial:"}</b>{" "}
          <a className="underline text-pine" href={data.normative.serpaviUrl} target="_blank" rel="noopener noreferrer">
            {ca ? "calculadora de preus del MIVAU (SERPAVI)" : "calculadora de precios del MIVAU (SERPAVI)"}
          </a>
          {" · "}
          {ca ? "índex a Catalunya (Agència d'Habitatge)" : "índice en Cataluña (Agència d'Habitatge)"}:{" "}
          <a className="underline text-pine" href="https://agenciahabitatge.gencat.cat/indexdelloguer" target="_blank" rel="noopener noreferrer">indexdelloguer</a>
          {" · "}
          {ca ? "data de consulta normativa" : "fecha de consulta normativa"}: {data.normative.consultedAt}
          {" · "}
          {data.normative.resolutions.join(" · ")}
        </div>
      </div>

      {/* C. UBICACIÓ */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="font-extrabold text-lg">{ca ? "C. Ubicació: serveis propers" : "C. Ubicación: servicios próximos"}</h3>
        <p className="text-[11px] text-stone mt-1">
          {data.serveisPoint.scope === "VIVENDA"
            ? (ca ? "Al voltant del punt marcat (ràdio 800 m, distàncies en línia recta — aproximades)." : "Alrededor del punto marcado (radio 800 m, distancias en línea recta — aproximadas).")
            : (ca ? "Al voltant del centre del municipi (no hem pogut geolocalitzar l'adreça concreta)." : "Alrededor del centro del municipio (no hemos podido geolocalizar la dirección concreta).")}
        </p>
        {serveisLoading && (
          <p className="mt-3 text-sm text-stone flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{ca ? "Consultant serveis propers (OpenStreetMap)…" : "Consultando servicios próximos (OpenStreetMap)…"}</p>
        )}
        {!serveisLoading && serveis == null && (
          <p className="mt-3 text-sm text-stone">{ca ? "Serveis no consultats." : "Servicios no consultados."}</p>
        )}
        {!serveisLoading && serveis && !serveis.ok && (
          <p className="mt-3 text-sm text-ember3">{serveis.message ?? (ca ? "El servei de dades d'entorn no ha respòs; reintenta més tard." : "El servicio de datos de entorno no ha respondido; reintenta más tarde.")}</p>
        )}
        {!serveisLoading && serveis?.ok && (
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            {(["TRANSPORT", "SALUT", "EDUCACIO", "COMPRA", "VERD"] as const).map((cat) => {
              const items = catItems(cat);
              return (
                <div key={cat} className="rounded-xl bg-cream border border-line p-3.5">
                  <div className="text-xs font-bold text-pine">{CATEGORY_LABELS[cat][locale as Locale2]}</div>
                  {items.length === 0 ? (
                    <p className="text-xs text-stone mt-1.5">{ca ? "Cap element registrat a prop en dades obertes." : "Ningún elemento registrado cerca en datos abiertos."}</p>
                  ) : (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {items.map((x, ix) => (
                        <li key={`${x.name}-${ix}`} className="text-xs flex justify-between gap-2">
                          <span className="text-moss truncate">{x.name}</span>
                          <span className="text-stone shrink-0">{dist(x.distanceM)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <div className="md:col-span-2 text-[11px] text-stone leading-relaxed">
              {ca
                ? "Font: OpenStreetMap (ODbL, dades col·laboratives de resolució variable) via Overpass. Distàncies en línia recta, no temps reals de trajecte. Pendent d'integrar amb fonts oficials: mapa de soroll de Catalunya, qualitat de l'aire (XVPCA), risc d'inundació (SINCRO/ICGC) i cobertura de fibra — no s'inventen valors."
                : "Fuente: OpenStreetMap (ODbL, datos colaborativos de resolución variable) vía Overpass. Distancias en línea recta, no tiempos reales de trayecto. Pendiente de integrar con fuentes oficiales: mapa de ruido de Cataluña, calidad del aire (XVPCA), riesgo de inundación (SINCRO/ICGC) y cobertura de fibra — no se inventan valores."}
            </div>
          </div>
        )}
      </div>

      {/* D. ABANS DE SIGNAR */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="font-extrabold text-lg">{ca ? "D. Abans de signar — llista de comprovació" : "D. Antes de firmar — lista de comprobación"}</h3>
        <p className="text-[11px] text-stone mt-1">{ca ? "Marca el que ja has revisat (es recorda en aquest navegador)." : "Marca lo que ya has revisado (se recuerda en este navegador)."}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {data.checklist.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => toggleCheck(c.id)}
                className={`w-full text-left flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors min-h-[44px] ${checked[c.id] ? "border-pine bg-sand2" : "border-line bg-cream hover:bg-sand"}`}
              >
                {checked[c.id] ? <CheckCircle2 className="w-4 h-4 text-pine shrink-0 mt-0.5" /> : <CircleDashed className="w-4 h-4 text-stone shrink-0 mt-0.5" />}
                <span>
                  <span className={checked[c.id] ? "font-semibold" : ""}>{CHECKLIST_LABELS[c.id]?.[locale as Locale2] ?? c.id}</span>
                  {c.source && <span className="block text-[10px] text-stone mt-0.5">{c.source}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Fonts i limitacions */}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h3 className="font-extrabold text-lg">{ca ? "Fonts, limitacions i precisió" : "Fuentes, limitaciones y precisión"}</h3>
        <ul className="mt-2 flex flex-col gap-1.5 text-xs text-moss leading-relaxed">
          {data.sources.map((s, ix) => (
            <li key={ix}>
              <b>{s.t}</b> — <a className="underline text-pine" href={s.u} target="_blank" rel="noopener noreferrer">{s.u}</a> · {s.d}
            </li>
          ))}
        </ul>
        <ul className="mt-3 flex flex-col gap-1.5 text-xs text-stone leading-relaxed">
          {data.limitations.map((l, ix) => (
            <li key={ix}>· {l}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => navigate("/mapa")} className="rounded-xl border border-line bg-card font-semibold hover:bg-sand transition-colors flex items-center gap-2 px-4 min-h-[44px] text-sm">
            <MapPin className="w-4 h-4" />{ca ? "Torna al mapa" : "Vuelve al mapa"}
          </button>
          <button onClick={() => navigate("/comparador")} className="rounded-xl border border-line bg-card font-semibold hover:bg-sand transition-colors flex items-center gap-2 px-4 min-h-[44px] text-sm">
            {ca ? "Anar al comparador" : "Ir al comparador"}<ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
