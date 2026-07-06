// Canonical -> ClickHouse row mapping, colocated so DDL and write path can't drift.
import type { CanonicalMetric } from "@heliograph/domain";

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
  token_type: string;
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
    token_type: m.tokenType ?? "",
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
