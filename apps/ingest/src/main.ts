// Ingest service: OTLP receiver -> adapt -> redact -> enrich -> produce. See docs/ARCHITECTURE.md.
import {
  createLogger,
  handleOpsRequest,
  type HealthState,
} from "@heliograph/observability";
import { AdapterRegistry, ClaudeCodeAdapter } from "@heliograph/adapters";
import { OtlpDecodeError } from "@heliograph/otlp";

import { Enricher, createIdentityHasher } from "@heliograph/enrichment";
import { makeQueueProvider } from "@heliograph/queue";
import { kafkaEnv, identityPepper, queueProviderName } from "@heliograph/config";
import { MetricsIngestPipeline, SaturatedError, type IngestResult } from "./pipeline.ts";
import { EventsIngestPipeline } from "./events-pipeline.ts";
import { startOtlpGrpcServer, type OtlpGrpcHandle } from "./grpc.ts";

const log = createLogger({ service: "ingest" });
const httpPort = Number(process.env.INGEST_HTTP_PORT ?? 4318);
const grpcPort = Number(process.env.INGEST_GRPC_PORT ?? 4317);

const kafka = kafkaEnv();
const queue = makeQueueProvider({
  provider: queueProviderName(),
  kafka: { brokers: kafka.brokers, clientId: kafka.clientId },
});
const registry = new AdapterRegistry().register(new ClaudeCodeAdapter());
const hash = createIdentityHasher(identityPepper());
const enricher = new Enricher();

const metricsPipeline = new MetricsIngestPipeline({
  registry,
  hash,
  enricher,
  publisher: queue.publisher(),
  metricsTopic: kafka.topics.metrics,
});
const eventsPipeline = new EventsIngestPipeline({
  registry,
  hash,
  enricher,
  publisher: queue.publisher(),
  eventsTopic: kafka.topics.events,
});

let ready = false;
await queue
  .init([kafka.topics.metrics, kafka.topics.events, kafka.topics.dlq])
  .then(() => (ready = true))
  .catch((e) => log.error("queue init failed", { err: String(e) }));

const health: HealthState = { live: () => true, ready: () => ready };

// OTLP/gRPC receiver (:4317), same pipelines as HTTP.
let grpcHandle: OtlpGrpcHandle | undefined;
await startOtlpGrpcServer(
  {
    ingestMetrics: (b) => metricsPipeline.ingestJson(b),
    ingestEvents: (b) => eventsPipeline.ingestJson(b),
    isReady: () => ready,
    log,
  },
  grpcPort,
)
  .then((h) => {
    grpcHandle = h;
    log.info("ingest grpc listening", { port: h.port });
  })
  .catch((e) => log.error("grpc bind failed", { err: String(e) }));

const server = Bun.serve({
  port: httpPort,
  async fetch(req) {
    const ops = await handleOpsRequest(req, health);
    if (ops) return ops;

    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/v1/metrics") {
      return handleOtlp(req, (b) => metricsPipeline.ingestJson(b), "metrics");
    }
    if (req.method === "POST" && url.pathname === "/v1/logs") {
      return handleOtlp(req, (b) => eventsPipeline.ingestJson(b), "events");
    }
    return new Response("not found", { status: 404 });
  },
});

async function handleOtlp(
  req: Request,
  ingest: (body: unknown) => Promise<IngestResult>,
  label: string,
): Promise<Response> {
  const ct = req.headers.get("content-type") ?? "";
  // HTTP path is OTLP/JSON only; protobuf/gRPC clients use :4317.
  if (!ct.includes("application/json")) {
    return json(415, { message: "only application/json (OTLP/JSON) supported" });
  }
  try {
    if (queueNotReady()) return json(503, { message: "not ready" });
    const result = await ingest(await req.json());
    log.info(`${label} ingested`, { accepted: result.accepted });
    return json(200, { partialSuccess: {} });
  } catch (err) {
    if (err instanceof SaturatedError) return json(429, { message: "saturated" });
    // Malformed payload (bad JSON or OTLP shape) is a client fault, not retryable.
    if (err instanceof SyntaxError || err instanceof OtlpDecodeError) {
      log.warn(`${label} decode error`, { err: String(err) });
      return json(400, { message: String(err) });
    }
    // Backend/transient fault (e.g. produce failure) — signal retryable.
    log.error(`${label} ingest error`, { err: String(err) });
    return json(503, { message: "ingest unavailable" });
  }
}

function queueNotReady(): boolean {
  return !ready;
}

function json(status: number, body: unknown): Response {
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
    await grpcHandle?.shutdown();
    await queue.close();
    process.exit(0);
  });
}
