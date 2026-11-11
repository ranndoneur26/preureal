"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { RefreshCw, Shield, Mail, Database, Plug, Users, Euro, Filter, FileWarning, ClipboardCheck, Settings, Download, ScrollText, FileDown, HeartHandshake, MapPin } from "lucide-react";

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

type TabId = "stats" | "users" | "emails" | "data" | "reports" | "plans" | "audit";

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
      const errs: string[] = d.errors || [];
      setSeedMunisMsg(
        res.ok
          ? `OK: ${d.created} nous, ${d.updated} actualitzats de ${d.total} municipis` +
            (errs.length ? ` — ERRORS (mostreig): ${errs.join(" | ")}` : "")
          : d.message || d.error,
      );
    } catch (e: any) {
      setSeedMunisMsg("Error: " + e.message);
    } finally {
      setSeedingMunis(false);
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
          <Shield className="w-7 h-7 text-[#0f2e21]" />
          {t.admin.title}
        </h1>
        <button onClick={loadAll} className="p-2 rounded-lg border border-[#e5e1da] hover:bg-[#f0ede8]" title="Refrescar">
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
            ["reports", ca ? "Informes ciutadans" : "Informes ciudadanos", ClipboardCheck],
            ["plans", ca ? "Plans i límits" : "Planes y límites", Settings],
            ["audit", ca ? "Auditoria" : "Auditoría", ScrollText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as TabId)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
              tab === id ? "bg-[#0f2e21] text-white" : "bg-white border border-[#e5e1da] hover:bg-[#f0ede8]"
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

          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
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
                  <div className="bg-[#e8673c] rounded-t-sm" style={{ height: `${(s.SUBSCRIBE_SUCCESS / maxSeries) * 100}%`, minHeight: s.SUBSCRIBE_SUCCESS ? 3 : 0 }} />
                  <div className="bg-[#0f2e21] rounded-b-sm" style={{ height: `${(s.MAP_QUERY / maxSeries) * 100}%`, minHeight: s.MAP_QUERY ? 2 : 0 }} />
                </div>
              ))}
              {stats.series.length === 0 && <div className="text-sm text-[#6b6f68]">—</div>}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-[#6b6f68]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#0f2e21] inline-block rounded-sm" /> MAP_QUERY</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#e8673c] inline-block rounded-sm" /> SUBSCRIBE_SUCCESS</span>
            </div>
          </div>

          {/* Integracions + estat BD */}
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
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
                <a key={ty} href={`/api/admin/export-csv?type=${ty}`} className="px-3 py-2 rounded-lg border border-[#e5e1da] text-xs font-semibold hover:bg-[#f0ede8] flex items-center gap-1.5">
                  <FileDown className="w-3.5 h-3.5" /> {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* USUARIS */}
      {tab === "users" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] overflow-hidden">
          <div className="p-4 border-b border-[#eee9e1] flex gap-2 flex-wrap items-center">
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder={t.admin.search}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
            />
            <select value={userPlanFilter} onChange={(e) => setUserPlanFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-[#e5e1da] text-sm">
              <option value="">{ca ? "Tots els plans" : "Todos los planes"}</option>
              <option value="FREE">FREE</option>
              <option value="PREMIUM">PREMIUM</option>
              <option value="PRO">PRO</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#faf9f7] text-left">
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
                  <tr key={u.id} className={`border-t border-[#f2efe9] ${u.active ? "" : "opacity-50"}`}>
                    <td className="px-4 py-2.5">
                      {u.email}
                      <span className="block text-xs text-[#6b6f68]">{u.name || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={u.plan} onChange={async (e) => patchUser(u.id, { plan: e.target.value })} className="border border-[#e5e1da] rounded-md px-2 py-1 text-xs">
                        <option>FREE</option>
                        <option>PREMIUM</option>
                        <option>PRO</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={u.role} onChange={async (e) => patchUser(u.id, { role: e.target.value })} className="border border-[#e5e1da] rounded-md px-2 py-1 text-xs">
                        <option>USER</option>
                        <option>ADMIN</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => patchUser(u.id, { active: !u.active })}
                        className={`text-xs font-bold px-2 py-1 rounded-full ${u.active ? "bg-[#e6f4ea] text-[#1e7a41]" : "bg-[#fdeae2] text-[#b0431c]"}`}
                      >
                        {u.active ? (ca ? "Actiu" : "Activo") : (ca ? "Desactivat" : "Desactivado")}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{u.emailVerifiedAt ? "✓" : "—"}</td>
                    <td className="px-4 py-2.5 text-[#6b6f68]">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b6f68]">—</td></tr>
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
            <div className="bg-white rounded-2xl border border-[#e5e1da] p-8 text-center text-[#6b6f68] text-sm">
              {t.admin.noEmails}
            </div>
          )}
          {emails.map((e) => (
            <div key={e.id} className="bg-white rounded-xl border border-[#e5e1da] p-4">
              <div className="flex justify-between gap-2 flex-wrap">
                <div className="font-semibold text-sm">{e.subject}</div>
                <div className="text-xs text-[#6b6f68]">
                  {e.provider} · {e.status}
                  {e.type && e.type !== "GENERIC" ? ` · ${e.type}` : ""}
                  {e.attempts > 1 ? ` · ${e.attempts} intents` : ""}
                  {e.providerMessageId ? ` · msg ${String(e.providerMessageId).slice(0, 8)}` : ""}
                  {" · "}
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-[#6b6f68] mt-1">→ {e.to}</div>
              {/* Diagnòstic: error real retornat pel proveïdor (Resend) quan status === "error" */}
              {e.error ? (
                <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 whitespace-pre-wrap break-all">
                  {String(e.error).slice(0, 600)}
                </div>
              ) : null}
              {/* text net (htmlToText al servidor) — sense dangerouslySetInnerHTML */}
              <pre className="mt-2 text-xs bg-[#faf9f7] rounded-lg p-3 max-h-40 overflow-y-auto pr-scroll whitespace-pre-wrap font-sans">{e.bodyText}</pre>
            </div>
          ))}
        </div>
      )}

      {/* DADES / IMPORTACIÓ */}
      {tab === "data" && (
        <div className="mt-6 space-y-4">
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
            <h3 className="font-bold flex items-center gap-2"><FileWarning className="w-4 h-4 text-[#e8673c]" />{t.admin.importTitle}</h3>
            <p className="text-sm text-[#4b5349] mt-2 leading-relaxed">{t.admin.importDesc}</p>
            <pre className="mt-3 bg-[#faf9f7] border border-[#eee9e1] rounded-lg p-3 text-xs overflow-x-auto">{`[
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
              className="mt-3 w-full px-3 py-2 rounded-lg border border-[#e5e1da] text-sm font-mono outline-none focus:border-[#e8673c]"
            />
            <div className="mt-3 flex items-center gap-3">
              <button onClick={doImport} className="px-4 py-2 rounded-lg bg-[#0f2e21] text-white text-sm font-bold hover:bg-[#16402e]">
                {t.admin.importBtn}
              </button>
              {importMsg && <span className="text-sm text-[#4b5349]">{importMsg}</span>}
            </div>
          </div>

          {/* Fase 4 — catàleg d'ajudes al lloguer (seed editorial) */}
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
            <h3 className="font-bold flex items-center gap-2"><HeartHandshake className="w-4 h-4 text-[#0f2e21]" />{ca ? "Ajudes al lloguer — catàleg editorial" : "Ayudas al alquiler — catálogo editorial"}</h3>
            <p className="text-sm text-[#4b5349] mt-2 leading-relaxed">
              {ca
                ? "Sincronitza a la base de dades el catàleg d'ajudes al lloguer (font: src/data/rental_aid_seed.json, revisió 2026-11-10). Idempotent: pot executar-se tantes vegades com calgui sense duplicar files. Només escriu a la taula RentalAid."
                : "Sincroniza en la base de datos el catálogo de ayudas al alquiler (fuente: src/data/rental_aid_seed.json, revisión 2026-11-10). Idempotente: puede ejecutarse tantas veces como haga falta sin duplicar filas. Solo escribe en la tabla RentalAid."}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={doSeedAid}
                disabled={seedingAid}
                className="px-4 py-2 rounded-lg bg-[#0f2e21] text-white text-sm font-bold hover:bg-[#16402e] disabled:opacity-50"
              >
                {seedingAid
                  ? ca ? "Sincronitzant…" : "Sincronizando…"
                  : ca ? "Sincronitza el catàleg" : "Sincronizar el catálogo"}
              </button>
              {seedAidMsg && <span className="text-sm text-[#4b5349]">{seedAidMsg}</span>}
            </div>
          </div>

          {/* v39 — dades municipals (fiances Incasòl + ref. comarca) */}
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
            <h3 className="font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-[#0f2e21]" />{ca ? "Dades municipals — fiances i referències de comarca" : "Datos municipales — fianzas y referencias de comarca"}</h3>
            <p className="text-sm text-[#4b5349] mt-2 leading-relaxed">
              {ca
                ? "Sincronitza la taula Municipality amb el seed empaquetat (src/data/municipalities.json): fiances Incasòl oficials vigents, Palamós recuperat i la referència de comarca dels 254 municipis sense renda publicada. Idempotent (upsert per codi): no duplica files i només escriu a Municipality."
                : "Sincroniza la tabla Municipality con el seed empaquetado (src/data/municipalities.json): fianzas Incasòl oficiales vigentes, Palamós recuperado y la referencia de comarca de los 254 municipios sin renta publicada. Idempotente (upsert por código): no duplica filas y solo escribe en Municipality."}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={doSeedMunis}
                disabled={seedingMunis}
                className="px-4 py-2 rounded-lg bg-[#0f2e21] text-white text-sm font-bold hover:bg-[#16402e] disabled:opacity-50"
              >
                {seedingMunis
                  ? ca ? "Sincronitzant…" : "Sincronizando…"
                  : ca ? "Sincronitza les dades municipals" : "Sincronizar los datos municipales"}
              </button>
              {seedMunisMsg && <span className="text-sm text-[#4b5349]">{seedMunisMsg}</span>}
            </div>
          </div>

          {/* Historial d'importacions (Fase 9.2) */}
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
            <h3 className="font-bold mb-3">{ca ? "Historial d'importacions" : "Historial de importaciones"}</h3>
            {importRuns && importRuns.length > 0 ? (
              <div className="space-y-2 text-sm">
                {importRuns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border border-[#f2efe9] rounded-lg px-3 py-2">
                    <span>
                      <b>{r.source}</b> · {r.created} nous / {r.updated} act. / {r.skipped} ignorats de {r.rowsTotal}
                      <span className="block text-xs text-[#6b6f68]">{new Date(r.createdAt).toLocaleString()} · estat {r.status}{r.error ? ` — ${r.error}` : ""}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6b6f68]">{ca ? "Cap importació registrada encara." : "Ninguna importación registrada todavía."}</p>
            )}
          </div>
        </div>
      )}

      {/* INFORMES CIUTADANS — MODERACIÓ */}
      {tab === "reports" && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card label="Pendents" value={modStats?.PENDING ?? "—"} />
            <Card label="Acceptats" value={modStats?.ACCEPTED ?? "—"} />
            <Card label="Rebutjats" value={modStats?.REJECTED ?? "—"} />
          </div>
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5 space-y-2">
            {modReports === null && <p className="text-sm text-[#6b6f68]">…</p>}
            {modReports?.length === 0 && <p className="text-sm text-[#6b6f68]">{ca ? "Cap informe." : "Ningún informe."}</p>}
            {modReports?.map((r) => (
              <div key={r.id} className="border border-[#f2efe9] rounded-lg px-3 py-2.5 text-sm flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <b>{r.offerEurMonth} €/mes</b> {r.offerEurM2 && <span className="text-xs text-[#6b6f68]">({r.offerEurM2} €/m²)</span>}
                  <span className="block text-xs text-[#6b6f68]">
                    mun {r.municipalityCode} · {r.contractType || "—"} · {r.surfaceM2 ? `${r.surfaceM2} m²` : "—"} · {r.userEmail || "anònim"} · {new Date(r.createdAt).toLocaleString()}
                    {r.note && <span className="block">nota: {r.note}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "ACCEPTED" ? "bg-[#e6f4ea] text-[#1e7a41]" : r.status === "REJECTED" ? "bg-[#fdeae2] text-[#b0431c]" : "bg-[#f0ede8]"}`}>
                    {r.status}
                  </span>
                  {r.status !== "ACCEPTED" && (
                    <button onClick={() => moderate(r.id, "ACCEPTED")} className="px-2.5 py-1 rounded-md bg-[#e6f4ea] text-[#1e7a41] text-xs font-semibold">Acceptar</button>
                  )}
                  {r.status !== "REJECTED" && (
                    <button onClick={() => moderate(r.id, "REJECTED")} className="px-2.5 py-1 rounded-md bg-[#fdeae2] text-[#b0431c] text-xs font-semibold">Rebutjar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PLANS I LÍMITS */}
      {tab === "plans" && planSettings && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-5">
          <h3 className="font-bold mb-3">{ca ? "Configuració dels plans (efectiva al servidor)" : "Configuración de los planes (efectiva en el servidor)"}</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {(["FREE", "PREMIUM", "PRO"] as const).map((p) => (
              <div key={p} className="border border-[#f2efe9] rounded-xl p-4 space-y-2">
                <div className="font-bold">{p}</div>
                <div>
                  <label className="text-xs text-[#6b6f68]">{ca ? "Consultes/mes (-1 = il·limitades)" : "Consultas/mes (-1 = ilimitadas)"}</label>
                  <input
                    type="number"
                    value={planSettings[p].quotaMonth}
                    onChange={(e) => setPlanSettings({ ...planSettings, [p]: { ...planSettings[p], quotaMonth: parseInt(e.target.value, 10) } })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e5e1da] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#6b6f68]">{ca ? "Preu (€/mes)" : "Precio (€/mes)"}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={planSettings[p].priceEur}
                    onChange={(e) => setPlanSettings({ ...planSettings, [p]: { ...planSettings[p], priceEur: parseFloat(e.target.value) } })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e5e1da] text-sm"
                  />
                </div>
                <div className="text-xs text-[#6b6f68] space-y-1">
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
          <button onClick={savePlanSettings} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0f2e21] text-white text-sm font-bold">
            {ca ? "Desar configuració" : "Guardar configuración"}
          </button>
          <p className="text-xs text-[#6b6f68] mt-2">{ca ? "Els canvis s'apliquen al cap de 30 s (cau) i queden registrats a l'auditoria." : "Los cambios se aplican en 30 s (caché) y quedan registrados en la auditoría."}</p>
        </div>
      )}

      {/* AUDITORIA */}
      {tab === "audit" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{ca ? "Historial d'auditoria (accions sensibles)" : "Historial de auditoría (acciones sensibles)"}</h3>
            <a href="/api/admin/export-csv?type=audit" className="text-xs underline flex items-center gap-1"><Download className="w-3 h-3" /> CSV</a>
          </div>
          {auditLogs === null && <p className="text-sm text-[#6b6f68]">…</p>}
          {auditLogs?.length === 0 && <p className="text-sm text-[#6b6f68]">{ca ? "Cap acció registrada encara." : "Ninguna acción registrada todavía."}</p>}
          <div className="space-y-1.5">
            {auditLogs?.map((l) => (
              <div key={l.id} className="text-xs border border-[#f2efe9] rounded-lg px-3 py-2 flex items-start justify-between gap-2 flex-wrap">
                <span>
                  <b className="font-mono">{l.action}</b> {l.target && <span className="text-[#6b6f68]">→ {l.target}</span>}
                  {l.meta && <span className="block text-[#6b6f68] max-w-2xl truncate">{JSON.stringify(l.meta)}</span>}
                </span>
                <span className="text-[#6b6f68] shrink-0">{l.actorEmail || "sistema"} · {new Date(l.createdAt).toLocaleString()}</span>
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
    <div className={`rounded-xl bg-white border border-[#e5e1da] ${small ? "p-3" : "p-4"}`}>
      <div className={`font-black text-[#0f2e21] ${small ? "text-xl" : "text-2xl"}`}>{value}</div>
      <div className={`text-[#6b6f68] mt-0.5 ${small ? "text-[10px]" : "text-xs"}`}>{label}</div>
    </div>
  );
}

function IntRow({ name, ok, detail }: { name: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border border-[#eee9e1] rounded-lg px-3 py-2">
      <span>
        {name}
        {detail && <span className="block text-xs text-[#6b6f68]">{detail}</span>}
      </span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ok ? "bg-[#e6f4ea] text-[#1e7a41]" : "bg-[#fdeae2] text-[#b0431c]"}`}>
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
        setMsg(ca ? "Dades invàlides: revisa l'email i la contrasenya (mínim 8 caràcters)." : "Datos inválidos: revisa el email y la contraseña (mínimo 8 caracteres).");
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
          <button onClick={() => navigate("/entrada")} className="px-5 py-2.5 rounded-xl bg-[#e8673c] text-white font-bold">
            {t.nav.entrada}
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
          <h3 className="font-bold">{ca ? "Recupera l'accés d'administració" : "Recupera el acceso de administración"}</h3>
          <p className="text-sm text-[#4b5349] mt-2 leading-relaxed">
            {ca
              ? "Només per al propietari: defineix ADMIN_BOOTSTRAP_CODE a Vercel (Settings → Environment Variables, després Redeploy) i introdueix aquí el codi amb el teu email i una contrasenya nova (mínim 8 caràcters). Si ja tens compte, se't dona el rol admin; si no, es crea."
              : "Solo para el propietario: define ADMIN_BOOTSTRAP_CODE en Vercel (Settings → Environment Variables, después Redeploy) e introduce aquí el código con tu email y una contraseña nueva (mínimo 8 caracteres). Si ya tienes cuenta, se te da el rol admin; si no, se crea."}
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={ca ? "El teu email" : "Tu email"}
            className="mt-3 w-full px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder={ca ? "Contrasenya nova (mín. 8)" : "Contraseña nueva (mín. 8)"}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={ca ? "Codi de recuperació (ADMIN_BOOTSTRAP_CODE)" : "Código de recuperación (ADMIN_BOOTSTRAP_CODE)"}
            className="mt-2 w-full px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
          />
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={recover}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-[#0f2e21] text-white text-sm font-bold hover:bg-[#16402e] disabled:opacity-50"
            >
              {busy ? (ca ? "Recuperant…" : "Recuperando…") : ca ? "Recupera l'accés" : "Recuperar el acceso"}
            </button>
            {msg && <span className="text-sm text-[#4b5349] flex-1 min-w-[12rem]">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function NoAccess() {
  const { locale } = useApp();
  return (
    <div className="flex-1 flex items-center justify-center px-4 text-[#6b6f68]">
      {locale === "ca" ? "Accés restringit a administradors" : "Acceso restringido a administradores"}
    </div>
  );
}
