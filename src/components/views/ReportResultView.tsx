"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

/**
 * v38.8 — pantalla de retorn del pagament d'un informe individual (pagament
 * únic). exit: consulta l'estat REAL de la sessió a Stripe via
 * /api/reports/shop/return (el webhook signat és la confirmació efectiva; això
 * és el fallback idempotent que completa la compra si el webhook arriba tard).
 * cancelat: informa que no s'ha fet cap pagament.
 */
export default function ReportResultView({ mode }: { mode: "exit" | "cancelat" }) {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const [state, setState] = useState<"checking" | "paid" | "pending" | "error">("checking");
  const [detail, setDetail] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

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
    const check = () =>
      fetch("/api/reports/shop/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (!res.ok) {
            setState("error");
            setDetail(
              d.error === "STRIPE_NOT_CONFIGURED"
                ? (ca ? "Stripe encara no està configurat pel propietari." : "Stripe aún no está configurado por el propietario.")
                : d.error === "UNAUTHENTICATED"
                  ? (ca ? "Inicia sessió amb el mateix compte que ha fet la compra." : "Inicia sesión con la misma cuenta que hizo la compra.")
                  : (ca ? "No s'ha pogut verificar la sessió de pagament." : "No se pudo verificar la sesión de pago."),
            );
            return false;
          }
          if (d.paid) {
            setState("paid");
            setDownloadUrl(d.downloadUrl || null);
            setDetail(ca ? "Pagament confirmat! El PDF ja està generat; també l'has rebut al correu." : "¡Pago confirmado! El PDF ya está generado; también lo has recibido por correo.");
            return true;
          }
          setState("pending");
          setDetail(ca ? "El pagament no s'ha completat encara (mètodes asíncrons com SEPA poden trigar uns dies)." : "El pago no se ha completado todavía (métodos asíncronos como SEPA pueden tardar unos días).");
          return false;
        })
        .catch(() => {
          setState("error");
          setDetail(ca ? "Error de xarxa verificant el pagament." : "Error de red verificando el pago.");
          return false;
        });
    void check();
  }, [mode, ca]);

  const recheck = () => {
    setState("checking");
    const hq = window.location.hash.split("?")[1] || "";
    const sessionId = new URLSearchParams(hq).get("session_id");
    if (!sessionId) {
      setState("error");
      return;
    }
    fetch("/api/reports/shop/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.paid) {
          setState("paid");
          setDownloadUrl(d.downloadUrl || null);
          setDetail(ca ? "Pagament confirmat!" : "¡Pago confirmado!");
        } else {
          setState("pending");
        }
      })
      .catch(() => setState("pending"));
  };

  return (
    <div className="flex-1 max-w-lg w-full mx-auto px-4 py-20 text-center">
      {state === "checking" && (
        <>
          <Loader2 className="w-10 h-10 text-ember animate-spin mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Verificant el pagament…" : "Verificando el pago…"}</h1>
        </>
      )}
      {state === "paid" && (
        <>
          <CheckCircle2 className="w-14 h-14 text-green2 mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Informe a punt!" : "¡Informe listo!"}</h1>
          <p className="mt-2 text-sm text-moss">{detail}</p>
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="mt-6 inline-block px-6 py-3 rounded-xl bg-ember text-white font-bold hover:bg-ember2"
            >
              {ca ? "Descarregar el PDF" : "Descargar el PDF"}
            </a>
          )}
          <div className="mt-3">
            <button onClick={() => navigate("/mapa")} className="text-sm text-pine underline">
              {ca ? "Tornar al mapa" : "Volver al mapa"}
            </button>
          </div>
        </>
      )}
      {state === "pending" && (
        <>
          <Loader2 className="w-12 h-12 text-ambergold animate-spin mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Gairebé llest" : "Casi listo"}</h1>
          <p className="mt-2 text-sm text-moss">{detail}</p>
          <button onClick={recheck} className="mt-6 px-6 py-3 rounded-xl bg-pine text-white font-bold">
            {ca ? "Tornar a comprovar" : "Volver a comprobar"}
          </button>
        </>
      )}
      {state === "error" && (
        <>
          <XCircle className="w-14 h-14 text-ember3 mx-auto" />
          <h1 className="mt-4 text-2xl font-extrabold">{ca ? "Pagament no completat" : "Pago no completado"}</h1>
          <p className="mt-2 text-sm text-moss">{detail}</p>
          <div className="mt-6 flex gap-2 justify-center">
            <button onClick={() => navigate("/preus")} className="px-5 py-2.5 rounded-xl bg-ember text-white font-bold">
              {ca ? "Tornar als preus" : "Volver a los precios"}
            </button>
            <button onClick={() => navigate("/panell")} className="px-5 py-2.5 rounded-xl border border-line font-semibold">
              {ca ? "Al meu panell" : "A mi panel"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
