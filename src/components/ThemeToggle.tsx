"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Canvi de tema clar/fosc (v38.2).
 * - Persistència: localStorage "pr_theme" ("light" | "dark").
 * - Sense preferència desada: segueix prefers-color-scheme
 *   (el script anti-FOUC de layout.tsx ja ha posat .dark si cal).
 * - El botó només decideix icona després de muntar (evita mismatch SSR).
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !(dark ?? false);
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("pr_theme", next ? "dark" : "light"); } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Activa el tema clar" : "Activa el tema fosc"}
      title={dark ? "Tema clar" : "Tema fosc"}
      className="p-2 rounded-lg border border-line hover:bg-sand transition-colors flex items-center justify-center"
    >
      {dark === null ? (
        <span className="w-4 h-4" />
      ) : dark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}
