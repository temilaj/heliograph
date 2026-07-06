/**
 * Read API service.
 *
 * Responsibility: serve tenant-scoped aggregate queries over
 * ClickHouse for dashboards.
 */
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";

const log = createLogger({ service: "read-api" });
const port = Number(process.env.READ_API_PORT ?? 8080);

const health: HealthState = {
  live: () => true,
  ready: () => true,
};

const server = Bun.serve({
  port,
  async fetch(req) {
    const ops = await handleOpsRequest(req, health);
    if (ops) return ops;
    // Query endpoints (/v1/query/*).
    return new Response("not found", { status: 404 });
  },
});

log.info("read-api listening", { port: server.port });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log.info("shutting down", { signal: sig });
    server.stop();
    process.exit(0);
  });
}
