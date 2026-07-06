// Canonical -> ClickHouse row mapping, colocated so DDL and write path can't drift.
import type { CanonicalEvent, CanonicalMetric } from "@heliograph/domain";

export interface MetricRow {
  timestamp: string; // DateTime64(9) as a decimal-seconds string
  source: string;
  name: string;
  kind: string;
  unit: string;
  value: number;
  org_id: string;
  user_hash: string;
  session_id: string;
  model: string;
  language: string;
  edit_type: string;
  subtype: string;
  start_type: string;
  query_source: string;
  tool_name: string;
  decision: string;
  department: string;
  team_id: string;
  cost_center: string;
  region: string;
  app_version: string;
  entrypoint: string;
  attributes: Record<string, string>;
  dedup_id: string;
}

/** Nanoseconds-since-epoch → ClickHouse DateTime64(9) string 'YYYY-MM-DD HH:MM:SS.fffffffff' (UTC). */
export function nsToClickHouse(ns: bigint): string {
  const sec = ns / 1_000_000_000n;
  const frac = ns % 1_000_000_000n;
  const base = new Date(Number(sec) * 1000).toISOString().slice(0, 19).replace("T", " ");
  return `${base}.${frac.toString().padStart(9, "0")}`;
}

export function metricToRow(m: CanonicalMetric): MetricRow {
  const id = m.resource.identity;
  return {
    timestamp: nsToClickHouse(m.timestampNs),
    source: m.source,
    name: m.name,
    kind: m.kind,
    unit: m.unit ?? "",
    value: m.value,
    org_id: id.orgId,
    // Primary person anchor: account hash, falling back to device hash (ADR-0002).
    user_hash: id.accountHash ?? id.userIdHash,
    session_id: m.resource.sessionId,
    model: m.model ?? "",
    language: m.language ?? "",
    edit_type: m.editType ?? "",
    subtype: m.subtype ?? "",
    start_type: m.startType ?? "",
    query_source: m.querySource ?? "",
    tool_name: m.toolName ?? "",
    decision: m.decision ?? "",
    department: m.resource.department ?? "",
    team_id: m.resource.teamId ?? "",
    cost_center: m.resource.costCenter ?? "",
    region: m.resource.region ?? "",
    app_version: m.resource.appVersion ?? "",
    entrypoint: m.resource.appEntrypoint ?? "",
    attributes: m.attributes,
    dedup_id: m.dedupId ?? "",
  };
}

export interface EventRow {
  timestamp: string;
  source: string;
  event_type: string;
  org_id: string;
  user_hash: string;
  session_id: string;
  correlation_id: string;
  model: string;
  status_code: string;
  decision: string;
  numbers: Record<string, number>;
  dims: Record<string, string>;
  department: string;
  team_id: string;
  region: string;
  app_version: string;
  attributes: Record<string, string>;
  redaction_flags: string[];
  content_class: string;
  content_keyid: string;
  content_fields: Record<string, string>;
  dedup_id: string;
}

export function eventToRow(e: CanonicalEvent): EventRow {
  const id = e.resource.identity;
  const contentFields: Record<string, string> = {};
  let contentKeyId = "";
  if (e.content) {
    for (const [name, f] of Object.entries(e.content.fields)) {
      contentFields[name] = f.ciphertext;
      contentKeyId = f.keyId;
    }
  }
  return {
    timestamp: nsToClickHouse(e.timestampNs),
    source: e.source,
    event_type: e.eventType,
    org_id: id.orgId,
    user_hash: id.accountHash ?? id.userIdHash,
    session_id: e.resource.sessionId,
    correlation_id: e.correlationId ?? "",
    model: e.dims["model"] ?? "",
    status_code: e.dims["status_code"] ?? "",
    decision: e.dims["decision"] ?? "",
    numbers: e.numbers,
    dims: e.dims,
    department: e.resource.department ?? "",
    team_id: e.resource.teamId ?? "",
    region: e.resource.region ?? "",
    app_version: e.resource.appVersion ?? "",
    attributes: e.attributes,
    redaction_flags: e.redactionFlags ?? [],
    content_class: e.content?.classification ?? "",
    content_keyid: contentKeyId,
    content_fields: contentFields,
    dedup_id: e.dedupId ?? "",
  };
}
