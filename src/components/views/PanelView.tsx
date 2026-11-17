"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { useUserPlan } from "@/hooks/use-user-plan";
import { diffPlanKeys, labelForDiffKey, dataNote, type PlanIdLite, type PlanShapeLite } from "@/lib/plan-change";
import { User, CreditCard, History, Star, GitCompare, FileText, Shield, Trash2, Settings, BadgeCheck, MailWarning, Download, ExternalLink, Search, BookOpen, Check, X as XIcon, AlertCircle, Lock, Fingerprint, Bell, Scale } from "lucide-react";

interface BillingData {
  subscriptions: Array<{ id: string; plan: string; status: string; demo: boolean; currentPeriodEnd: string | null; createdAt: string }>;
  invoices: Array<{ id: string; date: string | null; amount: number | null; currency: string | null; status: string | null; hostedUrl: string | null; pdfUrl?: string | null }>;
  stripeConfigured: boolean;
}

export default function PanelView() {
  const { t, auth, navigate, locale, setLocale } = useApp();
  // FASE 2 (plans migració): la pestanya es pot arribar a deep-link (des de la
  // targeta de preus: /panell?tab=alertes) — es llegeix del hash i es saneeza
  // contra la llista de pestanyes conegudes (mai res d'estrany des de l'URL).
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "resum";
    const hq = window.location.hash.split("?")[1] || "";
    const t = hq ? new URLSearchParams(hq).get("tab") : null;
    const KNOWN = ["resum", "perfil", "facturacio", "historial", "preferits", "comparacions", "informes", "alertes", "normativa", "seguretat"];
    return t && KNOWN.includes(t) ? t : "resum";
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // lint v2: el codi de verificació del hash s'inicialitza directament a l'estat
  // (lazy initializer) en comptes d'un efecte de muntatge amb setState síncron.
  const [verificacio, setVerificacio] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const hq0 = window.location.hash.split("?")[1] || "";
    return hq0 ? new URLSearchParams(hq0).get("verificacio") : null;
  });

  // dades
  const [name, setName] = useState("");
  const [history, setHistory] = useState<any[] | null>(null);
  const [favorites, setFavorites] = useState<any[] | null>(null);
  // Fase 5 — la API torna 403 PLAN_REQUIRED amb pla gratuït: la pestanya es
  // mostra BLOCADA amb teaser (mai com una llista buida que confon).
  const [historyLocked, setHistoryLocked] = useState(false);
  const [favoritesLocked, setFavoritesLocked] = useState(false);
  const [comparisons, setComparisons] = useState<any[] | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  // v22: estat de la suscripció des del SERVIDOR (mai del client) — encàrrec punt 6
  const plan = useUserPlan();
  const [myReports, setMyReports] = useState<any[] | null>(null);
  // v24 — opt-in del resum mensual de preferits (null = encara sense saber)
  const [alertsOn, setAlertsOn] = useState<boolean | null>(null);
  // v31 — cambio de plan self-service (avisos con diff de lo que se gana/pierde)
  const [plansCfg, setPlansCfg] = useState<Array<PlanShapeLite & { id: string; priceEur: number }> | null>(null);
  const [changeTarget, setChangeTarget] = useState<PlanIdLite | null>(null);
  const [changeMsg, setChangeMsg] = useState<string | null>(null);
  // v37 — retención antes de cancelar: modal con alternativas + motivo opcional
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState("");
  // v60 — exportació massiva del dataset (Pro): filtre per comarca o província
  const [dsScope, setDsScope] = useState("");
  const [dsKind, setDsKind] = useState<"comarca" | "provincia">("comarca");
  // FASE 2 (plans migració) — alertes configurades (UserAlert, Premium/Pro) i
  // mòdul normatiu complet per municipi (la API torna 403 PLAN_REQUIRED amb
  // pla gratuït: la pestanya es mostra BLOCADA amb teaser, mateix patró v5).
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [alertsLimit, setAlertsLimit] = useState(20);
  const [alertsLocked, setAlertsLocked] = useState(false);
  const [alertMuniQ, setAlertMuniQ] = useState("");
  const [alertMuniOpts, setAlertMuniOpts] = useState<Array<{ code: string; name: string }>>([]);
  const [alertMuniSel, setAlertMuniSel] = useState<{ code: string; name: string } | null>(null);
  const [alertTipus, setAlertTipus] = useState<"PRICE" | "TENSE" | "NORMATIVA">("PRICE");
  const [alertBusy, setAlertBusy] = useState(false);
  const [normData, setNormData] = useState<any | null>(null);
  const [normQ, setNormQ] = useState("");
  const [normOpts, setNormOpts] = useState<Array<{ code: string; name: string }>>([]);
  const [normBusy, setNormBusy] = useState(false);
  // timers de cerca (debounce) — SEMPRE abans del primer return condicional
  // (regla dels hooks: mateix ordre a cada render).
  const timerAlerts = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerNorm = useRef<ReturnType<typeof setTimeout> | null>(null);

  // seguretat
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [activity, setActivity] = useState<any[] | null>(null);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  // v37 — 2FA TOTP: alta (QR + codi), codis de recuperació i baixa
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpSecretManual, setTotpSecretManual] = useState<string | null>(null);
  const [totpCodeInput, setTotpCodeInput] = useState("");
  const [totpRecoveryCodes, setTotpRecoveryCodes] = useState<string[] | null>(null);
  const [totpPassword, setTotpPassword] = useState("");
  // v37.1 — passkeys (WebAuthn)
  const [passkeys, setPasskeys] = useState<any[] | null>(null);
  const [pkMsg, setPkMsg] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);
  const [pkPassword, setPkPassword] = useState("");

  useEffect(() => {
    auth.refresh();
  }, []);

  // v37.1 — carrega la llista de passkeys quan s'obre la pestanya Seguretat
  useEffect(() => {
    if (tab === "seguretat" && passkeys === null) {
      fetch("/api/auth/passkeys")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setPasskeys(d.passkeys || []))
        .catch(() => setPasskeys([]));
    }
  }, [tab, passkeys]);

  // lint v2: sincronitza el formulari amb l'usuari carregat mitjançant l'ajust
  // d'estat durant el render (patró React recomanat), no un efecte. El sentinel
  // (undefined) garanteix la primera sincronització també quan l'usuari ja hi és
  // al primer render, igual que feia l'efecte de muntatge.
  const [syncedUser, setSyncedUser] = useState<unknown>(undefined);
  if (auth.user && auth.user !== syncedUser) {
    setSyncedUser(auth.user);
    setName(auth.user.name || "");
    setAlertsOn(Boolean(auth.user.alertsEnabled)); // v24
    setTotpEnabled(Boolean((auth.user as any).totpEnabled)); // v37
  }

  const loadTab = useCallback(async (tabId: string) => {
    // Fase 5 — el codi d'estat importa: 403 PLAN_REQUIRED = pestanya blocada
    // pel pla (teaser d'upgrade), no «llista buida».
    const j = (u: string) =>
      fetch(u)
        .then(async (r) => ({ ok: r.ok, status: r.status, d: await r.json().catch(() => null) }))
        .catch(() => null);
    if (tabId === "historial" && history === null) {
      const r = await j("/api/history");
      if (r?.ok && r.d) setHistory(r.d.history);
      else if (r?.status === 403) { setHistoryLocked(true); setHistory([]); }
      else setHistory([]);
    }
    if (tabId === "preferits" && favorites === null) {
      const r = await j("/api/favorites");
      if (r?.ok && r.d) setFavorites(r.d.favorites);
      else if (r?.status === 403) { setFavoritesLocked(true); setFavorites([]); }
      else setFavorites([]);
    }
    if (tabId === "comparacions" && comparisons === null) {
      const r = await j("/api/comparisons");
      if (r?.ok && r.d) setComparisons(r.d.comparisons);
      else setComparisons([]);
    }
    if (tabId === "alertes" && alerts === null) {
      const r = await j("/api/alertes");
      if (r?.ok && r.d) { setAlerts(r.d.alerts); setAlertsLimit(r.d.limit || 20); }
      else if (r?.status === 403) { setAlertsLocked(true); setAlerts([]); }
      else setAlerts([]);
    }
    if (tabId === "facturacio") {
      if (billing === null) {
        const r = await j("/api/billing/history");
        if (r?.ok && r.d) setBilling(r.d);
      }
      // v31: config efectiva de planes para los avisos del cambio (misma fuente que el backend)
      const p = await j("/api/plans");
      if (p?.ok && p.d?.plans) setPlansCfg(p.d.plans);
    }
    if (tabId === "informes" && myReports === null) {
      const r = await j("/api/account/export");
      if (r?.ok && r.d) setMyReports(r.d.informesPreu || []);
    }
    if (tabId === "seguretat" && activity === null) {
      const r = await j("/api/account/activity");
      if (r?.ok && r.d) {
        setActivity(r.d.events || []);
        setLastLoginAt(r.d.lastLoginAt || null);
      } else setActivity([]);
    }
  }, [history, favorites, comparisons, alerts, billing, myReports, activity]);

  // lint v2: la càrrega de la pestanya s'arrenca en una continuació asíncrona
  // (loadTab posa estat; mai síncron dins de l'efecte)
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await loadTab(tab);
    })();
  }, [tab, loadTab]);

  if (!auth.user) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-stone mb-4">{locale === "ca" ? "Has d'iniciar la sessió" : "Debes iniciar sesión"}</p>
          <button onClick={() => navigate("/entrada")} className="px-5 py-2.5 rounded-xl bg-ember text-white font-bold">
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

  const revokeOtherSessions = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/sessions/revoke-all", { method: "POST" });
      if (!res.ok) {
        setMsg(locale === "ca" ? "No s'han pogut tancar les sessions." : "No se han podido cerrar las sesiones.");
        return;
      }
      await auth.refresh();
      setActivity(null); // recarrega l'activitat la propera vegada
      setMsg(locale === "ca"
        ? "S'han tancat les sessions d'altres dispositius. Aquesta sessió continua activa."
        : "Se han cerrado las sesiones de otros dispositivos. Esta sesión sigue activa.");
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

  // v37 — cancel·lació amb RETENCIÓ: el botó obre el modal (alternatives +
  // motiu); la cancel·lació real fa POST amb el motiu opcional.
  const cancelSubscription = () => {
    setCancelReason("");
    setCancelFeedback("");
    setRetentionOpen(true);
  };

  const confirmCancel = async () => {
    setBusy(true);
    setMsg(null);
    setRetentionOpen(false);
    try {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || undefined, feedback: cancelFeedback.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.message || d.error || "Error");
        return;
      }
      await Promise.all([plan.refresh(), auth.refresh()]);
      setBilling(null);
      loadTab("facturacio");
      setMsg(locale === "ca"
        ? "Cancel·lació programada: mantindràs l'accés fins al final del període. Si canvis d'idea, pots reactivar-la aquí mateix."
        : "Cancelación programada: mantendrás el acceso hasta el final del período. Si cambias de idea, puedes reactivarla aquí mismo.");
    } finally {
      setBusy(false);
    }
  };

  // v22: desfer una cancel·lació programada
  const reactivateSubscription = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/subscription/reactivate", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.message || d.error || "Error");
        return;
      }
      await Promise.all([plan.refresh(), auth.refresh()]);
      setBilling(null);
      loadTab("facturacio");
      setMsg(locale === "ca"
        ? "Subscripció reactivada: seguirà renovant-se normalment."
        : "Suscripción reactivada: seguirá renovándose normalmente.");
    } finally {
      setBusy(false);
    }
  };

  // v31 — cambio de plan self-service: aviso (gana/pierde) → confirmación → POST → refresh
  const priceLabel = (id: "PREMIUM" | "PRO") => {
    const p = plansCfg?.find((x) => x.id === id);
    return p ? ` (${p.priceEur.toFixed(2).replace(".", ",")} €/mes)` : "";
  };

  const changePlan = async (target: PlanIdLite) => {
    setBusy(true);
    setChangeMsg(null);
    try {
      const res = await fetch("/api/subscription/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPlan: target }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeMsg(d.message || d.error || "Error");
        return;
      }
      setChangeTarget(null);
      await Promise.all([plan.refresh(), auth.refresh()]);
      setBilling(null);
      loadTab("facturacio");
      const ca = locale === "ca";
      if (d.mode === "STRIPE_PRORATED") {
        setChangeMsg(ca ? "Canvi aplicat: Stripe imputarà el prorrateig a la pròxima factura." : "Cambio aplicado: Stripe imputará el prorrateo en la próxima factura.");
      } else if (d.mode === "DOWNGRADE_SCHEDULED") {
        setChangeMsg(ca
          ? `Baixa programada: mantindràs l'accés pagat fins al ${d.effectiveAt ? new Date(d.effectiveAt).toLocaleDateString() : "final del període"}.`
          : `Baja programada: mantendrás el acceso pagado hasta el ${d.effectiveAt ? new Date(d.effectiveAt).toLocaleDateString() : "final del período"}.`);
      } else if (d.mode === "DOWNGRADE_NOW" || d.mode === "ALREADY_FREE") {
        setChangeMsg(ca ? "Baixa aplicada: ara ets al pla gratuït." : "Baja aplicada: ahora estás en el plan gratuito.");
      } else {
        setChangeMsg(ca ? "Canvi de pla aplicat immediatament." : "Cambio de plan aplicado inmediatamente.");
      }
    } catch {
      setChangeMsg(locale === "ca" ? "Error de xarxa: torna-ho a provar." : "Error de red: inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  // ── v37 — 2FA TOTP ──────────────────────────────────────────────────────────
  const totpSetup = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error === "ALREADY_ENABLED" ? (locale === "ca" ? "El 2FA ja està actiu." : "El 2FA ya está activo.") : (d.error || "Error"));
        return;
      }
      setTotpSecretManual(d.secret);
      const QR = (await import("qrcode")).default;
      setTotpQr(await QR.toDataURL(d.uri, { width: 180, margin: 1 }));
    } finally {
      setBusy(false);
    }
  };

  const totpEnable = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCodeInput }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.message || d.error || "Error");
        return;
      }
      setTotpEnabled(true);
      setTotpRecoveryCodes(d.recoveryCodes || []);
      setTotpQr(null);
      setTotpSecretManual(null);
      setTotpCodeInput("");
      await auth.refresh();
      setMsg(locale === "ca" ? "Verificació en dos passos ACTIVADA. Guarda els codis de recuperació ara." : "Verificación en dos pasos ACTIVADA. Guarda los códigos de recuperación ahora.");
    } finally {
      setBusy(false);
    }
  };

  const totpDisable = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: totpPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.message || d.error || "Error");
        return;
      }
      setTotpEnabled(false);
      setTotpRecoveryCodes(null);
      setTotpPassword("");
      await auth.refresh();
      setMsg(locale === "ca" ? "Verificació en dos passos desactivada." : "Verificación en dos pasos desactivada.");
    } finally {
      setBusy(false);
    }
  };

  // ── v37 — ALERTA DE PREU d'un favorit: PATCH { entityKey, alertPct } ──
  const setFavAlert = async (entityKey: string, value: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityKey, alertPct: value === "" ? null : Number(value) }),
      });
      if (res.ok) {
        const r = await fetch("/api/favorites").catch(() => null);
        if (r?.ok) {
          const d = await r.json().catch(() => null);
          if (d?.favorites) setFavorites(d.favorites);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const totpRecoveryRegen = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: totpPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.message || d.error || "Error");
        return;
      }
      setTotpRecoveryCodes(d.recoveryCodes || []);
      setTotpPassword("");
    } finally {
      setBusy(false);
    }
  };

  // ── v37.1 — PASSKEYS (WebAuthn) ───────────────────────────────────────
  const passkeyAdd = async () => {
    setPkMsg(null);
    setPkBusy(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const o = await fetch("/api/auth/passkeys/register-options", { method: "POST" });
      const od = await o.json();
      if (!o.ok) { setPkMsg(od.message || od.error || "Error"); return; }
      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: od.options });
      } catch (e: any) {
        setPkMsg(e?.name === "NotAllowedError"
          ? (locale === "ca" ? "Has cancel·lat la petició del dispositiu." : "Has cancelado la petición del dispositivo.")
          : (e?.message || (locale === "ca" ? "El dispositiu no ha pogut crear la passkey." : "El dispositivo no ha podido crear la passkey.")));
        return;
      }
      const r = await fetch("/api/auth/passkeys/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: attResp }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPkMsg(d.message || d.error || "Error"); return; }
      setPkMsg(locale === "ca" ? "Passkey afegida. Ja pots entrar amb la petjada/cara/PIN." : "Passkey añadida. Ya puedes entrar con la huella/cara/PIN.");
      setPasskeys(null); // força recàrrega
    } finally {
      setPkBusy(false);
    }
  };

  const passkeyDelete = async (id: string) => {
    setPkMsg(null);
    setPkBusy(true);
    try {
      const r = await fetch("/api/auth/passkeys/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password: pkPassword }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setPkMsg(d.message || d.error || "Error"); return; }
      setPkPassword("");
      setPasskeys(null);
    } finally {
      setPkBusy(false);
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
        setMsg(d.message || d.error || "Error"); // v23: mostra el missatge del servidor (p. ex. STRIPE_CANCEL_FAILED)
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

  // v24 — opt-in/opt-out del resum mensual de preferits (correu)
  const toggleAlerts = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertsEnabled: !alertsOn }),
      });
      if (!res.ok) {
        setMsg(locale === "ca" ? "No s'ha pogut desar la preferència." : "No se pudo guardar la preferencia.");
        return;
      }
      setAlertsOn(!alertsOn);
      await auth.refresh();
      setMsg(locale === "ca"
        ? (!alertsOn
            ? "Avisos mensuals dels preferits ACTIVATS: el primer resum t'arribarà a principi de mes."
            : "Avisos mensuals dels preferits desactivats.")
        : (!alertsOn
            ? "Avisos mensuales de favoritos ACTIVADOS: el primer resumen te llegará a principio de mes."
            : "Avisos mensuales de favoritos desactivados."));
    } finally {
      setBusy(false);
    }
  };

  // v24 — enllaç "obre al mapa" per un preferit (edifici o municipi)
  const favoriteMapHref = (f: any) =>
    f.buildingId ? `/mapa?edifici=${encodeURIComponent(f.buildingId)}` : `/mapa?mun=${encodeURIComponent(f.municipalityCode || "")}`;

  // ── FASE 2 (plans migració): helpers d'alertes (UserAlert) i mòdul normatiu ──
  // (els useRef dels timers viuen AMUNT, amb la resta de hooks)

  /** Cerca de municipis (debounce 250 ms) compartida per Alertes i Normativa. */
  const cercaMunis = (
    q: string,
    setOpts: (o: Array<{ code: string; name: string }>) => void,
    timer: { current: ReturnType<typeof setTimeout> | null }
  ) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setOpts([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/municipalities?q=${encodeURIComponent(q.trim())}&limit=8`);
        const d = await r.json();
        setOpts((d?.municipalities || []).map((m: { code: string; name: string }) => ({ code: m.code, name: m.name })));
      } catch { setOpts([]); }
    }, 250);
  };

  const addAlert = async () => {
    if (!alertMuniSel || alertBusy) return;
    setAlertBusy(true);
    try {
      const r = await fetch("/api/alertes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ municipalityCode: alertMuniSel.code, tipus: alertTipus }),
      });
      const d = await r.json();
      if (r.ok && d?.alerts) {
        setAlerts(d.alerts);
        setAlertsLimit(d.limit || 20);
        setAlertMuniSel(null); setAlertMuniQ(""); setAlertMuniOpts([]);
      } else {
        setMsg(
          d?.error === "ALERT_LIMIT"
            ? (locale === "ca" ? `Màxim de ${d.limit} alertes actives. Esborra'n una per-ne afegir una de nova.` : `Máximo de ${d.limit} alertas activas. Borra una para añadir una nueva.`)
            : (locale === "ca" ? "No s'ha pogut afegir l'alerta." : "No se ha podido añadir la alerta.")
        );
      }
    } finally { setAlertBusy(false); }
  };

  const delAlert = async (id: string) => {
    try {
      const r = await fetch(`/api/alertes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) { const d = await r.json(); setAlerts(d.alerts); }
    } catch { /* mai blocuem la UI per un error de xarxa */ }
  };

  const carregaNorm = async (code: string) => {
    setNormBusy(true);
    try {
      const r = await fetch(`/api/normativa/${encodeURIComponent(code)}`);
      const d = await r.json();
      if (r.ok) setNormData(d);
      else setNormData({ error: d?.error || "ERROR" });
    } catch { setNormData({ error: "ERROR" }); }
    finally { setNormBusy(false); }
  };

  const tabs = [
    ["resum", t.panel.title, User],
    ["perfil", locale === "ca" ? "Dades personals" : "Datos personales", Settings],
    ["facturacio", locale === "ca" ? "Facturació" : "Facturación", CreditCard],
    ["historial", locale === "ca" ? "Historial" : "Historial", History],
    ["preferits", locale === "ca" ? "Preferits" : "Favoritos", Star],
    ["comparacions", locale === "ca" ? "Comparacions" : "Comparaciones", GitCompare],
    ["informes", locale === "ca" ? "Informes meus" : "Mis informes", FileText],
    // FASE 2 (plans migració) — pestanyes noves de Premium («Nou»); el Gratuït
    // les veu amb candau i teaser d'upgrade (mai llista buida que confon).
    ["alertes", locale === "ca" ? "Alertes" : "Alertas", Bell],
    ["normativa", locale === "ca" ? "Normativa" : "Normativa", Scale],
    ["seguretat", locale === "ca" ? "Seguretat" : "Seguridad", Shield],
  ] as const;

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">{t.panel.title}</h1>

      {verificacio && (
        <div className={`mt-4 rounded-xl p-4 text-sm ${verificacio === "ok" ? "bg-mintsoft text-green2" : "bg-embersoft text-ember3"}`}>
          {verificacio === "ok" &&
            (locale === "ca"
              ? "Correu verificat correctament. Ja pots fer consultes detallades!"
              : "¡Correo verificado correctamente. Ya puedes hacer consultas detalladas!")}
          {verificacio === "ja_usat" &&
            (locale === "ca"
              ? "Aquest enllaç de verificació ja s'havia utilitzat. Si el teu correu ja consta com a verificat, no cal fer res més."
              : "Este enlace de verificación ya se había utilizado. Si tu correo ya consta como verificado, no hace falta nada más.")}
          {verificacio === "caducat" &&
            (locale === "ca"
              ? "L'enllaç ha caducat (vàlid 24 hores). Reenvia'l i prova de nou."
              : "El enlace ha caducado (válido 24 horas). Reenvíalo e inténtalo de nuevo.")}
          {verificacio === "invalid" &&
            (locale === "ca"
              ? "L'enllaç de verificació no és vàlid."
              : "El enlace de verificación no es válido.")}
          {verificacio !== "ok" && (
            <button onClick={resendVerification} disabled={busy} className="ml-1 underline font-semibold disabled:opacity-50">
              {locale === "ca" ? "Reenviar correu de verificació" : "Reenviar correo de verificación"}
            </button>
          )}
        </div>
      )}
      {msg && (
        <div className="mt-4 rounded-xl bg-sand text-sm p-3">{msg}</div>
      )}

      {/* pestanyes */}
      <div className="mt-6 flex gap-1 flex-wrap">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
              tab === id ? "bg-pine text-white" : "bg-card border border-line hover:bg-sand"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {/* Fase 5 — candado visible en las pestañas que el plan gratuito tiene bloqueadas.
                FASE 1 (plans migració): «historial» ja NO es blocada al Gratuït (TTL 7 dies).
                FASE 2 (plans migració): «alertes» i «normativa» són del pla Premium («Nou»). */}
            {((id === "preferits") || (id === "alertes" || id === "normativa")) && u.plan === "FREE" && (
              <Lock className="w-3 h-3 opacity-60" aria-hidden />
            )}
          </button>
        ))}
      </div>

      {/* RESUM */}
      {tab === "resum" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6 space-y-4">
          {/* Fase 4 — accés a la guia (contingut gratuït: drets, fiança, despeses, ajudes) */}
          <button
            onClick={() => navigate("/guia")}
            className="w-full flex items-center gap-3 rounded-xl border border-line bg-cream p-3 text-left hover:border-ember transition-colors"
          >
            <BookOpen className="w-5 h-5 text-ember shrink-0" />
            <span className="flex-1 text-sm">
              <b className="text-pine">{locale === "ca" ? "Guia del lloguer" : "Guía del alquiler"}</b>
              <span className="text-moss"> — {locale === "ca" ? "drets, fiança amb calculadora, despeses, actualització de la renda i ajudes vigents" : "derechos, fianza con calculadora, gastos, actualización de la renta y ayudas vigentes"}</span>
            </span>
            <ExternalLink className="w-4 h-4 text-stone shrink-0" />
          </button>
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
            <span className="text-sm text-stone">{locale === "ca" ? "Correu verificat" : "Correo verificado"}</span>
            {u.emailVerified ? (
              <span className="text-xs font-bold text-green2 flex items-center gap-1"><BadgeCheck className="w-4 h-4" /> OK</span>
            ) : (
              <button onClick={resendVerification} disabled={busy} className="text-xs text-ember3 flex items-center gap-1 underline disabled:opacity-50">
                <MailWarning className="w-4 h-4" /> {locale === "ca" ? "No verificat — reenviar" : "No verificado — reenviar"}
              </button>
            )}
          </div>
          {/* v60 — exportació massiva del dataset municipal (pla Pro) */}
          <div className="pt-2 border-t border-sand">
            <div className="text-xs font-bold text-moss uppercase tracking-wide mb-1.5">
              {locale === "ca" ? "Exportació de dades (Pro)" : "Exportación de datos (Pro)"}
            </div>
            {u.plan === "PRO" ? (
              <div className="space-y-2">
                <p className="text-xs text-stone">
                  {locale === "ca"
                    ? "Dataset municipal en brut: lloguer mitjà, històric i contractes per municipi i any. Filtra per comarca o província, o exporta tota Catalunya."
                    : "Dataset municipal en bruto: alquiler medio, histórico y contratos por municipio y año. Filtra por comarca o provincia, o exporta toda Cataluña."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={dsKind}
                    onChange={(e) => setDsKind(e.target.value as "comarca" | "provincia")}
                    className="px-3 py-2 rounded-lg border border-line text-sm bg-card"
                    aria-label={locale === "ca" ? "Tipus de filtre" : "Tipo de filtro"}
                  >
                    <option value="comarca">{locale === "ca" ? "Comarca" : "Comarca"}</option>
                    <option value="provincia">{locale === "ca" ? "Província" : "Provincia"}</option>
                  </select>
                  <input
                    value={dsScope}
                    onChange={(e) => setDsScope(e.target.value.slice(0, 60))}
                    placeholder={locale === "ca" ? "Ex.: Bages (buit = tota Catalunya)" : "Ej.: Bages (vacío = toda Cataluña)"}
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-line text-sm"
                  />
                  <a
                    href={`/api/export/dataset?${dsScope.trim() ? `${dsKind}=${encodeURIComponent(dsScope.trim())}` : ""}&format=csv`.replace("?&", "?")}
                    className="px-4 py-2 rounded-lg border border-pine text-pine text-sm font-bold flex items-center gap-1.5 hover:bg-sand"
                  >
                    <Download className="w-4 h-4" /> CSV
                  </a>
                  <a
                    href={`/api/export/dataset?${dsScope.trim() ? `${dsKind}=${encodeURIComponent(dsScope.trim())}` : ""}&format=xlsx`.replace("?&", "?")}
                    className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold flex items-center gap-1.5 hover:bg-pine2"
                  >
                    <Download className="w-4 h-4" /> Excel (.xlsx)
                  </a>
                </div>
                <p className="text-[11px] text-stone">
                  {locale === "ca"
                    ? "Font: Incasòl (fiances) via habitatge.gencat.cat. El límit de ritme és 10 exportacions per minut."
                    : "Fuente: Incasòl (fianzas) via habitatge.gencat.cat. El límite de ritmo es 10 exportaciones por minuto."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-stone flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-ambergold shrink-0" />
                {locale === "ca"
                  ? "Amb el pla Pro: descàrrega del dataset municipal filtrat per comarca o província en CSV o Excel."
                  : "Con el plan Pro: descarga del dataset municipal filtrado por comarca o provincia en CSV o Excel."}
                <button onClick={() => navigate("/preus")} className="text-ember3 font-bold underline shrink-0">
                  {locale === "ca" ? "Veure plans" : "Ver planes"}
                </button>
              </p>
            )}
          </div>
          {u.plan === "FREE" && (
            <div className="pt-2">
              <button onClick={() => navigate("/preus")} className="px-5 py-2.5 rounded-xl bg-ember text-white text-sm font-bold hover:bg-ember2">
                {t.map.paywall.cta}
              </button>
            </div>
          )}
          {u.role === "ADMIN" && (
            <div className="pt-2">
              <button onClick={() => navigate("/admin")} className="px-5 py-2.5 rounded-xl bg-pine text-white text-sm font-bold hover:bg-pine2">
                {t.panel.adminLink}
              </button>
            </div>
          )}
          <div className="pt-2">
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); await auth.refresh(); navigate("/"); }} className="text-sm text-stone hover:underline">
              {t.panel.logout}
            </button>
          </div>
        </div>
      )}

      {/* PERFIL */}
      {tab === "perfil" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6 space-y-4">
          <div>
            <label className="text-xs text-stone">{locale === "ca" ? "Nom (opcional)" : "Nombre (opcional)"}</label>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm" />
          </div>
          <div>
            <label className="text-xs text-stone">{locale === "ca" ? "Idioma" : "Idioma"}</label>
            <select value={locale} onChange={(e) => setLocale(e.target.value as "ca" | "es")} className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm">
              <option value="ca">Català</option>
              <option value="es">Castellano</option>
            </select>
          </div>
          <button onClick={saveProfile} disabled={busy} className="px-5 py-2.5 rounded-xl bg-pine text-white text-sm font-bold disabled:opacity-50">
            {locale === "ca" ? "Desar canvis" : "Guardar cambios"}
          </button>
          <div className="pt-2 border-t border-sand">
            <a href="/api/account/export" className="text-sm text-pine underline flex items-center gap-1.5">
              <Download className="w-4 h-4" /> {locale === "ca" ? "Descarrega les meves dades (RGPD)" : "Descarga mis datos (RGPD)"}
            </a>
          </div>
        </div>
      )}

      {/* FACTURACIÓ */}
      {tab === "facturacio" && (
        <div className="mt-6 space-y-4">
          <div className="bg-card rounded-2xl border border-line p-6">
            <h3 className="font-bold mb-3">{locale === "ca" ? "Gestió de subscripció" : "Gestión de suscripción"}</h3>
            {billing === null ? (
              <p className="text-sm text-stone">…</p>
            ) : billing.subscriptions.length === 0 ? (
              <p className="text-sm text-stone">{locale === "ca" ? "Encara no tens cap subscripció." : "Aún no tienes ninguna suscripción."}</p>
            ) : (
              <div className="space-y-2 text-sm">
                {billing.subscriptions.map((s) => (
                  <Row key={s.id} label={`${s.plan}${s.demo ? " (DEMO)" : ""}`} value={s.status} />
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              {billing?.stripeConfigured && (
                <button onClick={openPortal} disabled={busy} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
                  <ExternalLink className="w-4 h-4" /> {locale === "ca" ? "Portal de client Stripe" : "Portal de cliente Stripe"}
                </button>
              )}
              {(u.plan === "PREMIUM" || u.plan === "PRO") && billing?.subscriptions.some((s) => s.demo) && (
                <button onClick={cancelDemo} disabled={busy} className="text-sm text-ember3 underline disabled:opacity-50">
                  {t.panel.cancelDemo}
                </button>
              )}
            </div>
          </div>

          {/* v31 — CANVI DE PLA self-service amb avís de què es guanya/perd */}
          {(u.plan === "PREMIUM" || u.plan === "PRO") && plansCfg && (
            <div className="bg-card rounded-2xl border border-line p-6">
              <h3 className="font-bold mb-1">{locale === "ca" ? "Canviar de pla" : "Cambiar de plan"}</h3>
              <p className="text-sm text-moss">
                {locale === "ca"
                  ? "Canvia de pla quan vulguis des d'aquí. Abans de confirmar veuràs exactament què guanyes i què perds: les teves dades mai s'esborren."
                  : "Cambia de plan cuando quieras desde aquí. Antes de confirmar verás exactamente qué ganas y qué pierdes: tus datos nunca se borran."}
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {u.plan === "PREMIUM" && (
                  <button onClick={() => setChangeTarget("PRO")} disabled={busy} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-semibold hover:bg-pine2 disabled:opacity-50">
                    {locale === "ca" ? "Pasar a Pro·Agents" : "Pasar a Pro·Agentes"}{priceLabel("PRO")}
                  </button>
                )}
                {u.plan === "PRO" && (
                  <button onClick={() => setChangeTarget("PREMIUM")} disabled={busy} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-semibold hover:bg-pine2 disabled:opacity-50">
                    {locale === "ca" ? "Pasar a Premium" : "Pasar a Premium"}{priceLabel("PREMIUM")}
                  </button>
                )}
                <button onClick={() => setChangeTarget("FREE")} disabled={busy} className="px-4 py-2 rounded-lg border border-ember3 text-ember3 text-sm font-semibold hover:bg-embersoft disabled:opacity-50">
                  {locale === "ca" ? "Pasar al pla gratuït" : "Pasar al plan gratuito"}
                </button>
              </div>

              {changeTarget && (() => {
                const fromPlan = (u.plan === "PRO" ? "PRO" : "PREMIUM") as PlanIdLite;
                const byId: Record<string, PlanShapeLite> = {};
                for (const p of plansCfg) byId[p.id] = p;
                const d = diffPlanKeys(fromPlan, changeTarget, byId);
                const isFreeTarget = changeTarget === "FREE";
                const isStripeReal = Boolean(billing?.stripeConfigured) && !billing?.subscriptions.some((s) => s.demo);
                const targetName = isFreeTarget
                  ? (locale === "ca" ? "el pla gratuït" : "el plan gratuito")
                  : changeTarget === "PRO" ? "Pro·Agents" : "Premium";
                return (
                  <div className="mt-4 rounded-xl border border-ambergold bg-ambersoft2 p-4">
                    <p className="text-sm font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-ember3" />
                      {locale === "ca" ? `Confirmes el canvi a ${targetName}?` : `¿Confirmas el cambio a ${targetName}?`}
                    </p>
                    {d.gained.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-bold text-green2 uppercase">{locale === "ca" ? "Guanyaràs" : "Ganarás"}</p>
                        <ul className="mt-1 space-y-0.5">
                          {d.gained.map((k) => (
                            <li key={k} className="text-sm text-green2 flex items-start gap-1.5"><Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />{labelForDiffKey(k, locale)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {d.lost.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-bold text-ember3 uppercase">{locale === "ca" ? "Perdràs accés a" : "Perderás acceso a"}</p>
                        <ul className="mt-1 space-y-0.5">
                          {d.lost.map((k) => (
                            <li key={k} className="text-sm text-ember3 flex items-start gap-1.5"><XIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />{labelForDiffKey(k, locale)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-stone">{dataNote(locale)}</p>
                    <p className="mt-1 text-xs text-stone">
                      {isFreeTarget
                        ? (isStripeReal
                            ? (locale === "ca" ? "La baixa s'aplica al FINAL del període pagat: mantens l'accés fins llavors." : "La baja se aplica al FINAL del período pagado: mantienes el acceso hasta entonces.")
                            : (locale === "ca" ? "La baixa és immediata (mode proves o concessió d'admin)." : "La baja es inmediata (modo pruebas o concesión de admin)."))
                        : (isStripeReal
                            ? (locale === "ca" ? "Stripe aplica el prorrateig: pagues la diferència proporcional en el moment del canvi." : "Stripe aplica el prorrateo: pagas la diferencia proporcional en el momento del cambio.")
                            : (locale === "ca" ? "El canvi és immediat (mode proves)." : "El cambio es inmediato (modo pruebas)."))}
                      {plan.cancelAtPeriodEnd && !isFreeTarget
                        ? (locale === "ca" ? " També s'anul·la la cancel·lació programada." : " También se anula la cancelación programada.")
                        : ""}
                    </p>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <button onClick={() => changePlan(changeTarget)} disabled={busy} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2 disabled:opacity-50">
                        {busy ? "…" : (locale === "ca" ? "Sí, confirma el canvi" : "Sí, confirmar el cambio")}
                      </button>
                      <button onClick={() => setChangeTarget(null)} disabled={busy} className="px-4 py-2 rounded-lg border border-line text-sm font-semibold hover:bg-sand disabled:opacity-50">
                        {locale === "ca" ? "Tornar" : "Volver"}
                      </button>
                    </div>
                  </div>
                );
              })()}
              {changeMsg && <p className="mt-3 text-sm font-semibold text-pine">{changeMsg}</p>}
            </div>
          )}
          {/* v22: estat de la subscripció vigent (dades del servidor via useUserPlan) */}
          {(plan.subscriptionStatus === "active" || plan.subscriptionStatus === "trialing") && (
            <div className="bg-card rounded-2xl border border-line p-6">
              <h3 className="font-bold mb-3">{locale === "ca" ? "Subscripció vigent" : "Suscripción vigente"}</h3>
              <div className="space-y-2 text-sm">
                <Row
                  label={locale === "ca" ? "Estat" : "Estado"}
                  value={plan.cancelAtPeriodEnd
                    ? (locale === "ca" ? "Activa — es cancel·la al final del període" : "Activa — se cancela al final del período")
                    : plan.subscriptionStatus}
                  strong={!plan.cancelAtPeriodEnd}
                />
                {plan.currentPeriodEnd && (
                  <Row
                    label={locale === "ca" ? "Renovació / fi del període" : "Renovación / fin del período"}
                    value={new Date(plan.currentPeriodEnd).toLocaleDateString()}
                  />
                )}
                <Row
                  label={locale === "ca" ? "Consultes detallades aquest mes" : "Consultas detalladas este mes"}
                  value={String(plan.monthlyDetailedQueriesUsed)}
                />
              </div>
              <div className="mt-4 flex gap-3 items-center flex-wrap">
                {!plan.cancelAtPeriodEnd ? (
                  <button onClick={cancelSubscription} disabled={busy} className="text-sm text-ember3 underline disabled:opacity-50">
                    {locale === "ca" ? "Cancel·lar (al final del període)" : "Cancelar (al final del período)"}
                  </button>
                ) : (
                  <button onClick={reactivateSubscription} disabled={busy} className="text-sm text-green2 underline disabled:opacity-50">
                    {locale === "ca" ? "Reactivar la subscripció" : "Reactivar la suscripción"}
                  </button>
                )}
                <span className="text-xs text-stone">
                  {plan.stripeConfigured
                    ? (locale === "ca" ? "Gestionada amb Stripe." : "Gestionada con Stripe.")
                    : (locale === "ca" ? "Mode proves (sense Stripe)." : "Modo pruebas (sin Stripe).")}
                </span>
              </div>
            </div>
          )}
          <div className="bg-card rounded-2xl border border-line p-6">
            <h3 className="font-bold mb-3">{locale === "ca" ? "Historial de pagaments i factures" : "Historial de pagos y facturas"}</h3>
            {billing?.invoices.length ? (
              <div className="space-y-2">
                {billing.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2">
                    <span>{inv.date ? new Date(inv.date).toLocaleDateString() : "—"} · {inv.amount?.toFixed(2)} {inv.currency?.toUpperCase()}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-stone">{inv.status}</span>
                      {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="text-xs underline text-pine">PDF</a>}
                      {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className="text-xs underline text-pine">{locale === "ca" ? "Factura" : "Factura"}</a>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone">
                {billing?.stripeConfigured
                  ? (locale === "ca" ? "Cap factura encara." : "Ninguna factura todavía.")
                  : (locale === "ca" ? "Les factures de Stripe apareixeran aquí quan el propietari connecti el compte de Stripe." : "Las facturas de Stripe aparecerán aquí cuando el propietario conecte la cuenta de Stripe.")}
              </p>
            )}
          </div>
          {/* v37 — MODAL DE RETENCIÓ abans de confirmar la cancel·lació */}
          {retentionOpen && (
            <div className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setRetentionOpen(false)}>
              <div className="bg-card rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-bold text-lg">
                  {locale === "ca" ? "Abans de marxar…" : "Antes de irte…"}
                </h3>
                <p className="mt-1 text-sm text-moss">
                  {locale === "ca"
                    ? "Mantindràs l'accés fins al final del període pagat. Però potser no cal cancel·lar: mira aquestes alternatives."
                    : "Mantendrás el acceso hasta el final del período pagado. Pero quizá no hace falta cancelar: mira estas alternativas."}
                </p>
                <div className="mt-4 space-y-2">
                  {u.plan === "PRO" && (
                    <button onClick={() => { setRetentionOpen(false); setChangeTarget("PREMIUM"); }} className="w-full text-left rounded-xl border border-line hover:bg-sand p-3">
                      <p className="text-sm font-bold">{locale === "ca" ? "Et passes a Premium i estalvies 12 €/mes (144 €/any)" : "Pásate a Premium y ahorras 12 €/mes (144 €/año)"}</p>
                      <p className="text-xs text-stone">{locale === "ca" ? "Mateixos informes PDF municipals, consultes il·limitades, sense naves industrials." : "Mismos informes PDF municipales, consultas ilimitadas, sin naves industriales."}</p>
                    </button>
                  )}
                  {u.plan === "PREMIUM" && (
                    <button onClick={() => { setRetentionOpen(false); setChangeTarget("PRO"); }} className="w-full text-left rounded-xl border border-line hover:bg-sand p-3">
                      <p className="text-sm font-bold">{locale === "ca" ? "Prova Pro·Agents (pots tornar a Premium quan vulguis)" : "Prueba Pro·Agentes (puedes volver a Premium cuando quieras)"}</p>
                      <p className="text-xs text-stone">{locale === "ca" ? "Si necessites CSV, PDF d'edifici i naus industrials. El canvi es prorrateja amb Stripe." : "Si necesitas CSV, PDF de edificio y naves industriales. El cambio se prorratea con Stripe."}</p>
                    </button>
                  )}
                  <button onClick={openPortal} disabled={busy} className="w-full text-left rounded-xl border border-line hover:bg-sand p-3">
                    <p className="text-sm font-bold">{locale === "ca" ? "Només volia canviar la targeta / el mètode de pagament" : "Solo quería cambiar la tarjeta / el método de pago"}</p>
                    <p className="text-xs text-stone">{locale === "ca" ? "Al Portal de Stripe pots actualitzar la targeta sense perdre el pla." : "En el Portal de Stripe puedes actualizar la tarjeta sin perder el plan."}</p>
                  </button>
                  <button onClick={() => { setRetentionOpen(false); navigate("/preus"); }} className="w-full text-left rounded-xl border border-line hover:bg-sand p-3">
                    <p className="text-sm font-bold">{locale === "ca" ? "Revisar què inclou cada pla" : "Revisar qué incluye cada plan"}</p>
                    <p className="text-xs text-stone">{locale === "ca" ? "Comparació completa de Premium i Pro·Agents." : "Comparación completa de Premium y Pro·Agentes."}</p>
                  </button>
                </div>
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-sm font-bold">{locale === "ca" ? "Vols continuar amb la cancel·lació?" : "¿Quieres continuar con la cancelación?"}</p>
                  <label className="block mt-2 text-xs font-semibold text-moss">
                    {locale === "ca" ? "Motiu (opcional — ens ajuda a millorar)" : "Motivo (opcional — nos ayuda a mejorar)"}
                  </label>
                  <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                    <option value="">{locale === "ca" ? "— Tria un motiu —" : "— Elige un motivo —"}</option>
                    <option value="CAR">{locale === "ca" ? "El preu / la targeta" : "El precio / la tarjeta"}</option>
                    <option value="NO_USO">{locale === "ca" ? "No l'uso prou" : "No lo uso lo suficiente"}</option>
                    <option value="PREU">{locale === "ca" ? "És car per al que em fa falta" : "Es caro para lo que necesito"}</option>
                    <option value="FALTEN_DADES">{locale === "ca" ? "Falten dades que necessito" : "Faltan datos que necesito"}</option>
                    <option value="UN_ALTRE">{locale === "ca" ? "Un altre motiu" : "Otro motivo"}</option>
                  </select>
                  <textarea
                    value={cancelFeedback}
                    onChange={(e) => setCancelFeedback(e.target.value.slice(0, 500))}
                    placeholder={locale === "ca" ? "Explica'ns-ho (opcional, màx. 500 caràcters)…" : "Cuéntanos (opcional, máx. 500 caracteres)…"}
                    rows={2}
                    className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm"
                  />
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button onClick={confirmCancel} disabled={busy} className="px-4 py-2 rounded-lg bg-ember3 text-white text-sm font-bold hover:opacity-90 disabled:opacity-50">
                      {locale === "ca" ? "Confirmar la cancel·lació" : "Confirmar la cancelación"}
                    </button>
                    <button onClick={() => setRetentionOpen(false)} disabled={busy} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold hover:bg-pine2 disabled:opacity-50">
                      {locale === "ca" ? "Me queda" : "Me quedo"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORIAL */}
      {tab === "historial" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{locale === "ca" ? "Historial de consultes" : "Historial de consultas"}</h3>
            {history && history.length > 0 && (
              <button onClick={() => deleteHistory()} className="text-xs text-ember3 underline">{locale === "ca" ? "Buida-ho tot" : "Vaciar todo"}</button>
            )}
          </div>
          {/* FASE 1 (plans migració): el Gratuït té historial amb TTL de 7 dies;
              els plans de pagament el mantenen sense límit de temps. */}
          {u.plan === "FREE" && !historyLocked && (
            <p className="text-xs text-stone mb-3">
              {locale === "ca"
                ? "Al pla gratuït, l'historial es guarda 7 dies. Amb els plans de pagament no té límit de temps."
                : "En el plan gratuito, el historial se guarda 7 días. Con los planes de pago no tiene límite de tiempo."}
            </p>
          )}
          {/* Fase 5 — pestanya blocada amb teaser (la API torna 403 PLAN_REQUIRED) */}
          {historyLocked ? (
            <div className="text-center py-5">
              <div className="mx-auto w-10 h-10 rounded-full bg-ambersoft2 border border-amberline2 flex items-center justify-center">
                <Lock className="w-5 h-5 text-ember3" />
              </div>
              <p className="mt-3 text-sm font-semibold text-pine">
                {locale === "ca" ? "L'historial és del pla Premium" : "El historial es del plan Premium"}
              </p>
              <p className="mt-1 text-sm text-moss max-w-md mx-auto leading-relaxed">
                {locale === "ca"
                  ? "Amb Premium, cada consulta queda desada perquè puguis tornar-la a obrir i veure l'evolució del municipi. Les teves dades no s'esborren mai: si actives Premium, hi tornaràs a tenir accés."
                  : "Con Premium, cada consulta queda guardada para que puedas volver a abrirla y ver la evolución del municipio. Tus datos no se borran nunca: si activas Premium, volverás a tener acceso."}
              </p>
              <button onClick={() => navigate("/preus")} className="mt-4 px-4 py-2 rounded-lg bg-ember text-white text-xs font-bold hover:bg-ember2">
                {locale === "ca" ? "Veure Premium" : "Ver Premium"}
              </button>
            </div>
          ) : history === null ? (
            <p className="text-sm text-stone">…</p>
          ) : history.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-stone">{locale === "ca" ? "Cap consulta registrada." : "Ninguna consulta registrada."}</p>
              <button onClick={() => navigate("/mapa")} className="mt-3 px-4 py-2 rounded-lg bg-pine text-white text-xs font-bold">
                {locale === "ca" ? "Explora el mapa" : "Explora el mapa"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2">
                  <span>
                    <b>{h.municipalityName || h.municipalityCode}</b>
                    {h.rentLatest != null && <span className="text-stone"> · {h.rentLatest.toFixed(0)} €/mes ({h.rentPeriod})</span>}
                    <span className="block text-xs text-stone">{new Date(h.createdAt).toLocaleString()}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {h.municipalityCode && (
                      <button
                        onClick={() => navigate(`/mapa?mun=${encodeURIComponent(h.municipalityCode)}${h.buildingId ? `&edifici=${encodeURIComponent(h.buildingId)}` : ""}`)}
                        className="text-xs text-pine underline flex items-center gap-1"
                        title={locale === "ca" ? "Torna a obrir aquesta consulta al mapa" : "Vuelve a abrir esta consulta en el mapa"}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {locale === "ca" ? "Al mapa" : "Al mapa"}
                      </button>
                    )}
                    <button onClick={() => deleteHistory(h.id)} className="text-xs text-stone underline">{locale === "ca" ? "Esborra" : "Borra"}</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PREFERITS */}
      {tab === "preferits" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6">
          <h3 className="font-bold mb-3">{locale === "ca" ? "Edificis i municipis preferits (Premium)" : "Edificios y municipios favoritos (Premium)"}</h3>
          {/* Fase 5 — pla gratuït: pestanya blocada amb teaser (la API torna 403 PLAN_REQUIRED) */}
          {favoritesLocked ? (
            <div className="text-center py-5">
              <div className="mx-auto w-10 h-10 rounded-full bg-ambersoft2 border border-amberline2 flex items-center justify-center">
                <Lock className="w-5 h-5 text-ember3" />
              </div>
              <p className="mt-3 text-sm font-semibold text-pine">
                {locale === "ca" ? "Els preferits són del pla Premium" : "Los favoritos son del plan Premium"}
              </p>
              <p className="mt-1 text-sm text-moss max-w-md mx-auto leading-relaxed">
                {locale === "ca"
                  ? "Desa municipis i edificis amb l'estrella del mapa i segueix-los amb un resum mensual per correu. Les teves dades no s'esborren mai: si actives Premium, els recuperaràs tal com els vas desar."
                  : "Guarda municipios y edificios con la estrella del mapa y síguelos con un resumen mensual por correo. Tus datos no se borran nunca: si activas Premium, los recuperarás tal como los guardaste."}
              </p>
              <button onClick={() => navigate("/preus")} className="mt-4 px-4 py-2 rounded-lg bg-ember text-white text-xs font-bold hover:bg-ember2">
                {locale === "ca" ? "Veure Premium" : "Ver Premium"}
              </button>
            </div>
          ) : favorites === null ? (
            <p className="text-sm text-stone">…</p>
          ) : favorites.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-stone">{locale === "ca" ? "Encara no n'has desat cap. Desa'ls amb l'estrella del panell del mapa." : "Aún no has guardado ninguno. Guárdalos con la estrella del panel del mapa."}</p>
              <button onClick={() => navigate("/mapa")} className="mt-3 px-4 py-2 rounded-lg bg-pine text-white text-xs font-bold">
                {locale === "ca" ? "Explora el mapa" : "Explora el mapa"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-stone">
                {locale === "ca"
                  ? "Amb l'alerta activada, t'avisem per correu quan el preu vigent d'un preferit canviï el % que triïs (o passi a àrea tensada). L'avís arriba quan publiquem dades noves, màx. un per dia."
                  : "Con la alerta activada, te avisamos por correo cuando el precio vigente de un favorito cambie el % que elijas (o pase a área tensionada). El aviso llega cuando publicamos datos nuevos, máx. uno al día."}
              </p>
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2 flex-wrap">
                  <span className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-ember fill-ember" />
                    <b>{f.label || f.entityKey}</b>
                    <span className="text-xs text-stone">{f.buildingId ? "edifici" : "municipi"}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* v37 — alerta de preu: llindar % per favorit */}
                    <select
                      value={f.alertPct != null ? String(f.alertPct) : ""}
                      onChange={(e) => setFavAlert(f.entityKey, e.target.value)}
                      disabled={busy}
                      className="text-xs rounded-lg border border-line px-2 py-1"
                      title={locale === "ca" ? "Alerta de preu" : "Alerta de precio"}
                    >
                      <option value="">{locale === "ca" ? "Sense alerta" : "Sin alerta"}</option>
                      <option value="3">±3%</option>
                      <option value="5">±5%</option>
                      <option value="10">±10%</option>
                      <option value="15">±15%</option>
                    </select>
                    {(f.buildingId || f.municipalityCode) && (
                      <button
                        onClick={() => navigate(favoriteMapHref(f))}
                        className="text-xs text-pine underline flex items-center gap-1"
                        title={locale === "ca" ? "Obre al mapa" : "Abre en el mapa"}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {locale === "ca" ? "Al mapa" : "Al mapa"}
                      </button>
                    )}
                    <button
                      onClick={async () => { await fetch(`/api/favorites?key=${encodeURIComponent(f.entityKey)}`, { method: "DELETE" }); setFavorites(null); loadTab("preferits"); }}
                      className="text-xs text-stone underline"
                    >
                      {locale === "ca" ? "Esborra" : "Borra"}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {/* v24 — resum mensual de preferits per correu (opt-in, només plans de pagament) */}
          {(u.plan === "PREMIUM" || u.plan === "PRO") && (
            <div className="mt-4 pt-4 border-t border-sand space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={alertsOn === true}
                  onChange={toggleAlerts}
                  disabled={busy || alertsOn === null}
                  className="w-4 h-4 accent-ember"
                />
                {locale === "ca" ? "Avisa'm per correu cada mes dels meus preferits" : "Avísame por correo cada mes de mis favoritos"}
              </label>
              <p className="text-xs text-stone leading-relaxed">
                {locale === "ca"
                  ? "Un resum mensual amb el preu mitjà vigent de cada municipi o edifici desat i l'enllaç directe per obrir-lo al mapa. Pots desactivar-ho quan vulguis."
                  : "Un resumen mensual con el precio medio vigente de cada municipio o edificio guardado y el enlace directo para abrirlo en el mapa. Puedes desactivarlo cuando quieras."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* COMPARACIONS */}
      {tab === "comparacions" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{locale === "ca" ? "Comparacions desades" : "Comparaciones guardadas"}</h3>
            <button onClick={() => navigate("/comparador")} className="text-xs text-pine underline">{locale === "ca" ? "Obrir comparador" : "Abrir comparador"}</button>
          </div>
          {comparisons === null ? (
            <p className="text-sm text-stone">…</p>
          ) : comparisons.length === 0 ? (
            <p className="text-sm text-stone">{locale === "ca" ? "Encara no n'has desat cap des del comparador." : "Aún no has guardado ninguna desde el comparador."}</p>
          ) : (
            <div className="space-y-2">
              {comparisons.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2">
                  <span><b>{c.name}</b> <span className="text-xs text-stone">· {c.entities.length} entitats · {new Date(c.createdAt).toLocaleDateString()}</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => navigate(`/comparador?id=${encodeURIComponent(c.id)}`)}
                      className="text-xs text-pine underline flex items-center gap-1"
                      title={locale === "ca" ? "Carrega aquesta comparació al comparador" : "Carga esta comparación en el comparador"}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {locale === "ca" ? "Obrir" : "Abrir"}
                    </button>
                    <button
                      onClick={async () => { await fetch(`/api/comparisons?id=${c.id}`, { method: "DELETE" }); setComparisons(null); loadTab("comparacions"); }}
                      className="text-xs text-stone underline"
                    >
                      {locale === "ca" ? "Esborra" : "Borra"}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INFORMES MEUS */}
      {tab === "informes" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6">
          <h3 className="font-bold mb-3">{locale === "ca" ? "Informes de preu enviats" : "Informes de precio enviados"}</h3>
          {myReports === null ? (
            <p className="text-sm text-stone">…</p>
          ) : myReports.length === 0 ? (
            <p className="text-sm text-stone">{locale === "ca" ? "Encara no n'has enviat cap des del mapa." : "Aún no has enviado ninguno desde el mapa."}</p>
          ) : (
            <div className="space-y-2">
              {myReports.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2">
                  <span>{r.municipalityCode} · <b>{r.offerEurMonth} €/mes</b> {r.offerEurM2 && <span className="text-xs text-stone">({r.offerEurM2} €/m²)</span>}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sand">{r.status}</span>
                </div>
              ))}
              <p className="text-xs text-stone">{locale === "ca" ? "Els informes passen per moderació abans de ser útils estadísticament." : "Los informes pasan por moderación antes de ser útiles estadísticamente."}</p>
            </div>
          )}
        </div>
      )}

      {/* ALERTES (FASE 2 — Nou Premium): preu i normativa per municipi, revisió diària */}
      {tab === "alertes" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6">
          <h3 className="font-bold flex items-center gap-2 mb-1">
            {locale === "ca" ? "Alertes de preu i normativa" : "Alertas de precio y normativa"}
            <span className="shrink-0 rounded-full bg-ambersoft border border-amberline text-ambertext text-[10px] font-bold px-1.5 py-0.5 leading-none" aria-label={locale === "ca" ? "Nou" : "Nuevo"}>
              {locale === "ca" ? "Nou" : "Nuevo"}
            </span>
          </h3>
          <p className="text-xs text-stone mb-4 leading-relaxed">
            {locale === "ca"
              ? "Revisió diària contra FONTS OFICIALS: fiances Incasòl via habitatge.gencat.cat, llistes d'àrees tensades (DOGC) i normativa vigent (IRAV/INE). Reps UN correu consolidat quan canvia la dada oficial — mai dobles avisos del mateix fet."
              : "Revisión diaria contra FUENTES OFICIALES: fianzas Incasòl via habitatge.gencat.cat, listas de áreas tensadas (DOGC) y normativa vigente (IRAV/INE). Recibes UN correo consolidado cuando cambia el dato oficial — nunca avisos duplicados del mismo hecho."}
          </p>
          {alertsLocked ? (
            <div className="text-center py-5">
              <div className="mx-auto w-10 h-10 rounded-full bg-ambersoft2 border border-amberline2 flex items-center justify-center">
                <Bell className="w-5 h-5 text-ember3" />
              </div>
              <p className="mt-3 text-sm font-semibold text-pine">
                {locale === "ca" ? "Les alertes són del pla Premium" : "Las alertas son del plan Premium"}
              </p>
              <p className="mt-1 text-sm text-moss max-w-md mx-auto leading-relaxed">
                {locale === "ca"
                  ? "Amb Premium pots vigilar municipis i rebre un avís quan el preu oficial canviï, quan un municipi entri o surti d'àrea tensada o quan canviï la normativa vigent."
                  : "Con Premium puedes vigilar municipios y recibir un aviso cuando el precio oficial cambie, cuando un municipio entre o salga de área tensada o cuando cambie la normativa vigente."}
              </p>
              <button onClick={() => navigate("/preus")} className="mt-4 px-4 py-2 rounded-lg bg-ember text-white text-xs font-bold hover:bg-ember2">
                {locale === "ca" ? "Veure Premium" : "Ver Premium"}
              </button>
            </div>
          ) : (
            <>
              {/* formulari: municipi + tipus */}
              <div className="border border-sand2 rounded-xl p-4 mb-4">
                <label className="block text-xs font-semibold text-moss mb-1.5" htmlFor="alerta-muni">
                  {locale === "ca" ? "Municipi a vigilar" : "Municipio a vigilar"}
                </label>
                <input
                  id="alerta-muni"
                  value={alertMuniSel ? alertMuniSel.name : alertMuniQ}
                  onChange={(e) => {
                    setAlertMuniSel(null);
                    setAlertMuniQ(e.target.value);
                    cercaMunis(e.target.value, setAlertMuniOpts, timerAlerts);
                  }}
                  placeholder={locale === "ca" ? "Cerca municipi (mín. 2 lletres)..." : "Busca municipio (mín. 2 letras)..."}
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pine/30"
                />
                {alertMuniOpts.length > 0 && (
                  <div className="mt-1.5 border border-line rounded-lg divide-y divide-sand2 bg-cream overflow-hidden">
                    {alertMuniOpts.map((m) => (
                      <button
                        key={m.code}
                        onClick={() => { setAlertMuniSel(m); setAlertMuniOpts([]); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-sand flex items-center justify-between gap-2"
                      >
                        <span>{m.name}</span>
                        <span className="text-xs text-stone">{m.code}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex gap-1.5 flex-wrap">
                  {([
                    ["PRICE", locale === "ca" ? "Preu oficial" : "Precio oficial"],
                    ["TENSE", locale === "ca" ? "Àrea tensa" : "Área tensada"],
                    ["NORMATIVA", "Normativa"],
                  ] as const).map(([v, lab]) => (
                    <button
                      key={v}
                      onClick={() => setAlertTipus(v)}
                      aria-pressed={alertTipus === v}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        alertTipus === v ? "bg-pine text-white border-pine" : "bg-card border-line text-moss hover:bg-sand"
                      }`}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
                <button
                  onClick={addAlert}
                  disabled={!alertMuniSel || alertBusy}
                  className="mt-3 px-4 py-2 rounded-lg bg-pine text-white text-xs font-bold hover:bg-pine2 disabled:opacity-50"
                >
                  {alertBusy ? "..." : (locale === "ca" ? "Afegeix alerta" : "Añadir alerta")}
                </button>
              </div>
              {/* llista */}
              {alerts === null ? (
                <p className="text-sm text-stone">…</p>
              ) : alerts.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-stone">
                    {locale === "ca" ? "Cap alerta configurada encara." : "Ninguna alerta configurada todavía."}
                  </p>
                  <p className="mt-1 text-xs text-stone">
                    {locale === "ca" ? `Fins a ${alertsLimit} alertes actives.` : `Hasta ${alertsLimit} alertas activas.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2">
                      <span>
                        <b>{a.municipi?.name || a.entityKey}</b>
                        {a.municipi?.rentLatest != null && (
                          <span className="text-stone"> · {a.municipi.rentLatest.toFixed(0)} €/mes ({a.municipi.rentPeriod})</span>
                        )}
                        <span className="block text-xs text-stone">
                          {a.tipus === "PRICE"
                            ? (locale === "ca" ? "Preu oficial (Incasòl)" : "Precio oficial (Incasòl)")
                            : a.tipus === "TENSE"
                              ? (locale === "ca" ? "Àrea tensa (DOGC)" : "Área tensada (DOGC)")
                              : "Normativa (IRAV/INE · DOGC)"}
                          {a.ultimaComprovacio && ` · ${locale === "ca" ? "darrera comprovació" : "última comprobación"}: ${new Date(a.ultimaComprovacio).toLocaleDateString()}`}
                        </span>
                      </span>
                      <button onClick={() => delAlert(a.id)} className="text-xs text-stone underline shrink-0">
                        {locale === "ca" ? "Esborra" : "Borra"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* NORMATIVA (FASE 2 — Nou Premium): mòdul normatiu complet per municipi */}
      {tab === "normativa" && (
        <div className="mt-6 bg-card rounded-2xl border border-line p-6">
          <h3 className="font-bold flex items-center gap-2 mb-1">
            {locale === "ca" ? "Mòdul normatiu complet" : "Módulo normativo completo"}
            <span className="shrink-0 rounded-full bg-ambersoft border border-amberline text-ambertext text-[10px] font-bold px-1.5 py-0.5 leading-none" aria-label={locale === "ca" ? "Nou" : "Nuevo"}>
              {locale === "ca" ? "Nou" : "Nuevo"}
            </span>
          </h3>
          <p className="text-xs text-stone mb-4 leading-relaxed">
            {locale === "ca"
              ? "Índex de referència vigent, IRAV (INE), gran tenedor i SERPAVI, límits de contracte i àrees tensades — amb la font i el període de cada dada. Comparació estadística, no és una taxació."
              : "Índice de referencia vigente, IRAV (INE), gran tenedor y SERPAVI, límites de contrato y áreas tensadas — con la fuente y el período de cada dato. Comparación estadística, no es una tasación."}
          </p>
          {normData?.error === "PLAN_REQUIRED" ? (
            <div className="text-center py-5">
              <div className="mx-auto w-10 h-10 rounded-full bg-ambersoft2 border border-amberline2 flex items-center justify-center">
                <Scale className="w-5 h-5 text-ember3" />
              </div>
              <p className="mt-3 text-sm font-semibold text-pine">
                {locale === "ca" ? "El mòdul normatiu complet és del pla Premium" : "El módulo normativo completo es del plan Premium"}
              </p>
              <p className="mt-1 text-sm text-moss max-w-md mx-auto leading-relaxed">
                {locale === "ca"
                  ? "Amb Premium tens tota la regulació aplicable a un municipi en un sol lloc: referència vigent, IRAV, gran tenedor/SERPAVI, àrees tensades i límits de contracte, amb fonts oficials."
                  : "Con Premium tienes toda la regulación aplicable a un municipio en un solo lugar: referencia vigente, IRAV, gran tenedor/SERPAVI, áreas tensadas y límites de contrato, con fuentes oficiales."}
              </p>
              <button onClick={() => navigate("/preus")} className="mt-4 px-4 py-2 rounded-lg bg-ember text-white text-xs font-bold hover:bg-ember2">
                {locale === "ca" ? "Veure Premium" : "Ver Premium"}
              </button>
            </div>
          ) : (
            <>
              {/* cerca de municipi */}
              <div className="border border-sand2 rounded-xl p-4 mb-4">
                <label className="block text-xs font-semibold text-moss mb-1.5" htmlFor="norm-muni">
                  {locale === "ca" ? "Municipi" : "Municipio"}
                </label>
                <input
                  id="norm-muni"
                  value={normData && !normData.error ? normData.municipi?.name : normQ}
                  onChange={(e) => { setNormData(null); setNormQ(e.target.value); cercaMunis(e.target.value, setNormOpts, timerNorm); }}
                  placeholder={locale === "ca" ? "Cerca municipi (mín. 2 lletres)..." : "Busca municipio (mín. 2 letras)..."}
                  className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pine/30"
                />
                {normOpts.length > 0 && (
                  <div className="mt-1.5 border border-line rounded-lg divide-y divide-sand2 bg-cream overflow-hidden">
                    {normOpts.map((m) => (
                      <button
                        key={m.code}
                        onClick={() => { setNormOpts([]); setNormQ(m.name); carregaNorm(m.code); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-sand flex items-center justify-between gap-2"
                      >
                        <span>{m.name}</span>
                        <span className="text-xs text-stone">{m.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {normBusy && <p className="text-sm text-stone">…</p>}
              {!normBusy && normData && !normData.error && (
                <div className="space-y-3 text-sm">
                  {/* A. índex de referència vigent */}
                  <div className="border border-sand2 rounded-lg px-3 py-2.5">
                    <p className="font-semibold">
                      {locale === "ca" ? "Índex de referència vigent" : "Índice de referencia vigente"}
                      {normData.indexReferencia?.estimacio && (
                        <span className="ml-2 text-[10px] font-bold uppercase text-ember3">
                          {locale === "ca" ? "estimació (comarca)" : "estimación (comarca)"}
                        </span>
                      )}
                    </p>
                    <p className="text-stone mt-0.5">
                      {normData.indexReferencia?.valor != null
                        ? <><b className="text-pine">{normData.indexReferencia.valor.toFixed(0)} €/mes</b> · {normData.indexReferencia.period}{normData.indexReferencia.variacioInteranualPct != null ? ` · ${normData.indexReferencia.variacioInteranualPct > 0 ? "+" : ""}${normData.indexReferencia.variacioInteranualPct}% ${locale === "ca" ? "interanual" : "interanual"}` : ""}</>
                        : (locale === "ca" ? "Encara sense valor publicat per a aquest municipi." : "Todavía sin valor publicado para este municipio.")}
                    </p>
                    <p className="text-xs text-stone mt-0.5">{normData.indexReferencia?.font}</p>
                  </div>
                  {/* B. àrea tensa */}
                  <div className="border border-sand2 rounded-lg px-3 py-2.5">
                    <p className="font-semibold">{locale === "ca" ? "Àrea de mercat residencial tensat" : "Área de mercado residencial tensionado"}</p>
                    <p className="text-stone mt-0.5">
                      {normData.areaTensa?.tense
                        ? (locale === "ca" ? <span><b className="text-ember3">Sí</b> — llista {normData.areaTensa.llista === "A" ? "TER/3739/2026 (pròrroga)" : normData.areaTensa.llista === "C" ? "TER/3740/2026 (nous)" : normData.areaTensa.llista} · nous contractes amb límit de renta (LAU art. 17.2)</span> : <span><b className="text-ember3">Sí</b> — los nuevos contratos tienen límite de renta (LAU art. 17.2)</span>)
                        : (locale === "ca" ? "No consta a les llistes vigents." : "No consta en las listas vigentes.")}
                    </p>
                    <p className="text-xs text-stone mt-0.5">{normData.areaTensa?.resolucionsVigents?.join(" · ")} · {normData.areaTensa?.publicacio}</p>
                  </div>
                  {/* C. IRAV */}
                  <div className="border border-sand2 rounded-lg px-3 py-2.5">
                    <p className="font-semibold">IRAV — {locale === "ca" ? "actualització anual de renta (INE)" : "actualización anual de renta (INE)"}</p>
                    <p className="text-stone mt-0.5">+{normData.irav?.pct}% · {normData.irav?.periode}</p>
                    <p className="text-xs text-stone mt-0.5">{normData.irav?.font}</p>
                  </div>
                  {/* D. gran tenedor / SERPAVI */}
                  <div className="border border-sand2 rounded-lg px-3 py-2.5">
                    <p className="font-semibold">{locale === "ca" ? "Gran tenedor i SERPAVI" : "Gran tenedor y SERPAVI"}</p>
                    <p className="text-stone mt-0.5">{normData.granTenedorSerpavi?.vigencia}</p>
                    <p className="text-stone mt-0.5">{normData.granTenedorSerpavi?.granTenedor}</p>
                    <p className="text-xs text-stone mt-0.5">
                      {normData.granTenedorSerpavi?.nota}{" "}
                      <a href={normData.granTenedorSerpavi?.consultaOficial} target="_blank" rel="noopener noreferrer" className="underline text-pine">serpavi.mivau.gob.es</a>
                    </p>
                  </div>
                  {/* E. altres límits */}
                  <div className="border border-sand2 rounded-lg px-3 py-2.5">
                    <p className="font-semibold">{locale === "ca" ? "Altres regles vigents" : "Otras reglas vigentes"}</p>
                    <p className="text-stone mt-0.5">{normData.limits?.nouContracte}</p>
                    <p className="text-stone">{normData.limits?.temporada}</p>
                    <p className="text-stone">{normData.altres?.amiant}</p>
                  </div>
                  <p className="text-xs text-stone leading-relaxed">
                    {normData.disclaimer?.[locale === "es" ? "es" : "ca"]}
                    {" "}
                    {locale === "ca" ? "Consulta feta" : "Consulta hecha"} {new Date(normData.consultedAt).toLocaleString()}.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SEGURETAT */}
      {tab === "seguretat" && (
        <div className="mt-6 space-y-4">
          <div className="bg-card rounded-2xl border border-line p-6 space-y-3">
            <h3 className="font-bold">{locale === "ca" ? "Sessions" : "Sesiones"}</h3>
            {lastLoginAt && (
              <p className="text-sm text-stone">
                {locale === "ca" ? "Últim inici de sessió:" : "Último inicio de sesión:"}{" "}
                <b>{new Date(lastLoginAt).toLocaleString()}</b>
              </p>
            )}
            <button onClick={revokeOtherSessions} disabled={busy} className="px-5 py-2.5 rounded-xl bg-pine text-white text-sm font-bold disabled:opacity-50">
              {locale === "ca" ? "Tanca les sessions d'altres dispositius" : "Cierra las sesiones de otros dispositivos"}
            </button>
            <p className="text-xs text-stone">
              {locale === "ca"
                ? "Invalida totes les sessions obertes en altres ordinadors o mòbils. Aquest dispositiu continua amb la sessió iniciada. També es tanquen automàticament en canviar la contrasenya."
                : "Invalida todas las sesiones abiertas en otros ordenadores o móviles. Este dispositivo sigue con la sesión iniciada. También se cierran automáticamente al cambiar la contraseña."}
            </p>
          </div>
          {/* v37 — AUTENTICACIÓ EN DOS PASSOS (TOTP) */}
          <div className="bg-card rounded-2xl border border-line p-6 space-y-3">
            <h3 className="font-bold flex items-center gap-2">
              <Shield className="w-4 h-4" />
              {locale === "ca" ? "Verificació en dos passos (2FA)" : "Verificación en dos pasos (2FA)"}
              {totpEnabled !== null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totpEnabled ? "bg-mintsoft text-green2" : "bg-sand text-stone"}`}>
                  {totpEnabled ? (locale === "ca" ? "Activada" : "Activada") : (locale === "ca" ? "Desactivada" : "Desactivada")}
                </span>
              )}
            </h3>
            {totpEnabled === false && (
              <>
                <p className="text-sm text-moss">
                  {locale === "ca"
                    ? "Afegeix una segona capa de seguretat: a més de la contrasenya, caldrà un codi de l'app d'autenticació (Google Authenticator, Authy, Aegis…)."
                    : "Añade una segunda capa de seguridad: además de la contraseña, hará falta un código de la app de autenticación (Google Authenticator, Authy, Aegis…)."}
                </p>
                {!totpQr ? (
                  <button onClick={totpSetup} disabled={busy} className="px-5 py-2.5 rounded-xl bg-pine text-white text-sm font-bold disabled:opacity-50">
                    {locale === "ca" ? "Activa la verificació en dos passos" : "Activar la verificación en dos pasos"}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <ol className="text-sm text-moss list-decimal pl-5 space-y-0.5">
                      <li>{locale === "ca" ? "Obre l'app d'autenticació i escaneja aquest codi:" : "Abre la app de autenticación y escanea este código:"}</li>
                      <li>{locale === "ca" ? "Introdueix el codi de 6 dígits que et mostra per confirmar." : "Introduce el código de 6 dígitos que te muestra para confirmar."}</li>
                    </ol>
                    <div className="flex flex-wrap items-center gap-4">
                      {totpQr && <img src={totpQr} alt="QR 2FA" width={180} height={180} className="rounded-lg border border-line" />}
                      {totpSecretManual && (
                        <div className="text-xs text-stone">
                          <p className="font-semibold">{locale === "ca" ? "Alta manual (si no pots escanejar):" : "Alta manual (si no puedes escanear):"}</p>
                          <code className="break-all">{totpSecretManual}</code>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <input
                        value={totpCodeInput}
                        onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        className="w-36 px-3 py-2 rounded-lg border border-line text-center text-lg tracking-[0.2em] font-bold"
                        autoComplete="one-time-code"
                      />
                      <button onClick={totpEnable} disabled={busy || totpCodeInput.length !== 6} className="px-5 py-2.5 rounded-xl bg-pine text-white text-sm font-bold disabled:opacity-50">
                        {locale === "ca" ? "Confirma i activa" : "Confirmar y activar"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {totpEnabled === true && (
              <div className="space-y-3">
                <p className="text-sm text-moss">
                  {locale === "ca"
                    ? "En entrar, després de la contrasenya, es demanarà el codi de l'app d'autenticació."
                    : "Al entrar, después de la contraseña, se pedirá el código de la app de autenticación."}
                </p>
                {totpRecoveryCodes && (
                  <div className="rounded-xl border border-ambergold bg-ambersoft2 p-4">
                    <p className="text-sm font-bold">{locale === "ca" ? "Codis de recuperació (un sol ús)" : "Códigos de recuperación (un solo uso)"}</p>
                    <p className="text-xs text-stone mt-0.5">
                      {locale === "ca"
                        ? "Cada codi funciona UNA vegada si no tens l'app a mà. No es tornaran a mostrar: fes-ne una captura o imprimeix-los."
                        : "Cada código funciona UNA vez si no tienes la app a mano. No se volverán a mostrar: haz una captura o imprímelos."}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
                      {totpRecoveryCodes.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                    <button onClick={() => setTotpRecoveryCodes(null)} className="mt-2 text-xs underline text-pine">
                      {locale === "ca" ? "Ja els he guardat" : "Ya los he guardado"}
                    </button>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap items-center">
                  <input
                    type="password"
                    value={totpPassword}
                    onChange={(e) => setTotpPassword(e.target.value)}
                    placeholder={locale === "ca" ? "Contrasenya per confirmar" : "Contraseña para confirmar"}
                    className="px-3 py-2 rounded-lg border border-line text-sm"
                  />
                  <button onClick={totpRecoveryRegen} disabled={busy || !totpPassword} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-semibold disabled:opacity-50">
                    {locale === "ca" ? "Nous codis de recuperació" : "Nuevos códigos de recuperación"}
                  </button>
                  <button onClick={totpDisable} disabled={busy || !totpPassword} className="px-4 py-2 rounded-lg border border-ember3 text-ember3 text-sm font-semibold hover:bg-embersoft disabled:opacity-50">
                    {locale === "ca" ? "Desactiva el 2FA" : "Desactivar el 2FA"}
                  </button>
                </div>
                <p className="text-xs text-stone">
                  {locale === "ca"
                    ? "Les accions d'aquesta secció demanen la contrasenya: si algú té el telèfon robat, no podrà desactivar el 2FA ni regenerar els codis."
                    : "Las acciones de esta sección piden la contraseña: si alguien tiene el teléfono robado, no podrá desactivar el 2FA ni regenerar los códigos."}
                </p>
              </div>
            )}
          </div>
          {/* v37.1 — PASSKEYS (claus d'accés, WebAuthn) */}
          <div className="bg-card rounded-2xl border border-line p-6 space-y-3">
            <h3 className="font-bold flex items-center gap-2">
              <Shield className="w-4 h-4" />
              {locale === "ca" ? "Claus d'accés (passkeys)" : "Claves de acceso (passkeys)"}
              {passkeys !== null && passkeys.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-mintsoft text-green2">
                  {passkeys.length}
                </span>
              )}
            </h3>
            <p className="text-sm text-moss">
              {locale === "ca"
                ? "Entra amb la petjada, la cara o el PIN del dispositiu — sense escriure la contrasenya. Les passkeys queden lligades a aquest domini (a preureal.vercel.app i a www.preureal.com són independents)."
                : "Entra con la huella, la cara o el PIN del dispositivo — sin escribir la contraseña. Las passkeys quedan ligadas a este dominio (en preureal.vercel.app y en www.preureal.com son independientes)."}
            </p>
            {passkeys !== null && passkeys.length > 0 && (
              <div className="space-y-1.5">
                {passkeys.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2 flex-wrap">
                    <span className="flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-pine" />
                      <b>{p.label || "Passkey"}</b>
                      {p.backedUp && <span className="text-xs text-stone">{locale === "ca" ? "(sincronitzada)" : "(sincronizada)"}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {p.lastUsedAt && <span className="text-xs text-stone">{new Date(p.lastUsedAt).toLocaleDateString()}</span>}
                      <button onClick={() => passkeyDelete(p.id)} disabled={pkBusy || !pkPassword} className="text-xs text-ember3 underline disabled:opacity-40" title={locale === "ca" ? "Cal la contrasenya a sota per poder eliminar" : "Hace falta la contraseña de abajo para eliminar"}>
                        {locale === "ca" ? "Elimina" : "Eliminar"}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={passkeyAdd} disabled={pkBusy} className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-bold disabled:opacity-50">
                {pkBusy ? "…" : (locale === "ca" ? "Afegeix una passkey" : "Añadir una passkey")}
              </button>
              {(passkeys?.length || 0) > 0 && (
                <input
                  type="password"
                  value={pkPassword}
                  onChange={(e) => setPkPassword(e.target.value)}
                  placeholder={locale === "ca" ? "Contrasenya per eliminar una passkey" : "Contraseña para eliminar una passkey"}
                  className="px-3 py-2 rounded-lg border border-line text-sm"
                />
              )}
            </div>
            {pkMsg && <p className="text-sm text-moss">{pkMsg}</p>}
          </div>
          <div className="bg-card rounded-2xl border border-line p-6 space-y-3">
            <h3 className="font-bold">{locale === "ca" ? "Activitat recent del compte" : "Actividad reciente de la cuenta"}</h3>
            {activity === null ? (
              <p className="text-sm text-stone">…</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-stone">
                {locale === "ca" ? "Encara no hi ha activitat registrada." : "Aún no hay actividad registrada."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {activity.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 text-sm border border-sand2 rounded-lg px-3 py-2">
                    <b className="text-pine">{activityLabel(e.type, locale)}</b>
                    <span className="text-xs text-stone">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-card rounded-2xl border border-line p-6 space-y-3">
            <h3 className="font-bold">{locale === "ca" ? "Canvi de contrasenya" : "Cambio de contraseña"}</h3>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={locale === "ca" ? "Contrasenya actual" : "Contraseña actual"} className="w-full px-3 py-2 rounded-lg border border-line text-sm" />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={locale === "ca" ? "Contrasenya nova (mín. 8)" : "Contraseña nueva (mín. 8)"} className="w-full px-3 py-2 rounded-lg border border-line text-sm" />
            <button onClick={changePassword} disabled={busy || !currentPassword || !newPassword} className="px-5 py-2.5 rounded-xl bg-pine text-white text-sm font-bold disabled:opacity-50">
              {locale === "ca" ? "Canvia la contrasenya" : "Cambiar la contraseña"}
            </button>
            <p className="text-xs text-stone">{locale === "ca" ? "En canviar-la es tanquen totes les sessions obertes en altres dispositius." : "Al cambiarla se cierran todas las sesiones abiertas en otros dispositivos."}</p>
          </div>
          <div className="bg-card rounded-2xl border border-emberline p-6 space-y-3">
            <h3 className="font-bold text-ember3 flex items-center gap-2"><Trash2 className="w-4 h-4" />{locale === "ca" ? "Eliminació del compte (RGPD)" : "Eliminación de la cuenta (RGPD)"}</h3>
            <p className="text-sm text-moss">{locale === "ca" ? "S'esborren les teves dades personals, preferits i informes. Els registres agregats i anonimitzats d'ús es conserven per estadística. Aquesta acció és irreversible." : "Se borran tus datos personales, favoritos e informes. Los registros agregados y anonimizados de uso se conservan con fines estadísticos. Esta acción es irreversible."}</p>
            <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())} placeholder={locale === "ca" ? 'Escriu "ESBORRA" per confirmar' : 'Escribe "ESBORRA" para confirmar'} className="w-full px-3 py-2 rounded-lg border border-emberline text-sm" />
            <button onClick={deleteAccount} disabled={busy || deleteConfirm !== "ESBORRA"} className="px-5 py-2.5 rounded-xl bg-ember3 text-white text-sm font-bold disabled:opacity-40">
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
      <span className="text-sm text-stone">{label}</span>
      <span className={`text-sm ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

/** Etiqueta llegible per a cada tipus d'esdeveniment del compte (bilingüe). */
function activityLabel(type: string, locale: "ca" | "es"): string {
  const ca: Record<string, string> = {
    SIGNUP: "Registre del compte",
    SIGNUP_GOOGLE: "Registre amb Google",
    LOGIN: "Inici de sessió",
    LOGIN_GOOGLE: "Inici de sessió amb Google",
    LOGOUT: "Tancament de sessió",
    EMAIL_VERIFIED: "Correu verificat",
    EMAIL_NOT_VERIFIED: "Consulta sense correu verificat",
    PASSWORD_RESET: "Restabliment de contrasenya demanat",
    SESSIONS_REVOKED: "Sessions d'altres dispositius tancades",
    PAYWALL_VIEW: "Consulta (quota exhaurida)",
    MAP_QUERY: "Consulta al mapa",
    PRICE_REPORT: "Informe de preu enviat",
    EXPORT: "Exportació de dades",
    CHECKOUT_START: "Inici de subscripció",
    CHECKOUT_DEMO: "Subscripció de prova (demo)",
    SUBSCRIBE_SUCCESS: "Subscripció activada",
  };
  const es: Record<string, string> = {
    SIGNUP: "Registro de la cuenta",
    SIGNUP_GOOGLE: "Registro con Google",
    LOGIN: "Inicio de sesión",
    LOGIN_GOOGLE: "Inicio de sesión con Google",
    LOGOUT: "Cierre de sesión",
    EMAIL_VERIFIED: "Correo verificado",
    EMAIL_NOT_VERIFIED: "Consulta sin correo verificado",
    PASSWORD_RESET: "Restablecimiento de contraseña solicitado",
    SESSIONS_REVOKED: "Sesiones de otros dispositivos cerradas",
    PAYWALL_VIEW: "Consulta (cuota agotada)",
    MAP_QUERY: "Consulta en el mapa",
    PRICE_REPORT: "Informe de precio enviado",
    EXPORT: "Exportación de datos",
    CHECKOUT_START: "Inicio de suscripción",
    CHECKOUT_DEMO: "Suscripción de prueba (demo)",
    SUBSCRIBE_SUCCESS: "Suscripción activada",
  };
  return (locale === "es" ? es : ca)[type] || type;
}
