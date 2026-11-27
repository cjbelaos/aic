import https from "node:https";
import { appendFileSync } from "node:fs";

/**
 * Patches https.request to log Google API calls as JSON lines.
 * Output: SHEETS_TRACE_FILE (default ./tmp/google-api-trace.jsonl).
 * Spreadsheet IDs are redacted; the A1 range (tab name) is kept because the
 * baseline needs to know which tabs each page reads.
 */
export function installGoogleApiTracer() {
  const marker = Symbol.for("aic.googleApiTracer");
  const g = globalThis as Record<symbol, unknown>;
  if (g[marker]) return;
  g[marker] = true;

  const file = process.env.SHEETS_TRACE_FILE || "tmp/google-api-trace.jsonl";
  const original = https.request;

  const traced = function (this: unknown, ...args: unknown[]) {
    const req = (original as (...a: unknown[]) => import("node:http").ClientRequest).apply(this, args);
    try {
      const target = args[0];
      let host = "";
      let path = "";
      let method = "GET";
      if (typeof target === "string" || target instanceof URL) {
        const u = new URL(String(target));
        host = u.hostname;
        path = u.pathname + u.search;
      } else if (target && typeof target === "object") {
        const o = target as { hostname?: string; host?: string; path?: string; method?: string };
        host = o.hostname || o.host || "";
        path = o.path || "";
        method = o.method || method;
      }
      const opts = args.find((a, i) => i > 0 && a && typeof a === "object" && "method" in (a as object)) as
        | { method?: string }
        | undefined;
      if (opts?.method) method = opts.method;
      if (!host.endsWith("googleapis.com")) return req;

      const started = Date.now();
      const safePath = decodeURIComponent(path)
        .replace(/\/spreadsheets\/[A-Za-z0-9_-]{20,}/, "/spreadsheets/<id>")
        .replace(/\/files\/[A-Za-z0-9_-]{20,}/, "/files/<id>")
        .replace(/([?&](access_token|key)=)[^&]+/g, "$1<redacted>");
      req.on("response", (res) => {
        const entry = {
          ts: new Date(started).toISOString(),
          ms: Date.now() - started,
          method,
          host,
          path: safePath.slice(0, 300),
          status: res.statusCode,
        };
        try {
          appendFileSync(file, JSON.stringify(entry) + "\n");
        } catch {
          // tracing must never break a request
        }
      });
    } catch {
      // ignore tracer failures
    }
    return req;
  };
  (https as unknown as { request: unknown }).request = traced;
}
