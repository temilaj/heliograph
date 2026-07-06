// Read API: tenant-scoped aggregate queries + a minimal dashboard. See docs/ARCHITECTURE.md.
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";
import { makeStorageProvider } from "@heliograph/storage";
import { clickhouseEnv, storeProviderName } from "@heliograph/config";
import { orgFrom, dateRange, json } from "./routes.ts";
import { DASHBOARD_HTML } from "./dashboard.ts";

const log = createLogger({ service: "read-api" });
const port = Number(process.env.READ_API_PORT ?? 8080);

const storage = makeStorageProvider({ provider: storeProviderName(), clickhouse: clickhouseEnv() });
const queries = storage.queryRepository();

const health: HealthState = { live: () => true, ready: () => storage.health() };

const server = Bun.serve({
  port,
  async fetch(req) {
    const ops = await handleOpsRequest(req, health);
    if (ops) return ops;

    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html" } });
    }
    if (url.pathname === "/v1/orgs") {
      // Org discovery for the dashboard. In a real deployment this is admin-gated.
      try {
        return json(200, await queries.orgs());
      } catch (err) {
        log.error("orgs query failed", { err: String(err) });
        return json(500, { message: "query failed" });
      }
    }
    if (url.pathname === "/v1/summary") {
      const org = orgFrom(req);
      if (!org) return json(400, { message: "missing org (X-Org-Id header or ?org=)" });
      try {
        return json(200, await queries.summary(dateRange(req, org)));
      } catch (err) {
        log.error("query failed", { err: String(err) });
        return json(500, { message: "query failed" });
      }
    }
    return new Response("not found", { status: 404 });
  },
});

log.info("read-api listening", { port: server.port });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    log.info("shutting down", { signal: sig });
    server.stop();
    await storage.close();
    process.exit(0);
  });
}
