import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";

/**
 * GET    /api/comparisons — comparacions desades de l'usuari
 * POST   /api/comparisons { name, entities: [{type:"MUNI"|"BUILDING", code}] }
 * DELETE /api/comparisons?id=...
 */
export async function GET() {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const comps = await db.savedComparison.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    comparisons: comps.map((c) => ({ id: c.id, name: c.name, entities: JSON.parse(c.entities), createdAt: c.createdAt })),
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const name = body?.name ? String(body.name).slice(0, 80) : null;
  const entities = Array.isArray(body?.entities) ? body.entities : null;
  if (!name || !entities || entities.length < 2 || entities.length > 6) {
    return NextResponse.json({ error: "BAD_INPUT", message: "Cal un nom i entre 2 i 6 entitats." }, { status: 400 });
  }
  const clean = entities
    .map((e: any) => ({
      type: e?.type === "BUILDING" ? "BUILDING" : "MUNI",
      code: String(e?.code || "").slice(0, 40),
    }))
    .filter((e: any) => e.code);
  if (clean.length < 2) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });

  const comp = await db.savedComparison.create({
    data: { userId: user.id, name, entities: JSON.stringify(clean) },
  });
  return NextResponse.json({ ok: true, id: comp.id });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3: funcionalitat principal
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id || id.length > 40) return NextResponse.json({ error: "BAD_INPUT" }, { status: 400 });
  await db.savedComparison.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
