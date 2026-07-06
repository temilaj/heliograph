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
  // --- tool & agent usage ---
  tools: { tool: string; uses: number; successRate: number; avgMs: number }[];
  toolDecisions: { tool: string; accept: number; reject: number; block: number }[];
  subagents: { agentType: string; uses: number; tokens: number }[];
  // --- spend breakdown ---
  costByEffort: { effort: string; cost: number }[];
  costByUser: { userHash: string; cost: number }[]; // top spenders
  // --- when ---
  activityByHour: { hour: number; requests: number; cost: number }[];
  // --- capability adoption ---
  skills: { name: string; count: number }[];
  mcpServers: { name: string; count: number }[];
  plugins: { name: string; count: number }[];
}

export interface OrgInfo {
  orgId: string;
  rows: number;
  lastSeen: string;
}

// --- drill-down shapes (Phase 2). Identity stays pseudonymous: user_hash as-is. ---
export interface PersonRow {
  userHash: string;
  cost: number;
  tokens: number;
  sessions: number;
  toolCalls: number;
  linesAdded: number;
  lastActive: string;
}

export interface PersonDetail {
  costByDay: { day: string; cost: number }[];
  tokens: { tokenType: string; tokens: number }[];
  models: { model: string; cost: number }[];
  tools: { tool: string; uses: number; successRate: number; avgMs: number }[];
  activityByHour: { hour: number; requests: number; cost: number }[];
  sessions: number;
  linesOfCode: { subtype: string; lines: number }[];
}

export interface ModelDetail {
  costByDay: { day: string; cost: number }[];
  tokensByType: { tokenType: string; tokens: number }[];
  topUsers: { userHash: string; cost: number }[];
  costBySource: { source: string; cost: number }[];
  costByEffort: { effort: string; cost: number }[];
}

export interface ToolDetail {
  usesByDay: { day: string; uses: number; successRate: number }[];
  latency: { avgMs: number; p95Ms: number };
  decisions: { accept: number; reject: number; block: number };
  topUsers: { userHash: string; uses: number }[];
}

export interface AgentDetail {
  usesByDay: { day: string; uses: number; tokens: number }[];
  topUsers: { userHash: string; uses: number }[];
}

export interface CostTimeseriesRow {
  day: string;
  model: string;
  cost: number;
}

// --- teams (Phase 6). Membership maps user_hash → team; users without a row
// roll up under "(unassigned)". Identity stays pseudonymous. ---
export interface TeamRow {
  team: string;
  members: number; // distinct active user_hashes in range
  cost: number;
  tokens: number;
  sessions: number;
  toolCalls: number;
}

export interface TeamDetail {
  costByDay: { day: string; cost: number }[];
  members: { userHash: string; cost: number; tokens: number; sessions: number }[];
  models: { model: string; cost: number }[];
  tools: { tool: string; uses: number; successRate: number; avgMs: number }[];
}

export interface QueryRepository {
  /** Distinct orgs we've received telemetry from, most-recent first. */
  orgs(): Promise<OrgInfo[]>;
  summary(r: DateRange): Promise<OrgSummary>;
  /** Per-user aggregates for the org, top spenders first (cap 500). */
  people(r: DateRange): Promise<PersonRow[]>;
  /** One user's summary blocks, scoped by pseudonymous user_hash. */
  personDetail(r: DateRange, userHash: string): Promise<PersonDetail>;
  /** One model's trend, token mix, top users, spend splits. */
  modelDetail(r: DateRange, model: string): Promise<ModelDetail>;
  /** One tool's trend, latency, decisions, top users. */
  toolDetail(r: DateRange, tool: string): Promise<ToolDetail>;
  /** One subagent type's trend and top users. */
  agentDetail(r: DateRange, agentType: string): Promise<AgentDetail>;
  /** Per-day per-model cost — feeds the multi-series trend chart. */
  costTimeseries(r: DateRange): Promise<CostTimeseriesRow[]>;
  /** Team rollups (membership join; unassigned users bucket together). */
  teams(r: DateRange): Promise<TeamRow[]>;
  /** One team's trend, members, model and tool mix. */
  teamDetail(r: DateRange, team: string): Promise<TeamDetail>;
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

