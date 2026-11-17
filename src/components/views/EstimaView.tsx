"use client";

import { useState } from "react";
import { WandSparkles, ListChecks, Home, Info, ExternalLink, FileText, Ruler, MapPin, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/app-context";
import EstimaForm, { type EstimaPayload } from "@/components/estima/EstimaForm";
import EstimaReport from "@/components/estima/EstimaReport";
import { GateLockedPanel } from "@/components/emailfirst/EmailFirst";
import { ESTIMA_LIMITATIONS, ESTIMA_SOURCES, ESTIMA_SERPAVI_URL } from "@/lib/estima";
import { ORIENTATION_DISCLAIMER } from "@/lib/analitza";

/**
 * F2/F3 (redisseny de la Home) — Vista #/estima: «Estima el lloguer del teu
 * habitatge», estimació progressiva: N1 (base estadística oficial Incasòl
 * escalada per superfície) + N2 (ajustos opcionals per estat de conservació
 * i habitacions amb coeficient documentat al motor validat). Resultat SEMPRE
 * en rang orientatiu amb traçabilitat. Mai una valoració individualitzada:
 * vegeu ORIENTATION_DISCLAIMER.
 */
export default function EstimaView() {
  const { locale, auth, navigate } = useApp();
  const ca = locale === "ca";
  const [result, setResult] = useState<EstimaPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const passos = ca
    ? [
        { icon: <MapPin className="w-5 h-5" />, t: "1 · Municipi", d: "Trieu el municipi de l'habitatge: la base és la fiança mitjana registrada a Incasòl per aquell municipi (dada oficial, amb període i nº de contractes visibles)." },
        { icon: <Ruler className="w-5 h-5" />, t: "2 · Superfície i característiques", d: "Introduïu els m² aproximats: la base s'escala amb elasticitat renda-superfície documentada (0,8) sobre l'habitatge típic de 85 m². Estat de conservació i habitacions són OPCIONALS: són els únics ajustos amb coeficient documentat (N2)." },
        { icon: <ListChecks className="w-5 h-5" />, t: "3 · Rang mesurat", d: "L'horquilla no s'inventa: és la dispersió relativa MESURADA dels municipis de la comarca (≥5 amb dada; si no, província ≥10; si no, sèrie històrica)." },
        { icon: <ShieldCheck className="w-5 h-5" />, t: "4 · Traçabilitat i límits", d: "Veureu font, període, nº contractes, fórmula i confiança; si la zona no té mostra suficient, ho direm clarament i t'oferirem SERPAVI — mai cap càlcul poc fiable en silenci." },
      ]
    : [
        { icon: <MapPin className="w-5 h-5" />, t: "1 · Municipio", d: "Elige el municipio de la vivienda: la base es la fianza media registrada en Incasòl para ese municipio (dato oficial, con período y nº de contratos visibles)." },
        { icon: <Ruler className="w-5 h-5" />, t: "2 · Superficie y características", d: "Introduce los m² aproximados: la base se escala con elasticidad renta-superficie documentada (0,8) sobre la vivienda típica de 85 m². Estado de conservación y habitaciones son OPCIONALES: son los únicos ajustes con coeficiente documentado (N2)." },
        { icon: <ListChecks className="w-5 h-5" />, t: "3 · Rango medido", d: "La horquilla no se inventa: es la dispersión relativa MEDIDA de los municipios de la comarca (≥5 con dato; si no, provincia ≥10; si no, serie histórica)." },
        { icon: <ShieldCheck className="w-5 h-5" />, t: "4 · Trazabilidad y límites", d: "Verás fuente, período, nº contratos, fórmula y confianza; si la zona no tiene muestra suficiente, lo diremos claramente y te ofreceremos SERPAVI — nunca un cálculo poco fiable en silencio." },
      ];

  return (
    <div className="w-full bg-cream">
      <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        {/* capçalera */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-semibold mb-4">
            <WandSparkles className="w-4 h-4 text-mint" />
            {ca ? "Nou · nivells N1 + N2 · gratuït amb registre Free" : "Nuevo · niveles N1 + N2 · gratuito con registro Free"}
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {ca ? "Valora el lloguer del teu habitatge" : "Valora el alquiler de tu vivienda"}
          </h1>
          <p className="mt-3 text-moss leading-relaxed">
            {ca
              ? "Una valoració progressiva per passos: el nivell N1 calcula un RANG orientatiu amb la base oficial registrada (fiances Incasòl) escalada per superfície, i el nivell N2 hi afegeix els ajustos opcionals amb coeficient documentat (estat de conservació i habitacions). Cada xifra ve amb la seva font, el període, els contractes, els ajustos amb el seu factor i les limitacions. Aquesta eina NO fa taxacions oficials ni avaluacions individualitzades."
              : "Una valoración progresiva por pasos: el nivel N1 calcula un RANGO orientativo con la base oficial registrada (fianzas Incasòl) escalada por superficie, y el nivel N2 añade los ajustos opcionales con coeficiente documentado (estado de conservación y habitaciones). Cada cifra viene con su fuente, el período, los contratos, los ajustos con su factor y las limitaciones. Esta herramienta NO hace tasaciones oficiales ni evaluaciones individualizadas."}
          </p>
          <p className="mt-2 text-xs text-stone leading-relaxed">
            {ca ? ORIENTATION_DISCLAIMER.ca : ORIENTATION_DISCLAIMER.es}
          </p>
        </div>

        <div className="mt-8 grid lg:grid-cols-2 gap-8 items-start">
          {/* formulari */}
          <div className="rounded-2xl border border-line bg-card p-5 md:p-6 shadow-xl shadow-black/5">
            <h2 className="font-extrabold text-lg mb-1">{ca ? "Les dades (N1 + N2)" : "Los datos (N1 + N2)"}</h2>
            <p className="text-xs text-stone mb-4">
              {ca
                ? "Només demanem el que el càlcul usa: municipi i superfície, i opcionalment estat de conservació i habitacions (els únics ajustos amb coeficient documentat). Ascensor, aparcament, moblat, planta o energia NO es demanen: sense coeficient documentat, no s'apliquen ni s'inventen."
                : "Solo pedimos lo que el cálculo usa: municipio y superficie, y opcionalmente estado de conservación y habitaciones (los únicos ajustes con coeficiente documentado). Ascensor, aparcamiento, amueblado, planta o energía NO se piden: sin coeficiente documentado, no se aplican ni se inventan."}
            </p>
            <EstimaForm
              key={formKey}
              variant="full"
              onResult={(d) => setResult(d)}
              onLoadingChange={setLoading}
            />
          </div>

          {/* resultat + com funciona */}
          <div className="flex flex-col gap-6">
            {result ? (
              <EstimaReport
                data={result}
                variant="full"
                onRetry={() => { setResult(null); setFormKey((k) => k + 1); }}
              />
            ) : !auth.user ? (
              // v46 — el panell de resultats NEIX BLOQUEJAT sense compte:
              // «Registra't primer» (el bloqueig real és al servidor: 401)
              <GateLockedPanel ca={ca} onSignup={() => navigate("/registre")} />
            ) : (
              <div className="rounded-2xl border border-line bg-card p-6 text-sm text-stone leading-relaxed">
                <p className="font-semibold text-moss flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-pine" />
                  {ca ? "Què veuràs al resultat:" : "Qué verás en el resultado:"}
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  <li><b>{ca ? "Rang orientatiu" : "Rango orientativo"}</b> — {ca ? "«entre X i Y €/mes»: mai una xifra única de taxació." : "«entre X y Y €/mes»: nunca una cifra única de tasación."}</li>
                  <li><b>{ca ? "Traçabilitat" : "Trazabilidad"}</b> — {ca ? "base Incasòl, període, nº contractes, fórmula i dispersió mesurada." : "base Incasòl, período, nº contratos, fórmula y dispersión medida."}</li>
                  <li><b>{ca ? "Degradació honesta" : "Degradación honesta"}</b> — {ca ? "si la zona no té mostra: «dades insuficients» + consulta oficial SERPAVI." : "si la zona no tiene muestra: «datos insuficientes» + consulta oficial SERPAVI."}</li>
                </ul>
                <p className="mt-3 text-xs">
                  {loading
                    ? (ca ? "Calculant amb la base oficial…" : "Calculando con la base oficial…")
                    : (ca
                      ? "Gratuït amb registre Free: el resultat ve de fonts oficials (Incasòl) amb constants documentades i sempre amb les limitacions explicades. L'e-mail només identifica el compte i aplica la quota (3 consultes detallades al mes)."
                      : "Gratuito con registro Free: el resultado viene de fuentes oficiales (Incasòl) con constantes documentadas y siempre con las limitaciones explicadas. El e-mail solo identifica la cuenta y aplica la cuota (3 consultas detalladas al mes).")}
                </p>
              </div>
            )}

            {/* com funciona (4 passos) */}
            <div className="rounded-2xl border border-line bg-card p-5 md:p-6">
              <h2 className="font-extrabold text-lg mb-4">{ca ? "Com funcionen els nivells N1 i N2" : "Cómo funcionan los niveles N1 y N2"}</h2>
              <ol className="flex flex-col gap-3.5">
                {passos.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-xl bg-pine text-white flex items-center justify-center shrink-0">{p.icon}</span>
                    <div>
                      <div className="font-bold text-sm">{p.t}</div>
                      <p className="text-[13px] text-moss leading-relaxed mt-0.5">{p.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-stone leading-relaxed">
                {ca
                  ? "Full de ruta honest: el N3 (rang per secció censal amb metodologia oficial) només el pot calcular SERPAVI, que treballa amb fonts tributàries no públiques en bloc: aquesta eina NO simula consultes oficials ni inventa rangs per secció — t'oferim sempre la consulta oficial. Mentre tant, el rang amb validesa legal només el dóna SERPAVI."
                  : "Hoja de ruta honesta: el N3 (rango por sección censal con metodología oficial) solo lo puede calcular SERPAVI, que trabaja con fuentes tributarias no públicas en bloque: esta herramienta NO simula consultas oficiales ni inventa rangos por sección — te ofrecemos siempre la consulta oficial. Mientras tanto, el rango con validez legal solo lo da SERPAVI."}
              </p>
              <a
                href={ESTIMA_SERPAVI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full rounded-xl bg-pine text-white font-bold text-sm px-4 py-3 hover:bg-pine/90 transition-colors flex items-center justify-center gap-2 min-h-[48px]"
              >
                <ExternalLink className="w-4 h-4" />
                {ca ? "Consulta el rang oficial a SERPAVI" : "Consulta el rango oficial en SERPAVI"}
              </a>
            </div>
          </div>
        </div>

        {/* fonts i limitacions */}
        <div className="mt-10 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-line bg-card p-5">
            <h2 className="font-extrabold text-base mb-3 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-pine" />
              {ca ? "Fonts" : "Fuentes"}
            </h2>
            <ul className="flex flex-col gap-2.5 text-[13px] leading-relaxed">
              {ESTIMA_SOURCES.map((s, i) => (
                <li key={i}>
                  <a href={s.u} target="_blank" rel="noopener noreferrer" className="font-bold text-pine hover:underline">{s.t}</a>
                  <span className="text-stone"> — {s.d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-card p-5">
            <h2 className="font-extrabold text-base mb-3 flex items-center gap-1.5">
              <Home className="w-4 h-4 text-pine" />
              {ca ? "Limitacions conegudes" : "Limitaciones conocidas"}
            </h2>
            <ul className="flex flex-col gap-2 text-[13px] text-moss leading-relaxed">
              {ESTIMA_LIMITATIONS.map((l, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-ember shrink-0" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
