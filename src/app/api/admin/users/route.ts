import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/** GET /api/admin/users — listado de usuarios (solo admin). */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  const users = await db.user.findMany({
    where: q ? { email: { contains: q } } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      plan: true,
      locale: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

/** PATCH /api/admin/users — cambia plan o rol. */
export async function PATCH(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "BAD_ID" }, { status: 400 });
  const data: any = {};
  if (body?.plan && ["FREE", "PREMIUM", "PRO"].includes(body.plan)) data.plan = body.plan;
  if (body?.role && ["USER", "ADMIN"].includes(body.role)) data.role = body.role;
  const user = await db.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true, user: { id: user.id, plan: user.plan, role: user.role } });
}
