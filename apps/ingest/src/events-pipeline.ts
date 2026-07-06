// Events pipeline: decode logs -> adapt -> [redaction seam] -> enrich -> produce.
// Redaction is not wired yet (packages/redaction exists but is deferred). Until
// it is, sensitive staged content is DROPPED here, so nothing raw reaches the
// queue/storage. Wiring redaction later = replace the drop with a redact call.
import { decodeLogsJson } from "@heliograph/otlp";
import type { AdapterContext, AdapterRegistry } from "@heliograph/adapters";
import type { Enricher, HashFn } from "@heliograph/enrichment";
import type { CanonicalEvent } from "@heliograph/domain";
import { partitionKey, serialize, type EventPublisher } from "@heliograph/queue";
import { SaturatedError, type IngestResult } from "./pipeline.ts";

export interface EventsPipelineDeps {
  registry: AdapterRegistry;
  hash: HashFn;
  enricher: Enricher;
  publisher: EventPublisher;
  eventsTopic: string;
}

export class EventsIngestPipeline {
  constructor(private readonly deps: EventsPipelineDeps) {}

  async ingestJson(body: unknown): Promise<IngestResult> {
    if (this.deps.publisher.isSaturated()) throw new SaturatedError();

    const decoded = decodeLogsJson(body);
    const ctx: AdapterContext = { hash: this.deps.hash };
    const events: CanonicalEvent[] = [];

    for (const group of decoded.groups) {
      const adapter = this.deps.registry.resolve(group.scope);
      if (!adapter.toEvents) continue;
      for (const record of group.records) {
        for (const e of adapter.toEvents(record, group.resource, ctx)) {
          // Redaction seam: until the redaction layer is wired, drop raw content.
          delete e.stagedContent;
          this.deps.enricher.enrichEvent(e);
          events.push(e);
        }
      }
    }

    if (events.length > 0) {
      await this.deps.publisher.publish(
        this.deps.eventsTopic,
        events.map((e) => ({
          key: partitionKey(e.resource.identity.orgId, e.resource.sessionId),
          value: serialize(e),
        })),
      );
    }
    return { accepted: events.length };
  }
}
