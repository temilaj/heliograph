// Fallback for unrecognized sources: capture as source "unknown" with generic
// mapping rather than dropping. Still strips RESOURCE_KEYS so no raw identity leaks.
import {
  CURRENT_SCHEMA_VERSION,
  type CanonicalMetric,
} from "@heliograph/domain";
import type { OtlpMetricPoint, OtlpResource, ResourceScope } from "@heliograph/otlp";
import type { AdapterContext, SourceAdapter } from "./SourceAdapter.ts";
import { RESOURCE_KEYS, resourceContextFromAttrs } from "./resource.ts";

export class DefaultAdapter implements SourceAdapter {
  readonly source = "unknown" as const;

  canHandle(_scope: ResourceScope): boolean {
    return true; // registry uses this only as an explicit fallback
  }

  toMetrics(point: OtlpMetricPoint, resource: OtlpResource, ctx: AdapterContext): CanonicalMetric[] {
    const rc = resourceContextFromAttrs(this.source, resource.attributes, point.attributes, ctx);
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(point.attributes)) {
      if (!RESOURCE_KEYS.has(k)) attributes[k] = v;
    }
    return [
      {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        source: this.source,
        name: point.name,
        kind: point.kind,
        value: point.value,
        unit: point.unit,
        timestampNs: point.timestampNs,
        resource: rc,
        attributes,
      },
    ];
  }
}
