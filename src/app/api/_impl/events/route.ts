import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { getSession } from "@/lib/auth";

/** POST /api/events — esdeveniments d'analítica del client (embudo). */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`events:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });
  const session = await getSession();
  const body = await req.json().catch(() => null);
  const type = String(body?.type || "").slice(0, 40);
  const allowed = ["PAYWALL_VIEW", "PRICING_VIEW", "CHECKOUT_CLICKED", "TEASER_SHOWN", "MAP_LOAD", "SEARCH_USED", "COMPARATOR_USED", "PDF_DOWNLOADED"];
  if (!allowed.includes(type)) return NextResponse.json({ error: "BAD_TYPE" }, { status: 400 });
  // meta limitada i sempre com a text JSON
  let meta: string | null = null;
  if (body?.meta && typeof body.meta === "object") {
    try {
      meta = JSON.stringify(body.meta).slice(0, 500);
    } catch {}
  }
  try {
    const { db } = await import("@/lib/db");
    await db.event.create({ data: { type, userId: session?.userId || null, meta } });
  } catch {}
  return NextResponse.json({ ok: true });
}
