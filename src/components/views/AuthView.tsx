"use client";

import { useState } from "react";
import { useApp } from "@/components/app-context";
import { MapPin } from "lucide-react";

export default function AuthView({
  mode,
  token,
}: {
  mode: "register" | "login" | "forgot" | "reset";
  token?: string;
}) {
  const { t, navigate, locale, auth } = useApp();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, locale }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "DEFAULT");
          return;
        }
        await auth.refresh();
        navigate("/mapa");
      } else if (mode === "login") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "DEFAULT");
          return;
        }
        await auth.refresh();
        navigate("/mapa");
      } else if (mode === "forgot") {
        const res = await fetch("/api/auth/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email }),
        });
        setInfo(t.auth.forgotSent);
      } else if (mode === "reset") {
        const res = await fetch("/api/auth/password-reset/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password: form.password }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || "DEFAULT");
          return;
        }
        await auth.refresh();
        navigate("/mapa");
      }
    } finally {
      setBusy(false);
    }
  };

  const titles =
    mode === "register"
      ? { h: t.auth.registreTitle, btn: t.auth.registreCta }
      : mode === "login"
      ? { h: t.auth.entradaTitle, btn: t.auth.entradaCta }
      : mode === "forgot"
      ? { h: t.auth.forgotTitle, btn: t.auth.forgotCta }
      : { h: t.auth.resetTitle, btn: t.auth.resetCta };

  const errText = error
    ? (t.auth.errors as Record<string, string>)[error] || t.auth.errors.DEFAULT
    : null;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-14">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#0f2e21] text-white flex items-center justify-center mx-auto">
            <MapPin className="w-6 h-6 text-[#7fd6a4]" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">{titles.h}</h1>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-[#e5e1da] p-6 space-y-4">
          {mode === "register" && (
            <Field label={t.auth.name}>
              <input value={form.name} onChange={set("name")} className="pr-input" autoComplete="name" />
            </Field>
          )}
          {mode !== "reset" && (
            <Field label={t.auth.email}>
              <input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                className="pr-input"
                autoComplete="email"
              />
            </Field>
          )}
          {mode !== "forgot" && (
            <Field label={t.auth.password}>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={set("password")}
                className="pr-input"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Field>
          )}

          {errText && (
            <div className="rounded-lg bg-[#fdeae2] border border-[#f2c4ac] text-[#b0431c] text-sm px-3 py-2">
              {errText}
            </div>
          )}
          {info && (
            <div className="rounded-lg bg-[#e6f4ea] border border-[#bfe3cc] text-[#1e7a41] text-sm px-3 py-2">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-[#e8673c] text-white font-bold hover:bg-[#d95a31] transition-colors disabled:opacity-60"
          >
            {busy ? "..." : titles.btn}
          </button>

          <div className="text-sm text-center space-y-1.5 pt-2">
            {mode === "login" && (
              <>
                <div className="text-[#6b6f68]">
                  {t.auth.noAccount}{" "}
                  <button onClick={() => navigate("/registre")} className="text-[#e8673c] font-semibold">
                    {t.nav.registre}
                  </button>
                </div>
                <div>
                  <button onClick={() => navigate("/oblidat")} className="text-[#6b6f68] hover:underline">
                    {t.auth.forgot}
                  </button>
                </div>
              </>
            )}
            {mode === "register" && (
              <div className="text-[#6b6f68]">
                {t.auth.haveAccount}{" "}
                <button onClick={() => navigate("/entrada")} className="text-[#e8673c] font-semibold">
                  {t.nav.entrada}
                </button>
              </div>
            )}
            {(mode === "forgot" || mode === "reset") && (
              <div>
                <button onClick={() => navigate("/entrada")} className="text-[#6b6f68] hover:underline">
                  {t.nav.entrada}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      <style jsx global>{`
        .pr-input {
          width: 100%;
          padding: 0.65rem 0.8rem;
          border: 1px solid #e5e1da;
          border-radius: 0.6rem;
          font-size: 0.9rem;
          outline: none;
          background: #faf9f7;
        }
        .pr-input:focus {
          border-color: #e8673c;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-[#4b5349] mb-1 block">{label}</label>
      {children}
    </div>
  );
}
