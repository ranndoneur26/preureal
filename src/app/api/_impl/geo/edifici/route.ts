import { NextResponse } from "next/server";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { getPlanSettings } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { getEdificiEstimacio, isGeoNotReady } from "@/lib/geo";

/**
 * GET /api/geo/edifici?refcat=08001_000100300DF19C — estimación del pipeline
 * (downscaling seccional→edificio, PASO 3/4 del encargo) a nivel EDIFICIO por
 * referencia catastral.
 *
 * Gating: PREMIUM/PRO (403 PLAN_REQUIRED para el Gratuït), coherente con el
 * producto (la estimación por edificio es el valor de pago). Dato derivado de
 * fuentes oficiales con IC95% y grado de calidad — siempre etiquetado como
 * comparación estadística, nunca taxación oficial. Ruta NUEVA y aditiva.
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`geo-edifici:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (plan === "FREE") {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
  }

  const refcat = new URL(req.url).searchParams.get("refcat") || "";
  // refcat14 = 7 dígits + 7 alfanumèrics (p. ex. 000100300DF19C), amb o sense prefix muni5_
  if (!/^\d{5}_[0-9]{7}[A-Z0-9]{7}$/i.test(refcat) && !/^[0-9]{7}[A-Z0-9]{7}$/i.test(refcat)) {
    return NextResponse.json(
      { error: "BAD_REFCAT", message: "refcat ha de ser la referència catastral (14) o muni5_refcat14" },
      { status: 400 },
    );
  }

  try {
    const edifici = await getEdificiEstimacio(refcat);
    if (!edifici) {
      return NextResponse.json(
        { error: "EDIFICI_NOT_FOUND", message: "cap estimació per a aquesta referència catastral (fora de l'abast carregat o no residencial)" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        edifici,
        nota: "Estimació estadística derivada de fonts oficials (Catastro, SERPAVI, Incasòl) amb IC95% i grau de qualitat. Comparació estadística, no és una taxació oficial.",
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  } catch (e) {
    if (isGeoNotReady(e)) {
      return NextResponse.json(
        { error: "DATA_NOT_READY", message: "el pipeline geoespacial encara no s'ha carregat en aquesta BD" },
        { status: 503 },
      );
    }
    console.error("geo/edifici:", refcat, e);
    return NextResponse.json(
      { error: "GEO_ERROR", detail: String(e instanceof Error ? e.message : e).slice(0, 200) },
      { status: 500 },
    );
  }
}
