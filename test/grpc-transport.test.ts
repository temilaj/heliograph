import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { AdapterRegistry, ClaudeCodeAdapter } from "@heliograph/adapters";
import { Enricher, createIdentityHasher } from "@heliograph/enrichment";
import { InMemoryBus, deserialize } from "@heliograph/queue";
import type { CanonicalMetric } from "@heliograph/domain";
import {
  OTLP_LOGS_SERVICE_PROTO,
  OTLP_METRICS_SERVICE_PROTO,
  OTLP_PROTO_ROOT,
} from "@heliograph/otlp";
import type { Logger } from "@heliograph/observability";
import { MetricsIngestPipeline } from "../apps/ingest/src/pipeline.ts";
import { EventsIngestPipeline } from "../apps/ingest/src/events-pipeline.ts";
import { startOtlpGrpcServer, type OtlpGrpcHandle } from "../apps/ingest/src/grpc.ts";
import { claudeCodeEventsPayload, claudeCodeMetricsPayload } from "../tools/loadgen/src/payload.ts";

const METRICS_TOPIC = "canonical.metrics";
const EVENTS_TOPIC = "canonical.events";
const silent: Logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silent } as Logger;

const LOAD_OPTS: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: false,
  oneofs: true,
  includeDirs: [OTLP_PROTO_ROOT],
};

function makeClient(protoFile: string, signal: "metrics" | "logs", port: number): any {
  const pkg = grpc.loadPackageDefinition(protoLoader.loadSync(protoFile, LOAD_OPTS)) as any;
  const svc = signal === "metrics" ? "MetricsService" : "LogsService";
  const Ctor = pkg.opentelemetry.proto.collector[signal].v1[svc];
  return new Ctor(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
}

const exportAsync = (client: any, req: unknown): Promise<unknown> =>
  new Promise((resolve, reject) =>
    client.Export(req, (err: unknown, resp: unknown) => (err ? reject(err) : resolve(resp))),
  );

describe("OTLP gRPC transport", () => {
  const bus = new InMemoryBus();
  let handle: OtlpGrpcHandle;

  beforeAll(async () => {
    const common = {
      registry: new AdapterRegistry().register(new ClaudeCodeAdapter()),
      hash: createIdentityHasher("test-pepper"),
      enricher: new Enricher(),
      publisher: bus.publisher(),
    };
    const metrics = new MetricsIngestPipeline({ ...common, metricsTopic: METRICS_TOPIC });
    const events = new EventsIngestPipeline({ ...common, eventsTopic: EVENTS_TOPIC });
    handle = await startOtlpGrpcServer(
      {
        ingestMetrics: (b) => metrics.ingestJson(b),
        ingestEvents: (b) => events.ingestJson(b),
        isReady: () => true,
        log: silent,
      },
      0, // ephemeral port
    );
  });

  afterAll(async () => {
    await handle.shutdown();
  });

  test("metrics Export decodes to the same points as the HTTP/JSON path", async () => {
    const client = makeClient(OTLP_METRICS_SERVICE_PROTO, "metrics", handle.port);
    const resp = await exportAsync(client, claudeCodeMetricsPayload());
    expect(resp).toEqual({}); // empty response = full success

    const landed = bus.topics.get(METRICS_TOPIC) ?? [];
    // Same 14-point count the in-memory JSON pipeline test asserts.
    expect(landed.length).toBe(14);
    const points = landed.map((m) => deserialize<CanonicalMetric>(m.value));
    const cost = points.find((m) => m.name === "cost.usage")!;
    expect(cost.value).toBeCloseTo(0.0123);
    expect(cost.unit).toBe("USD");
  });

  test("int64 timeUnixNano survives protobuf encode/decode as bigint", async () => {
    const bus2 = new InMemoryBus();
    const pipe = new MetricsIngestPipeline({
      registry: new AdapterRegistry().register(new ClaudeCodeAdapter()),
      hash: createIdentityHasher("test-pepper"),
      enricher: new Enricher(),
      publisher: bus2.publisher(),
      metricsTopic: METRICS_TOPIC,
    });
    const h = await startOtlpGrpcServer(
      { ingestMetrics: (b) => pipe.ingestJson(b), ingestEvents: async () => ({ accepted: 0 }), isReady: () => true, log: silent },
      0,
    );
    const client = makeClient(OTLP_METRICS_SERVICE_PROTO, "metrics", h.port);
    await exportAsync(client, claudeCodeMetricsPayload({ timeUnixNano: "1751812607123456789" }));
    const first = deserialize<CanonicalMetric>((bus2.topics.get(METRICS_TOPIC) ?? [])[0]!.value);
    // Full ns precision (exceeds MAX_SAFE_INTEGER) survives protobuf int64 → bigint.
    expect(first.timestampNs).toBe(1751812607123456789n);
    await h.shutdown();
  });

  test("events Export lands canonical events with no raw PII on the wire", async () => {
    const client = makeClient(OTLP_LOGS_SERVICE_PROTO, "logs", handle.port);
    await exportAsync(client, claudeCodeEventsPayload());
    const wire = (bus.topics.get(EVENTS_TOPIC) ?? []).map((m) => m.value).join("");
    expect(wire.length).toBeGreaterThan(0);
    expect(wire).not.toContain("jane.doe@acme.com");
    expect(wire).not.toContain("acct-uuid-999");
  });
});
