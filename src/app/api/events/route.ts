import { NextResponse } from "next/server";
import { logEvent, rateLimit } from "@/lib/analytics";
import { getSession } from "@/lib/auth";

/** POST /api/events — esdeveniments d'analítica del client (embudo). */
export async function POST(req: Request) {
  const rl = rateLimit("events", 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });
  const session = await getSession();
  const body = await req.json().catch(() => null);
  const type = String(body?.type || "").slice(0, 40);
  const allowed = ["PAYWALL_VIEW", "PRICING_VIEW", "CHECKOUT_CLICKED", "TEASER_SHOWN", "MAP_LOAD"];
  if (!allowed.includes(type)) return NextResponse.json({ error: "BAD_TYPE" }, { status: 400 });
  await logEvent(type, session?.userId || null, body?.meta);
  return NextResponse.json({ ok: true });
}
