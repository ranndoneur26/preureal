import { NextResponse } from "next/server";
import { googleOAuthEnabled } from "@/lib/google";

/** GET /api/auth/google/status — la UI consulta si el botó de Google és actiu. */
export async function GET() {
  return NextResponse.json({
    enabled: googleOAuthEnabled(),
    provider: "google",
  });
}
