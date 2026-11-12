import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { buildPurchasePdf, shopError } from "@/lib/reports-fulfill";
import { downloadTokenMatches } from "@/lib/reports-shop";

/**
 * GET /api/reports/shop/download?p=<purchaseId>&t=<token> — v38.8: descàrrega
 * del PDF d'una compra puntual. Doble via d'autorització:
 *  1. TOKEN (enllaç del correu): el token cru només viatja al correu; a la BD
 *     només hi ha el SHA-256. Sense login funciona (entrega per correu).
 *  2. SESSIÓ de l'usuari propietari (pantalla de retorn / panell).
 * El PDF es regenera SEMPRE des dels paràmetres snapshot de la compra.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const purchaseId = (url.searchParams.get("p") || "").slice(0, 40);
  const token = (url.searchParams.get("t") || "").slice(0, 200);
  if (!purchaseId) return shopError("BAD_INPUT", 400);

  const rl = await rateLimit(`shop-download:${purchaseId}`, 30, 60_000);
  if (!rl.ok) return shopError("TOO_MANY", 429);

  const purchase = await db.reportPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return shopError("NOT_FOUND", 404);

  // ---- autorització: token del correu O sessió del propietari ----
  let authorized = false;
  if (token) {
    authorized = downloadTokenMatches(token, purchase.downloadTokenHash);
  }
  if (!authorized) {
    try {
      const user = await requireVerifiedUser();
      authorized = purchase.userId === user.id;
    } catch {
      authorized = false;
    }
  }
  if (!authorized) return shopError("FORBIDDEN", 403);

  if (purchase.status !== "paid") {
    return shopError("PAYMENT_PENDING", 409);
  }

  let bytes: Uint8Array;
  let filename: string;
  try {
    const built = await buildPurchasePdf(purchase);
    bytes = built.bytes;
    filename = built.filename;
  } catch (e) {
    console.error("shop download: pdf error", e);
    await db.event
      .create({ data: { type: "REPORT_PDF_ERROR", userId: purchase.userId, meta: JSON.stringify({ purchaseId, error: String(e).slice(0, 300) }) } })
      .catch(() => {});
    return shopError("PDF_ERROR", 500);
  }

  await db.reportPurchase.update({
    where: { id: purchase.id },
    data: {
      downloadCount: { increment: 1 },
      ...(purchase.deliveredAt ? {} : { deliveredAt: new Date() }),
    },
  });
  await db.event
    .create({ data: { type: "REPORT_DOWNLOAD", userId: purchase.userId, meta: JSON.stringify({ purchaseId, kind: purchase.kind, via: token ? "token" : "session" }) } })
    .catch(() => {});

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
