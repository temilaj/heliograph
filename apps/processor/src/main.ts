// Processor service: queue consumer -> batch -> storage sink. Providers are
// selected by config so the queue/store are swappable. See docs/ARCHITECTURE.md.
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";
import { makeQueueProvider } from "@heliograph/queue";
import { makeStorageProvider } from "@heliograph/storage";
import { kafkaEnv, clickhouseEnv, queueProviderName, storeProviderName } from "@heliograph/config";
import { handleMetricBatch } from "./consume.ts";

const log = createLogger({ service: "processor" });
const opsPort = Number(process.env.OPS_PORT ?? 9465);

const kafka = kafkaEnv();
const queue = makeQueueProvider({
  provider: queueProviderName(),
  kafka: { brokers: kafka.brokers, clientId: kafka.clientId },
});
const storage = makeStorageProvider({ provider: storeProviderName(), clickhouse: clickhouseEnv() });
const sink = storage.metricSink();
const consumer = queue.consumer("heliograph-metrics", [kafka.topics.metrics]);

let ready = false;
const health: HealthState = { live: () => true, ready: () => ready && storage.health() };

Bun.serve({
  port: opsPort,
  async fetch(req) {
    return (await handleOpsRequest(req, health)) ?? new Response("not found", { status: 404 });
  },
});
log.info("processor ops listening", { port: opsPort });

await storage.migrate();
log.info("schema migrated");
ready = true;

consumer
  .run(async (batch) => {
    const n = await handleMetricBatch(batch, sink);
    log.info("batch written", { topic: batch.topic, rows: n });
  })
  .catch((e) => {
    log.error("consumer crashed", { err: String(e) });
    process.exit(1);
  });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    log.info("shutting down", { signal: sig });
    await consumer.close();
    await queue.close();
    await storage.close();
    process.exit(0);
  });
}
