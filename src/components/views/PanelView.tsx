"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";

export default function PanelView() {
  const { t, auth, navigate, locale } = useApp();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    auth.refresh();
     
  }, []);

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

  const cancelDemo = async () => {
    setBusy(true);
    await fetch("/api/stripe/demo", { method: "POST" });
    await auth.refresh();
    setBusy(false);
  };

  return (
    <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">{t.panel.title}</h1>

      <div className="mt-6 bg-white rounded-2xl border border-[#e5e1da] p-6 space-y-4">
        <Row label={t.auth.email} value={u.email} />
        <Row label={t.panel.plan} value={planName} strong />
        {u.plan === "FREE" && auth.quota && (
          <Row
            label={t.panel.quota}
            value={`${auth.quota.used} / ${auth.quota.limit}`}
          />
        )}
        {(u.plan === "PREMIUM" || u.plan === "PRO") && (
          <>
            <Row label={t.panel.quota} value={t.panel.unlimited} />
            <Row label={t.panel.subscription} value={t.panel.active} />
            {u.plan === "PREMIUM" && (
              <div className="pt-2">
                <button
                  onClick={cancelDemo}
                  disabled={busy}
                  className="text-sm text-[#b0431c] underline hover:no-underline disabled:opacity-50"
                >
                  {t.panel.cancelDemo}
                </button>
              </div>
            )}
          </>
        )}
        {u.plan === "FREE" && (
          <div className="pt-2">
            <button
              onClick={() => navigate("/preus")}
              className="px-5 py-2.5 rounded-xl bg-[#e8673c] text-white text-sm font-bold hover:bg-[#d95a31]"
            >
              {t.map.paywall.cta}
            </button>
          </div>
        )}
      </div>

      {u.role === "ADMIN" && (
        <div className="mt-4">
          <button
            onClick={() => navigate("/admin")}
            className="px-5 py-2.5 rounded-xl bg-[#0f2e21] text-white text-sm font-bold hover:bg-[#16402e]"
          >
            {t.panel.adminLink}
          </button>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            await auth.refresh();
            navigate("/");
          }}
          className="text-sm text-[#6b6f68] hover:underline"
        >
          {t.panel.logout}
        </button>
      </div>
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
