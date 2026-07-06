// Vendor-neutral OTLP intermediate. The decoder produces these; adapters consume them.

export interface OtlpResource {
  attributes: Record<string, string>;
}

/** Identity of the emitting instrumentation, used to pick a SourceAdapter. */
export interface ResourceScope {
  /** `service.name` resource attribute, e.g. "claude-code". */
  serviceName?: string;
  /** InstrumentationScope name, e.g. "com.anthropic.claude_code". */
  scopeName?: string;
  scopeVersion?: string;
}

export type MetricPointKind = "counter" | "gauge";

/** A single flattened metric data point. */
export interface OtlpMetricPoint {
  name: string;
  unit?: string;
  kind: MetricPointKind;
  value: number;
  /** timeUnixNano parsed to a bigint (nanoseconds since epoch). */
  timestampNs: bigint;
  /** Data-point attributes, flattened to strings. */
  attributes: Record<string, string>;
}

/** One resource's worth of decoded metrics, grouped with its scope. */
export interface DecodedMetricGroup {
  resource: OtlpResource;
  scope: ResourceScope;
  points: OtlpMetricPoint[];
}

export interface DecodedMetrics {
  groups: DecodedMetricGroup[];
}
