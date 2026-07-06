// Read API: tenant-scoped aggregate queries + serves the dashboard SPA. See docs/ARCHITECTURE.md.
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";
import { makeStorageProvider } from "@heliograph/storage";
import { clickhouseEnv, storeProviderName } from "@heliograph/config";
import { orgFrom, dateRange, json } from "./routes.ts";
import dashboard from "@heliograph/dashboard/index.html";

const log = createLogger({ service: "read-api" });
const port = Number(process.env.READ_API_PORT ?? 8080);

const storage = makeStorageProvider({ provider: storeProviderName(), clickhouse: clickhouseEnv() });
const queries = storage.queryRepository();

const health: HealthState = { live: () => true, ready: () => storage.health() };

// SPA: Bun 1.3 bundles the imported HTML (tsx/css) at runtime. Routes take
// precedence over fetch; every client path serves the same shell.
const spaRoutes = {
  "/": dashboard,
  "/people": dashboard,
  "/people/:hash": dashboard,
  "/models": dashboard,
  "/models/:model": dashboard,
  "/tools/:tool": dashboard,
  "/agents/:agentType": dashboard,
  "/teams": dashboard,
  "/teams/:team": dashboard,
};

const server = Bun.serve({
  port,
  development: process.env.NODE_ENV !== "production",
  routes: spaRoutes,
  async fetch(req) {
    const ops = await handleOpsRequest(req, health);
    if (ops) return ops;

    const url = new URL(req.url);
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
    // Drill-down reads (Phase 2). The trailing path segment is decoded and bound
    // as a query parameter downstream — never interpolated into SQL.
    const drill = url.pathname.match(/^\/v1\/(people|models|tools|agents|cost-timeseries)(?:\/([^/]+))?$/);
    if (drill) {
      const org = orgFrom(req);
      if (!org) return json(400, { message: "missing org (X-Org-Id header or ?org=)" });
      const r = dateRange(req, org);
      const id = drill[2] ? decodeURIComponent(drill[2]) : undefined;
      try {
        switch (drill[1]) {
          case "people":
            return json(200, id ? await queries.personDetail(r, id) : await queries.people(r));
          case "models":
            return id ? json(200, await queries.modelDetail(r, id)) : json(400, { message: "missing model" });
          case "tools":
            return id ? json(200, await queries.toolDetail(r, id)) : json(400, { message: "missing tool" });
          case "agents":
            return id ? json(200, await queries.agentDetail(r, id)) : json(400, { message: "missing agent type" });
          case "cost-timeseries":
            return json(200, await queries.costTimeseries(r));
        }
      } catch (err) {
        log.error("query failed", { err: String(err), path: url.pathname });
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
