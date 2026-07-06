// Claude Code adapter — the only file that knows `claude_code.*`. Strips the
// prefix, promotes hot dims. Events arrive in Phase 2. See docs/ARCHITECTURE.md.
import {
  CURRENT_SCHEMA_VERSION,
  type CanonicalMetric,
  type ResourceContext,
} from "@heliograph/domain";
import type { OtlpMetricPoint, OtlpResource, ResourceScope } from "@heliograph/otlp";
import type { AdapterContext, SourceAdapter } from "../SourceAdapter.ts";
import { buildResourceContext } from "../resource.ts";

const VENDOR_PREFIX = "claude_code.";

/** Data-point attribute keys promoted to canonical columns, and their targets. */
const PROMOTED: Array<[attrKey: string, field: keyof CanonicalMetric]> = [
  ["model", "model"],
  ["language", "language"],
  ["edit_type", "editType"],
  ["type", "tokenType"], // token.usage breakdown: input|output|cacheRead|cacheCreation
  ["query_source", "querySource"],
  ["tool_name", "toolName"],
  ["decision", "decision"],
];
const PROMOTED_KEYS = new Set(PROMOTED.map(([k]) => k));

export class ClaudeCodeAdapter implements SourceAdapter {
  readonly source = "claude_code" as const;

  canHandle(scope: ResourceScope): boolean {
    const svc = scope.serviceName?.toLowerCase();
    const scopeName = scope.scopeName?.toLowerCase() ?? "";
    return (
      svc === "claude-code" ||
      svc === "claude_code" ||
      scopeName.includes("claude_code") ||
      scopeName.includes("claude-code")
    );
  }

  buildResourceContext(resource: OtlpResource, ctx: AdapterContext): ResourceContext {
    return buildResourceContext(this.source, resource, ctx);
  }

  toMetrics(point: OtlpMetricPoint, rc: ResourceContext): CanonicalMetric[] {
    const name = point.name.startsWith(VENDOR_PREFIX)
      ? point.name.slice(VENDOR_PREFIX.length)
      : point.name;

    const metric: CanonicalMetric = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      source: this.source,
      name,
      kind: point.kind,
      value: point.value,
      unit: point.unit,
      timestampNs: point.timestampNs,
      resource: rc,
      attributes: {},
    };

    const writable = metric as unknown as Record<string, string>;
    for (const [attrKey, field] of PROMOTED) {
      const v = point.attributes[attrKey];
      if (v !== undefined) writable[field] = v;
    }
    for (const [k, v] of Object.entries(point.attributes)) {
      if (!PROMOTED_KEYS.has(k)) metric.attributes[k] = v;
    }

    return [metric];
  }
}
