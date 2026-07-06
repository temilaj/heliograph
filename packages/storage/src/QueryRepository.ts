// Read side: tenant-scoped aggregate queries for dashboards. Every query is
// parameterized ({name:Type}) and filtered by org_id — never string-interpolated.
// FINAL collapses ReplacingMergeTree dupes so counters aren't double-counted.
//
// NOTE (Phase 4): assumes delta-style metric points (loadgen + delta temporality).
// Cumulative counters would need max/last-per-series, not sum.
import type { ClickHouseClient } from "./ClickHouseClient.ts";

export interface DateRange {
  org: string;
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
}

export interface OrgSummary {
  cost: { model: string; cost: number }[];
  costByDay: { day: string; cost: number }[];
  costBySource: { source: string; cost: number }[]; // main vs subagent spend
  tokens: { tokenType: string; tokens: number }[];
  adoption: { activeUsers: number; sessions: number };
  edits: { accept: number; reject: number };
  reliability: { apiRequests: number; apiErrors: number };
  linesOfCode: { subtype: string; lines: number }[]; // added / removed
  activeTime: { subtype: string; seconds: number }[]; // user / cli
  sessionsByStart: { startType: string; count: number }[]; // fresh / resume / ...
  commits: number;
  pullRequests: number;
}

export interface OrgInfo {
  orgId: string;
  rows: number;
  lastSeen: string;
}

export interface QueryRepository {
  /** Distinct orgs we've received telemetry from, most-recent first. */
  orgs(): Promise<OrgInfo[]>;
  summary(r: DateRange): Promise<OrgSummary>;
}

const num = (v: unknown): number => Number(v ?? 0);

export class ClickHouseQueryRepository implements QueryRepository {
  constructor(private readonly ch: ClickHouseClient) {}

  async orgs(): Promise<OrgInfo[]> {
    const rows = await this.ch.query<{ orgId: string; rows: number; lastSeen: string }>(
      `SELECT org_id AS orgId, sum(c) AS rows, max(ls) AS lastSeen FROM (
         SELECT org_id, count() c, max(timestamp) ls FROM hg_metrics GROUP BY org_id
         UNION ALL
         SELECT org_id, count() c, max(timestamp) ls FROM hg_events GROUP BY org_id
       ) GROUP BY org_id ORDER BY lastSeen DESC`,
    );
    return rows.map((r) => ({ orgId: r.orgId, rows: num(r.rows), lastSeen: String(r.lastSeen) }));
  }

  async summary(r: DateRange): Promise<OrgSummary> {
    const p = { org: r.org, from: r.from, to: r.to };
    const metricsWhere =
      "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    const eventsWhere = metricsWhere;

    // Metric-name and group column are hardcoded literals (not user input).
    const metricSum = (name: string, groupExpr?: string) =>
      groupExpr
        ? `SELECT ${groupExpr} AS k, sum(value) AS v FROM hg_metrics FINAL
           WHERE ${metricsWhere} AND name = '${name}' GROUP BY k ORDER BY v DESC`
        : `SELECT sum(value) AS v FROM hg_metrics FINAL WHERE ${metricsWhere} AND name = '${name}'`;

    const [
      cost,
      costByDay,
      costBySource,
      tokens,
      adoption,
      edits,
      reliability,
      linesOfCode,
      commits,
      pullRequests,
      activeTime,
      sessionsByStart,
    ] = await Promise.all([
      this.ch.query<{ k: string; v: number }>(metricSum("cost.usage", "model"), p),
      this.ch.query<{ day: string; v: number }>(
        `SELECT toString(event_date) AS day, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${metricsWhere} AND name = 'cost.usage' GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(metricSum("cost.usage", "query_source"), p),
      this.ch.query<{ k: string; v: number }>(metricSum("token.usage", "subtype"), p),
      this.ch.query<{ activeUsers: number; sessions: number }>(
        `SELECT uniqExact(user_hash) AS activeUsers, uniqExact(session_id) AS sessions
         FROM hg_metrics FINAL WHERE ${metricsWhere}`,
        p,
      ),
      this.ch.query<{ accept: number; reject: number }>(
        `SELECT sumIf(value, decision = 'accept') AS accept, sumIf(value, decision = 'reject') AS reject
         FROM hg_metrics FINAL WHERE ${metricsWhere} AND name = 'code_edit_tool.decision'`,
        p,
      ),
      this.ch.query<{ apiRequests: number; apiErrors: number }>(
        `SELECT countIf(event_type = 'api_request') AS apiRequests,
                countIf(event_type = 'api_error') AS apiErrors
         FROM hg_events FINAL WHERE ${eventsWhere}`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(metricSum("lines_of_code.count", "subtype"), p),
      this.ch.query<{ v: number }>(metricSum("commit.count"), p),
      this.ch.query<{ v: number }>(metricSum("pull_request.count"), p),
      this.ch.query<{ k: string; v: number }>(metricSum("active_time.total", "subtype"), p),
      // session.count: prefer the promoted start_type column, fall back to the
      // attributes map for rows ingested before it was promoted.
      this.ch.query<{ k: string; v: number }>(
        metricSum("session.count", "if(start_type != '', start_type, attributes['start_type'])"),
        p,
      ),
    ]);

    return {
      cost: cost.map((r) => ({ model: r.k || "(unknown)", cost: num(r.v) })),
      costByDay: costByDay.map((r) => ({ day: r.day, cost: num(r.v) })),
      costBySource: costBySource.map((r) => ({ source: r.k || "(main)", cost: num(r.v) })),
      tokens: tokens.map((r) => ({ tokenType: r.k || "(none)", tokens: num(r.v) })),
      adoption: {
        activeUsers: num(adoption[0]?.activeUsers),
        sessions: num(adoption[0]?.sessions),
      },
      edits: { accept: num(edits[0]?.accept), reject: num(edits[0]?.reject) },
      reliability: {
        apiRequests: num(reliability[0]?.apiRequests),
        apiErrors: num(reliability[0]?.apiErrors),
      },
      linesOfCode: linesOfCode.map((r) => ({ subtype: r.k || "(none)", lines: num(r.v) })),
      activeTime: activeTime.map((r) => ({ subtype: r.k || "(none)", seconds: num(r.v) })),
      sessionsByStart: sessionsByStart.map((r) => ({ startType: r.k || "(none)", count: num(r.v) })),
      commits: num(commits[0]?.v),
      pullRequests: num(pullRequests[0]?.v),
    };
  }
}

/** Empty results — for the in-memory provider (read-api runs against ClickHouse). */
export class InMemoryQueryRepository implements QueryRepository {
  async orgs(): Promise<OrgInfo[]> {
    return [];
  }
  async summary(): Promise<OrgSummary> {
    return {
      cost: [],
      costByDay: [],
      costBySource: [],
      tokens: [],
      adoption: { activeUsers: 0, sessions: 0 },
      edits: { accept: 0, reject: 0 },
      reliability: { apiRequests: 0, apiErrors: 0 },
      linesOfCode: [],
      activeTime: [],
      sessionsByStart: [],
      commits: 0,
      pullRequests: 0,
    };
  }
}
