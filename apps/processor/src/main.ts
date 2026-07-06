// Processor service: Redpanda consumer -> batch -> ClickHouse. See docs/ARCHITECTURE.md.
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";
import { KafkaConsumer } from "@heliograph/queue";
import { ClickHouseClient, ClickHouseMetricSink, migrate } from "@heliograph/storage";
import { kafkaEnv, clickhouseEnv } from "@heliograph/config";
import { handleMetricBatch } from "./consume.ts";

const log = createLogger({ service: "processor" });
const opsPort = Number(process.env.OPS_PORT ?? 9465);

const kafka = kafkaEnv();
const chCfg = clickhouseEnv();
const ch = new ClickHouseClient(chCfg);
const sink = new ClickHouseMetricSink(ch);
const consumer = new KafkaConsumer(
  { brokers: kafka.brokers, clientId: kafka.clientId },
  "heliograph-metrics",
  [kafka.topics.metrics],
);

let ready = false;
const health: HealthState = { live: () => true, ready: () => ready && ch.ping() };

Bun.serve({
  port: opsPort,
  async fetch(req) {
    return (await handleOpsRequest(req, health)) ?? new Response("not found", { status: 404 });
  },
});
log.info("processor ops listening", { port: opsPort });

// Ensure schema exists, then run the consume loop.
await migrate(ch, chCfg.database);
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
    process.exit(0);
  });
}
