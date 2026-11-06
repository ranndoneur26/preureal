// Autogenerat per scripts/gen_api_dispatcher.py — NO editar a mà.
//
// Un ÚNIC serverless function (catch-all) enruta totes les rutes de l'API
// (limit de 12 functions del pla Hobby de Vercel; l'app en té ~45).
// Els handlers reals viuen a src/app/api/_impl/**/route.ts sense canvis;
// /api/health i /api/stripe/webhook segueixen sent funcions pròpies.
import { NextResponse, type NextRequest } from "next/server";

import * as h_account from "../_impl/account/route";
import * as h_account_activity from "../_impl/account/activity/route";
import * as h_account_export from "../_impl/account/export/route";
import * as h_admin_audit from "../_impl/admin/audit/route";
import * as h_admin_emails from "../_impl/admin/emails/route";
import * as h_admin_export_csv from "../_impl/admin/export-csv/route";
import * as h_admin_import from "../_impl/admin/import/route";
import * as h_admin_imports from "../_impl/admin/imports/route";
import * as h_admin_plan_settings from "../_impl/admin/plan-settings/route";
import * as h_admin_reports from "../_impl/admin/reports/route";
import * as h_admin_stats from "../_impl/admin/stats/route";
import * as h_admin_users from "../_impl/admin/users/route";
import * as h_auth_change_password from "../_impl/auth/change-password/route";
import * as h_auth_google from "../_impl/auth/google/route";
import * as h_auth_google_callback from "../_impl/auth/google/callback/route";
import * as h_auth_google_status from "../_impl/auth/google/status/route";
import * as h_auth_login from "../_impl/auth/login/route";
import * as h_auth_logout from "../_impl/auth/logout/route";
import * as h_auth_me from "../_impl/auth/me/route";
import * as h_auth_password_reset from "../_impl/auth/password-reset/route";
import * as h_auth_password_reset_confirm from "../_impl/auth/password-reset/confirm/route";
import * as h_auth_register from "../_impl/auth/register/route";
import * as h_auth_sessions_revoke_all from "../_impl/auth/sessions/revoke-all/route";
import * as h_auth_verify from "../_impl/auth/verify/route";
import * as h_billing_history from "../_impl/billing/history/route";
import * as h_buildings from "../_impl/buildings/route";
import * as h_comparator from "../_impl/comparator/route";
import * as h_comparisons from "../_impl/comparisons/route";
import * as h_cron_emails from "../_impl/cron/emails/route";
import * as h_events from "../_impl/events/route";
import * as h_favorites from "../_impl/favorites/route";
import * as h_geocode from "../_impl/geocode/route";
import * as h_history from "../_impl/history/route";
import * as h_lookup from "../_impl/lookup/route";
import * as h_lookup_refcat from "../_impl/lookup-refcat/route";
import * as h_municipalities from "../_impl/municipalities/route";
import * as h_plans from "../_impl/plans/route";
import * as h_provenance from "../_impl/provenance/route";
import * as h_reports from "../_impl/reports/route";
import * as h_reports_pdf from "../_impl/reports/pdf/route";
import * as h_root from "../_impl/root/route";
import * as h_stripe_checkout from "../_impl/stripe/checkout/route";
import * as h_stripe_demo from "../_impl/stripe/demo/route";
import * as h_stripe_portal from "../_impl/stripe/portal/route";
import * as h_stripe_return from "../_impl/stripe/return/route";
import * as h_subscription from "../_impl/subscription/route";
import * as h_subscription_cancel from "../_impl/subscription/cancel/route";
import * as h_subscription_reactivate from "../_impl/subscription/reactivate/route";
import * as h_export_code from "../_impl/export/[code]/route";
import * as h_municipalities_code from "../_impl/municipalities/[code]/route";

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;

