"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { RefreshCw, Shield, Mail, Database, Plug, Users, Euro, Filter, FileWarning } from "lucide-react";

interface Stats {
  users: number;
  plans: { free: number; premium: number; pro: number };
  mrr: number;
  funnel30: { signups: number; queries: number; paywalls: number; subscribes: number; teasers: number };
  series: Array<{ day: string; SIGNUP: number; MAP_QUERY: number; PAYWALL_VIEW: number; SUBSCRIBE_SUCCESS: number }>;
  reports: number;
  emails: number;
}

interface Health {
  integrations: {
    icgc: { ok: boolean; status: any };
    catastro: { ok: boolean; status: any };
    stripe: { configured: boolean; demoCheckout: boolean };
    email: { provider: string };
  };
}

export default function AdminView() {
  const { t, auth, navigate, locale } = useApp();
  const [tab, setTab] = useState<"stats" | "users" | "emails" | "data">("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [emails, setEmails] = useState<any[]>([]);
  const [importJson, setImportJson] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

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
    auth.refresh().then(() => {
      if (auth.user && auth.user.role !== "ADMIN") navigate("/");
      else loadAll();
    });
     
  }, []);

  useEffect(() => {
    if (tab === "users") {
      fetch(`/api/admin/users?q=${encodeURIComponent(userQuery)}`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => setUsers(d.users || []))
        .catch(() => {});
    }
  }, [tab, userQuery]);

  if (!auth.user) return <LoginRequired />;
  if (auth.user.role !== "ADMIN") return <NoAccess />;

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
      setImportMsg(res.ok ? `OK: ${d.created} nous, ${d.updated} actualitzats, ${d.skipped} ignorats` : d.error);
    } catch (e: any) {
      setImportMsg("JSON invàlid: " + e.message);
    }
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
            ["stats", locale === "ca" ? "Mètriques" : "Métricas", Filter],
            ["users", t.admin.users, Users],
            ["emails", t.admin.emails, Mail],
            ["data", t.admin.importTitle.split(" (")[0], Database],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
              tab === id ? "bg-[#0f2e21] text-white" : "bg-white border border-[#e5e1da] hover:bg-[#f0ede8]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "stats" && stats && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label={t.admin.users} value={stats.users} />
            <Card label={t.admin.mrr} value={`${stats.mrr.toFixed(2)} €`} />
            <Card label="Premium" value={stats.plans.premium} />
            <Card label="Pro" value={stats.plans.pro} />
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
            {/* mini gráfico de barras 30 días */}
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

          {/* Integraciones */}
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Plug className="w-4 h-4" />{t.admin.integrations}</h3>
            {health && (
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <IntRow name="ICGC API Territorial (edificis, límits, refcat)" ok={health.integrations.icgc.ok} />
                <IntRow name="Cadastre (any de construcció)" ok={health.integrations.catastro.ok} />
                <IntRow
                  name={`Stripe ${health.integrations.stripe.configured ? "(configurat)" : health.integrations.stripe.demoCheckout ? "(MODO PRUEBA)" : "(no configurat)"}`}
                  ok={health.integrations.stripe.configured || health.integrations.stripe.demoCheckout}
                />
                <IntRow name={`Correus (${health.integrations.email.provider})`} ok />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] overflow-hidden">
          <div className="p-4 border-b border-[#eee9e1]">
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder={t.admin.search}
              className="w-full max-w-xs px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#faf9f7] text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.email}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.plan}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.role}</th>
                  <th className="px-4 py-2.5 font-semibold">{t.admin.usersTable.created}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-[#f2efe9]">
                    <td className="px-4 py-2.5">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.plan}
                        onChange={async (e) => {
                          await fetch("/api/admin/users", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: u.id, plan: e.target.value }),
                          });
                          loadAll();
                        }}
                        className="border border-[#e5e1da] rounded-md px-2 py-1 text-xs"
                      >
                        <option>FREE</option>
                        <option>PREMIUM</option>
                        <option>PRO</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={u.role}
                        onChange={async (e) => {
                          await fetch("/api/admin/users", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: u.id, role: e.target.value }),
                          });
                          loadAll();
                        }}
                        className="border border-[#e5e1da] rounded-md px-2 py-1 text-xs"
                      >
                        <option>USER</option>
                        <option>ADMIN</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-[#6b6f68]">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[#6b6f68]">—</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  {e.provider} · {e.status} · {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-[#6b6f68] mt-1">→ {e.to}</div>
              <div className="mt-2 text-xs bg-[#faf9f7] rounded-lg p-3 max-h-40 overflow-y-auto pr-scroll" dangerouslySetInnerHTML={{ __html: e.body }} />
            </div>
          ))}
        </div>
      )}

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

          <div className="bg-white rounded-2xl border border-[#e5e1da] p-5">
            <h3 className="font-bold">{t.admin.reports}</h3>
            <p className="text-3xl font-black mt-2">{stats?.reports ?? "—"}</p>
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

function IntRow({ name, ok }: { name: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border border-[#eee9e1] rounded-lg px-3 py-2">
      <span>{name}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ok ? "bg-[#e6f4ea] text-[#1e7a41]" : "bg-[#fdeae2] text-[#b0431c]"}`}>
        {ok ? "OK" : "KO"}
      </span>
    </div>
  );
}

function LoginRequired() {
  const { t, navigate } = useApp();
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <button onClick={() => navigate("/entrada")} className="px-5 py-2.5 rounded-xl bg-[#e8673c] text-white font-bold">
        {t.nav.entrada}
      </button>
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
