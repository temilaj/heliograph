// Ingest service: OTLP receiver -> adapt -> enrich -> produce. See docs/ARCHITECTURE.md.
import { createLogger, handleOpsRequest, type HealthState } from "@heliograph/observability";
import { AdapterRegistry, ClaudeCodeAdapter } from "@heliograph/adapters";
import { Enricher, createIdentityHasher } from "@heliograph/enrichment";
import { makeQueueProvider } from "@heliograph/queue";
import { kafkaEnv, identityPepper, queueProviderName } from "@heliograph/config";
import { MetricsIngestPipeline, SaturatedError } from "./pipeline.ts";

const log = createLogger({ service: "ingest" });
const httpPort = Number(process.env.INGEST_HTTP_PORT ?? 4318);

const kafka = kafkaEnv();
const queue = makeQueueProvider({
  provider: queueProviderName(),
  kafka: { brokers: kafka.brokers, clientId: kafka.clientId },
});
const registry = new AdapterRegistry().register(new ClaudeCodeAdapter());
const pipeline = new MetricsIngestPipeline({
  registry,
  hash: createIdentityHasher(identityPepper()),
  enricher: new Enricher(),
  publisher: queue.publisher(),
  metricsTopic: kafka.topics.metrics,
});

let ready = false;
await queue
  .init([kafka.topics.metrics, kafka.topics.events, kafka.topics.dlq])
  .then(() => (ready = true))
  .catch((e) => log.error("queue init failed", { err: String(e) }));

const health: HealthState = { live: () => true, ready: () => ready };

const server = Bun.serve({
  port: httpPort,
  async fetch(req) {
    const ops = await handleOpsRequest(req, health);
    if (ops) return ops;

    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/v1/metrics") {
      return handleMetrics(req);
    }
    return new Response("not found", { status: 404 });
  },
});

async function handleMetrics(req: Request): Promise<Response> {
  const ct = req.headers.get("content-type") ?? "";
  // accepts OTLP/JSON for now. ; protobuf + gRPC later.
  if (!ct.includes("application/json")) {
    return otlp(415, { message: "only application/json (OTLP/JSON) supported in Phase 1" });
  }
  try {
    const result = await pipeline.ingestJson(await req.json());
    return otlp(200, { partialSuccess: {} }, { accepted: result.accepted });
  } catch (err) {
    if (err instanceof SaturatedError) return otlp(429, { message: "saturated" });
    log.error("ingest error", { err: String(err) });
    return otlp(400, { message: String(err) });
  }
}

function otlp(status: number, body: unknown, logFields?: Record<string, unknown>): Response {
  if (logFields) log.info("metrics ingested", logFields);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

log.info("ingest listening", { port: server.port });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    log.info("shutting down", { signal: sig });
    server.stop();
    await queue.close();
    process.exit(0);
  });
}
