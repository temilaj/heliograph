// Fallback for unrecognized sources: capture as source "unknown" with generic
// mapping rather than dropping.
import {
  CURRENT_SCHEMA_VERSION,
  type CanonicalMetric,
  type ResourceContext,
} from "@heliograph/domain";
import type { OtlpMetricPoint, OtlpResource, ResourceScope } from "@heliograph/otlp";
import type { AdapterContext, SourceAdapter } from "./SourceAdapter.ts";
import { buildResourceContext } from "./resource.ts";

export class DefaultAdapter implements SourceAdapter {
  readonly source = "unknown" as const;

  canHandle(_scope: ResourceScope): boolean {
    return true; // registry uses this only as an explicit fallback
  }

  buildResourceContext(resource: OtlpResource, ctx: AdapterContext): ResourceContext {
    return buildResourceContext(this.source, resource, ctx);
  }

  toMetrics(point: OtlpMetricPoint, rc: ResourceContext): CanonicalMetric[] {
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
        attributes: { ...point.attributes },
      },
    ];
  }
}
