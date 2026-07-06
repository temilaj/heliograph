// The extensibility seam: one SourceAdapter per tool, the only layer that knows
// vendor names. Adding a tool = implement + register. See docs/ARCHITECTURE.md.
import type { CanonicalEvent, CanonicalMetric, SourceId } from "@heliograph/domain";
import type { OtlpLogRecord, OtlpMetricPoint, OtlpResource, ResourceScope } from "@heliograph/otlp";

/** Injected so adapters stay pure. `hash` pseudonymizes identity at the boundary. */
export interface AdapterContext {
  hash: (raw: string) => string;
}

export interface SourceAdapter {
  readonly source: SourceId;

  /** True if this adapter recognizes the emitting instrumentation. */
  canHandle(scope: ResourceScope): boolean;

  /**
   * Map one metric data point → canonical metrics. The adapter builds identity/
   * resource context from the MERGED resource + point attributes (identity can
   * live on either), hashing raw identity and never keeping it as an attribute.
   */
  toMetrics(point: OtlpMetricPoint, resource: OtlpResource, ctx: AdapterContext): CanonicalMetric[];

  /** Map one log/event record → canonical events (same merged-attrs handling). */
  toEvents?(record: OtlpLogRecord, resource: OtlpResource, ctx: AdapterContext): CanonicalEvent[];
}
