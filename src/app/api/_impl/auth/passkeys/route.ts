import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/auth/passkeys — llista les passkeys de l'usuari (Panell → Seguretat).
 * Mai exposa la clau pública ni metadades internes: només el que pinta la UI.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rows = await db.passkeyCredential.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
  });
  return NextResponse.json({ passkeys: rows });
}
