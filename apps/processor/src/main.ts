/**
 * Processor service.
 *
 */
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";

const log = createLogger({ service: "processor" });
const opsPort = Number(process.env.OPS_PORT ?? 9465);

const health: HealthState = {
  live: () => true,
  ready: () => true,
};

const server = Bun.serve({
  port: opsPort,
  async fetch(req) {
    const ops = await handleOpsRequest(req, health);
    if (ops) return ops;
    return new Response("not found", { status: 404 });
  },
});

log.info("processor ops listening", { port: server.port });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log.info("shutting down", { signal: sig });
    server.stop();
    process.exit(0);
  });
}
