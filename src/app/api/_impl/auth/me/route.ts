import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { canConsult } from "@/lib/plans";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ user: null });

  const quota = await canConsult(user.id, (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE");
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: user.plan,
      locale: user.locale,
      alertsEnabled: user.alertsEnabled, // v24: resum mensual de preferits (opt-in)
      totpEnabled: Boolean(user.totpEnabled), // v37: 2FA actiu (només l'estat, mai el secret)
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    quota: { used: quota.used, limit: quota.limit },
  });
}
