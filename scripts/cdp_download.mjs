// CDP download: reutilitza el Chrome d'agent-browser (mateix perfil -> mateixes cookies)
// i baixa el GTFS agregat de T-mobilitat amb Browser.setDownloadBehavior.
import { readFileSync, mkdirSync } from "node:fs";

const [port, url] = process.argv.slice(2);
const dir = "/tmp/dl";
mkdirSync(dir, { recursive: true });
const info = readFileSync(
  `/tmp/agent-browser-chrome-175ce568-45f1-4c28-8d76-a1afda27fb8c/DevToolsActivePort`,
  "utf8",
).trim().split("\n");
const wsPort = info[0]; // 1a línia: port; 2a: browser ws path
const wsUrl = `ws://127.0.0.1:${wsPort}${info[1] ?? "/devtools/browser"}`;
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  } else if (m.method) {
    events.push(m);
    if (m.method === "Browser.downloadProgress" && m.params.state === "completed") {
      console.log("DOWNLOAD_COMPLETED", JSON.stringify(m.params));
    }
  }
};
await new Promise((r) => (ws.onopen = r));
console.log("ws ok", wsUrl);
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
console.log("session", sessionId);
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dir, eventsEnabled: true });
await send("Page.enable", {}, sessionId);
console.log("navigating", url);
await send("Page.navigate", { url }, sessionId);
// espera els events de download (fins a 8 min)
const t0 = Date.now();
let done = false;
while (Date.now() - t0 < 480000) {
  const c = events.find((e) => e.method === "Browser.downloadProgress" && e.params.state === "completed");
  if (c) { done = true; break; }
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(done ? "OK: downloaded" : "TIMEOUT esperando descarga");
ws.close();
process.exit(done ? 0 : 2);