const TABLE: Array<{ seg: string[]; h: Record<string, Handler | unknown> }> = [
  { seg: ["account"], h: h_account },
  { seg: ["account", "activity"], h: h_account_activity },
  { seg: ["account", "export"], h: h_account_export },
  { seg: ["admin", "audit"], h: h_admin_audit },
  { seg: ["admin", "emails"], h: h_admin_emails },
  { seg: ["admin", "export-csv"], h: h_admin_export_csv },
  { seg: ["admin", "import"], h: h_admin_import },
  { seg: ["admin", "imports"], h: h_admin_imports },
  { seg: ["admin", "plan-settings"], h: h_admin_plan_settings },
  { seg: ["admin", "reports"], h: h_admin_reports },
  { seg: ["admin", "stats"], h: h_admin_stats },
  { seg: ["admin", "users"], h: h_admin_users },
  { seg: ["auth", "change-password"], h: h_auth_change_password },
  { seg: ["auth", "google"], h: h_auth_google },
  { seg: ["auth", "google", "callback"], h: h_auth_google_callback },
  { seg: ["auth", "google", "status"], h: h_auth_google_status },
  { seg: ["auth", "login"], h: h_auth_login },
  { seg: ["auth", "logout"], h: h_auth_logout },
  { seg: ["auth", "me"], h: h_auth_me },
  { seg: ["auth", "password-reset"], h: h_auth_password_reset },
  { seg: ["auth", "password-reset", "confirm"], h: h_auth_password_reset_confirm },
  { seg: ["auth", "register"], h: h_auth_register },
  { seg: ["auth", "sessions", "revoke-all"], h: h_auth_sessions_revoke_all },
  { seg: ["auth", "verify"], h: h_auth_verify },
  { seg: ["billing", "history"], h: h_billing_history },
  { seg: ["buildings"], h: h_buildings },
  { seg: ["comparator"], h: h_comparator },
  { seg: ["comparisons"], h: h_comparisons },
  { seg: ["cron", "emails"], h: h_cron_emails },
  { seg: ["events"], h: h_events },
  { seg: ["favorites"], h: h_favorites },
  { seg: ["geocode"], h: h_geocode },
  { seg: ["history"], h: h_history },
  { seg: ["lookup"], h: h_lookup },
  { seg: ["lookup-refcat"], h: h_lookup_refcat },
  { seg: ["municipalities"], h: h_municipalities },
  { seg: ["plans"], h: h_plans },
  { seg: ["provenance"], h: h_provenance },
  { seg: ["reports"], h: h_reports },
  { seg: ["reports", "pdf"], h: h_reports_pdf },
  { seg: ["root"], h: h_root },
  { seg: ["stripe", "checkout"], h: h_stripe_checkout },
  { seg: ["stripe", "demo"], h: h_stripe_demo },
  { seg: ["stripe", "portal"], h: h_stripe_portal },
  { seg: ["stripe", "return"], h: h_stripe_return },
  { seg: ["subscription"], h: h_subscription },
  { seg: ["subscription", "cancel"], h: h_subscription_cancel },
  { seg: ["subscription", "reactivate"], h: h_subscription_reactivate },
  { seg: ["export", ":code"], h: h_export_code },
  { seg: ["municipalities", ":code"], h: h_municipalities_code },
];

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function dispatch(req: NextRequest, method: Method, parts: string[]): Promise<Response> {
  for (const r of TABLE) {
    if (r.seg.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < r.seg.length; i++) {
      const s = r.seg[i];
      const got = safeDecode(parts[i]);
      if (s.startsWith(":")) {
        params[s.slice(1)] = got;
      } else if (s !== got) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const fn = r.h[method] as Handler | undefined;
    if (!fn) {
      return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
    }
    return fn(req, { params: Promise.resolve(params) });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

async function handle(
  req: NextRequest,
  method: Method,
  ctx: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  const { path } = await ctx.params;
  return dispatch(req, method, path ?? []);
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  handle(req, "GET", ctx);
export const POST = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  handle(req, "POST", ctx);
export const PUT = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  handle(req, "PUT", ctx);
export const PATCH = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  handle(req, "PATCH", ctx);
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) =>
  handle(req, "DELETE", ctx);
