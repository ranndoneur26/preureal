"use client";

import { useEffect, useState } from "react";
import { Database, Scale, ShieldCheck, AlertTriangle, FileText } from "lucide-react";
import { useApp } from "@/components/app-context";

/**
 * #/metodologia — Transparència metodològica.
 * Consumeix l'API pública /api/provenance (registre de proveniència v19/Fase 9)
 * i afegeix les limitacions conegudes i el cicle d'actualització de dades.
 * Tot el text és bilingüe inline (patró CookieConsent/OnboardingTour).
 */

type Dataset = {
  id: string;
  nom: string;
  font: string;
  llicencia: string;
  unitat: string;
  ambit: string;
  periodicitat: string;
  metodologia: string;
  qualitat: string;
};

type IneStatus = {
  ok?: boolean;
  ultimasImportaciones?: Array<{
    source: string;
    status: string;
    rowsTotal: number | null;
    createdAt: string;
    error?: string | null;
  }>;
};

const QUALITY_STYLES: Record<string, string> = {
  ALTA: "bg-mintsoft text-mossdeep border-mintline",
  MITJANA: "bg-ambersoft text-ambertext border-amberline",
  DECLARATIU: "bg-sand text-stone border-line",
  EDITORIAL: "bg-sand text-stone border-line",
};

function qualityStyle(q: string): string {
  if (q.startsWith("ALTA")) return QUALITY_STYLES.ALTA;
  if (q.startsWith("MITJANA")) return QUALITY_STYLES.MITJANA;
  if (q.startsWith("EDITORIAL") || q.startsWith("DECLARATIU")) return QUALITY_STYLES.EDITORIAL;
  return "bg-embersoft text-ember3 border-emberline"; // SEGONS FONT / altres
}

