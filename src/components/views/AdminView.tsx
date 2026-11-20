"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { RefreshCw, Shield, Mail, Database, Gauge, Plug, Users, Euro, Filter, FileWarning, ClipboardCheck, Settings, Download, ScrollText, FileDown, HeartHandshake, MapPin, Globe } from "lucide-react";
import { COLOR_ESTAT, FONTS_PANEL } from "@/lib/datos-fuentes";

interface Stats {
  users: number;
  plans: { free: number; premium: number; pro: number };
  mrr: number;
  mrrPastDue?: number;
  demoMrr?: number;
  activeSubs?: number;
  funnel30: { signups: number; queries: number; paywalls: number; subscribes: number; teasers: number };
  series: Array<{ day: string; SIGNUP: number; MAP_QUERY: number; PAYWALL_VIEW: number; SUBSCRIBE_SUCCESS: number }>;
  reports: number;
  emails: number;
}

interface Health {
  status?: string;
  database?: { ok: boolean; latencyMs: number | null; error?: string };
  integrations: {
    icgc: { ok: boolean; status: any };
    catastro: { ok: boolean; status: any };
    stripe: { configured: boolean; demoCheckout: boolean };
    email: { provider: string };
    google?: { configured: boolean };
  };
}

// v71 — «fonts» és el panell «Dades i fonts» (Fase P1 del pla de manteniment)
type TabId = "stats" | "users" | "emails" | "data" | "fonts" | "reports" | "plans" | "audit";

