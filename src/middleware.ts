import { NextRequest, NextResponse } from "next/server";

/**
 * Redireccions de domini canònic (301).
 *
 * Domini canònic: https://www.preureal.com
 * - L'apex preureal.com → www (una sola canonical evita contingut duplicat).
 * - Les variants de marca (preureal.cat i subdominis) → www.preureal.com,
 *   perquè el producte ha de tenir un sol nom (rebranding v36).
 *
 * No toca cap altre host: localhost i els previews de Vercel
 * (*.vercel.app) continuen funcionant sense redirigir (el RP ID de
 * WebAuthn depèn d'ells durant el desenvolupament).
 */

const CANON_HOST = "www.preureal.com";

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];

  const isApex = host === "preureal.com";
  const isBrandVariant =
    host === "preureal.cat" || host.endsWith(".preureal.cat");

  if (host === CANON_HOST || (!isApex && !isBrandVariant)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.protocol = "https";
  url.host = CANON_HOST;
  url.port = "";
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
