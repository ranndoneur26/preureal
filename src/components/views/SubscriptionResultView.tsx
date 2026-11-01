"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

/**
 * Pantalla de retorn del pagament Stripe (Fase 7).
 * exit: consulta l'estat REAL de la sessió a Stripe via /api/stripe/return.
 * cancelat: informa que no s'ha fet cap pagament.
 * L'activació efectiva del pla SEMPRE l'ha fet el webhook signat.
 */
export default function SubscriptionResultView({ mode }: { mode: "exit" | "cancelat" }) {
  const { locale, navigate, auth } = useApp();
  const ca = locale === "ca";
  const [state, setState] = useState<"checking" | "ok" | "pending" | "error">("checking");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    if (mode === "cancelat") {
      const id = setTimeout(() => {
        setState("error");
        setDetail(ca ? "No s'ha fet cap pagament. Pots tornar-ho a provar quan vulguis." : "No se ha realizado ningún pago. Puedes intentarlo de nuevo cuando quieras.");
      }, 0);
      return () => clearTimeout(id);
    }
    const hq = window.location.hash.split("?")[1] || "";
    const sessionId = new URLSearchParams(hq).get("session_id");
    if (!sessionId) {
      const id = setTimeout(() => {
        setState("error");
        setDetail(ca ? "Falta l'identificador de sessió de Stripe." : "Falta el identificador de sesión de Stripe.");
      }, 0);
      return () => clearTimeout(id);
    }
    fetch("/api/stripe/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("error");
          setDetail(d.error === "STRIPE_NOT_CONFIGURED"
            ? (ca ? "Stripe encara no està configurat pel propietari." : "Stripe aún no está configurado por el propietario.")
            : (ca ? "No s'ha pogut verificar la sessió de pagament." : "No se pudo verificar la sesión de pago."));
          return;
        }
        await auth.refresh();
        if (d.activat) {
          setState("ok");
          setDetail(ca ? "Pagament confirmat i subscripció activa. Ja tens accés complet!" : "Pago confirmado y suscripción activa. ¡Ya tienes acceso completo!");
        } else if (d.paymentStatus === "paid") {
          setState("pending");
          setDetail(d.message || (ca ? "Pagament rebut; la subscripció s'activarà amb la confirmació de Stripe (normalment segons)." : "Pago recibido; la suscripción se activará con la confirmación de Stripe."));
        } else {
          setState("pending");
          setDetail(d.message || (ca ? "El pagament no s'ha completat encara." : "El pago no se ha completado todavía."));
        }
      })
      .catch(() => {
        setState("error");
        setDetail(ca ? "Error de xarxa verificant el pagament." : "Error de red verificando el pago.");
      });
     
  }, [mode]);

  return (
    <div className="flex-1 max-w-lg w-full mx-auto px-4 py-20 text-center">
      {state === "checking" && (
        <>
          <Loader2 className="w-10 h-10 text-[#e8673c] animate-spin mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Verificant el pagament…" : "Verificando el pago…"}</h1>
        </>
      )}
      {state === "ok" && (
        <>
          <CheckCircle2 className="w-14 h-14 text-[#1e7a41] mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Subscripció activa!" : "¡Suscripción activa!"}</h1>
          <p className="mt-2 text-sm text-[#4b5349]">{detail}</p>
          <button onClick={() => navigate("/mapa")} className="mt-6 px-6 py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31]">
            {ca ? "Anar al mapa" : "Ir al mapa"}
          </button>
        </>
      )}
      {state === "pending" && (
        <>
          <Loader2 className="w-12 h-12 text-[#e89a4b] animate-spin mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Gairebé llest" : "Casi listo"}</h1>
          <p className="mt-2 text-sm text-[#4b5349]">{detail}</p>
          <button onClick={() => navigate("/panell")} className="mt-6 px-6 py-3 rounded-xl bg-[#0f2e21] text-white font-bold">
            {ca ? "Al meu panell" : "A mi panel"}
          </button>
        </>
      )}
      {state === "error" && (
        <>
          <XCircle className="w-14 h-14 text-[#b0431c] mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Pagament no completat" : "Pago no completado"}</h1>
          <p className="mt-2 text-sm text-[#4b5349]">{detail}</p>
          <div className="mt-6 flex gap-2 justify-center">
            <button onClick={() => navigate("/preus")} className="px-5 py-2.5 rounded-xl bg-[#e8673c] text-white font-bold">
              {ca ? "Tornar als plans" : "Volver a los planes"}
            </button>
            <button onClick={() => navigate("/panell")} className="px-5 py-2.5 rounded-xl border border-[#e5e1da] font-semibold">
              {ca ? "Al meu panell" : "A mi panel"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