export default function AdminView() {
  const { t, auth, navigate, locale } = useApp();
  const [tab, setTab] = useState<TabId>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState("");
  const [emails, setEmails] = useState<any[]>([]);
  const [importJson, setImportJson] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [seedAidMsg, setSeedAidMsg] = useState<string | null>(null);
  const [seedingAid, setSeedingAid] = useState(false);
  // v39 — sincronitza Municipality amb el seed empaquetat (255 munis + refs comarca)
  const [seedMunisMsg, setSeedMunisMsg] = useState<string | null>(null);
  const [seedingMunis, setSeedingMunis] = useState(false);
  // v37 — genera els slugs públics dels municipis (pàgines SEO /lloguer/[slug])
  const [seedingSlugs, setSeedingSlugs] = useState(false);
  const [seedSlugsMsg, setSeedSlugsMsg] = useState<string | null>(null);
  const [modReports, setModReports] = useState<any[] | null>(null);
  const [modStats, setModStats] = useState<any>(null);
  const [planSettings, setPlanSettings] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[] | null>(null);
  const [importRuns, setImportRuns] = useState<any[] | null>(null);

  const loadAll = useCallback(async () => {
    const [s, h] = await Promise.all([
      fetch("/api/admin/stats").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/health").then((r) => r.json()),
    ]);
    setStats(s);
    setHealth(h);
    if (s) {
      const u = await fetch(`/api/admin/users?q=${encodeURIComponent(userQuery)}`).then((r) => (r.ok ? r.json() : { users: [] }));
      setUsers(u.users || []);
      const e = await fetch("/api/admin/emails").then((r) => (r.ok ? r.json() : { emails: [] }));
      setEmails(e.emails || []);
    }
  }, [userQuery]);

  useEffect(() => {
    // v31: la closure antigua leía auth.user dentro de .then (siempre null
    // porque el estado aún no se había actualizado) — la rama nunca corría.
    // El guard de render <NoAccess /> ya cubre el caso sin rol ADMIN.
    auth.refresh().finally(loadAll);
  }, []);

  useEffect(() => {
    if (tab === "users") {
      fetch(`/api/admin/users?q=${encodeURIComponent(userQuery)}${userPlanFilter ? `&plan=${userPlanFilter}` : ""}`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => setUsers(d.users || []))
        .catch(() => {});
    }
  }, [tab, userQuery, userPlanFilter]);

  useEffect(() => {
    if (tab === "reports") {
      fetch("/api/admin/reports").then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d) { setModReports(d.reports); setModStats(d.stats); }
      }).catch(() => {});
    }
    if (tab === "plans") {
      fetch("/api/admin/plan-settings").then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d) setPlanSettings(d.settings);
      }).catch(() => {});
    }
    if (tab === "audit") {
      Promise.all([
        fetch("/api/admin/audit").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/imports").then((r) => (r.ok ? r.json() : null)),
      ]).then(([a, i]) => {
        if (a) setAuditLogs(a.logs);
        if (i) setImportRuns(i.runs);
      }).catch(() => {});
    }
  }, [tab]);

  if (!auth.user) return <LoginRequired />;
  if (auth.user.role !== "ADMIN") return <NoAccess />;

  const ca = locale === "ca";

  const doImport = async () => {
    setImportMsg(null);
    try {
      const rows = JSON.parse(importJson);
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json();
      setImportMsg(res.ok ? `OK: ${d.created} nous, ${d.updated} actualitzats, ${d.skipped} ignorats (run ${d.runId})` : d.message || d.error);
    } catch (e: any) {
      setImportMsg("JSON invàlid: " + e.message);
    }
  };

  // Fase 4 — sincronitza el catàleg editorial d'ajudes al lloguer (RentalAid)
  // amb src/data/rental_aid_seed.json. Idempotent (upsert per code).
  const doSeedAid = async () => {
    setSeedAidMsg(null);
    setSeedingAid(true);
    try {
      const res = await fetch("/api/admin/seed-aid", { method: "POST" });
      const d = await res.json();
      setSeedAidMsg(
        res.ok
          ? `OK: ${d.created} noves, ${d.updated} actualitzades de ${d.total} (revisió ${d.revisado})`
          : d.message || d.error,
      );
    } catch (e: any) {
      setSeedAidMsg("Error: " + e.message);
    } finally {
      setSeedingAid(false);
    }
  };

  // v39 — sincronitza la taula Municipality amb src/data/municipalities.json
  // (dades Incasòl vigents + referències de comarca). Idempotent (upsert).
  const doSeedMunis = async () => {
    setSeedMunisMsg(null);
    setSeedingMunis(true);
    try {
      const res = await fetch("/api/admin/seed-municipalities", { method: "POST" });
      const d = await res.json();
      setSeedMunisMsg(
        res.ok
          ? `OK: ${d.synced ?? d.updated}/${d.total} municipis sincronitzats`
          : d.message || d.error,
      );
    } catch (e: any) {
      setSeedMunisMsg("Error: " + e.message);
    } finally {
      setSeedingMunis(false);
    }
  };

  // v37 — genera els slugs públics dels municipis (pàgines SEO /lloguer/[slug])
  const doBackfillSlugs = async () => {
    setSeedSlugsMsg(null);
    setSeedingSlugs(true);
    try {
      const res = await fetch("/api/admin/backfill-slugs", { method: "POST" });
      const d = await res.json();
      setSeedSlugsMsg(res.ok ? (d.message || `OK: ${d.total} municipis`) : d.message || d.error);
    } catch (e: any) {
      setSeedSlugsMsg("Error: " + e.message);
    } finally {
      setSeedingSlugs(false);
    }
  };

  const patchUser = async (id: string, data: any) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error === "CANNOT_SELF_DEMOTE" ? "No et pots desactivar/degradar a tu mateix" : "Error");
    }
    loadAll();
  };

  const moderate = async (id: string, status: string) => {
    await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const d = await fetch("/api/admin/reports").then((r) => r.json());
    setModReports(d.reports);
    setModStats(d.stats);
  };

  const savePlanSettings = async () => {
    const res = await fetch("/api/admin/plan-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: planSettings }),
    });
    const d = await res.json();
    if (d.settings) setPlanSettings(d.settings);
    alert(res.ok ? "Plans actualitzats" : "Error");
  };

  const maxSeries = stats
    ? Math.max(1, ...stats.series.map((s) => Math.max(s.SIGNUP, s.MAP_QUERY, s.PAYWALL_VIEW, s.SUBSCRIBE_SUCCESS)))
    : 1;

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <Shield className="w-7 h-7 text-pine" />
          {t.admin.title}
        </h1>
        <button onClick={loadAll} className="p-2 rounded-lg border border-line hover:bg-sand" title="Refrescar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-6 flex gap-1 flex-wrap">
        {(
          [
            ["stats", ca ? "Mètriques" : "Métricas", Filter],
            ["users", t.admin.users, Users],
            ["emails", t.admin.emails, Mail],
            ["data", t.admin.importTitle.split(" (")[0], Database],
            ["fonts", ca ? "Dades i fonts" : "Datos y fuentes", Gauge],
            ["reports", ca ? "Informes ciutadans" : "Informes ciudadanos", ClipboardCheck],
            ["plans", ca ? "Plans i límits" : "Planes y límites", Settings],
            ["audit", ca ? "Auditoria" : "Auditoría", ScrollText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as TabId)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
              tab === id ? "bg-pine text-white" : "bg-card border border-line hover:bg-sand"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* MÈTRIQUES */}
      {tab === "stats" && stats && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label={t.admin.users} value={stats.users} />
            <Card label="MRR real (Stripe)" value={`${stats.mrr.toFixed(2)} €`} />
            <Card label={ca ? "MRR en demora" : "MRR en mora"} value={`${(stats.mrrPastDue || 0).toFixed(2)} €`} />
            <Card label="MRR demo" value={`${(stats.demoMrr || 0).toFixed(2)} €`} />
            <Card label="Premium" value={stats.plans.premium} />
            <Card label="Pro" value={stats.plans.pro} />
            <Card label={ca ? "Subscripcions actives" : "Suscripciones activas"} value={stats.activeSubs ?? "—"} />
            <Card label={ca ? "Informes ciutadans" : "Informes ciudadanos"} value={stats.reports} />
          </div>

          <div className="bg-card rounded-2xl border border-line p-5">
            <h3 className="font-bold mb-4">{t.admin.funnel}</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card small label={t.admin.teasers} value={stats.funnel30.teasers} />
              <Card small label={t.admin.signups} value={stats.funnel30.signups} />
              <Card small label={t.admin.queries} value={stats.funnel30.queries} />
              <Card small label={t.admin.paywalls} value={stats.funnel30.paywalls} />
              <Card small label={t.admin.subscribes} value={stats.funnel30.subscribes} />
            </div>
            <div className="mt-6 flex items-end gap-[3px] h-28">
              {stats.series.map((s) => (
                <div key={s.day} className="flex-1 flex flex-col justify-end gap-[2px]" title={`${s.day}: ${s.MAP_QUERY} consultes, ${s.SIGNUP} registres`}>
                  <div className="bg-ember rounded-t-sm" style={{ height: `${(s.SUBSCRIBE_SUCCESS / maxSeries) * 100}%`, minHeight: s.SUBSCRIBE_SUCCESS ? 3 : 0 }} />
                  <div className="bg-pine rounded-b-sm" style={{ height: `${(s.MAP_QUERY / maxSeries) * 100}%`, minHeight: s.MAP_QUERY ? 2 : 0 }} />
                </div>
              ))}
              {stats.series.length === 0 && <div className="text-sm text-stone">—</div>}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-stone">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-pine inline-block rounded-sm" /> MAP_QUERY</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-ember inline-block rounded-sm" /> SUBSCRIBE_SUCCESS</span>
            </div>
          </div>

          {/* Integracions + estat BD */}
          <div className="bg-card rounded-2xl border border-line p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Plug className="w-4 h-4" />{t.admin.integrations}</h3>
            {health && (
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <IntRow name="Base de dades (PostgreSQL)" ok={health.database?.ok ?? false} detail={health.database?.latencyMs != null ? `${health.database.latencyMs} ms` : health.database?.error} />
                <IntRow name="ICGC API Territorial (edificis, límits, refcat)" ok={health.integrations.icgc.ok} />
                <IntRow name="Cadastre (any de construcció)" ok={health.integrations.catastro.ok} />
                <IntRow
                  name={`Stripe ${health.integrations.stripe.configured ? "(configurat)" : health.integrations.stripe.demoCheckout ? "(MODO PRUEBA)" : "(no configurat)"}`}
                  ok={health.integrations.stripe.configured || health.integrations.stripe.demoCheckout}
                />
                <IntRow name={`Correus (${health.integrations.email.provider})`} ok />
                <IntRow name={`Google OAuth (${health.integrations.google?.configured ? "configurat" : "sense credencials"})`} ok={Boolean(health.integrations.google?.configured)} />
              </div>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              {[
                ["users", "Usuaris CSV"],
                ["reports", "Informes CSV"],
                ["subscriptions", "Subscripcions CSV"],
                ["audit", "Auditoria CSV"],
              ].map(([ty, label]) => (
                <a key={ty} href={`/api/admin/export-csv?type=${ty}`} className="px-3 py-2 rounded-lg border border-line text-xs font-semibold hover:bg-sand flex items-center gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* USUARIS */}
      {tab === "users" && (
        <div className="mt-6 bg-card rounded-2xl border border-line overflow-hidden">
          <div className="p-4 border-b border-sand3 flex gap-2 flex-wrap items-center">
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder={t.admin.search}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-ember"
            />
            <select value={userPlanFilter} onChange={(e) => setUserPlanFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-line text-sm">
              <option value="">{ca ? "Tots els plans" : "Todos los planes"}</option>
              <option value="FREE">FREE</option>
              <option value="PREMIUM">PREMIUM</option>
              <option value="PRO">PRO</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.email}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.plan}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.role}</th>
                  <th className="px-4 py-2.5 font-semibold">{ca ? "Actiu" : "Activo"}</th>
                  <th className="px-4 py-2.5 font-semibold">{ca ? "Verificat" : "Verificado"}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.created}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-t border-sand2 ${u.active ? "" : "opacity-50"}`}>
                    <td className="px-4 py-2.5">
                      {u.email}
                      <span className="block text-xs text-stone">{u.name || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={u.plan} onChange={async (e) => patchUser(u.id, { plan: e.target.value })} className="border border-line rounded-md px-2 py-1 text-xs">
                        <option>FREE</option>
                        <option>PREMIUM</option>
                        <option>PRO</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={u.role} onChange={async (e) => patchUser(u.id, { role: e.target.value })} className="border border-line rounded-md px-2 py-1 text-xs">
                        <option>USER</option>
                        <option>ADMIN</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => patchUser(u.id, { active: !u.active })}
                        className={`text-xs font-bold px-2 py-1 rounded-full ${u.active ? "bg-mintsoft text-green2" : "bg-embersoft text-ember3"}`}
                      >
                        {u.active ? (ca ? "Actiu" : "Activo") : (ca ? "Desactivat" : "Desactivado")}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{u.emailVerifiedAt ? "✓" : "—"}</td>
                    <td className="px-4 py-2.5 text-stone">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-stone">—</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CORREUS (cos com a TEXT, mai HTML — V1 corregida) */}
      {tab === "emails" && (
        <div className="mt-6 space-y-3">
          {emails.length === 0 && (
            <div className="bg-card rounded-2xl border border-line p-8 text-center text-stone text-sm">
              {t.admin.noEmails}
            </div>
          )}
          {emails.map((e) => (
            <div key={e.id} className="bg-card rounded-xl border border-line p-4">
              <div className="flex justify-between gap-2 flex-wrap">
                <div className="font-semibold text-sm">{e.subject}</div>
                <div className="text-xs text-stone">
                  {e.provider} · {e.status}
                  {e.type && e.type !== "GENERIC" ? ` · ${e.type}` : ""}
                  {e.attempts > 1 ? ` · ${e.attempts} intents` : ""}
                  {e.providerMessageId ? ` · msg ${String(e.providerMessageId).slice(0, 8)}` : ""}
                  {" · "}
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-stone mt-1">→ {e.to}</div>
              {/* Diagnòstic: error real retornat pel proveïdor (Resend) quan status === "error" */}
              {e.error ? (
                <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 whitespace-pre-wrap break-all">
                  {String(e.error).slice(0, 600)}
                </div>
              ) : null}
              {/* text net (htmlToText al servidor) — sense dangerouslySetInnerHTML */}
              <pre className="mt-2 text-xs bg-cream rounded-lg p-3 max-h-40 overflow-y-auto pr-scroll whitespace-pre-wrap font-sans">{e.bodyText}</pre>
            </div>
          ))}
        </div>
      )}

      {/* DADES / IMPORTACIÓ */}
      {tab === "data" && (
        <div className="mt-6 space-y-4">
          <div className="bg-card rounded-2xl border border-line p-5">
            <h3 className="font-bold flex items-center gap-2"><FileWarning className="w-4 h-4 text-ember" />{t.admin.importTitle}</h3>
            <p className="text-sm text-moss mt-2 leading-relaxed">{t.admin.importDesc}</p>
            <pre className="mt-3 bg-cream border border-sand3 rounded-lg p-3 text-xs overflow-x-auto">{`[
  {
    "refcat": "0801901DF3851E",
    "municipalityCode": "080193",
    "tipus": "edi",
    "polygon": [[2.1785, 41.3965], [2.1783, 41.3966], [2.1784, 41.3967]],
    "yearBuilt": 1930,
    "avgRentEurMonth": 1250.5,
    "sampleSize": 34
  }
]`}</pre>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={6}
              placeholder="[ ... ]"
              className="mt-3 w-full px-3 py-2 rounded-lg border border-line text-sm font-mono outline-none focus:border-ember"
            />
            <div className="mt-3 flex items-center gap-3">
              <button onClick={doImport} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2">
                {t.admin.importBtn}
              </button>
              {importMsg && <span className="text-sm text-moss">{importMsg}</span>}
            </div>
          </div>

          {/* Fase 4 — catàleg d'ajudes al lloguer (seed editorial) */}
          <div className="bg-card rounded-2xl border border-line p-5">
            <h3 className="font-bold flex items-center gap-2"><HeartHandshake className="w-4 h-4 text-pine" />{ca ? "Ajudes al lloguer — catàleg editorial" : "Ayudas al alquiler — catálogo editorial"}</h3>
            <p className="text-sm text-moss mt-2 leading-relaxed">
              {ca
                ? "Sincronitza a la base de dades el catàleg d'ajudes al lloguer (font: src/data/rental_aid_seed.json, revisió 2026-11-10). Idempotent: pot executar-se tantes vegades com calgui sense duplicar files. Només escriu a la taula RentalAid."
                : "Sincroniza en la base de datos el catálogo de ayudas al alquiler (fuente: src/data/rental_aid_seed.json, revisión 2026-11-10). Idempotente: puede ejecutarse tantas veces como haga falta sin duplicar filas. Solo escribe en la tabla RentalAid."}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={doSeedAid}
                disabled={seedingAid}
                className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2 disabled:opacity-50"
              >
                {seedingAid
                  ? ca ? "Sincronitzant…" : "Sincronizando…"
                  : ca ? "Sincronitza el catàleg" : "Sincronizar el catálogo"}
              </button>
              {seedAidMsg && <span className="text-sm text-moss">{seedAidMsg}</span>}
            </div>
          </div>

          {/* v39 — dades municipals (fiances Incasòl + ref. comarca) */}
          <div className="bg-card rounded-2xl border border-line p-5">
            <h3 className="font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-pine" />{ca ? "Dades municipals — fiances i referències de comarca" : "Datos municipales — fianzas y referencias de comarca"}</h3>
            <p className="text-sm text-moss mt-2 leading-relaxed">
              {ca
                ? "Sincronitza la taula Municipality amb el seed empaquetat (src/data/municipalities.json): fiances Incasòl oficials vigents, Palamós recuperat i la referència de comarca dels 254 municipis sense renda publicada. Idempotent (upsert per codi): no duplica files i només escriu a Municipality."
                : "Sincroniza la tabla Municipality con el seed empaquetado (src/data/municipalities.json): fianzas Incasòl oficiales vigentes, Palamós recuperado y la referencia de comarca de los 254 municipios sin renta publicada. Idempotente (upsert por código): no duplica filas y solo escribe en Municipality."}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={doSeedMunis}
                disabled={seedingMunis}
                className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2 disabled:opacity-50"
              >
                {seedingMunis
                  ? ca ? "Sincronitzant…" : "Sincronizando…"
                  : ca ? "Sincronitza les dades municipals" : "Sincronizar los datos municipales"}
              </button>
              {seedMunisMsg && <span className="text-sm text-moss">{seedMunisMsg}</span>}
            </div>
          </div>

          {/* v37 — slugs públics per a les pàgines SEO /lloguer/[slug] */}
          <div className="bg-card rounded-2xl border border-line p-5">
            <h3 className="font-bold flex items-center gap-2"><Globe className="w-4 h-4 text-pine" />{ca ? "Pàgines públiques de municipi (SEO)" : "Páginas públicas de municipio (SEO)"}</h3>
            <p className="text-sm text-moss mt-2 leading-relaxed">
              {ca
                ? "Genera el slug públic dels 947 municipis (ex.: /lloguer/barcelona) per a les pàgines indexables amb el preu mitjà i la sèrie històrica. Idempotent: només actualitza els slugs que canvien. Executa-ho després de cada sincronització de dades municipals."
                : "Genera el slug público de los 947 municipios (ej.: /lloguer/barcelona) para las páginas indexables con el precio medio y la serie histórica. Idempotente: solo actualiza los slugs que cambian. Ejecútalo después de cada sincronización de datos municipales."}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={doBackfillSlugs}
                disabled={seedingSlugs}
                className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2 disabled:opacity-50"
              >
                {seedingSlugs
                  ? ca ? "Generant slugs…" : "Generando slugs…"
                  : ca ? "Genera els slugs municipals" : "Generar los slugs municipales"}
              </button>
              {seedSlugsMsg && <span className="text-sm text-moss">{seedSlugsMsg}</span>}
            </div>
          </div>

          {/* Historial d'importacions (Fase 9.2) */}
          <div className="bg-card rounded-2xl border border-line p-5">
            <h3 className="font-bold mb-3">{ca ? "Historial d'importacions" : "Historial de importaciones"}</h3>
            {importRuns && importRuns.length > 0 ? (
              <div className="space-y-2 text-sm">
                {importRuns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border border-sand2 rounded-lg px-3 py-2">
                    <span>
                      <b>{r.source}</b> · {r.created} nous / {r.updated} act. / {r.skipped} ignorats de {r.rowsTotal}
                      <span className="block text-xs text-stone">{new Date(r.createdAt).toLocaleString()} · estat {r.status}{r.error ? ` — ${r.error}` : ""}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone">{ca ? "Cap importació registrada encara." : "Ninguna importación registrada todavía."}</p>
            )}
          </div>
        </div>
      )}

      {/* DADES I FONTS (v71 — Fase P1 del pla de manteniment) */}
      {tab === "fonts" && <FontsTab />}

      {/* INFORMES CIUTADANS — MODERACIÓ */}
      {tab === "reports" && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card label="Pendents" value={modStats?.PENDING ?? "—"} />
            <Card label="Acceptats" value={modStats?.ACCEPTED ?? "—"} />
            <Card label="Rebutjats" value={modStats?.REJECTED ?? "—"} />
          </div>
          <div className="bg-card rounded-2xl border border-line p-5 space-y-2">
            {modReports === null && <p className="text-sm text-stone">…</p>}
            {modReports?.length === 0 && <p className="text-sm text-stone">{ca ? "Cap informe." : "Ningún informe."}</p>}
            {modReports?.map((r) => (
              <div key={r.id} className="border border-sand2 rounded-lg px-3 py-2.5 text-sm flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <b>{r.offerEurMonth} €/mes</b> {r.offerEurM2 && <span className="text-xs text-stone">({r.offerEurM2} €/m²)</span>}
                  <span className="block text-xs text-stone">
                    mun {r.municipalityCode} · {r.contractType || "—"} · {r.surfaceM2 ? `${r.surfaceM2} m²` : "—"} · {r.userEmail || "anònim"} · {new Date(r.createdAt).toLocaleString()}
                    {r.note && <span className="block">nota: {r.note}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "ACCEPTED" ? "bg-mintsoft text-green2" : r.status === "REJECTED" ? "bg-embersoft text-ember3" : "bg-sand"}`}>
                    {r.status}
                  </span>
                  {r.status !== "ACCEPTED" && (
                    <button onClick={() => moderate(r.id, "ACCEPTED")} className="px-2.5 py-1 rounded-md bg-mintsoft text-green2 text-xs font-semibold">Acceptar</button>
                  )}
                  {r.status !== "REJECTED" && (
                    <button onClick={() => moderate(r.id, "REJECTED")} className="px-2.5 py-1 rounded-md bg-embersoft text-ember3 text-xs font-semibold">Rebutjar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PLANS I LÍMITS */}
      {tab === "plans" && planSettings && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-5">
          <h3 className="font-bold mb-3">{ca ? "Configuració dels plans (efectiva al servidor)" : "Configuración de los planes (efectiva en el servidor)"}</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {(["FREE", "PREMIUM", "PRO"] as const).map((p) => (
              <div key={p} className="border border-sand2 rounded-xl p-4 space-y-2">
                <div className="font-bold">{p}</div>
                <div>
                  <label className="text-xs text-stone">{ca ? "Consultes/mes (-1 = il·limitades)" : "Consultas/mes (-1 = ilimitadas)"}</label>
                  <input
                    type="number"
                    value={planSettings[p].quotaMonth}
                    onChange={(e) => setPlanSettings({ ...planSettings, [p]: { ...planSettings[p], quotaMonth: parseInt(e.target.value, 10) } })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone">{ca ? "Preu (€/mes)" : "Precio (€/mes)"}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={planSettings[p].priceEur}
                    onChange={(e) => setPlanSettings({ ...planSettings, [p]: { ...planSettings[p], priceEur: parseFloat(e.target.value) } })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm"
                  />
                </div>
                <div className="text-xs text-stone space-y-1">
                  {Object.entries(planSettings[p].features || {}).map(([k, v]: any) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(v)}
                        onChange={(e) => setPlanSettings({
                          ...planSettings,
                          [p]: { ...planSettings[p], features: { ...planSettings[p].features, [k]: e.target.checked } },
                        })}
                      />
                      {k}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={savePlanSettings} className="mt-4 px-5 py-2.5 rounded-xl bg-pine text-white text-sm font-bold">
            {ca ? "Desar configuració" : "Guardar configuración"}
          </button>
          <p className="text-xs text-stone mt-2">{ca ? "Els canvis s'apliquen al cap de 30 s (cau) i queden registrats a l'auditoria." : "Los cambios se aplican en 30 s (caché) y quedan registrados en la auditoría."}</p>
        </div>
      )}

      {/* AUDITORIA */}
      {tab === "audit" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{ca ? "Historial d'auditoria (accions sensibles)" : "Historial de auditoría (acciones sensibles)"}</h3>
            <a href="/api/admin/export-csv?type=audit" className="text-xs underline flex items-center gap-1"><Download className="w-3 h-3" /> CSV</a>
          </div>
          {auditLogs === null && <p className="text-sm text-stone">…</p>}
          {auditLogs?.length === 0 && <p className="text-sm text-stone">{ca ? "Cap acció registrada encara." : "Ninguna acción registrada todavía."}</p>}
          <div className="space-y-1.5">
            {auditLogs?.map((l) => (
              <div key={l.id} className="text-xs border border-sand2 rounded-lg px-3 py-2 flex items-start justify-between gap-2 flex-wrap">
                <span>
                  <b className="font-mono">{l.action}</b> {l.target && <span className="text-stone">→ {l.target}</span>}
                  {l.meta && <span className="block text-stone max-w-2xl truncate">{JSON.stringify(l.meta)}</span>}
                </span>
                <span className="text-stone shrink-0">{l.actorEmail || "sistema"} · {new Date(l.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, small }: { label: string; value: any; small?: boolean }) {
  return (
    <div className={`rounded-xl bg-card border border-line ${small ? "p-3" : "p-4"}`}>
      <div className={`font-black text-pine ${small ? "text-xl" : "text-2xl"}`}>{value}</div>
      <div className={`text-stone mt-0.5 ${small ? "text-[10px]" : "text-xs"}`}>{label}</div>
    </div>
  );
}

function IntRow({ name, ok, detail }: { name: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border border-sand3 rounded-lg px-3 py-2">
      <span>
        {name}
        {detail && <span className="block text-xs text-stone">{detail}</span>}
      </span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ok ? "bg-mintsoft text-green2" : "bg-embersoft text-ember3"}`}>
        {ok ? "OK" : "KO"}
      </span>
    </div>
  );
}

function LoginRequired() {
  const { t, navigate, locale } = useApp();
  const ca = locale === "ca";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Recuperació "break-glass" del accés admin (Fase 4): requereix el codi
  // ADMIN_BOOTSTRAP_CODE definit pel propietari a Vercel. Sense la variable
  // definida, l'endpoint respon BOOTSTRAP_DISABLED i el formulari no fa res.
  const recover = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, code }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(
          ca
            ? "Accés restablert. Ara prem 'Entrar' i inicia sessió amb aquest email i la contrasenya nova."
            : "Acceso restablecido. Ahora pulsa 'Entrar' e inicia sesión con ese email y la contraseña nueva.",
        );
      } else if (d.error === "BOOTSTRAP_DISABLED") {
        setMsg(d.message || (ca ? "Recuperació desactivada: falta ADMIN_BOOTSTRAP_CODE a Vercel." : "Recuperación desactivada: falta ADMIN_BOOTSTRAP_CODE en Vercel."));
      } else if (d.error === "BAD_CODE") {
        setMsg(ca ? "Codi incorrecte." : "Código incorrecto.");
      } else {
        setMsg(ca ? "Dades invàlides: revisa el correu i la contrasenya (mínim 8 caràcters)." : "Datos inválidos: revisa el email y la contraseña (mínimo 8 caracteres).");
      }
    } catch (e: any) {
      setMsg("Error: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center">
          <button onClick={() => navigate("/entrada")} className="px-5 py-2.5 rounded-xl bg-ember text-white font-bold">
            {t.nav.entrada}
          </button>
        </div>
        <div className="bg-card rounded-2xl border border-line p-5">
          <h3 className="font-bold">{ca ? "Recupera l'accés d'administració" : "Recupera el acceso de administración"}</h3>
          <p className="text-sm text-moss mt-2 leading-relaxed">
            {ca
              ? "Només per al propietari: defineix ADMIN_BOOTSTRAP_CODE a Vercel (Settings → Environment Variables, després Redeploy) i introdueix aquí el codi amb el teu email i una contrasenya nova (mínim 8 caràcters). Si ja tens compte, se't dona el rol admin; si no, es crea."
              : "Solo para el propietario: define ADMIN_BOOTSTRAP_CODE en Vercel (Settings → Environment Variables, después Redeploy) e introduce aquí el código con tu email y una contraseña nueva (mínimo 8 caracteres). Si ya tienes cuenta, se te da el rol admin; si no, se crea."}
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ca ? "El teu email" : "Tu email"}
            className="mt-3 w-full px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-ember"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder={ca ? "Contrasenya nova (mín. 8)" : "Contraseña nueva (mín. 8)"}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-ember"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={ca ? "Codi de recuperació (ADMIN_BOOTSTRAP_CODE)" : "Código de recuperación (ADMIN_BOOTSTRAP_CODE)"}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-ember"
          />
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={recover}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2 disabled:opacity-50"
            >
              {busy ? (ca ? "Recuperant…" : "Recuperando…") : ca ? "Recupera l'accés" : "Recuperar el acceso"}
            </button>
            {msg && <span className="text-sm text-moss flex-1 min-w-[12rem]">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function NoAccess() {
  const { locale } = useApp();
  return (
    <div className="flex-1 flex items-center justify-center px-4 text-stone">
      {locale === "ca" ? "Accés restringit a administradors" : "Acceso restringido a administradores"}
    </div>
  );
}

// ─── v71 — Panell «Dades i fonts» (Fase P1 del pla de manteniment) ──────────
// Semàforo per font (pla, taula 11), KPIs globals (taula 13) i accions
// protegides (taula 12): Auditar / Importar / Verificar / Rollback / Informe /
// Pausar / Programar + firma humana de C9/C10 en pantalla. L'execució real
// (descàrrega, F0, staging→prod, restauració) resta al pipeline i al workflow
// de manteniment; el panell registra estat, proteccions i traçabilitat
// (ImportRun + AuditLog). Colors del semàforo: els exactes del pla.

type FontData = any; // forma defensada des del servidor (GET /api/admin/datos-fuentes)

const ESTAT_LABEL: Record<string, { ca: string; es: string }> = {
  VIGENTE: { ca: "Vigent", es: "Vigente" },
  AVISO: { ca: "Aviso", es: "Aviso" },
  CRITICO: { ca: "Crític", es: "Crítico" },
  PAUSADA: { ca: "Pausada", es: "Pausada" },
};

const VEREDICTE_LABEL: Record<string, string> = {
  GO: "GO",
  GO_CONDICIONAL: "GO-COND",
  NO_GO: "NO-GO",
};

function estatMotiuText(m: string, ctx: FontData, ca: boolean): string {
  const sla = ctx.slaDies ?? ctx.sla ?? 0;
  const dies = ctx.dies;
  switch (m) {
    case "FRESQUERA_SLA":
      return ca
        ? `Actualització recomanada: frescura ${dies} d > SLA ${sla} d`
        : `Actualización recomendada: frescura ${dies} d > SLA ${sla} d`;
    case "FRESQUERA_SLA_MES_25":
      return ca
        ? `Acció requerida: frescura ${dies} d > SLA+25 % (${Math.round(sla * 1.25)} d)`
        : `Acción requerida: frescura ${dies} d > SLA+25 % (${Math.round(sla * 1.25)} d)`;
    case "IMPORT_ERROR":
      return ca ? "Acció requerida: última execució ERROR" : "Acción requerida: última ejecución ERROR";
    case "F0_FIRMA_PENDENT":
      return ca
        ? "Control C9/C10 pendent de firma humana (GO-CONDICIONAL)"
        : "Control C9/C10 pendiente de firma humana (GO-CONDICIONAL)";
    case "F0_NO_GO":
      return ca
        ? "Última auditoria F0 = NO-GO: no es pot importar"
        : "Última auditoría F0 = NO-GO: no se puede importar";
    case "PAUSADA":
      return ca ? "Font pausada per l'administrador" : "Fuente pausada por el administrador";
    default:
      return m;
  }
}

function FontsTab() {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: string; code?: string } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [d, h] = await Promise.all([
      fetch("/api/admin/datos-fuentes")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/health")
        .then((r) => r.json())
        .catch(() => null),
    ]);
    setData(d);
    setHealth(h);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const accio = async (action: string, code: string, extra: Record<string, unknown> = {}) => {
    setBusy(code + action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/datos-fuentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code, ...extra }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setMsg(d.comandos ? `${d.message}: ${d.comandos}` : d.message || "OK");
        setModal(null);
        setForm({});
        await load();
      } else {
        setMsg(d.message || d.error || "Error");
      }
    } catch (e: any) {
      setMsg("Error: " + (e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <div className="mt-6 bg-card rounded-2xl border border-line p-8 text-center text-stone text-sm">…</div>
    );
  }
  const k = data.kpis;
  const font = modal?.code ? data.fonts.find((x: FontData) => x.code === modal.code) : null;

  return (
    <div className="mt-6 space-y-4">
      {msg && (
        <div className="bg-card rounded-xl border border-line px-4 py-3 text-sm text-moss break-all">{msg}</div>
      )}

      {/* Banner d'alertes (taula 11) — sempre amb text, mai només color */}
      {k.alertes?.length > 0 && (
        <div
          className={`rounded-2xl border p-4 ${
            k.alertes.some((a: FontData) => a.estat === "CRITICO")
              ? "border-[#B23B3B] bg-[#B23B3B]/10"
              : "border-[#B8860B] bg-[#B8860B]/10"
          }`}
        >
          <div className="font-bold text-sm">
            {ca
              ? `Alertes de dades: ${k.alertes.length} ${k.alertes.length === 1 ? "font" : "fonts"}`
              : `Alertas de datos: ${k.alertes.length} ${k.alertes.length === 1 ? "fuente" : "fuentes"}`}
          </div>
          <div className="mt-2 space-y-1">
            {k.alertes.map((a: FontData) => (
              <div key={a.code} className="text-sm flex items-start gap-2 flex-wrap">
                <span className="font-bold shrink-0" style={{ color: COLOR_ESTAT[a.estat as string] }}>
                  [{ESTAT_LABEL[a.estat as string]?.[ca ? "ca" : "es"] || a.estat}]
                </span>
                <span>{a.nom}: {a.motius.map((m: string) => estatMotiuText(m, a, ca)).join(" · ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs globals (pla, taula 13) */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card label={ca ? "Frescura mitjana" : "Frescura media"} value={k.frescuraMitjana != null ? `${k.frescuraMitjana} d` : "—"} small />
        <Card label={ca ? "Completitud (renda)" : "Completitud (renta)"} value={`${k.munisRent}/${k.munisTotal}`} small />
        <Card label="Error rate 90d" value={k.errorRate90 != null ? `${k.errorRate90}%` : "—"} small />
        <Card label={ca ? "Canari API" : "Canario API"} value={health?.status === "ok" ? "OK" : health ? "KO" : "—"} small />
        <Card label="ZMRT vigents" value={k.zmrt ?? "—"} small />
        <Card label={ca ? "Fonts en alerta" : "Fuentes en alerta"} value={k.alertes?.length ?? 0} small />
      </div>

      {/* Capçalera de fonts */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold">
          {ca ? "Fonts" : "Fuentes"} ({data.fonts.length})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              for (const f of data.fonts.filter((x: FontData) => x.active)) {
                await accio("auditar_iniciar", f.code);
              }
            }}
            className="px-3 py-2 rounded-lg border border-line text-xs font-semibold hover:bg-sand flex items-center gap-1.5"
          >
            <ClipboardCheck className="w-3.5 h-3.5" /> {ca ? "Auditar tot" : "Auditar todo"}
          </button>
          <button
            onClick={() => {
              setForm({});
              setModal({ kind: "programar" });
            }}
            className="px-3 py-2 rounded-lg border border-line text-xs font-semibold hover:bg-sand flex items-center gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" /> Programar
          </button>
        </div>
      </div>

      {/* Targeta per font (pla, figura 3) */}
      {data.fonts.map((f: FontData) => (
        <FontCard
          key={f.code}
          f={f}
          ca={ca}
          busy={busy}
          onModal={(kind: string) => {
            setForm({});
            setModal({ kind, code: f.code });
          }}
          onAccio={accio}
        />
      ))}

      {/* Modals: confirmació escrita, firma C9/C10 i programació */}
      {modal && (
        <div className="fixed inset-0 z-[1100] bg-black/40 flex items-center justify-center px-4" onClick={() => setModal(null)}>
          <div
            className="bg-card rounded-2xl border border-line p-5 w-full max-w-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {modal.kind === "programar" ? (
              <ProgramarModal ca={ca} />
            ) : font ? (
              <AccioModal kind={modal.kind} f={font} ca={ca} form={form} setForm={setForm} busy={busy} onAccio={accio} />
            ) : null}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setModal(null)} className="px-3 py-1.5 rounded-lg border border-line text-xs hover:bg-sand">
                {ca ? "Tanca" : "Cerrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FontCard({
  f,
  ca,
  busy,
  onModal,
  onAccio,
}: {
  f: FontData;
  ca: boolean;
  busy: string | null;
  onModal: (kind: string) => void;
  onAccio: (action: string, code: string, extra?: Record<string, unknown>) => void;
}) {
  const estat = f.estat as string;
  const btn = "px-2.5 py-1.5 rounded-md border border-line text-xs font-semibold hover:bg-sand disabled:opacity-50";
  const pct = f.pct != null ? Math.min(110, f.pct) : 0;
  const nom = ca ? f.nom : f.nomEs || f.nom;
  return (
    <div
      className={`bg-card rounded-2xl border p-5 ${
        estat === "CRITICO" ? "border-[#B23B3B]/60" : estat === "AVISO" ? "border-[#B8860B]/60" : "border-line"
      }`}
    >
      {/* capçalera: semàforo + nom + chips */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-2.5">
          <span className="mt-1.5 w-3 h-3 rounded-full shrink-0" style={{ background: COLOR_ESTAT[estat] }} />
          <div>
            <div className="font-bold leading-tight">{nom}</div>
            <div className="text-xs text-stone mt-0.5">
              {ca ? f.periodicitatCa : f.periodicitatEs} · {f.institucio}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: COLOR_ESTAT[estat] }}>
            {ESTAT_LABEL[estat]?.[ca ? "ca" : "es"] || estat}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              f.prioritat === "CRITICA" ? "bg-embersoft text-ember3" : "bg-sand text-moss"
            }`}
          >
            {f.prioritat === "CRITICA" ? (ca ? "PRIORITÀRIA" : "PRIORITARIA") : "MEDIA"}
          </span>
          {f.dbUrl && (
            <a href={f.dbUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline text-moss">
              {ca ? "obrir URL" : "abrir URL"} ↗
            </a>
          )}
        </div>
      </div>

      {/* motius del semàforo — el color mai va sol (accessibilitat del pla) */}
      {f.motius?.length > 0 && (
        <div className="mt-2 text-xs font-semibold" style={{ color: COLOR_ESTAT[estat] }}>
          {f.motius.map((m: string) => estatMotiuText(m, f, ca)).join(" · ")}
        </div>
      )}

      {/* frescura (KPI-1) */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-stone">
          <span>
            {ca ? "Frescura" : "Frescura"}: <b className="text-ink">{f.dies != null ? `${f.dies} d` : "—"}</b> / SLA {f.slaDies} d
            {(f.slaNotaCa || f.slaNotaEs) ? (ca ? " (proposat)" : " (propuesto)") : ""}
          </span>
          <span>{f.pct != null ? `${f.pct}%` : "—"}</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-sand2 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLOR_ESTAT[estat] }} />
        </div>
      </div>

      {/* fitxa tècnica (columnes del model DataSource) */}
      <div className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone">
        <div>{ca ? "Llicència" : "Licencia"}: <span className="text-ink">{f.llicencia || "—"}</span></div>
        <div>
          Auditoria F0: <span className="font-mono text-ink">{f.auditSlug}</span>
        </div>
        <div className="sm:col-span-2">
          {ca ? "Cadència vigent" : "Cadencia vigente"}: {ca ? f.cadenciaCa : f.cadenciaEs}
        </div>
      </div>

      {/* última import / última execució / última auditoria / verificació */}
      <div className="mt-3 text-xs space-y-1">
        {f.ultimaOk ? (
          <div>
            {ca ? "Última import OK" : "Última import OK"}: <b>{new Date(f.ultimaOk.at).toLocaleDateString()}</b> ·{" "}
            {f.ultimaOk.rowsTotal} {ca ? "files" : "filas"} ({f.ultimaOk.created} {ca ? "noves" : "nuevas"} /{" "}
            {f.ultimaOk.updated} act. / {f.ultimaOk.skipped} ign.)
          </div>
        ) : (
          <div className="text-stone">
            {ca ? "Cap importació OK registrada encara." : "Ninguna importación OK registrada todavía."}
          </div>
        )}
        {f.ultimaRun && f.ultimaRun.status !== "OK" && (
          <div className="text-ember3">
            {ca ? "Última execució" : "Última ejecución"}: {f.ultimaRun.status} ({new Date(f.ultimaRun.at).toLocaleString()})
            {f.ultimaRun.source ? ` · ${f.ultimaRun.source}` : ""}
            {f.ultimaRun.error ? ` — ${f.ultimaRun.error}` : ""}
          </div>
        )}
        {f.lastF0 && (
          <div>
            {ca ? "Última auditoria F0" : "Última auditoría F0"}:{" "}
            <span
              className={`font-bold px-1.5 py-0.5 rounded ${
                f.lastF0.veredicte === "GO"
                  ? "bg-mintsoft text-green2"
                  : f.lastF0.veredicte === "NO_GO"
                    ? "bg-embersoft text-ember3"
                    : "bg-sand text-moss"
              }`}
            >
              {VEREDICTE_LABEL[f.lastF0.veredicte] || f.lastF0.veredicte} ({f.lastF0.controles}/12)
            </span>{" "}
            · {new Date(f.lastF0.at).toLocaleDateString()}
            {f.lastF0.sha256 ? ` · sha256 ${String(f.lastF0.sha256).slice(0, 10)}…` : ""}
            {f.lastF0.veredicte === "GO_CONDICIONAL" && (
              <span>
                {" · "}
                {ca ? "firma" : "firma"}:{" "}
                {f.firmaValida ? (
                  <b className="text-green2">{ca ? "registrada ✓" : "registrada ✓"}</b>
                ) : (
                  <b className="text-ember3">{ca ? "pendent" : "pendiente"}</b>
                )}
              </span>
            )}
            {f.lastF0.notas ? <div className="text-stone mt-0.5">{f.lastF0.notas}</div> : null}
          </div>
        )}
        {f.lastVerificar && (
          <div>
            {ca ? "Última verificació" : "Última verificación"}: <b>{f.lastVerificar.meta?.ok ? "OK" : "KO"}</b> ·{" "}
            {new Date(f.lastVerificar.at).toLocaleString()}
            {f.lastVerificar.meta?.munisTotal
              ? ` · ${f.lastVerificar.meta.munisTotal} munis · ${f.lastVerificar.meta.munisRent} ${ca ? "amb sèrie" : "con serie"} · ZMRT ${f.lastVerificar.meta.zmrt ?? "n/d"}`
              : ""}
          </div>
        )}
      </div>

      {/* assistent de 4 passos (pla, figura 4) */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[11px]">
        <Pas n={1} label={ca ? "Descàrrega" : "Descarga"} state={f.ultimaRun ? "ok" : "pendent"} hint={f.ultimaRun ? new Date(f.ultimaRun.at).toLocaleDateString() : undefined} />
        <span className="text-stone">→</span>
        <Pas
          n={2}
          label="Auditoria F0"
          state={
            f.lastF0
              ? f.lastF0.veredicte === "GO" || (f.lastF0.veredicte === "GO_CONDICIONAL" && f.firmaValida)
                ? "ok"
                : f.lastF0.veredicte === "NO_GO"
                  ? "ko"
                  : "aviso"
              : "pendent"
          }
          hint={f.lastF0 ? VEREDICTE_LABEL[f.lastF0.veredicte] || f.lastF0.veredicte : undefined}
        />
        <span className="text-stone">→</span>
        <Pas n={3} label="Importar" state={f.importacioOk ? "ok" : "bloquejat"} hint={f.importacioOk ? (ca ? "desbloquejat" : "desbloqueado") : ca ? "F0 necessari" : "F0 necesario"} />
        <span className="text-stone">→</span>
        <Pas n={4} label={ca ? "Verificar" : "Verificar"} state={f.lastVerificar ? (f.lastVerificar.meta?.ok ? "ok" : "ko") : "pendent"} hint={f.lastVerificar ? new Date(f.lastVerificar.at).toLocaleDateString() : undefined} />
      </div>

      {/* accions (pla, taula 12) */}
      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
        <button onClick={() => onModal("auditar")} className={btn}>
          {ca ? "Auditar" : "Auditar"}
        </button>
        <button
          onClick={() => onModal("importar")}
          disabled={!f.importacioOk}
          title={
            f.importacioOk
              ? undefined
              : ca
                ? "Bloquejat: exigeix auditoria F0 GO o firma humana C9/C10"
                : "Bloqueado: exige auditoría F0 GO o firma humana C9/C10"
          }
          className={btn}
        >
          {ca ? "Importar" : "Importar"}
        </button>
        <button onClick={() => onAccio("verificar", f.code)} disabled={busy === f.code + "verificar"} className={btn}>
          {busy === f.code + "verificar" ? "…" : ca ? "Verificar" : "Verificar"}
        </button>
        <button onClick={() => onModal("rollback")} className={btn}>
          Rollback
        </button>
        <button onClick={() => onModal("importar_registrar")} className={btn}>
          {ca ? "+ Resultat" : "+ Resultado"}
        </button>
        <a href={`/api/admin/datos-fuentes?informe=${f.code}`} className={btn + " inline-flex items-center gap-1"}>
          <FileDown className="w-3 h-3" /> Informe
        </a>
        {f.lastF0?.veredicte === "GO_CONDICIONAL" && !f.firmaValida && (
          <button
            onClick={() => onModal("firma")}
            className="px-2.5 py-1.5 rounded-md bg-[#FBF3DC] border border-[#B8860B]/40 text-xs font-semibold text-[#8A6D1C] hover:opacity-80"
          >
            {ca ? "Firmar revisió humana" : "Firmar revisión humana"}
          </button>
        )}
        {f.active ? (
          <button onClick={() => onModal("pausar")} className={btn + " text-ember3"}>
            {ca ? "Pausar" : "Pausar"}
          </button>
        ) : (
          <button onClick={() => onAccio("activar", f.code)} disabled={busy === f.code + "activar"} className={btn}>
            {busy === f.code + "activar" ? "…" : ca ? "Activar" : "Activar"}
          </button>
        )}
      </div>
    </div>
  );
}

function Pas({ n, label, state, hint }: { n: number; label: string; state: string; hint?: string }) {
  const cls =
    state === "ok"
      ? "bg-mintsoft text-green2"
      : state === "ko" || state === "bloquejat"
        ? "bg-embersoft text-ember3"
        : state === "aviso"
          ? "bg-[#FBF3DC] text-[#8A6D1C]"
          : "bg-sand text-stone";
  return (
    <span className={`px-2 py-1 rounded-md font-semibold ${cls}`} title={hint}>
      {n} {label}
      {hint ? ` · ${hint}` : ""}
    </span>
  );
}

function AccioModal({
  kind,
  f,
  ca,
  form,
  setForm,
  busy,
  onAccio,
}: {
  kind: string;
  f: FontData;
  ca: boolean;
  form: Record<string, string>;
  setForm: (v: Record<string, string>) => void;
  busy: string | null;
  onAccio: (action: string, code: string, extra?: Record<string, unknown>) => void;
}) {
  const inp = "w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm outline-none focus:border-ember";
  const lbl = "block text-xs text-stone mt-3";
  const set = (key: string) => (e: any) => setForm({ ...form, [key]: e.target.value });
  const btn = "mt-4 px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2 disabled:opacity-50";
  const nom = ca ? f.nom : f.nomEs || f.nom;

  if (kind === "auditar") {
    return (
      <div>
        <h3 className="font-bold">
          {ca ? "Auditar" : "Auditar"}: {nom}
        </h3>
        <p className="text-sm text-moss mt-2 leading-relaxed">
          {ca
            ? "1) Registra la sol·licitud (ImportRun AUDIT). 2) Executa l'auditoria F0 (12 controls, sense escriure a BD) al teu entorn d'operació o al workflow de manteniment. 3) Registra el veredicte: GO 12/12 desbloqueja Importar; GO-CONDICIONAL exigeix firma humana de C9/C10; NO-GO atura el procés."
            : "1) Registra la solicitud (ImportRun AUDIT). 2) Ejecuta la auditoría F0 (12 controles, sin escribir en BD) en tu entorno de operación o en el workflow de mantenimiento. 3) Registra el veredicto: GO 12/12 desbloquea Importar; GO-CONDICIONAL exige firma humana de C9/C10; NO-GO detiene el proceso."}
        </p>
        <pre className="mt-3 bg-cream border border-sand3 rounded-lg p-3 text-xs overflow-x-auto">{f.procediments.auditar}</pre>
        <button
          onClick={() => onAccio("auditar_iniciar", f.code)}
          disabled={busy === f.code + "auditar_iniciar"}
          className={btn}
        >
          {busy === f.code + "auditar_iniciar" ? "…" : ca ? "Registra la sol·licitud" : "Registra la solicitud"}
        </button>
        <div className="mt-5 border-t border-sand3 pt-4">
          <h4 className="font-bold text-sm">{ca ? "Registra el resultat F0" : "Registra el resultado F0"}</h4>
          <label className={lbl}>{ca ? "Veredicte" : "Veredicto"}</label>
          <select value={form.veredicte || ""} onChange={set("veredicte")} className={inp}>
            <option value="">{ca ? "Tria…" : "Elige…"}</option>
            <option value="GO">GO (12/12)</option>
            <option value="GO_CONDICIONAL">{ca ? "GO-CONDICIONAL (C9/C10 pendents de firma)" : "GO-CONDICIONAL (C9/C10 pendientes de firma)"}</option>
            <option value="NO_GO">NO-GO</option>
          </select>
          <label className={lbl}>{ca ? "Controls superats (0-12)" : "Controles superados (0-12)"}</label>
          <input type="number" min={0} max={12} value={form.controles || ""} onChange={set("controles")} className={inp} />
          <label className={lbl}>SHA-256 ({ca ? "opcional" : "opcional"})</label>
          <input value={form.sha256 || ""} onChange={set("sha256")} className={inp} placeholder="a3f8…" />
          <label className={lbl}>{ca ? "Notes (desviacions C9/C10, incidències…)" : "Notas (desviaciones C9/C10, incidencias…)"}</label>
          <textarea rows={2} value={form.notas || ""} onChange={set("notas")} className={inp} />
          <button
            onClick={() =>
              onAccio("auditar_registrar", f.code, {
                veredicte: form.veredicte,
                controles: form.controles,
                sha256: form.sha256,
                notas: form.notas,
              })
            }
            disabled={busy === f.code + "auditar_registrar" || !form.veredicte}
            className={btn}
          >
            {busy === f.code + "auditar_registrar" ? "…" : ca ? "Registra el veredicte" : "Registra el veredicto"}
          </button>
        </div>
      </div>
    );
  }

  if (kind === "importar") {
    return (
      <div>
        <h3 className="font-bold">
          {ca ? "Importar" : "Importar"}: {nom}
        </h3>
        <p className="text-sm text-moss mt-2 leading-relaxed">
          {ca
            ? "Acció protegida: exigeix auditoria F0 12/12 (o firma humana C9/C10 posterior), confirmació escrita i backup previ obligatori. La promoció staging→producció corre a càrrec del pipeline (update_all.sh) al teu entorn d'operació o al workflow de manteniment; el panell registra la sol·licitud a l'auditoria."
            : "Acción protegida: exige auditoría F0 12/12 (o firma humana C9/C10 posterior), confirmación escrita y backup previo obligatorio. La promoción staging→producción corre a cargo del pipeline (update_all.sh) en tu entorno de operación o en el workflow de mantenimiento; el panel registra la solicitud en la auditoría."}
        </p>
        <div className="mt-2 text-xs text-stone">
          F0:{" "}
          {f.lastF0
            ? `${VEREDICTE_LABEL[f.lastF0.veredicte] || f.lastF0.veredicte} (${f.lastF0.controles}/12) · ${new Date(f.lastF0.at).toLocaleDateString()}`
            : ca
              ? "sense auditoria registrada"
              : "sin auditoría registrada"}
          {f.lastF0?.veredicte === "GO_CONDICIONAL" ? ` · ${ca ? "firma" : "firma"}: ${f.firmaValida ? "OK" : ca ? "pendent" : "pendiente"}` : ""}
        </div>
        <label className={lbl}>
          {ca ? `Escriu «IMPORTAR ${f.code}» per confirmar` : `Escribe «IMPORTAR ${f.code}» para confirmar`}
        </label>
        <input value={form.confirm || ""} onChange={set("confirm")} className={inp} placeholder={`IMPORTAR ${f.code}`} />
        <button
          onClick={() => onAccio("importar", f.code, { confirm: form.confirm })}
          disabled={busy === f.code + "importar"}
          className={btn}
        >
          {busy === f.code + "importar" ? "…" : ca ? "Registra la sol·licitud d'importació" : "Registra la solicitud de importación"}
        </button>
        <div className="mt-5 border-t border-sand3 pt-4">
          <h4 className="font-bold text-sm">
            {ca ? "Registra el resultat de l'execució" : "Registra el resultado de la ejecución"}
          </h4>
          <label className={lbl}>{ca ? "Estat" : "Estado"}</label>
          <select value={form.status || ""} onChange={set("status")} className={inp}>
            <option value="">{ca ? "Tria…" : "Elige…"}</option>
            <option value="OK">OK</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="ERROR">ERROR</option>
          </select>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className={lbl}>{ca ? "Files total" : "Filas total"}</label>
              <input type="number" min={0} value={form.rowsTotal || ""} onChange={set("rowsTotal")} className={inp} />
            </div>
            <div>
              <label className={lbl}>{ca ? "Noves" : "Nuevas"}</label>
              <input type="number" min={0} value={form.created || ""} onChange={set("created")} className={inp} />
            </div>
            <div>
              <label className={lbl}>{ca ? "Actualitzades" : "Actualizadas"}</label>
              <input type="number" min={0} value={form.updated || ""} onChange={set("updated")} className={inp} />
            </div>
            <div>
              <label className={lbl}>{ca ? "Ignorades" : "Ignoradas"}</label>
              <input type="number" min={0} value={form.skipped || ""} onChange={set("skipped")} className={inp} />
            </div>
          </div>
          <label className={lbl}>Error ({ca ? "si n'hi ha" : "si lo hay"})</label>
          <input value={form.error || ""} onChange={set("error")} className={inp} />
          <button
            onClick={() =>
              onAccio("importar_registrar", f.code, {
                status: form.status,
                rowsTotal: form.rowsTotal,
                created: form.created,
                updated: form.updated,
                skipped: form.skipped,
                error: form.error,
              })
            }
            disabled={busy === f.code + "importar_registrar" || !form.status}
            className={btn}
          >
            {busy === f.code + "importar_registrar" ? "…" : ca ? "Registra el resultat" : "Registra el resultado"}
          </button>
        </div>
      </div>
    );
  }

  if (kind === "rollback") {
    return (
      <div>
        <h3 className="font-bold text-ember3">
          Rollback: {nom}
        </h3>
        <p className="text-sm text-moss mt-2 leading-relaxed">
          {ca
            ? "Acció destructiva: restaura el backup anterior (<taula>_bak_<data> o artifact backup-pg) i reverifica amb el canari. La restauració corre al teu entorn d'operació; el panell registra la sol·licitud amb la teva firma a l'auditoria. Només si el backup existeix."
            : "Acción destructiva: restaura el backup anterior (<tabla>_bak_<fecha> o artifact backup-pg) y reverifica con el canario. La restauración corre en tu entorno de operación; el panel registra la solicitud con tu firma en la auditoría. Solo si el backup existe."}
        </p>
        <pre className="mt-3 bg-cream border border-sand3 rounded-lg p-3 text-xs overflow-x-auto">{f.procediments.rollback}</pre>
        <label className={lbl}>
          {ca ? `Escriu «ROLLBACK ${f.code}» per confirmar` : `Escribe «ROLLBACK ${f.code}» para confirmar`}
        </label>
        <input value={form.confirm || ""} onChange={set("confirm")} className={inp} placeholder={`ROLLBACK ${f.code}`} />
        <button
          onClick={() => onAccio("rollback", f.code, { confirm: form.confirm })}
          disabled={busy === f.code + "rollback"}
          className={btn + " bg-ember text-white hover:bg-ember2 border-ember"}
        >
          {busy === f.code + "rollback" ? "…" : ca ? "Registra la sol·licitud de rollback" : "Registra la solicitud de rollback"}
        </button>
      </div>
    );
  }

  if (kind === "pausar") {
    return (
      <div>
        <h3 className="font-bold">
          {ca ? "Pausar" : "Pausar"}: {nom}
        </h3>
        <p className="text-sm text-moss mt-2 leading-relaxed">
          {ca
            ? "Desactiva la font (DataSource.active=false): els cicles i la vigilància l'ignoren sense esborrar cap dada. Pots reactivar-la quan vulguis amb «Activar»."
            : "Desactiva la fuente (DataSource.active=false): los ciclos y la vigilancia la ignoran sin borrar ningún dato. Puedes reactivarla cuando quieras con «Activar»."}
        </p>
        <label className={lbl}>{ca ? "Motiu (obligatori)" : "Motivo (obligatorio)"}</label>
        <textarea rows={2} value={form.motivo || ""} onChange={set("motivo")} className={inp} />
        <button
          onClick={() => onAccio("pausar", f.code, { motivo: form.motivo })}
          disabled={busy === f.code + "pausar"}
          className={btn}
        >
          {busy === f.code + "pausar" ? "…" : ca ? "Pausa la font" : "Pausa la fuente"}
        </button>
      </div>
    );
  }

  if (kind === "firma") {
    return (
      <div>
        <h3 className="font-bold">
          {ca ? "Firma humana C9/C10" : "Firma humana C9/C10"}: {nom}
        </h3>
        <p className="text-sm text-moss mt-2 leading-relaxed">
          {ca
            ? "L'última auditoria F0 va acabar en GO-CONDICIONAL (desviació C9/C10). Si has revisat la desviació i dones el vist-i-plau, signa aquí: la firma desbloqueja «Importar» per a aquesta font i queda registrada a l'auditoria amb el teu correu i el motiu."
            : "La última auditoría F0 terminó en GO-CONDICIONAL (desviación C9/C10). Si has revisado la desviación y das el visto bueno, firma aquí: la firma desbloquea «Importar» para esta fuente y queda registrada en la auditoría con tu correo y el motivo."}
        </p>
        {f.lastF0?.notas ? (
          <div className="mt-2 text-xs bg-cream border border-sand3 rounded-lg p-3">
            {ca ? "Notes de l'auditoria" : "Notas de la auditoría"}: {f.lastF0.notas}
          </div>
        ) : null}
        <label className={lbl}>{ca ? "Motiu de la firma (obligatori)" : "Motivo de la firma (obligatorio)"}</label>
        <textarea rows={2} value={form.motivo || ""} onChange={set("motivo")} className={inp} placeholder={ca ? "Revisades les X zones desviades: dada oficial confirmada" : "Revisadas las X zonas desviadas: dato oficial confirmado"} />
        <button
          onClick={() => onAccio("firma_f0", f.code, { motivo: form.motivo })}
          disabled={busy === f.code + "firma_f0"}
          className={btn}
        >
          {busy === f.code + "firma_f0" ? "…" : ca ? "Signa el vist-i-plau" : "Firma el visto bueno"}
        </button>
      </div>
    );
  }

  return null;
}

function ProgramarModal({ ca }: { ca: boolean }) {
  return (
    <div>
      <h3 className="font-bold">{ca ? "Programació vigent (cron)" : "Programación vigente (cron)"}</h3>
      <p className="text-sm text-moss mt-2 leading-relaxed">
        {ca
          ? "Els cicles de manteniment corren al workflow de GitHub Actions (.github/workflows/mantenimiento.yml) i als crons de l'app (vercel.json). El cron s'edita al repositori; el panell sempre mostra la programació vigent."
          : "Los ciclos de mantenimiento corren en el workflow de GitHub Actions (.github/workflows/mantenimiento.yml) y en los crons de la app (vercel.json). El cron se edita en el repositorio; el panel siempre muestra la programación vigente."}
      </p>
      <div className="mt-3 space-y-1.5">
        {FONTS_PANEL.map((f) => (
          <div key={f.code} className="border border-sand2 rounded-lg px-3 py-2 text-xs">
            <b>{ca ? f.nom : f.nomEs || f.nom}</b>
            <div className="text-stone mt-0.5">{ca ? f.cadenciaCa : f.cadenciaEs}</div>
          </div>
        ))}
      </div>
      <a
        href="https://github.com/ranndoneur26/preureal/blob/main/.github/workflows/mantenimiento.yml"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs underline text-moss inline-block mt-3"
      >
        .github/workflows/mantenimiento.yml ↗
      </a>
    </div>
  );
}
