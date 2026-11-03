"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { Check, Flame, Sparkles, Building2, AlertCircle } from "lucide-react";

export default function PricingView() {
  const { t, auth, navigate, locale } = useApp();
  const [demoMode, setDemoMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.integrations?.stripe?.demoCheckout && !d.integrations?.stripe?.configured) setDemoMode(true);
      })
      .catch(() => {});
  }, []);

  const checkout = async (plan: "PREMIUM" | "PRO") => {
    if (!auth.user) {
      navigate("/registre");
      return;
    }
    setBusy(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = await res.json();
      if (d.ok && d.mode === "STRIPE" && d.url) {
        window.location.href = d.url;
      } else if (d.ok && d.mode === "DEMO") {
        await auth.refresh();
        setNotice(d.message);
      } else {
        setNotice(d.message || d.error);
      }
    } catch {
      setNotice("Error de xarxa");
    } finally {
      setBusy(null);
    }
  };

  const currentPlan = auth.user?.plan || "FREE";

  return (
    <div className="max-w-6xl mx-auto px-4 py-14 w-full">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold tracking-tight">{t.plans.title}</h1>
        <p className="mt-3 text-[#4b5349]">{t.plans.subtitle}</p>
      </div>

      {demoMode && (
        <div className="mt-8 max-w-2xl mx-auto rounded-xl bg-[#fff7e8] border border-[#f2d9a4] text-[#8a6116] text-sm p-4 flex gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{t.plans.demoNote}</span>
        </div>
      )}

      {notice && (
        <div className="mt-8 max-w-2xl mx-auto rounded-xl bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm p-4">
          {notice}
        </div>
      )}

      <div className="mt-10 grid md:grid-cols-3 gap-5 items-stretch">
        {/* FREE */}
        <PlanCard
          name={t.plans.free.name}
          price={t.plans.free.price}
          per={t.plans.free.per}
          cta={currentPlan === "FREE" ? (locale === "ca" ? "Pla actual" : "Plan actual") : t.plans.free.cta}
          onCta={currentPlan === "FREE" ? undefined : () => navigate("/mapa")}
          feats={t.plans.free.feats}
        />
        {/* PREMIUM */}
        <PlanCard
          highlight
          popular={t.plans.premium.popular}
          name={t.plans.premium.name}
          price={t.plans.premium.price}
          per={t.plans.premium.per}
          cta={currentPlan === "PREMIUM" ? (locale === "ca" ? "Pla actual" : "Plan actual") : t.plans.premium.cta}
          onCta={currentPlan === "PREMIUM" ? undefined : () => checkout("PREMIUM")}
          feats={t.plans.premium.feats}
          busy={busy === "PREMIUM"}
        />
        {/* PRO */}
        <PlanCard
          name={t.plans.pro.name}
          price={t.plans.pro.price}
          per={t.plans.pro.per}
          cta={currentPlan === "PRO" ? (locale === "ca" ? "Pla actual" : "Plan actual") : t.plans.pro.cta}
          onCta={currentPlan === "PRO" ? undefined : () => checkout("PRO")}
          feats={t.plans.pro.feats}
          busy={busy === "PRO"}
          icon={<Building2 className="w-4 h-4" />}
        />
      </div>

      <div className="mt-10 text-center text-xs text-[#6b6f68] max-w-xl mx-auto leading-relaxed">
        {locale === "ca"
          ? "La subscripció es gestiona amb Stripe (pagaments xifrats). Pots cancel·lar quan vulguis. Els preus inclouen IVA si escau."
          : "La suscripción se gestiona con Stripe (pagos cifrados). Puedes cancelar cuando quieras. Los precios incluyen IVA si procede."}
      </div>
    </div>
  );
}

function PlanCard({
  name, price, per, cta, onCta, feats, highlight, popular, busy, icon,
}: {
  name: string; price: string; per: string; cta: string;
  onCta?: () => void; feats: readonly string[];
  highlight?: boolean; popular?: string; busy?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-6 flex flex-col ${
        highlight
          ? "border-[#0f2e21] bg-[#0f2e21] text-white shadow-2xl shadow-black/20 md:-mt-3 md:mb-3"
          : "border-[#e5e1da] bg-white"
      }`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#e8673c] text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          {popular}
        </div>
      )}
      <div className={`font-bold flex items-center gap-2 ${highlight ? "text-white" : ""}`}>
        {icon}
        {name}
      </div>
      <div className="mt-3 flex items-end gap-1">
        <span className={`text-4xl font-black ${highlight ? "text-white" : "text-[#0f2e21]"}`}>{price}</span>
        <span className={`text-sm mb-1.5 ${highlight ? "text-white/70" : "text-[#6b6f68]"}`}>{per}</span>
      </div>
      <ul className={`mt-5 space-y-2.5 text-sm flex-1 ${highlight ? "text-white/90" : "text-[#4b5349]"}`}>
        {feats.map((f, i) => (
          <li key={i} className="flex gap-2 items-start">
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${highlight ? "text-[#7fd6a4]" : "text-[#1e7a41]"}`} />
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onCta}
        disabled={!onCta || busy}
        className={`mt-6 w-full py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-60 ${
          highlight
            ? "bg-[#e8673c] text-white hover:bg-[#d95a31]"
            : "bg-[#0f2e21] text-white hover:bg-[#16402e]"
        }`}
      >
        {busy ? "..." : cta}
      </button>
    </div>
  );
}
