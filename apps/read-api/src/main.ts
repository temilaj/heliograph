// Read API: tenant-scoped aggregate queries + serves the dashboard SPA. See docs/ARCHITECTURE.md.
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";
import { makeStorageProvider } from "@heliograph/storage";
import { clickhouseEnv, storeProviderName } from "@heliograph/config";
import { orgFrom, dateRange, json, identityResolutionEnabled } from "./routes.ts";
import dashboard from "@heliograph/dashboard/index.html";

const log = createLogger({ service: "read-api" });
const port = Number(process.env.READ_API_PORT ?? 8080);
const MAX_IDENTITY_HASHES = 1000; // bounds the resolve IN-clause per request

const storage = makeStorageProvider({ provider: storeProviderName(), clickhouse: clickhouseEnv() });
const queries = storage.queryRepository();
const directory = storage.personDirectory();

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
  "/capabilities": dashboard,
  "/capabilities/plugins/:name": dashboard,
  "/reliability": dashboard,
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
    // Resolve pseudonymous user_hash -> person (ADR-0002). Dedicated RBAC-gated
    // call so the analytics reads stay identity-free; dashboard merges the map in.
    if (url.pathname === "/v1/identities" && req.method === "POST") {
      const org = orgFrom(req);
      if (!org) return json(400, { message: "missing org (X-Org-Id header or ?org=)" });
      if (!identityResolutionEnabled(req)) return json(200, { identities: {} });
      try {
        const body = (await req.json().catch(() => ({}))) as { hashes?: unknown };
        const hashes = Array.isArray(body.hashes)
          ? body.hashes.filter((h): h is string => typeof h === "string")
          : [];
        if (hashes.length > MAX_IDENTITY_HASHES) {
          return json(400, { message: `too many hashes (max ${MAX_IDENTITY_HASHES})` });
        }
        const resolved = await directory.resolve(org, hashes);
        return json(200, { identities: Object.fromEntries(resolved) });
      } catch (err) {
        log.error("identity resolution failed", { err: String(err) });
        return json(500, { message: "query failed" });
      }
    }
    // Drill-down reads. The trailing path segment is decoded and bound
    // as a query parameter downstream — never interpolated into SQL.
    const drill = url.pathname.match(
      /^\/v1\/(people|models|tools|agents|teams|capabilities|plugins|reliability|environment|cost-timeseries|efficiency|governance|engagement)(?:\/([^/]+))?$/,
    );
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
            return json(200, id ? await queries.toolDetail(r, id) : await queries.toolsList(r));
          case "agents":
            return json(200, id ? await queries.agentDetail(r, id) : await queries.agentsList(r));
          case "reliability":
            return json(200, await queries.reliability(r));
          case "teams":
            return json(200, id ? await queries.teamDetail(r, id) : await queries.teams(r));
          case "capabilities":
            return json(200, await queries.capabilities(r));
          case "environment":
            return json(200, await queries.environment(r));
          case "plugins":
            return id ? json(200, await queries.pluginDetail(r, id)) : json(400, { message: "missing plugin" });
          case "cost-timeseries":
            return json(200, await queries.costTimeseries(r));
          case "efficiency":
            return json(200, await queries.efficiency(r));
          case "governance":
            return json(200, await queries.governance(r));
          case "engagement":
            return json(200, await queries.engagement(r));
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
