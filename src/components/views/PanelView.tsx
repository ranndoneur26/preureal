"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { User, CreditCard, History, Star, GitCompare, FileText, Shield, Trash2, Settings, BadgeCheck, MailWarning, Download, ExternalLink, Search } from "lucide-react";

interface BillingData {
  subscriptions: Array<{ id: string; plan: string; status: string; demo: boolean; currentPeriodEnd: string | null; createdAt: string }>;
  invoices: Array<{ id: string; date: string | null; amount: number | null; currency: string | null; status: string | null; hostedUrl: string | null }>;
  stripeConfigured: boolean;
}

export default function PanelView() {
  const { t, auth, navigate, locale, setLocale } = useApp();
  const [tab, setTab] = useState("resum");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [verificacio, setVerificacio] = useState<string | null>(null);

  // dades
  const [name, setName] = useState("");
  const [history, setHistory] = useState<any[] | null>(null);
  const [favorites, setFavorites] = useState<any[] | null>(null);
  const [comparisons, setComparisons] = useState<any[] | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [reports, setReports] = useState<any[] | null>(null);
  const [myReports, setMyReports] = useState<any[] | null>(null);

  // seguretat
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    auth.refresh();
    const hq = typeof window !== "undefined" ? window.location.hash.split("?")[1] || "" : "";
    if (hq) {
      const p = new URLSearchParams(hq);
      if (p.get("verificacio")) setVerificacio(p.get("verificacio"));
    }
     
  }, []);

  useEffect(() => {
    if (auth.user) setName(auth.user.name || "");
  }, [auth.user]);

  const loadTab = useCallback(async (tabId: string) => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (tabId === "historial" && history === null) {
      const d = await j("/api/history");
      if (d) setHistory(d.history);
      else setHistory([]);
    }
    if (tabId === "preferits" && favorites === null) {
      const d = await j("/api/favorites");
      if (d) setFavorites(d.favorites);
      else setFavorites([]);
    }
    if (tabId === "comparacions" && comparisons === null) {
      const d = await j("/api/comparisons");
      if (d) setComparisons(d.comparisons);
      else setComparisons([]);
    }
    if (tabId === "facturacio" && billing === null) {
      const d = await j("/api/billing/history");
      if (d) setBilling(d);
    }
    if (tabId === "informes" && myReports === null) {
      const d = await j("/api/account/export");
      if (d) setMyReports(d.informesPreu || []);
    }
  }, [history, favorites, comparisons, billing, myReports]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  if (!auth.user) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-[#6b6f68] mb-4">{locale === "ca" ? "Has d'iniciar la sessió" : "Debes iniciar sesión"}</p>
          <button onClick={() => navigate("/entrada")} className="px-5 py-2.5 rounded-xl bg-[#e8673c] text-white font-bold">
            {t.nav.entrada}
          </button>
        </div>
      </div>
    );
  }

  const u = auth.user;
  const planName =
    u.plan === "PRO" ? t.plans.pro.name : u.plan === "PREMIUM" ? t.plans.premium.name : t.plans.free.name;

  const saveProfile = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, locale }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error || "Error");
        return;
      }
      await auth.refresh();
      setMsg(locale === "ca" ? "Dades desades." : "Datos guardados.");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error === "PASSWORD_SHORT"
          ? (locale === "ca" ? "La contrasenya nova és massa curta (mínim 8)." : "La contraseña nueva es demasiado corta (mín. 8).")
          : d.error === "BAD_CREDENTIALS"
          ? (locale === "ca" ? "La contrasenya actual no és correcta." : "La contraseña actual no es correcta.")
          : "Error");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setMsg(locale === "ca" ? "Contrasenya canviada. Les altres sessions s'han tancat." : "Contraseña cambiada. Las otras sesiones se han cerrado.");
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", { method: "POST" });
      setMsg(res.ok
        ? (locale === "ca" ? "Correu de verificació enviat (revisa també el sandbox del panell admin si els correus no estan actius)." : "Correo de verificación enviado.")
        : "Error");
    } finally {
      setBusy(false);
    }
  };

  const cancelDemo = async () => {
    setBusy(true);
    await fetch("/api/stripe/demo", { method: "POST" });
    await auth.refresh();
    setBusy(false);
  };

  const openPortal = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
      else setMsg(d.message || d.error || "Error");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== "ESBORRA") {
      setMsg(locale === "ca" ? "Escriu ESBORRA al camp de confirmació." : "Escribe ESBORRA en el campo de confirmación.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: deleteConfirm }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error || "Error");
        return;
      }
      navigate("/");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const deleteHistory = async (id?: string) => {
    const qs = id ? `id=${id}` : "all=1";
    await fetch(`/api/history?${qs}`, { method: "DELETE" });
    setHistory(null);
    loadTab("historial");
  };

  const tabs = [
    ["resum", t.panel.title, User],
    ["perfil", locale === "ca" ? "Dades personals" : "Datos personales", Settings],
    ["facturacio", locale === "ca" ? "Facturació" : "Facturación", CreditCard],
    ["historial", locale === "ca" ? "Historial" : "Historial", History],
    ["preferits", locale === "ca" ? "Preferits" : "Favoritos", Star],
    ["comparacions", locale === "ca" ? "Comparacions" : "Comparaciones", GitCompare],
    ["informes", locale === "ca" ? "Informes meus" : "Mis informes", FileText],
    ["seguretat", locale === "ca" ? "Seguretat" : "Seguridad", Shield],
  ] as const;

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">{t.panel.title}</h1>

      {verificacio && (
        <div className={`mt-4 rounded-xl p-4 text-sm ${verificacio === "ok" ? "bg-[#e6f4ea] text-[#1e7a41]" : "bg-[#fdeae2] text-[#b0431c]"}`}>
          {verificacio === "ok"
            ? (locale === "ca" ? "Correu verificat correctament. Gràcies!" : "Correo verificado correctamente. ¡Gracias!")
            : (locale === "ca" ? "L'enllaç de verificació no és vàlid o ha caducat." : "El enlace de verificación no es válido o ha caducado.")}
        </div>
      )}
      {msg && (
        <div className="mt-4 rounded-xl bg-[#f0ede8] text-sm p-3">{msg}</div>
      )}

      {/* pestanyes */}
      <div className="mt-6 flex gap-1 flex-wrap">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
              tab === id ? "bg-[#0f2e21] text-white" : "bg-white border border-[#e5e1da] hover:bg-[#f0ede8]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* RESUM */}
      {tab === "resum" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-6 space-y-4">
          <Row label={t.auth.email} value={u.email} />
          <Row label={t.panel.plan} value={planName} strong />
          {u.plan === "FREE" && auth.quota && (
            <Row label={t.panel.quota} value={`${auth.quota.used} / ${auth.quota.limit}`} />
          )}
          {(u.plan === "PREMIUM" || u.plan === "PRO") && (
            <>
              <Row label={t.panel.quota} value={t.panel.unlimited} />
              <Row
                label={t.panel.subscription}
                value={billing?.subscriptions.find((s) => s.demo) ? (locale === "ca" ? "DEMO (prova, sense cobrament)" : "DEMO (prueba, sin cobro)") : t.panel.active}
              />
            </>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-[#6b6f68]">{locale === "ca" ? "Correu verificat" : "Correo verificado"}</span>
            {u.emailVerified ? (
              <span className="text-xs font-bold text-[#1e7a41] flex items-center gap-1"><BadgeCheck className="w-4 h-4" /> OK</span>
            ) : (
              <button onClick={resendVerification} disabled={busy} className="text-xs text-[#b0431c] flex items-center gap-1 underline disabled:opacity-50">
                <MailWarning className="w-4 h-4" /> {locale === "ca" ? "No verificat — reenviar" : "No verificado — reenviar"}
              </button>
            )}
          </div>
          {u.plan === "FREE" && (
            <div className="pt-2">
              <button onClick={() => navigate("/preus")} className="px-5 py-2.5 rounded-xl bg-[#e8673c] text-white text-sm font-bold hover:bg-[#d95a31]">
                {t.map.paywall.cta}
              </button>
            </div>
          )}
          {u.role === "ADMIN" && (
            <div className="pt-2">
              <button onClick={() => navigate("/admin")} className="px-5 py-2.5 rounded-xl bg-[#0f2e21] text-white text-sm font-bold hover:bg-[#16402e]">
                {t.panel.adminLink}
              </button>
            </div>
          )}
          <div className="pt-2">
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); await auth.refresh(); navigate("/"); }} className="text-sm text-[#6b6f68] hover:underline">
              {t.panel.logout}
            </button>
          </div>
        </div>
      )}

      {/* PERFIL */}
      {tab === "perfil" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-6 space-y-4">
          <div>
            <label className="text-xs text-[#6b6f68]">{locale === "ca" ? "Nom (opcional)" : "Nombre (opcional)"}</label>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e5e1da] text-sm" />
          </div>
          <div>
            <label className="text-xs text-[#6b6f68]">{locale === "ca" ? "Idioma" : "Idioma"}</label>
            <select value={locale} onChange={(e) => setLocale(e.target.value as "ca" | "es")} className="w-full mt-1 px-3 py-2 rounded-lg border border-[#e5e1da] text-sm">
              <option value="ca">Català</option>
              <option value="es">Castellano</option>
            </select>
          </div>
          <button onClick={saveProfile} disabled={busy} className="px-5 py-2.5 rounded-xl bg-[#0f2e21] text-white text-sm font-bold disabled:opacity-50">
            {locale === "ca" ? "Desar canvis" : "Guardar cambios"}
          </button>
          <div className="pt-2 border-t border-[#f0ede8]">
            <a href="/api/account/export" className="text-sm text-[#0f2e21] underline flex items-center gap-1.5">
              <Download className="w-4 h-4" /> {locale === "ca" ? "Descarrega les meves dades (RGPD)" : "Descarga mis datos (RGPD)"}
            </a>
          </div>
        </div>
      )}

      {/* FACTURACIÓ */}
      {tab === "facturacio" && (
        <div className="mt-6 space-y-4">
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-6">
            <h3 className="font-bold mb-3">{locale === "ca" ? "Gestió de subscripció" : "Gestión de suscripción"}</h3>
            {billing === null ? (
              <p className="text-sm text-[#6b6f68]">…</p>
            ) : billing.subscriptions.length === 0 ? (
              <p className="text-sm text-[#6b6f68]">{locale === "ca" ? "Encara no tens cap subscripció." : "Aún no tienes ninguna suscripción."}</p>
            ) : (
              <div className="space-y-2 text-sm">
                {billing.subscriptions.map((s) => (
                  <Row key={s.id} label={`${s.plan}${s.demo ? " (DEMO)" : ""}`} value={s.status} />
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              {billing?.stripeConfigured && (
                <button onClick={openPortal} disabled={busy} className="px-4 py-2 rounded-lg bg-[#0f2e21] text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
                  <ExternalLink className="w-4 h-4" /> {locale === "ca" ? "Portal de client Stripe" : "Portal de cliente Stripe"}
                </button>
              )}
              {(u.plan === "PREMIUM" || u.plan === "PRO") && billing?.subscriptions.some((s) => s.demo) && (
                <button onClick={cancelDemo} disabled={busy} className="text-sm text-[#b0431c] underline disabled:opacity-50">
                  {t.panel.cancelDemo}
                </button>
              )}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-6">
            <h3 className="font-bold mb-3">{locale === "ca" ? "Historial de pagaments i factures" : "Historial de pagos y facturas"}</h3>
            {billing?.invoices.length ? (
              <div className="space-y-2">
                {billing.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 text-sm border border-[#f2efe9] rounded-lg px-3 py-2">
                    <span>{inv.date ? new Date(inv.date).toLocaleDateString() : "—"} · {inv.amount?.toFixed(2)} {inv.currency?.toUpperCase()}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-[#6b6f68]">{inv.status}</span>
                      {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className="text-xs underline text-[#0f2e21]">{locale === "ca" ? "Factura" : "Factura"}</a>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6b6f68]">
                {billing?.stripeConfigured
                  ? (locale === "ca" ? "Cap factura encara." : "Ninguna factura todavía.")
                  : (locale === "ca" ? "Les factures de Stripe apareixeran aquí quan el propietari connecti el compte de Stripe." : "Las facturas de Stripe aparecerán aquí cuando el propietario conecte la cuenta de Stripe.")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* HISTORIAL */}
      {tab === "historial" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{locale === "ca" ? "Historial de consultes (Premium)" : "Historial de consultas (Premium)"}</h3>
            {history && history.length > 0 && (
              <button onClick={() => deleteHistory()} className="text-xs text-[#b0431c] underline">{locale === "ca" ? "Buida-ho tot" : "Vaciar todo"}</button>
            )}
          </div>
          {history === null ? (
            <p className="text-sm text-[#6b6f68]">…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-[#6b6f68]">{locale === "ca" ? "Cap consulta registrada (el pla gratuït no desa historial)." : "Ninguna consulta registrada (el plan gratuito no guarda historial)."}</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 text-sm border border-[#f2efe9] rounded-lg px-3 py-2">
                  <span>
                    <b>{h.municipalityName || h.municipalityCode}</b>
                    {h.rentLatest != null && <span className="text-[#6b6f68]"> · {h.rentLatest.toFixed(0)} €/mes ({h.rentPeriod})</span>}
                    <span className="block text-xs text-[#6b6f68]">{new Date(h.createdAt).toLocaleString()}</span>
                  </span>
                  <button onClick={() => deleteHistory(h.id)} className="text-xs text-[#6b6f68] underline">{locale === "ca" ? "Esborra" : "Borra"}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PREFERITS */}
      {tab === "preferits" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-6">
          <h3 className="font-bold mb-3">{locale === "ca" ? "Edificis i municipis preferits (Premium)" : "Edificios y municipios favoritos (Premium)"}</h3>
          {favorites === null ? (
            <p className="text-sm text-[#6b6f68]">…</p>
          ) : favorites.length === 0 ? (
            <p className="text-sm text-[#6b6f68]">{locale === "ca" ? "Encara no n'has desat cap. Desa'ls amb l'estrella del panell del mapa." : "Aún no has guardado ninguno. Guárdalos con la estrella del panel del mapa."}</p>
          ) : (
            <div className="space-y-2">
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 text-sm border border-[#f2efe9] rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-[#e8673c] fill-[#e8673c]" />
                    <b>{f.label || f.entityKey}</b>
                    <span className="text-xs text-[#6b6f68]">{f.buildingId ? "edifici" : "municipi"}</span>
                  </span>
                  <button
                    onClick={async () => { await fetch(`/api/favorites?key=${encodeURIComponent(f.entityKey)}`, { method: "DELETE" }); setFavorites(null); loadTab("preferits"); }}
                    className="text-xs text-[#6b6f68] underline"
                  >
                    {locale === "ca" ? "Esborra" : "Borra"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COMPARACIONS */}
      {tab === "comparacions" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{locale === "ca" ? "Comparacions desades" : "Comparaciones guardadas"}</h3>
            <button onClick={() => navigate("/comparador")} className="text-xs text-[#0f2e21] underline">{locale === "ca" ? "Obrir comparador" : "Abrir comparador"}</button>
          </div>
          {comparisons === null ? (
            <p className="text-sm text-[#6b6f68]">…</p>
          ) : comparisons.length === 0 ? (
            <p className="text-sm text-[#6b6f68]">{locale === "ca" ? "Encara no n'has desat cap des del comparador." : "Aún no has guardado ninguna desde el comparador."}</p>
          ) : (
            <div className="space-y-2">
              {comparisons.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm border border-[#f2efe9] rounded-lg px-3 py-2">
                  <span><b>{c.name}</b> <span className="text-xs text-[#6b6f68]">· {c.entities.length} entitats · {new Date(c.createdAt).toLocaleDateString()}</span></span>
                  <button
                    onClick={async () => { await fetch(`/api/comparisons?id=${c.id}`, { method: "DELETE" }); setComparisons(null); loadTab("comparacions"); }}
                    className="text-xs text-[#6b6f68] underline"
                  >
                    {locale === "ca" ? "Esborra" : "Borra"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INFORMES MEUS */}
      {tab === "informes" && (
        <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-6">
          <h3 className="font-bold mb-3">{locale === "ca" ? "Informes de preu enviats" : "Informes de precio enviados"}</h3>
          {myReports === null ? (
            <p className="text-sm text-[#6b6f68]">…</p>
          ) : myReports.length === 0 ? (
            <p className="text-sm text-[#6b6f68]">{locale === "ca" ? "Encara no n'has enviat cap des del mapa." : "Aún no has enviado ninguno desde el mapa."}</p>
          ) : (
            <div className="space-y-2">
              {myReports.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm border border-[#f2efe9] rounded-lg px-3 py-2">
                  <span>{r.municipalityCode} · <b>{r.offerEurMonth} €/mes</b> {r.offerEurM2 && <span className="text-xs text-[#6b6f68]">({r.offerEurM2} €/m²)</span>}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f0ede8]">{r.status}</span>
                </div>
              ))}
              <p className="text-xs text-[#6b6f68]">{locale === "ca" ? "Els informes passen per moderació abans de ser útils estadísticament." : "Los informes pasan por moderación antes de ser útiles estadísticamente."}</p>
            </div>
          )}
        </div>
      )}

      {/* SEGURETAT */}
      {tab === "seguretat" && (
        <div className="mt-6 space-y-4">
          <div className="bg-white rounded-2xl border border-[#e5e1da] p-6 space-y-3">
            <h3 className="font-bold">{locale === "ca" ? "Canvi de contrasenya" : "Cambio de contraseña"}</h3>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={locale === "ca" ? "Contrasenya actual" : "Contraseña actual"} className="w-full px-3 py-2 rounded-lg border border-[#e5e1da] text-sm" />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={locale === "ca" ? "Contrasenya nova (mín. 8)" : "Contraseña nueva (mín. 8)"} className="w-full px-3 py-2 rounded-lg border border-[#e5e1da] text-sm" />
            <button onClick={changePassword} disabled={busy || !currentPassword || !newPassword} className="px-5 py-2.5 rounded-xl bg-[#0f2e21] text-white text-sm font-bold disabled:opacity-50">
              {locale === "ca" ? "Canvia la contrasenya" : "Cambiar la contraseña"}
            </button>
            <p className="text-xs text-[#6b6f68]">{locale === "ca" ? "En canviar-la es tanquen totes les sessions obertes en altres dispositius." : "Al cambiarla se cierran todas las sesiones abiertas en otros dispositivos."}</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#f2c4ac] p-6 space-y-3">
            <h3 className="font-bold text-[#b0431c] flex items-center gap-2"><Trash2 className="w-4 h-4" />{locale === "ca" ? "Eliminació del compte (RGPD)" : "Eliminación de la cuenta (RGPD)"}</h3>
            <p className="text-sm text-[#4b5349]">{locale === "ca" ? "S'esborren les teves dades personals, preferits i informes. Els registres agregats i anonimitzats d'ús es conserven per estadística. Aquesta acció és irreversible." : "Se borran tus datos personales, favoritos e informes. Los registros agregados y anonimizados de uso se conservan con fines estadísticos. Esta acción es irreversible."}</p>
            <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())} placeholder={locale === "ca" ? 'Escriu "ESBORRA" per confirmar' : 'Escribe "ESBORRA" para confirmar'} className="w-full px-3 py-2 rounded-lg border border-[#f2c4ac] text-sm" />
            <button onClick={deleteAccount} disabled={busy || deleteConfirm !== "ESBORRA"} className="px-5 py-2.5 rounded-xl bg-[#b0431c] text-white text-sm font-bold disabled:opacity-40">
              {locale === "ca" ? "Elimina el meu compte definitivament" : "Elimina mi cuenta definitivamente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-sm text-[#6b6f68]">{label}</span>
      <span className={`text-sm ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
