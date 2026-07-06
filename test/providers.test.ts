// Proves the provider factories return working implementations behind the
// interfaces, and that the full pipeline runs through them (memory providers).
import { expect, test, describe } from "bun:test";
import { makeQueueProvider } from "@heliograph/queue";
import { makeStorageProvider as makeStore, InMemoryStorageProvider } from "@heliograph/storage";
import { AdapterRegistry, ClaudeCodeAdapter } from "@heliograph/adapters";
import { Enricher, createIdentityHasher } from "@heliograph/enrichment";
import { MetricsIngestPipeline } from "../apps/ingest/src/pipeline.ts";
import { handleMetricBatch } from "../apps/processor/src/consume.ts";
import { claudeCodeMetricsPayload } from "../tools/loadgen/src/payload.ts";

const kafka = { brokers: ["unused"], clientId: "test" };

describe("provider factories", () => {
  test("unknown provider names throw (fail fast on misconfig)", () => {
    // @ts-expect-error intentional bad value
    expect(() => makeQueueProvider({ provider: "pulsar", kafka })).toThrow();
    // @ts-expect-error intentional bad value
    expect(() => makeStore({ provider: "snowflake", clickhouse: {} })).toThrow();
  });

  test("memory providers run the full pipeline through the interfaces", async () => {
    const queue = makeQueueProvider({ provider: "memory", kafka });
    const storage = makeStore({ provider: "memory", clickhouse: {} as never });
    await queue.init(["canonical.metrics"]);
    await storage.migrate();

    const pipeline = new MetricsIngestPipeline({
      registry: new AdapterRegistry().register(new ClaudeCodeAdapter()),
      hash: createIdentityHasher("t"),
      enricher: new Enricher(),
      publisher: queue.publisher(),
      metricsTopic: "canonical.metrics",
    });
    await pipeline.ingestJson(claudeCodeMetricsPayload());

    const sink = storage.metricSink();
    await queue.consumer("g", ["canonical.metrics"]).run((b) => handleMetricBatch(b, sink).then(() => {}));

    expect((storage as InMemoryStorageProvider).sink.written.length).toBe(8);
    expect(await storage.health()).toBe(true);
  });
});
