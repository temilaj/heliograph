// Metrics pipeline (layers 2-5): decode -> adapt -> enrich -> produce. Transport-free
// so it's unit-testable and reusable by the gRPC receiver in Phase 2.
import { decodeMetricsJson, decodeMetricsProto, type DecodedMetrics } from "@heliograph/otlp";
import type { AdapterContext, AdapterRegistry } from "@heliograph/adapters";
import type { Enricher, HashFn } from "@heliograph/enrichment";
import type { CanonicalMetric } from "@heliograph/domain";
import { partitionKey, serialize, type EventPublisher } from "@heliograph/queue";

export interface PipelineDeps {
  registry: AdapterRegistry;
  hash: HashFn;
  enricher: Enricher;
  publisher: EventPublisher;
  metricsTopic: string;
}

export interface IngestResult {
  accepted: number;
}

export class SaturatedError extends Error {
  constructor() {
    super("ingest saturated");
  }
}

export class MetricsIngestPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  /** Ingest one OTLP/JSON request. Throws SaturatedError for backpressure (HTTP 429). */
  ingestJson(body: unknown): Promise<IngestResult> {
    return this.process(decodeMetricsJson(body));
  }

  /** Ingest one OTLP/protobuf request (same pipeline as JSON). */
  ingestProto(bytes: Uint8Array): Promise<IngestResult> {
    return this.process(decodeMetricsProto(bytes));
  }

  private async process(decoded: DecodedMetrics): Promise<IngestResult> {
    if (this.deps.publisher.isSaturated()) throw new SaturatedError();

    const ctx: AdapterContext = { hash: this.deps.hash };
    const metrics: CanonicalMetric[] = [];

    for (const group of decoded.groups) {
      const adapter = this.deps.registry.resolve(group.scope);
      for (const point of group.points) {
        for (const m of adapter.toMetrics(point, group.resource, ctx)) {
          metrics.push(this.deps.enricher.enrichMetric(m));
        }
      }
    }

    if (metrics.length > 0) {
      await this.deps.publisher.publish(
        this.deps.metricsTopic,
        metrics.map((m) => ({
          key: partitionKey(m.resource.identity.orgId, m.resource.sessionId),
          value: serialize(m),
        })),
      );
    }

    return { accepted: metrics.length };
  }
}
