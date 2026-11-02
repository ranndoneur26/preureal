import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";

/** GET /api/admin/users — llistat de usuaris amb cerca/filtres (solo admin). */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 100);
  const plan = searchParams.get("plan");
  const role = searchParams.get("role");

  const where: any = {};
  if (q) where.email = { contains: q, mode: "insensitive" };
  if (plan && ["FREE", "PREMIUM", "PRO"].includes(plan)) where.plan = plan;
  if (role && ["USER", "ADMIN"].includes(role)) where.role = role;

  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      plan: true,
      locale: true,
      active: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

/** PATCH /api/admin/users — canvia pla, rol o activació (amb auditoria). */
export async function PATCH(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").slice(0, 40);
  if (!id) return NextResponse.json({ error: "BAD_ID" }, { status: 400 });

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const data: any = {};
  if (body?.plan && ["FREE", "PREMIUM", "PRO"].includes(body.plan)) data.plan = body.plan;
  if (body?.role && ["USER", "ADMIN"].includes(body.role)) data.role = body.role;
  if (typeof body?.active === "boolean") data.active = body.active;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });

  // protecció: un admin no es pot desactivar ni degradar a si mateix
  if (id === admin.id && (data.active === false || (data.role && data.role !== "ADMIN"))) {
    return NextResponse.json({ error: "CANNOT_SELF_DEMOTE" }, { status: 400 });
  }

  const user = await db.user.update({ where: { id }, data });

  // auditoria de l'acció (Fase 12) amb abans→després
  const before: Record<string, unknown> = { plan: target.plan, role: target.role, active: target.active };
  const after: Record<string, unknown> = { plan: user.plan, role: user.role, active: user.active };
  await audit(admin.id, "USER_UPDATED", id, { before, after });

  return NextResponse.json({ ok: true, user: { id: user.id, plan: user.plan, role: user.role, active: user.active } });
}
