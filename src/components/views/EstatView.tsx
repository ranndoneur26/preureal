"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Database, MapPin, Inbox, CreditCard, Map, Globe, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useApp } from "@/components/app-context";

/**
 * #/estat — Pàgina d'estat del servei.
 * Consumeix els endpoints públics /api/health i /api/ine/status i mostra:
 *  - estat en temps real dels components (BD, ICGC, Cadastre, Stripe, correu)
 *  - última actualització de dades (importacions INE + municipis amb dada)
 *  - incidències conegudes (historial editorial a src/data/incidents.ts)
 * Auto-refresc cada 60 s. Sense dades inventades: si una sonda no respon,
 * es mostra com a no disponible.
 */

type Health = {
  status?: string;
  database?: { ok?: boolean; latencyMs?: number; provider?: string };
  municipalities?: { total?: number; withRent?: number; withComarcaRef?: number };
  integrations?: Record<string, { name?: string; ok?: boolean; status?: number; configured?: boolean; demoCheckout?: boolean; provider?: string }>;
};

type IneStatus = {
  ultimasImportaciones?: Array<{ source: string; status: string; rowsTotal: number | null; createdAt: string }>;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  database: Database,
  icgc: Map,
  catastro: MapPin,
  stripe: CreditCard,
  email: Inbox,
  google: Globe,
};

