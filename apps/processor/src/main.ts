// Processor service: consume canonical.metrics + canonical.events -> storage,
// with a DLQ for poison messages. Providers are config-selected. See docs/ARCHITECTURE.md.
import {
  createLogger,
  handleOpsRequest,
  type HealthState,
} from "@heliograph/observability";
import { makeQueueProvider } from "@heliograph/queue";

import { makeStorageProvider } from "@heliograph/storage";
import { kafkaEnv, clickhouseEnv, queueProviderName, storeProviderName } from "@heliograph/config";
import { handleEventBatch, handleMetricBatch } from "./consume.ts";
import { PublisherDlq } from "./dlq.ts";

const log = createLogger({ service: "processor" });
const opsPort = Number(process.env.OPS_PORT ?? 9465);

const kafka = kafkaEnv();
const queue = makeQueueProvider({
  provider: queueProviderName(),
  kafka: { brokers: kafka.brokers, clientId: kafka.clientId },
});
const storage = makeStorageProvider({ provider: storeProviderName(), clickhouse: clickhouseEnv() });
const metricSink = storage.metricSink();
const eventSink = storage.eventSink();
const dlq = new PublisherDlq(queue.publisher(), kafka.topics.dlq);
const consumer = queue.consumer(kafka.consumerGroup, [kafka.topics.metrics, kafka.topics.events]);

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
    const n =
      batch.topic === kafka.topics.events
        ? await handleEventBatch(batch, eventSink, dlq)
        : await handleMetricBatch(batch, metricSink, dlq);
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
