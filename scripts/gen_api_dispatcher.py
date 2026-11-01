#!/usr/bin/env python3
"""
PreuReal.cat — genera el dispatcher únic de l'API (src/app/api/[[...path]]/route.ts).

Motiu: el pla Hobby de Vercel limita a 12 Serverless Functions per deployment i
l'app té ~45 rutes API. Tots els handlers viuen ara a src/app/api/_impl/ (carpeta
privada, ignorada pel router) i UN sol catch-all els enruta per segment.

Regenerar després d'afeguir/moure rutes:  python3 scripts/gen_api_dispatcher.py
"""
import os
import re
import sys

ROOT = "/home/z/my-project"
API = os.path.join(ROOT, "src", "app", "api")
OUT = os.path.join(API, "[[...path]]", "route.ts")

# Rutes que queden com a funcions independents (no passen pel dispatcher)
KEEP = {"health", os.path.join("stripe", "webhook")}

entries = []  # (segments, rel_import_path, ident)
for dirpath, _dirs, files in os.walk(os.path.join(API, "_impl")):
    if "route.ts" not in files:
        continue
    rel = os.path.relpath(dirpath, API)  # p.ex. "_impl/municipalities/[code]"
    under = rel[len("_impl"):] if rel.startswith("_impl") else rel
    under = under.lstrip(os.sep)
    if under in KEEP:
        continue
    if under == "":
        segs = []
        ident = "h_root"
        imp = "_impl/root/route"
        if not os.path.isfile(os.path.join(API, "_impl", "root", "route.ts")):
            continue  # no hi ha arrel
    else:
        parts = under.split(os.sep)
        segs = [f":{p[1:-1]}" if p.startswith("[") else p for p in parts]
        ident = "h_" + re.sub(r"[^a-zA-Z0-9]+", "_", under).strip("_")
        imp = "_impl/" + "/".join(parts) + "/route"
    entries.append((segs, imp, ident))

if not entries:
    sys.exit("✗ no s'han trobat handlers a _impl")

# estàtiques primer, dinàmiques al final (llegibilitat)
entries.sort(key=lambda e: (any(s.startswith(":") for s in e[0]), e[0]))

lines = []
lines.append("// Autogenerat per scripts/gen_api_dispatcher.py — NO editar a mà.")
lines.append("//")
lines.append("// Un ÚNIC serverless function (catch-all) enruta totes les rutes de l'API")
lines.append("// (limit de 12 functions del pla Hobby de Vercel; l'app en té ~45).")
lines.append("// Els handlers reals viuen a src/app/api/_impl/**/route.ts sense canvis;")
lines.append("// /api/health i /api/stripe/webhook segueixen sent funcions pròpies.")
lines.append('import { NextResponse, type NextRequest } from "next/server";')
lines.append("")
for _segs, imp, ident in entries:
    lines.append(f'import * as {ident} from "../{imp}";')
lines.append("")
lines.append("type Ctx = { params: Promise<Record<string, string>> };")
lines.append("type Handler = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;")
lines.append("")
lines.append("const TABLE: Array<{ seg: string[]; h: Record<string, Handler | unknown> }> = [")
for segs, _imp, ident in entries:
    segs_str = "[" + ", ".join(f'"{s}"' for s in segs) + "]"
    lines.append(f"  {{ seg: {segs_str}, h: {ident} }},")
lines.append("];")
lines.append("""
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
""")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write("\n".join(lines))
print(f"✓ {OUT}")
print(f"  {len(entries)} rutes al dispatcher:")
for segs, _imp, _i in entries:
    print(f"    /api/{'/'.join(segs)}")