export default function EstatView() {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [health, setHealth] = useState<Health | null>(null);
  const [ine, setIne] = useState<IneStatus | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [rh, ri] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/ine/status", { cache: "no-store" }),
      ]);
      const dh = await rh.json();
      let di: IneStatus = {};
      try { di = await ri.json(); } catch {}
      setHealth(dh);
      setIne(di);
      setCheckedAt(new Date());
    } catch {
      setHealth(null);
      setCheckedAt(new Date());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const allOk = health?.status === "ok";

  const rows: Array<{ key: string; nom: string; ok: boolean | null; detail: string }> = [];
  if (health) {
    const db = health.database;
    rows.push({
      key: "database",
      nom: ca ? "Base de dades (PostgreSQL)" : "Base de datos (PostgreSQL)",
      ok: Boolean(db?.ok),
      detail: db?.ok ? `${db.provider ?? "postgresql"} · ${db.latencyMs ?? "?"} ms` : ca ? "sense resposta" : "sin respuesta",
    });
    const ig = health.integrations ?? {};
    for (const key of ["icgc", "catastro", "stripe", "email", "google"]) {
      const v = ig[key];
      if (!v) continue;
      const iconKey = key === "icgc" ? "icgc" : key;
      const nom = v.name ?? key;
      let ok: boolean | null = null;
      let detail = "";
      if (typeof v.ok === "boolean") {
        ok = v.ok;
        detail = v.ok ? `HTTP ${v.status ?? 200}` : ca ? `error (HTTP ${v.status ?? "?"})` : `error (HTTP ${v.status ?? "?"})`;
      } else if (typeof v.configured === "boolean") {
        ok = v.configured ? true : null;
        detail = v.configured ? (ca ? "configurat" : "configurado") : ca ? "opcional, no configurat" : "opcional, no configurado";
      } else if (v.provider) {
        ok = true;
        detail = v.provider;
      }
      rows.push({ key: iconKey, nom, ok, detail });
    }
  }

  const imports = ine?.ultimasImportaciones ?? [];
  const lastImport = imports[0];

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-extrabold flex items-center gap-3">
          <Activity className="w-7 h-7 text-ember" />
          {ca ? "Estat del servei" : "Estado del servicio"}
        </h1>
        <button
          onClick={load}
          disabled={busy}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-line text-sm font-semibold hover:bg-sand disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          {ca ? "Comprova ara" : "Comprobar ahora"}
        </button>
      </div>

      <div className={`mt-5 rounded-2xl border p-5 flex items-center gap-4 ${health === null ? "border-amberline bg-ambersoft" : allOk ? "border-mintline bg-mintsoft" : "border-emberline bg-embersoft"}`}>
        {health === null ? (
          <>
            <Clock className="w-8 h-8 text-ambertext shrink-0" />
            <div>
              <div className="font-bold text-ambertext">{ca ? "Comprovant l'estat…" : "Comprobando el estado…"}</div>
              <p className="text-sm text-ambertext mt-0.5">{ca ? "Si no apareix res en uns segons, hi pot haver una incidència temporal." : "Si no aparece nada en unos segundos, puede haber una incidencia temporal."}</p>
            </div>
          </>
        ) : allOk ? (
          <>
            <CheckCircle2 className="w-8 h-8 text-mossdeep shrink-0" />
            <div>
              <div className="font-bold text-mossdeep">{ca ? "Tots els sistemes operatius" : "Todos los sistemas operativos"}</div>
              <p className="text-sm text-mossdeep/80 mt-0.5">
                {checkedAt && (ca ? `Última comprovació: ${checkedAt.toLocaleTimeString("ca-ES")} · auto-refresc cada minut` : `Última comprobación: ${checkedAt.toLocaleTimeString("es-ES")} · autorrefresco cada minuto`)}
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="w-8 h-8 text-ember3 shrink-0" />
            <div>
              <div className="font-bold text-ember3">{ca ? "Rendiment degradat" : "Rendimiento degradado"}</div>
              <p className="text-sm text-ember3/80 mt-0.5">{ca ? "Alguns components no responen correctament." : "Algunos componentes no responden correctamente."}</p>
            </div>
          </>
        )}
      </div>

      {/* Components */}
      <h2 className="mt-8 font-bold text-lg">{ca ? "Components" : "Componentes"}</h2>
      <div className="mt-3 grid gap-2.5">
        {rows.length === 0 && (
          <p className="text-sm text-stone">{ca ? "Carregant sondes…" : "Cargando sondas…"}</p>
        )}
        {rows.map((r) => {
          const Icon = ICONS[r.key] ?? Globe;
          return (
            <div key={r.key} className="rounded-xl border border-line bg-card px-4 py-3 flex items-center gap-3">
              <Icon className="w-5 h-5 text-moss shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{r.nom}</div>
                <div className="text-xs text-stone truncate">{r.detail}</div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${r.ok === true ? "bg-mintsoft text-mossdeep" : r.ok === false ? "bg-embersoft text-ember3" : "bg-sand text-stone"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${r.ok === true ? "bg-green" : r.ok === false ? "bg-ember" : "bg-graydot"}`} />
                {r.ok === true ? (ca ? "Operatiu" : "Operativo") : r.ok === false ? (ca ? "Error" : "Error") : ca ? "Opcional" : "Opcional"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Actualització de dades */}
      <h2 className="mt-8 font-bold text-lg">{ca ? "Actualització de dades" : "Actualización de datos"}</h2>
      <div className="mt-3 grid gap-2.5">
        {health?.municipalities && (
          <div className="rounded-xl border border-line bg-card px-4 py-3 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-moss shrink-0" />
            <div className="flex-1 text-sm">
              <b>{health.municipalities.total ?? "—"}</b> {ca ? "municipis carregats ·" : "municipios cargados ·"}{" "}
              <b>{health.municipalities.withRent ?? "—"}</b> {ca ? "amb mitjana oficial de fiances ·" : "con media oficial de fianzas ·"}{" "}
              <b>{health.municipalities.withComarcaRef ?? "—"}</b> {ca ? "amb referència de comarca" : "con referencia de comarca"}
            </div>
          </div>
        )}
        {lastImport ? (
          <div className="rounded-xl border border-line bg-card px-4 py-3 flex items-center gap-3">
            <Database className="w-5 h-5 text-moss shrink-0" />
            <div className="flex-1 text-sm">
              <b>{ca ? "Última importació INE:" : "Última importación INE:"}</b>{" "}
              {lastImport.source} · {lastImport.rowsTotal ?? 0} {ca ? "files" : "filas"} ·{" "}
              {new Date(lastImport.createdAt).toLocaleString(ca ? "ca-ES" : "es-ES")}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${lastImport.status === "ok" ? "bg-mintsoft text-mossdeep" : "bg-ambersoft text-ambertext"}`}>
              {lastImport.status}
            </span>
          </div>
        ) : (
          <p className="text-sm text-stone">{ca ? "Carregant historial d'importacions…" : "Cargando historial de importaciones…"}</p>
        )}
      </div>

      {/* Incidències */}
      <h2 className="mt-8 font-bold text-lg">{ca ? "Incidències" : "Incidencias"}</h2>
      <p className="mt-1 text-sm text-stone">
        {ca
          ? "Historial d'incidències rellevants publicades. Si ara mateix tot és operatiu, no n'hi ha cap d'activa."
          : "Historial de incidencias relevantes publicadas. Si ahora mismo todo está operativo, no hay ninguna activa."}
      </p>
      <div className="mt-3 rounded-xl border border-line bg-card divide-y divide-line">
        {INCIDENTS.map((inc, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-green shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <b>{ca ? inc.titolCa : inc.titolEs}</b>
              <p className="text-[13px] text-stone mt-0.5 leading-relaxed">{ca ? inc.detallCa : inc.detallEs}</p>
            </div>
            <span className="shrink-0 text-xs text-stone">{inc.data}</span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-stone leading-relaxed">
        {ca
          ? "Aquesta pàgina fa sondes en directe contra els mateixos endpoints que usa la web (cap dada inventada). El percentatge d'uptime continu requereix monitoratge extern; les sondes d'aquesta pàgina s'executen des del teu navegador cada 60 segons."
          : "Esta página hace sondas en directo contra los mismos endpoints que usa la web (ningún dato inventado). El porcentaje de uptime continuo requiere monitorización externa; las sondas de esta página se ejecutan desde tu navegador cada 60 segundos."}
      </p>
    </div>
  );
}

/** Historial editorial d'incidències (edita a mà; només incidents reals). */
const INCIDENTS: Array<{ data: string; titolCa: string; titolEs: string; detallCa: string; detallEs: string }> = [
  {
    data: "2026-11",
    titolCa: "Errors 500 en generar informes PDF",
    titolEs: "Errores 500 al generar informes PDF",
    detallCa:
      "Els caràcters ≥ i ≤ no són representables en la codificació WinAnsi de les fonts estàndard del PDF: qualsevol informe que els incloés fallava. Corregit amb degradació de símbols.",
    detallEs:
      "Los caracteres ≥ y ≤ no son representables en la codificación WinAnsi de las fuentes estándar del PDF: cualquier informe que los incluyera fallaba. Corregido con degradación de símbolos.",
  },
];
