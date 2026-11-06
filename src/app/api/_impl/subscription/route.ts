import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSubscriptionState } from "@/lib/subscription";

/**
 * GET /api/subscription — estat de la suscripció per al hook useUserPlan().
 * 401 si no hi ha sessió (el hook mostra el pla gratuït per defecte).
 * El pla SEMPRE ve de la BD via getAuthUser (mai del client) — equivalent
 * funcional de `supabase.auth.getUser()` + RLS del encàrrec.
 */
export async function GET() {
  let user;
  try {
    user = await getAuthUser();
  } catch {
    user = null;
  }
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const state = await getSubscriptionState(user);
  return NextResponse.json(state);
}
