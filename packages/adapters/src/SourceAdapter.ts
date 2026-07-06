// The extensibility seam: one SourceAdapter per tool, the only layer that knows
// vendor names. Adding a tool = implement + register. See docs/ARCHITECTURE.md.
import type { CanonicalEvent, CanonicalMetric, ResourceContext, SourceId } from "@heliograph/domain";
import type { OtlpMetricPoint, OtlpResource, ResourceScope } from "@heliograph/otlp";

/** Injected so adapters stay pure. `hash` pseudonymizes identity at the boundary. */
export interface AdapterContext {
  hash: (raw: string) => string;
}

export interface SourceAdapter {
  readonly source: SourceId;

  /** True if this adapter recognizes the emitting instrumentation. */
  canHandle(scope: ResourceScope): boolean;

  /** Map the OTLP Resource → normalized, pseudonymized ResourceContext. */
  buildResourceContext(resource: OtlpResource, ctx: AdapterContext): ResourceContext;

  /** Map one metric data point → zero or more canonical metrics. */
  toMetrics(point: OtlpMetricPoint, rc: ResourceContext): CanonicalMetric[];

  /**
   * Map one log/event record → zero or more canonical events.
   * Implemented in Phase 2 (events). Metrics-only adapters may omit it.
   */
  toEvents?(record: unknown, rc: ResourceContext): CanonicalEvent[];
}
