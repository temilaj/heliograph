// Events pipeline: decode logs -> adapt -> redact -> enrich -> produce.
// Redaction runs on every event: it scrubs secrets/PII/paths from dims and either
// drops (default, metadata-only) or encrypts (opt-in orgs) staged content, always
// clearing stagedContent. See docs/ARCHITECTURE.md.
import { decodeLogsJson, decodeLogsProto, type DecodedLogs } from "@heliograph/otlp";
import type { AdapterContext, AdapterRegistry } from "@heliograph/adapters";
import type { Enricher, HashFn } from "@heliograph/enrichment";
import type { CanonicalEvent } from "@heliograph/domain";
import type { OrgPolicyStore, RedactionPipeline } from "@heliograph/redaction";
import { partitionKey, serialize, type EventPublisher } from "@heliograph/queue";
import { SaturatedError, type IngestResult } from "./pipeline.ts";

export interface EventsPipelineDeps {
  registry: AdapterRegistry;
  hash: HashFn;
  enricher: Enricher;
  redactor: RedactionPipeline;
  policyStore: OrgPolicyStore;
  publisher: EventPublisher;
  eventsTopic: string;
}

export class EventsIngestPipeline {
  constructor(private readonly deps: EventsPipelineDeps) {}

  ingestJson(body: unknown): Promise<IngestResult> {
    return this.process(decodeLogsJson(body));
  }

  /** Ingest one OTLP/protobuf request (same pipeline as JSON). */
  ingestProto(bytes: Uint8Array): Promise<IngestResult> {
    return this.process(decodeLogsProto(bytes));
  }

  private async process(decoded: DecodedLogs): Promise<IngestResult> {
    if (this.deps.publisher.isSaturated()) throw new SaturatedError();

    const ctx: AdapterContext = { hash: this.deps.hash };
    const events: CanonicalEvent[] = [];

    for (const group of decoded.groups) {
      const adapter = this.deps.registry.resolve(group.scope);
      if (!adapter.toEvents) continue;
      for (const record of group.records) {
        for (const e of adapter.toEvents(record, group.resource, ctx)) {
          // Redact BEFORE enrich: dedupId must be computed on scrubbed dims.
          const policy = this.deps.policyStore.get(e.resource.identity.orgId);
          this.deps.redactor.redactEvent(e, policy);
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