    // Event-driven story blocks (tools, subagents, spend splits, when, adoption).
    const inEvent = (et: string) => `${eventsWhere} AND event_type = '${et}'`;
    const [tools, toolDec, subagents, costByEffort, costByUser, activityByHour, skills, mcps, plugins] =
      await Promise.all([
        this.ch.query<{ tool: string; uses: number; successRate: number; avgMs: number }>(
          `SELECT dims['tool_name'] AS tool, count() AS uses,
                  countIf(dims['success'] = 'true') / count() AS successRate,
                  avgIf(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS avgMs
           FROM hg_events FINAL WHERE ${inEvent("tool_result")} AND dims['tool_name'] != ''
           GROUP BY tool ORDER BY uses DESC LIMIT 20`,
          p,
        ),
        this.ch.query<{ tool: string; accept: number; reject: number; block: number }>(
          `SELECT dims['tool_name'] AS tool, countIf(dims['decision'] = 'accept') AS accept,
                  countIf(dims['decision'] = 'reject') AS reject, countIf(dims['decision'] = 'block') AS block
           FROM hg_events FINAL WHERE ${inEvent("tool_decision")} AND dims['tool_name'] != ''
           GROUP BY tool ORDER BY accept + reject + block DESC LIMIT 20`,
          p,
        ),
        this.ch.query<{ k: string; uses: number; tokens: number }>(
          `SELECT dims['agent_type'] AS k, count() AS uses, sum(numbers['total_tokens']) AS tokens
           FROM hg_events FINAL WHERE ${eventsWhere} AND mapContains(dims, 'agent_type')
           GROUP BY k ORDER BY uses DESC LIMIT 20`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT attributes['effort'] AS k, sum(value) AS v FROM hg_metrics FINAL
           WHERE ${metricsWhere} AND name = 'cost.usage' GROUP BY k ORDER BY v DESC`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT user_hash AS k, sum(value) AS v FROM hg_metrics FINAL
           WHERE ${metricsWhere} AND name = 'cost.usage' GROUP BY k ORDER BY v DESC LIMIT 10`,
          p,
        ),
        this.ch.query<{ hour: number; requests: number; cost: number }>(
          `SELECT toHour(timestamp) AS hour, count() AS requests, sum(numbers['cost_usd']) AS cost
           FROM hg_events FINAL WHERE ${inEvent("api_request")} GROUP BY hour ORDER BY hour`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['skill.name'] AS k, count() AS v FROM hg_events FINAL
           WHERE ${inEvent("skill_activated")} AND dims['skill.name'] != '' GROUP BY k ORDER BY v DESC LIMIT 20`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['server_name'] AS k, count() AS v FROM hg_events FINAL
           WHERE ${inEvent("mcp_server_connection")} AND dims['server_name'] != '' GROUP BY k ORDER BY v DESC LIMIT 20`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['plugin.name'] AS k, count() AS v FROM hg_events FINAL
           WHERE ${inEvent("plugin")} AND dims['plugin.name'] != '' GROUP BY k ORDER BY v DESC LIMIT 20`,
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
      tools: tools.map((r) => ({
        tool: r.tool || "(unknown)",
        uses: num(r.uses),
        successRate: num(r.successRate),
        avgMs: num(r.avgMs),
      })),
      toolDecisions: toolDec.map((r) => ({
        tool: r.tool || "(unknown)",
        accept: num(r.accept),
        reject: num(r.reject),
        block: num(r.block),
      })),
      subagents: subagents.map((r) => ({ agentType: r.k || "(unknown)", uses: num(r.uses), tokens: num(r.tokens) })),
      costByEffort: costByEffort.map((r) => ({ effort: r.k || "(none)", cost: num(r.v) })),
      costByUser: costByUser.map((r) => ({ userHash: r.k, cost: num(r.v) })),
      activityByHour: activityByHour.map((r) => ({ hour: num(r.hour), requests: num(r.requests), cost: num(r.cost) })),
      skills: skills.map((r) => ({ name: r.k, count: num(r.v) })),
      mcpServers: mcps.map((r) => ({ name: r.k, count: num(r.v) })),
      plugins: plugins.map((r) => ({ name: r.k, count: num(r.v) })),
    };
  }

  async people(r: DateRange): Promise<PersonRow[]> {
    const p = { org: r.org, from: r.from, to: r.to };
    const where = "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    // Metric-name / subtype literals are hardcoded (not user input); merge with events in TS.
    const [metricRows, toolRows] = await Promise.all([
      this.ch.query<{ userHash: string; cost: number; tokens: number; linesAdded: number; sessions: number; lastActive: string }>(
        `SELECT user_hash AS userHash,
                sumIf(value, name = 'cost.usage') AS cost,
                sumIf(value, name = 'token.usage') AS tokens,
                sumIf(value, name = 'lines_of_code.count' AND subtype = 'added') AS linesAdded,
                uniqExact(session_id) AS sessions, toString(max(timestamp)) AS lastActive
         FROM hg_metrics FINAL WHERE ${where} GROUP BY user_hash`,
        p,
      ),
      this.ch.query<{ userHash: string; toolCalls: number }>(
        `SELECT user_hash AS userHash, count() AS toolCalls
         FROM hg_events FINAL WHERE ${where} AND event_type = 'tool_result' GROUP BY user_hash`,
        p,
      ),
    ]);
    const tools = new Map(toolRows.map((t) => [t.userHash, num(t.toolCalls)]));
    const seen = new Set<string>();
    const rows: PersonRow[] = metricRows.map((m) => {
      seen.add(m.userHash);
      return {
        userHash: m.userHash,
        cost: num(m.cost),
        tokens: num(m.tokens),
        sessions: num(m.sessions),
        toolCalls: tools.get(m.userHash) ?? 0,
        linesAdded: num(m.linesAdded),
        lastActive: String(m.lastActive),
      };
    });
    // Users with only tool events (no metrics) still count.
    for (const t of toolRows) {
      if (seen.has(t.userHash)) continue;
      rows.push({ userHash: t.userHash, cost: 0, tokens: 0, sessions: 0, toolCalls: num(t.toolCalls), linesAdded: 0, lastActive: "" });
    }
    return rows.sort((a, b) => b.cost - a.cost).slice(0, 500);
  }

  async personDetail(r: DateRange, userHash: string): Promise<PersonDetail> {
    // userHash is bound ({u:String}) — never interpolated.
    const p = { org: r.org, from: r.from, to: r.to, u: userHash };
    const metricsWhere =
      "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND user_hash = {u:String}";
    const eventsWhere = metricsWhere;
    const [costByDay, tokens, models, sessions, linesOfCode, tools, activityByHour] = await Promise.all([
      this.ch.query<{ day: string; v: number }>(
        `SELECT toString(event_date) AS day, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${metricsWhere} AND name = 'cost.usage' GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT subtype AS k, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${metricsWhere} AND name = 'token.usage' GROUP BY k ORDER BY v DESC`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT model AS k, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${metricsWhere} AND name = 'cost.usage' GROUP BY k ORDER BY v DESC`,
        p,
      ),
      this.ch.query<{ v: number }>(
        `SELECT uniqExact(session_id) AS v FROM hg_metrics FINAL WHERE ${metricsWhere}`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT subtype AS k, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${metricsWhere} AND name = 'lines_of_code.count' GROUP BY k ORDER BY v DESC`,
        p,
      ),
      this.ch.query<{ tool: string; uses: number; successRate: number; avgMs: number }>(
        `SELECT dims['tool_name'] AS tool, count() AS uses,
                countIf(dims['success'] = 'true') / count() AS successRate,
                avgIf(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS avgMs
         FROM hg_events FINAL WHERE ${eventsWhere} AND event_type = 'tool_result' AND dims['tool_name'] != ''
         GROUP BY tool ORDER BY uses DESC LIMIT 20`,
        p,
      ),
      this.ch.query<{ hour: number; requests: number; cost: number }>(
        `SELECT toHour(timestamp) AS hour, count() AS requests, sum(numbers['cost_usd']) AS cost
         FROM hg_events FINAL WHERE ${eventsWhere} AND event_type = 'api_request' GROUP BY hour ORDER BY hour`,
        p,
      ),
    ]);
    return {
      costByDay: costByDay.map((x) => ({ day: x.day, cost: num(x.v) })),
      tokens: tokens.map((x) => ({ tokenType: x.k || "(none)", tokens: num(x.v) })),
      models: models.map((x) => ({ model: x.k || "(unknown)", cost: num(x.v) })),
      tools: tools.map((x) => ({ tool: x.tool || "(unknown)", uses: num(x.uses), successRate: num(x.successRate), avgMs: num(x.avgMs) })),
      activityByHour: activityByHour.map((x) => ({ hour: num(x.hour), requests: num(x.requests), cost: num(x.cost) })),
      sessions: num(sessions[0]?.v),
      linesOfCode: linesOfCode.map((x) => ({ subtype: x.k || "(none)", lines: num(x.v) })),
    };
  }

  async modelDetail(r: DateRange, model: string): Promise<ModelDetail> {
    // model is a promoted column (not in attributes) — filter directly, bound as {m:String}.
    const p = { org: r.org, from: r.from, to: r.to, m: model };
    const where =
      "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND name = 'cost.usage' AND model = {m:String}";
    const [costByDay, tokensByType, topUsers, costBySource, costByEffort] = await Promise.all([
      this.ch.query<{ day: string; v: number }>(
        `SELECT toString(event_date) AS day, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${where} GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT subtype AS k, sum(value) AS v FROM hg_metrics FINAL
         WHERE org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}
           AND name = 'token.usage' AND model = {m:String} GROUP BY k ORDER BY v DESC`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT user_hash AS k, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${where} GROUP BY k ORDER BY v DESC LIMIT 10`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT query_source AS k, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${where} GROUP BY k ORDER BY v DESC`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT attributes['effort'] AS k, sum(value) AS v FROM hg_metrics FINAL
         WHERE ${where} GROUP BY k ORDER BY v DESC`,
        p,
      ),
    ]);
    return {
      costByDay: costByDay.map((x) => ({ day: x.day, cost: num(x.v) })),
      tokensByType: tokensByType.map((x) => ({ tokenType: x.k || "(none)", tokens: num(x.v) })),
      topUsers: topUsers.map((x) => ({ userHash: x.k, cost: num(x.v) })),
      costBySource: costBySource.map((x) => ({ source: x.k || "(main)", cost: num(x.v) })),
      costByEffort: costByEffort.map((x) => ({ effort: x.k || "(none)", cost: num(x.v) })),
    };
  }

  async toolDetail(r: DateRange, tool: string): Promise<ToolDetail> {
    // tool is bound ({t:String}) into the dims map lookup — never interpolated.
    const p = { org: r.org, from: r.from, to: r.to, t: tool };
    const where = "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    const [usesByDay, latency, decisions, topUsers] = await Promise.all([
      this.ch.query<{ day: string; uses: number; successRate: number }>(
        `SELECT toString(event_date) AS day, count() AS uses,
                countIf(dims['success'] = 'true') / count() AS successRate
         FROM hg_events FINAL WHERE ${where} AND event_type = 'tool_result' AND dims['tool_name'] = {t:String}
         GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      this.ch.query<{ avgMs: number; p95Ms: number }>(
        `SELECT avgIf(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS avgMs,
                quantileIf(0.95)(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS p95Ms
         FROM hg_events FINAL WHERE ${where} AND event_type = 'tool_result' AND dims['tool_name'] = {t:String}`,
        p,
      ),
      this.ch.query<{ accept: number; reject: number; block: number }>(
        `SELECT countIf(dims['decision'] = 'accept') AS accept, countIf(dims['decision'] = 'reject') AS reject,
                countIf(dims['decision'] = 'block') AS block
         FROM hg_events FINAL WHERE ${where} AND event_type = 'tool_decision' AND dims['tool_name'] = {t:String}`,
        p,
      ),
      this.ch.query<{ k: string; uses: number }>(
        `SELECT user_hash AS k, count() AS uses
         FROM hg_events FINAL WHERE ${where} AND event_type = 'tool_result' AND dims['tool_name'] = {t:String}
         GROUP BY k ORDER BY uses DESC LIMIT 10`,
        p,
      ),
    ]);
    return {
      usesByDay: usesByDay.map((x) => ({ day: x.day, uses: num(x.uses), successRate: num(x.successRate) })),
      latency: { avgMs: num(latency[0]?.avgMs), p95Ms: num(latency[0]?.p95Ms) },
      decisions: { accept: num(decisions[0]?.accept), reject: num(decisions[0]?.reject), block: num(decisions[0]?.block) },
      topUsers: topUsers.map((x) => ({ userHash: x.k, uses: num(x.uses) })),
    };
  }

  async agentDetail(r: DateRange, agentType: string): Promise<AgentDetail> {
    // agentType is bound ({a:String}) into the dims map lookup — never interpolated.
    const p = { org: r.org, from: r.from, to: r.to, a: agentType };
    const where =
      "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND mapContains(dims, 'agent_type') AND dims['agent_type'] = {a:String}";
    const [usesByDay, topUsers] = await Promise.all([
      this.ch.query<{ day: string; uses: number; tokens: number }>(
        `SELECT toString(event_date) AS day, count() AS uses, sum(numbers['total_tokens']) AS tokens
         FROM hg_events FINAL WHERE ${where} GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      this.ch.query<{ k: string; uses: number }>(
        `SELECT user_hash AS k, count() AS uses FROM hg_events FINAL
         WHERE ${where} GROUP BY k ORDER BY uses DESC LIMIT 10`,
        p,
      ),
    ]);
    return {
      usesByDay: usesByDay.map((x) => ({ day: x.day, uses: num(x.uses), tokens: num(x.tokens) })),
      topUsers: topUsers.map((x) => ({ userHash: x.k, uses: num(x.uses) })),
    };
  }

  async costTimeseries(r: DateRange): Promise<CostTimeseriesRow[]> {
    const p = { org: r.org, from: r.from, to: r.to };
    const rows = await this.ch.query<{ day: string; model: string; v: number }>(
      `SELECT toString(event_date) AS day, model AS model, sum(value) AS v FROM hg_metrics FINAL
       WHERE org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND name = 'cost.usage'
       GROUP BY event_date, model ORDER BY event_date`,
      p,
    );
    return rows.map((x) => ({ day: x.day, model: x.model || "(unknown)", cost: num(x.v) }));
  }

  // TODO(phase-6 backend agent): real membership-join SQL replaces these stubs.
  async teams(): Promise<TeamRow[]> {
    return [];
  }
  async teamDetail(): Promise<TeamDetail> {
    return { costByDay: [], members: [], models: [], tools: [] };
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
      tools: [],
      toolDecisions: [],
      subagents: [],
      costByEffort: [],
      costByUser: [],
      activityByHour: [],
      skills: [],
      mcpServers: [],
      plugins: [],
    };
  }
  async people(): Promise<PersonRow[]> {
    return [];
  }
  async personDetail(): Promise<PersonDetail> {
    return { costByDay: [], tokens: [], models: [], tools: [], activityByHour: [], sessions: 0, linesOfCode: [] };
  }
  async modelDetail(): Promise<ModelDetail> {
    return { costByDay: [], tokensByType: [], topUsers: [], costBySource: [], costByEffort: [] };
  }
  async toolDetail(): Promise<ToolDetail> {
    return { usesByDay: [], latency: { avgMs: 0, p95Ms: 0 }, decisions: { accept: 0, reject: 0, block: 0 }, topUsers: [] };
  }
  async agentDetail(): Promise<AgentDetail> {
    return { usesByDay: [], topUsers: [] };
  }
  async costTimeseries(): Promise<CostTimeseriesRow[]> {
    return [];
  }
  async teams(): Promise<TeamRow[]> {
    return [];
  }
  async teamDetail(): Promise<TeamDetail> {
    return { costByDay: [], members: [], models: [], tools: [] };
  }
}
