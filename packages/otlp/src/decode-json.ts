// OTLP/JSON metrics decoder. Handles sum (counter) + gauge; histograms are not
// emitted by Claude Code. int64 fields arrive as strings in OTLP/JSON. See docs/ARCHITECTURE.md.
import type {
  DecodedMetrics,
  DecodedMetricGroup,
  OtlpMetricPoint,
  ResourceScope,
} from "./types.ts";
import { decodeAttributes, decodeResource, toBigIntNs, type KeyValue } from "./anyvalue.ts";

// --- Minimal structural typings of the OTLP/JSON payload -------------------

interface NumberDataPoint {
  attributes?: KeyValue[];
  timeUnixNano?: string | number;
  startTimeUnixNano?: string | number;
  asInt?: string | number;
  asDouble?: number;
}
interface Metric {
  name?: string;
  unit?: string;
  sum?: { dataPoints?: NumberDataPoint[]; isMonotonic?: boolean };
  gauge?: { dataPoints?: NumberDataPoint[] };
}
interface ScopeMetrics {
  scope?: { name?: string; version?: string };
  metrics?: Metric[];
}
interface ResourceMetrics {
  resource?: { attributes?: KeyValue[] };
  scopeMetrics?: ScopeMetrics[];
}
interface MetricsPayload {
  resourceMetrics?: ResourceMetrics[];
}

export class OtlpDecodeError extends Error {}

/** Decode an OTLP/JSON metrics ExportMetricsServiceRequest. */
export function decodeMetricsJson(body: unknown): DecodedMetrics {
  if (typeof body !== "object" || body === null) {
    throw new OtlpDecodeError("metrics payload must be a JSON object");
  }
  const payload = body as MetricsPayload;
  const groups: DecodedMetricGroup[] = [];

  for (const rm of payload.resourceMetrics ?? []) {
    const resource = decodeResource(rm.resource?.attributes);
    for (const sm of rm.scopeMetrics ?? []) {
      const scope: ResourceScope = {
        serviceName: resource.attributes["service.name"],
        scopeName: sm.scope?.name,
        scopeVersion: sm.scope?.version,
      };
      const points: OtlpMetricPoint[] = [];
      for (const metric of sm.metrics ?? []) {
        collectPoints(metric, points);
      }
      if (points.length > 0) groups.push({ resource, scope, points });
    }
  }
  return { groups };
}

function collectPoints(metric: Metric, out: OtlpMetricPoint[]): void {
  const name = metric.name;
  if (!name) return;
  const unit = metric.unit || undefined;

  if (metric.sum?.dataPoints) {
    for (const dp of metric.sum.dataPoints) {
      out.push(toPoint(name, unit, "counter", dp));
    }
  }
  if (metric.gauge?.dataPoints) {
    for (const dp of metric.gauge.dataPoints) {
      out.push(toPoint(name, unit, "gauge", dp));
    }
  }
}

function toPoint(
  name: string,
  unit: string | undefined,
  kind: "counter" | "gauge",
  dp: NumberDataPoint,
): OtlpMetricPoint {
  return {
    name,
    unit,
    kind,
    value: numberValue(dp),
    timestampNs: toBigIntNs(dp.timeUnixNano ?? dp.startTimeUnixNano),
    attributes: decodeAttributes(dp.attributes),
  };
}

function numberValue(dp: NumberDataPoint): number {
  if (typeof dp.asDouble === "number") return dp.asDouble;
  if (dp.asInt !== undefined) return Number(dp.asInt);
  return 0;
}