export default function MetodologiaView() {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [principis, setPrincipis] = useState<string[]>([]);
  const [ine, setIne] = useState<IneStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rp, ri] = await Promise.all([
          fetch("/api/provenance", { cache: "no-store" }),
          fetch("/api/ine/status", { cache: "no-store" }),
        ]);
        const dp = await rp.json();
        let di: IneStatus = {};
        try { di = await ri.json(); } catch {}
        if (!alive) return;
        setDatasets(Array.isArray(dp.datasets) ? dp.datasets : []);
        setPrincipis(Array.isArray(dp.principis) ? dp.principis : []);
        setIne(di);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const limitacions = ca
    ? [
        "Les fiances d'Incasòl es publiquen amb retard: el període vigent acostuma a tancar-se aproximadament un any després. La sèrie històrica disponible arriba fins a on la Generalitat ha publicat.",
        "254 municipis no tenen mitjana municipal publicada (mostra petita): es mostra una referència de comarca ponderada, marcada sempre com a estimació i mai com a dada oficial municipal.",
        "La mitjana de fiances és la mitjana de contractes amb fiança registrada: no recull rendes no declarades, descomptes pactats fora de contracte ni ocupacions no formalitzades.",
        "Les dades declarades pels usuaris (crowdsourcing) es moderen abans de publicar-se i es mostren SEMPRE separades de les dades oficials.",
        "L'any de construcció ve dels serveis lliures del Cadastre: si el servei no respon, el camp es mostra com a no disponible en lloc d'inventar-lo.",
        "Les àrees tensades les defineix el DOGC i poden canviar amb cada resolució: la web cita sempre la resolució vigent (TER/3739/2026 i TER/3740/2026).",
        "L'IPVA de l'INE és un índex d'evolució (base 2015=100), no un preu en euros: mai es converteix ni es barreja amb les mitjanes de fiances.",
      ]
    : [
        "Las fianzas de Incasòl se publican con retraso: el período vigente suele cerrarse aproximadamente un año después. La serie histórica disponible llega hasta donde la Generalitat ha publicado.",
        "254 municipios no tienen media municipal publicada (muestra pequeña): se muestra una referencia de comarca ponderada, marcada siempre como estimación y nunca como dato oficial municipal.",
        "La media de fianzas es la media de contratos con fianza registrada: no recoge rentas no declaradas, descuentos pactados fuera de contrato ni ocupaciones no formalizadas.",
        "Los datos declarados por los usuarios (crowdsourcing) se moderan antes de publicarse y se muestran SIEMPRE separados de los datos oficiales.",
        "El año de construcción viene de los servicios libres del Catastro: si el servicio no responde, el campo se muestra como no disponible en lugar de inventarlo.",
        "Las áreas tensionadas las define el DOGC y pueden cambiar con cada resolución: la web cita siempre la resolución vigente (TER/3739/2026 y TER/3740/2026).",
        "El IPVA del INE es un índice de evolución (base 2015=100), no un precio en euros: nunca se convierte ni se mezcla con las medias de fianzas.",
      ];

  const cicle = ca
    ? [
        { t: "Refresc de dades oficials", d: "scripts/update_all.sh descarrega els fitxers oficials (Incasòl, DOGC, INE) i regenera el seed; el cron /api/cron/ine importa l'IPVA i l'Atlas de renda cada trimestre." },
        { t: "Cau de cartografia", d: "Els edificis ICGC es guarden amb un cau de 30 dies; les referències cadastrals es consulten en temps real amb cau mentre la dada no canviï." },
        { t: "Verificació", d: "Cada sèrie municipal es verifica contra la nota de premsa oficial (p. ex. Atlas de renda 2015-2024) abans de publicar-se." },
      ]
    : [
        { t: "Refresco de datos oficiales", d: "scripts/update_all.sh descarga los ficheros oficiales (Incasòl, DOGC, INE) y regenera el seed; el cron /api/cron/ine importa el IPVA y el Atlas de renta cada trimestre." },
        { t: "Caché de cartografía", d: "Los edificios ICGC se guardan con una caché de 30 días; las referencias catastrales se consultan en tiempo real con caché mientras el dato no cambie." },
        { t: "Verificación", d: "Cada serie municipal se verifica contra la nota de prensa oficial (p. ej. Atlas de renta 2015-2024) antes de publicarse." },
      ];

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold flex items-center gap-3">
        <Scale className="w-7 h-7 text-ember" />
        {ca ? "Fonts i metodologia" : "Fuentes y metodología"}
      </h1>
      <p className="mt-3 text-[15px] text-moss leading-relaxed max-w-3xl">
        {ca
          ? "Cada xifra de Preureal ve d'una font oficial amb llicència coneguda. Aquí expliquem d'on surt cada dada, amb quina metodologia, amb quines limitacions i quan s'actualitza. La transparència metodològica no és un annex: és la base per poder comparar amb criteri."
          : "Cada cifra de Preureal viene de una fuente oficial con licencia conocida. Aquí explicamos de dónde sale cada dato, con qué metodología, con qué limitaciones y cuándo se actualiza. La transparencia metodológica no es un anexo: es la base para poder comparar con criterio."}
      </p>

      {/* Principis */}
      <div className="mt-8 rounded-2xl border border-line bg-sand/60 p-5">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-pine" />
          {ca ? "Principis" : "Principios"}
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm text-moss">
          {(principis.length > 0
            ? principis.map((p) => (locale === "ca" ? p : translatePrincipi(p)))
            : fallbackPrincipis(ca)
          ).map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ember font-bold">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Datasets */}
      <h2 className="mt-10 font-bold text-xl flex items-center gap-2">
        <Database className="w-5 h-5 text-pine" />
        {ca ? "Datasets, un a un" : "Conjuntos de datos, uno a uno"}
      </h2>
      {error && (
        <p className="mt-3 text-sm text-ember3">
          {ca ? "No s'ha pogut carregar el registre de proveniència ara mateix." : "No se ha podido cargar el registro de procedencia ahora mismo."}
        </p>
      )}
      {datasets === null && !error && (
        <div className="mt-4 grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-line p-5 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-line" />
              <div className="mt-3 h-3 w-full rounded bg-sand" />
              <div className="mt-2 h-3 w-5/6 rounded bg-sand" />
            </div>
          ))}
        </div>
      )}
      {datasets && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {datasets.map((d) => (
            <article key={d.id} className="rounded-2xl border border-line bg-card p-5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold leading-snug">{d.nom}</h3>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${qualityStyle(d.qualitat)}`}>
                  {d.qualitat.split("—")[0].trim()}
                </span>
              </div>
              <dl className="text-sm text-moss space-y-1">
                <Row k={ca ? "Font" : "Fuente"} v={d.font} />
                <Row k={ca ? "Llicència" : "Licencia"} v={d.llicencia} />
                <Row k={ca ? "Unitat" : "Unidad"} v={d.unitat} />
                <Row k={ca ? "Àmbit" : "Ámbito"} v={d.ambit} />
                <Row k={ca ? "Periodicitat" : "Periodicidad"} v={d.periodicitat} />
              </dl>
              <p className="text-[13px] text-stone leading-relaxed border-t border-line pt-2">
                <b className="text-moss">{ca ? "Metodologia: " : "Metodología: "}</b>
                {d.metodologia}
              </p>
            </article>
          ))}
        </div>
      )}

      {/* Últimes importacions INE (data real de refresc) */}
      {ine?.ultimasImportaciones && ine.ultimasImportaciones.length > 0 && (
        <div className="mt-8 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-bold text-lg">{ca ? "Últimes importacions INE" : "Últimas importaciones INE"}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {ine.ultimasImportaciones.slice(0, 4).map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === "ok" || r.status === "success" ? "bg-mintsoft text-mossdeep" : "bg-ambersoft text-ambertext"}`}>
                  {r.source}
                </span>
                <span className="text-moss">
                  {r.status} · {r.rowsTotal ?? 0} {ca ? "files" : "filas"} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString(ca ? "ca-ES" : "es-ES")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cicle d'actualització */}
      <h2 className="mt-10 font-bold text-xl flex items-center gap-2">
        <FileText className="w-5 h-5 text-pine" />
        {ca ? "Cicle d'actualització" : "Ciclo de actualización"}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {cicle.map((c, i) => (
          <div key={i} className="rounded-2xl border border-line bg-sand/50 p-4">
            <div className="font-semibold text-sm">{c.t}</div>
            <p className="mt-1.5 text-[13px] text-moss leading-relaxed">{c.d}</p>
          </div>
        ))}
      </div>

      {/* Limitacions */}
      <h2 className="mt-10 font-bold text-xl flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-ember" />
        {ca ? "Limitacions conegudes" : "Limitaciones conocidas"}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {limitacions.map((l, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-moss leading-relaxed">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-ember shrink-0" />
            <span>{l}</span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-stone">
        {ca ? "Vols veure les dades en directe? " : "¿Quieres ver los datos en directo? "}
        <button onClick={() => navigate("/mapa")} className="text-ember font-semibold hover:underline">
          {ca ? "Obre el mapa" : "Abre el mapa"}
        </button>
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-stone shrink-0 w-24">{k}</dt>
      <dd className="flex-1">{v}</dd>
    </div>
  );
}

function translatePrincipi(p: string): string {
  const map: Record<string, string> = {
    "Les dades oficials i les declaracions d'usuaris es presenten SEMPRE per seperat.":
      "Los datos oficiales y las declaraciones de usuarios se presentan SIEMPRE por separado.",
    "Si una dada no està disponible, es mostra com a no disponible (mai s'inventa).":
      "Si un dato no está disponible, se muestra como no disponible (nunca se inventa).",
    "Cada xifra cita la seva font i el període de referència.":
      "Cada cifra cita su fuente y el período de referencia.",
  };
  return map[p] ?? p;
}

function fallbackPrincipis(ca: boolean): string[] {
  return ca
    ? [
        "Les dades oficials i les declaracions d'usuaris es presenten SEMPRE per separat.",
        "Si una dada no està disponible, es mostra com a no disponible (mai s'inventa).",
        "Cada xifra cita la seva font i el període de referència.",
      ]
    : [
        "Los datos oficiales y las declaraciones de usuarios se presentan SIEMPRE por separado.",
        "Si un dato no está disponible, se muestra como no disponible (nunca se inventa).",
        "Cada cifra cita su fuente y el período de referencia.",
      ];
}
