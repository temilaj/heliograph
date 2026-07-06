// Sets a deterministic dedupId so ReplacingMergeTree collapses at-least-once dupes.
import type { CanonicalMetric } from "@heliograph/domain";
import { sha256 } from "./hash.ts";

export class Enricher {
  enrichMetric(m: CanonicalMetric): CanonicalMetric {
    m.dedupId = metricDedupId(m);
    return m;
  }
}

/** Dedup key from the fields that make a point unique: name, session, ts, value, dims. */
export function metricDedupId(m: CanonicalMetric): string {
  const dims = [
    m.model,
    m.language,
    m.editType,
    m.tokenType,
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
  ].join("");
  return sha256(parts);
}
