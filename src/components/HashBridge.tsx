"use client";

/**
 * Pont de ruta real → ruta hash.
 *
 * La UI de Preureal viu en un hash-router (/#/mapa, /#/preus…) dins del shell
 * client (AppShell). Aquest component permet que les URL reals sense hash
 * (p. ex. /preus, /metodologia) no donin 404: redirigeixen a l'equivalent
 * amb hash sense deixar entrada a l'historial.
 *
 * Nota tècnica: es fa al client perquè els `redirects()` de next.config no
 * garanteixen la conservació del fragment (#) en totes les plataformes.
 */

export default function HashBridge({ to }: { to: string }) {
  if (typeof window !== "undefined") {
    // Es executa durant el render client: substitueix l'entrada actual
    // (sense afegir historial) per la ruta hash equivalent.
    window.setTimeout(() => window.location.replace(to), 0);
  }
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <p className="text-sm text-stone">
        Redirigint… <span className="opacity-60">/ Redirigiendo…</span>
      </p>
    </div>
  );
}
