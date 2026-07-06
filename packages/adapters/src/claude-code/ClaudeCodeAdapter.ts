// Claude Code adapter — the only file that knows `claude_code.*`. Strips the
// prefix, promotes hot dims, and (critically) builds identity from the MERGED
// resource + point/record attributes, stripping RESOURCE_KEYS so raw identity is
// never stored. See docs/ARCHITECTURE.md.
import {
  CURRENT_SCHEMA_VERSION,
  type CanonicalEvent,
  type CanonicalMetric,
} from "@heliograph/domain";
import type { OtlpLogRecord, OtlpMetricPoint, OtlpResource, ResourceScope } from "@heliograph/otlp";
import type { AdapterContext, SourceAdapter } from "../SourceAdapter.ts";
import { RESOURCE_KEYS, resourceContextFromAttrs } from "../resource.ts";
import { CONSUMED_EVENT_KEYS, CONTENT_KEYS, isNumeric, toEventType } from "./events.ts";

const VENDOR_PREFIX = "claude_code.";

/** Data-point attribute keys promoted to canonical columns, and their targets. */
const PROMOTED: Array<[attrKey: string, field: keyof CanonicalMetric]> = [
  ["model", "model"],
  ["language", "language"],
  ["edit_type", "editType"],
  ["type", "subtype"], // generic subtype: token breakdown / added-removed / user-cli
  ["start_type", "startType"], // session.count: fresh|resume|continue|agents_view
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

  toMetrics(point: OtlpMetricPoint, resource: OtlpResource, ctx: AdapterContext): CanonicalMetric[] {
    const rc = resourceContextFromAttrs(this.source, resource.attributes, point.attributes, ctx);
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
      // Never keep promoted keys or identity/resource keys (PII) as attributes.
      if (!PROMOTED_KEYS.has(k) && !RESOURCE_KEYS.has(k)) metric.attributes[k] = v;
    }

    return [metric];
  }

  toEvents(record: OtlpLogRecord, resource: OtlpResource, ctx: AdapterContext): CanonicalEvent[] {
    const rc = resourceContextFromAttrs(this.source, resource.attributes, record.attributes, ctx);

    const numbers: Record<string, number> = {};
    const dims: Record<string, string> = {};
    const stagedContent: Record<string, string> = {};

    for (const [k, v] of Object.entries(record.attributes)) {
      // Drop consumed markers and identity/resource keys (PII) — never dims.
      if (CONSUMED_EVENT_KEYS.has(k) || RESOURCE_KEYS.has(k)) continue;
      if (CONTENT_KEYS.has(k)) stagedContent[k] = v;
      else if (isNumeric(v)) numbers[k] = Number(v);
      else dims[k] = v;
    }

    // MCP tools arrive as `mcp__<server>__<tool>`; split so servers are queryable
    // (tool part may itself contain "__"). tool_name stays unchanged.
    const toolName = dims["tool_name"];
    if (toolName?.startsWith("mcp__")) {
      const rest = toolName.slice(5);
      const sep = rest.indexOf("__");
      if (sep > 0 && sep + 2 < rest.length) {
        dims["mcp_server"] = rest.slice(0, sep);
        dims["mcp_tool"] = rest.slice(sep + 2);
      }
    }

    const eventType = toEventType(record.eventName);
    // Preserve the raw name of unrecognized events so we can extend the taxonomy.
    if (eventType === "unknown" && record.eventName) dims["event.name"] = record.eventName;

    const event: CanonicalEvent = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      source: this.source,
      eventType,
      timestampNs: record.timestampNs,
      resource: rc,
      correlationId: record.attributes["prompt.id"],
      numbers,
      dims,
      attributes: {},
    };
    if (Object.keys(stagedContent).length > 0) event.stagedContent = stagedContent;
    return [event];
  }
}
