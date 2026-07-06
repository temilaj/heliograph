/**
 * Ingest service.
 *
 * Responsibility: terminate OTLP, adapt to canonical,
 * redact, enrich, and produce to Redpanda. 
 */
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";

const log = createLogger({ service: "ingest" });
const httpPort = Number(process.env.INGEST_HTTP_PORT ?? 4318);

const health: HealthState = {
  live: () => true,
  ready: () => true,
};

const server = Bun.serve({
  port: httpPort,
  async fetch(req) {
    const ops = await handleOpsRequest(req, health);
    if (ops) return ops;
    // OTLP endpoints (/v1/metrics, /v1/logs).
    return new Response("not found", { status: 404 });
  },
});

log.info("ingest listening", { port: server.port });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log.info("shutting down", { signal: sig });
    server.stop();
    process.exit(0);
  });
}
