// Sets a deterministic dedupId so ReplacingMergeTree collapses at-least-once dupes.
import type { CanonicalEvent, CanonicalMetric } from "@heliograph/domain";
import { sha256 } from "./hash.ts";

export class Enricher {
  enrichMetric(m: CanonicalMetric): CanonicalMetric {
    m.dedupId = metricDedupId(m);
    return m;
  }
  enrichEvent(e: CanonicalEvent): CanonicalEvent {
    e.dedupId = eventDedupId(e);
    return e;
  }
}

/** Dedup key from the fields that make a point unique: name, session, ts, value, dims. */
export function metricDedupId(m: CanonicalMetric): string {
  const dims = [
    m.model,
    m.language,
    m.editType,
    m.subtype,
    m.startType,
    m.querySource,
    m.toolName,
    m.decision,
  ].join("|");
  const parts = [
    m.source,
    m.name,
    m.resource.sessionId,
    m.timestampNs.toString(),
    m.value.toString(),
    dims,
  ].join("");
  return sha256(parts);
}

/** Dedup key for an event: identity + type + ts + correlation + sorted fields. */
export function eventDedupId(e: CanonicalEvent): string {
  const stable = (o: Record<string, unknown>) =>
    Object.keys(o)
      .sort()
      .map((k) => `${k}=${o[k]}`)
      .join(",");
  const parts = [
    e.source,
    e.eventType,
    e.resource.sessionId,
    e.timestampNs.toString(),
    e.correlationId ?? "",
    stable(e.numbers),
    stable(e.dims),
  ].join("|");
  return sha256(parts);
}
