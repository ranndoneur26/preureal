import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

/**
 * Observabilitat lleugera sense dependències (v38.3).
 *
 * 1. Request ID: repeteix el que porta el client (o en genera un) i el
 *    retorna com a capçalera X-Request-ID — imprescindible per demanar
 *    suport o buscar un error als logs.
 * 2. Logs estructurats: una línia JSON per petició {reqId, method, path,
 *    status, ms} — grep-friendly i compatible amb qualsevol ingestor.
 * 3. Sentry sense SDK: si hi ha SENTRY_DSN, els errors no capturats
 *    s'envien a l'Envelope API de Sentry amb fetch (fire-and-forget).
 *    Configuració: només SENTRY_DSN al panell de Vercel; si no hi és,
 *    tot queda en logs i no falla mai.
 *
 * Per què no @sentry/nextjs? El pla Hobby comparteix budget d'invocació i
 * el SDK afegeix ~100 KB i bundling especial; amb l'Envelope API tinc
 * issues agrupades amb stacktrace i context sense res d'això.
 */

const MAX_SENTRY_EVENTS_PER_INVOCATION = 3;
let sentryEvents = 0;

export function newRequestId(req: NextRequest): string {
  const h = req.headers.get("x-request-id");
  if (h && /^[A-Za-z0-9_-]{8,64}$/.test(h)) return h;
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 12)}`;
}

type Level = "info" | "warn" | "error";

export function logJson(level: Level, event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "dev",
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

type Dsn = { key: string; host: string; projectId: string };

function parseDsn(dsn: string): Dsn | null {
  try {
    const u = new URL(dsn);
    const key = u.username;
    const projectId = u.pathname.replace(/^\//, "");
    if (!key || !u.host || !projectId) return null;
    return { key, host: u.host, projectId };
  } catch {
    return null;
  }
}

/** Envia l'error a Sentry (Envelope API) si SENTRY_DSN està definit. */
export function captureError(err: unknown, ctx: Record<string, unknown> = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  logJson("error", "api_error", {
    message: e.message,
    name: e.name,
    stack: e.stack?.split("\n").slice(0, 12).join("\n"),
    ...ctx,
  });

  const dsnEnv = process.env.SENTRY_DSN;
  if (!dsnEnv || sentryEvents >= MAX_SENTRY_EVENTS_PER_INVOCATION) return;
  const dsn = parseDsn(dsnEnv);
  if (!dsn) return;
  sentryEvents++;

  const eventId = randomUUID().replace(/-/g, "");
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
    JSON.stringify({
      level: "error",
      logger: "preureal.api",
      platform: "node",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      server_name: "preureal",
      exception: {
        values: [
          {
            type: e.name,
            value: e.message,
            stacktrace: {
              frames: (e.stack ?? "")
                .split("\n")
                .slice(1, 9)
                .map((l) => ({ filename: l.trim().replace(/^at\s+/, "") })),
            },
          },
        ],
      },
      extra: ctx,
    }),
  ].join("\n");

  const url = `https://${dsn.host}/api/${dsn.projectId}/store/?sentry_version=7&sentry_key=${dsn.key}&sentry_client=preureal-node/1.0`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body: envelope,
  }).catch(() => {
    /* mai interromp la resposta de l'API per un error de telemetria */
  });
}

/** Log d'accés en una línia (estil access log). */
export function logAccess(fields: {
  reqId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}) {
  logJson(fields.status >= 500 ? "error" : fields.status >= 400 ? "warn" : "info", "api_access", fields);
}
