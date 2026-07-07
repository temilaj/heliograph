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

// One row per tool for the Models & Tools index — the full list, no teaser cap.
// tool_result aggregates (uses/success/latency/users) merged in TS with
// tool_decision counters (accept/reject/block). mcpServer is '' unless the
// adapter split a mcp__<server>__<tool> name into dims['mcp_server'].
export interface ToolsListRow {
  tool: string;
  mcpServer: string;
  uses: number;
  successRate: number;
  avgMs: number;
  p95Ms: number;
  users: number;
  accept: number;
  reject: number;
  block: number;
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

// --- capabilities (Phase 7). Plugins/hooks are dims/numbers-map reads on
// hg_events; mcpServers reads the mcp_server dim the adapter splits from
// mcp__<server>__<tool> tool names (accrues from new telemetry). ---
export interface PluginRow {
  name: string;
  version: string;
  marketplace: string;
  scope: string;
  enabledVia: string;
  hasHooks: boolean;
  hasMcp: boolean;
  skills: number; // bundled skill/command/agent path counts
  commands: number;
  agents: number;
  events: number;
}

export interface HookEventRow {
  hookEvent: string; // Stop / Notification / ...
  executions: number;
  hooks: number;
  success: number;
  blocking: number;
  cancelled: number;
  errors: number; // non-blocking errors
  avgMs: number;
}

export interface McpServerRow {
  server: string;
  calls: number;
  successRate: number;
  avgMs: number;
}

export interface CapabilitiesSummary {
  plugins: PluginRow[];
  hooks: HookEventRow[];
  hooksBySource: { source: string; count: number }[];
  mcp: {
    connections: number;
    avgConnectMs: number;
    pluginProvided: number;
    byTransport: { transport: string; count: number }[];
  };
  mcpServers: McpServerRow[];
  skills: { name: string; count: number }[];
  sessionStarts: { startType: string; count: number }[];
  autonomy: AutonomySummary;
}

// Permission-mode posture (permission_mode_changed events): how autonomously the
// org runs Claude Code and how often it switches modes.
export interface AutonomySummary {
  total: number; // total mode switches in range
  byMode: { mode: string; count: number }[]; // destination mode distribution
  transitions: { from: string; to: string; count: number }[];
  byTrigger: { trigger: string; count: number }[];
}

// --- reliability (Phase 8). API errors / refusals / retries-exhausted /
// internal errors. Error text is never surfaced — classify by status_code. ---
export interface ReliabilitySummary {
  totals: {
    apiRequests: number;
    apiErrors: number;
    refusals: number;
    retriesExhausted: number;
    internalErrors: number;
  };
  errorsByDay: { day: string; requests: number; errors: number }[];
  errorsByStatus: { status: string; count: number }[]; // http status_code bucket
  errorsByModel: { model: string; errors: number }[];
  refusalsByModel: { model: string; count: number }[];
  topUsers: { userHash: string; errors: number }[];
}

// --- agents list (Phase 8). Full subagent table, richer than the overview
// BarList. Keyed on the real CC agent.name attribute; empty until subagent
// telemetry (gated behind OTEL_LOG_TOOL_DETAILS=1) accrues. ---
export interface AgentsListRow {
  agentType: string;
  uses: number;
  tokens: number;
  toolUses: number;
  users: number;
}

export interface PluginDetail {
  info: PluginRow | null;
  versions: { version: string; count: number }[];
  users: { userHash: string; events: number }[];
  byDay: { day: string; events: number }[];
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
  /** Full per-tool list for the Models & Tools index (no teaser cap; ceiling 500). */
  toolsList(r: DateRange): Promise<ToolsListRow[]>;
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
  /** Capability adoption: plugins, hooks, MCP, skills, session starts, autonomy. */
  capabilities(r: DateRange): Promise<CapabilitiesSummary>;
  /** One plugin's info, version spread, adopters, timeline. */
  pluginDetail(r: DateRange, name: string): Promise<PluginDetail>;
  /** API reliability: errors / refusals / retries-exhausted / internal errors. */
  reliability(r: DateRange): Promise<ReliabilitySummary>;
  /** Full subagent-type table (uses, tokens, tool uses, users). */
  agentsList(r: DateRange): Promise<AgentsListRow[]>;
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
    const [tools, toolDec, subagents, subagentTokens, costByEffort, costByUser, activityByHour, skills, mcps, plugins] =
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
        // Subagents: real CC attributes runs to agent.name (api_request events); there
        // is no agent_type / subagent_completed event. uses = event count per agent.name.
        this.ch.query<{ k: string; uses: number }>(
          `SELECT dims['agent.name'] AS k, count() AS uses
           FROM hg_events FINAL WHERE ${eventsWhere} AND dims['agent.name'] != ''
           GROUP BY k ORDER BY uses DESC LIMIT 20`,
          p,
        ),
        // Subagent tokens live on token.usage; agent.name is unpromoted, so it's in the
        // attributes map. Merge into the events rows by agent.name in TS.
        this.ch.query<{ k: string; v: number }>(
          `SELECT attributes['agent.name'] AS k, sum(value) AS v FROM hg_metrics FINAL
           WHERE ${metricsWhere} AND name = 'token.usage' AND attributes['agent.name'] != '' GROUP BY k`,
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
      subagents: (() => {
        const tok = new Map(subagentTokens.map((s) => [s.k, num(s.v)]));
        return subagents.map((r) => ({ agentType: r.k || "(unknown)", uses: num(r.uses), tokens: tok.get(r.k) ?? 0 }));
      })(),
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

  async toolsList(r: DateRange): Promise<ToolsListRow[]> {
    const p = { org: r.org, from: r.from, to: r.to };
    const where = "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    // tool_result carries usage/latency/success/mcp_server; tool_decision carries
    // accept/reject/block. Aggregate each side, merge by tool in TS (people() pattern).
    const [resultRows, decRows] = await Promise.all([
      this.ch.query<{ tool: string; mcpServer: string; uses: number; successRate: number; avgMs: number; p95Ms: number; users: number }>(
        `SELECT dims['tool_name'] AS tool, any(dims['mcp_server']) AS mcpServer, count() AS uses,
                countIf(dims['success'] = 'true') / count() AS successRate,
                avgIf(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS avgMs,
                quantileIf(0.95)(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS p95Ms,
                uniqExact(user_hash) AS users
         FROM hg_events FINAL WHERE ${where} AND event_type = 'tool_result' AND dims['tool_name'] != ''
         GROUP BY tool ORDER BY uses DESC LIMIT 500`,
        p,
      ),
      this.ch.query<{ tool: string; accept: number; reject: number; block: number }>(
        `SELECT dims['tool_name'] AS tool, countIf(dims['decision'] = 'accept') AS accept,
                countIf(dims['decision'] = 'reject') AS reject, countIf(dims['decision'] = 'block') AS block
         FROM hg_events FINAL WHERE ${where} AND event_type = 'tool_decision' AND dims['tool_name'] != ''
         GROUP BY tool`,
        p,
      ),
    ]);
    const dec = new Map(decRows.map((d) => [d.tool, d]));
    const seen = new Set<string>();
    const rows: ToolsListRow[] = resultRows.map((t) => {
      seen.add(t.tool);
      const d = dec.get(t.tool);
      return {
        tool: t.tool || "(unknown)",
        mcpServer: t.mcpServer || "",
        uses: num(t.uses),
        successRate: num(t.successRate),
        avgMs: num(t.avgMs),
        p95Ms: num(t.p95Ms),
        users: num(t.users),
        accept: num(d?.accept),
        reject: num(d?.reject),
        block: num(d?.block),
      };
    });
    // Tools seen only in decisions (approved/blocked but no tool_result) still appear.
    for (const d of decRows) {
      if (seen.has(d.tool)) continue;
      rows.push({
        tool: d.tool || "(unknown)", mcpServer: "", uses: 0, successRate: 0, avgMs: 0, p95Ms: 0, users: 0,
        accept: num(d.accept), reject: num(d.reject), block: num(d.block),
      });
    }
    return rows.sort((a, b) => b.uses - a.uses).slice(0, 500);
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
    // agentType is the real CC agent.name attribute, bound ({a:String}) into the map
    // lookup — never interpolated. It's dims['agent.name'] on events, attributes['agent.name']
    // (unpromoted) on token.usage metrics.
    const p = { org: r.org, from: r.from, to: r.to, a: agentType };
    const eventsWhere =
      "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND dims['agent.name'] = {a:String}";
    const metricsWhere =
      "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND name = 'token.usage' AND attributes['agent.name'] = {a:String}";
    const [usesByDay, tokensByDay, topUsers] = await Promise.all([
      this.ch.query<{ day: string; uses: number }>(
        `SELECT toString(event_date) AS day, count() AS uses
         FROM hg_events FINAL WHERE ${eventsWhere} GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      // Tokens per day from the token.usage metric; merge into event days by day in TS.
      this.ch.query<{ day: string; v: number }>(
        `SELECT toString(event_date) AS day, sum(value) AS v
         FROM hg_metrics FINAL WHERE ${metricsWhere} GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      this.ch.query<{ k: string; uses: number }>(
        `SELECT user_hash AS k, count() AS uses FROM hg_events FINAL
         WHERE ${eventsWhere} GROUP BY k ORDER BY uses DESC LIMIT 10`,
        p,
      ),
    ]);
    const tok = new Map(tokensByDay.map((x) => [x.day, num(x.v)]));
    return {
      usesByDay: usesByDay.map((x) => ({ day: x.day, uses: num(x.uses), tokens: tok.get(x.day) ?? 0 })),
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

  async teams(r: DateRange): Promise<TeamRow[]> {
    const p = { org: r.org, from: r.from, to: r.to };
    const where = "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    // ANY LEFT JOIN membership (FINAL) on user_hash; unmatched users bucket as "(unassigned)".
    const join =
      "ANY LEFT JOIN (SELECT account_hash, team FROM hg_team_membership FINAL WHERE org_id = {org:String}) tm ON user_hash = tm.account_hash";
    const teamExpr = "if(tm.team != '', tm.team, '(unassigned)')";
    // Metric-name literals are hardcoded (not user input); merge with events in TS.
    const [metricRows, toolRows] = await Promise.all([
      this.ch.query<{ team: string; members: number; cost: number; tokens: number; sessions: number }>(
        `SELECT ${teamExpr} AS team, uniqExact(user_hash) AS members,
                sumIf(value, name = 'cost.usage') AS cost,
                sumIf(value, name = 'token.usage') AS tokens,
                uniqExact(session_id) AS sessions
         FROM hg_metrics FINAL ${join}
         WHERE ${where} GROUP BY team ORDER BY cost DESC`,
        p,
      ),
      this.ch.query<{ team: string; toolCalls: number }>(
        `SELECT ${teamExpr} AS team, count() AS toolCalls
         FROM hg_events FINAL ${join}
         WHERE ${where} AND event_type = 'tool_result' GROUP BY team`,
        p,
      ),
    ]);
    const tools = new Map(toolRows.map((t) => [t.team, num(t.toolCalls)]));
    const seen = new Set<string>();
    const rows: TeamRow[] = metricRows.map((m) => {
      seen.add(m.team);
      return {
        team: m.team,
        members: num(m.members),
        cost: num(m.cost),
        tokens: num(m.tokens),
        sessions: num(m.sessions),
        toolCalls: tools.get(m.team) ?? 0,
      };
    });
    // Teams with only tool events (no metrics) still count.
    for (const t of toolRows) {
      if (seen.has(t.team)) continue;
      rows.push({ team: t.team, members: 0, cost: 0, tokens: 0, sessions: 0, toolCalls: num(t.toolCalls) });
    }
    return rows.sort((a, b) => b.cost - a.cost);
  }

  async teamDetail(r: DateRange, team: string): Promise<TeamDetail> {
    // team is bound ({t:String}) — "(unassigned)" works as a value, never interpolated.
    const p = { org: r.org, from: r.from, to: r.to, t: team };
    const join =
      "ANY LEFT JOIN (SELECT account_hash, team FROM hg_team_membership FINAL WHERE org_id = {org:String}) tm ON user_hash = tm.account_hash";
    const teamExpr = "if(tm.team != '', tm.team, '(unassigned)')";
    const where = `org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND ${teamExpr} = {t:String}`;
    const [costByDay, members, models, tools] = await Promise.all([
      this.ch.query<{ day: string; v: number }>(
        `SELECT toString(event_date) AS day, sum(value) AS v FROM hg_metrics FINAL ${join}
         WHERE ${where} AND name = 'cost.usage' GROUP BY event_date ORDER BY event_date`,
        p,
      ),
      this.ch.query<{ userHash: string; cost: number; tokens: number; sessions: number }>(
        `SELECT user_hash AS userHash,
                sumIf(value, name = 'cost.usage') AS cost,
                sumIf(value, name = 'token.usage') AS tokens,
                uniqExact(session_id) AS sessions
         FROM hg_metrics FINAL ${join}
         WHERE ${where} GROUP BY userHash ORDER BY cost DESC LIMIT 100`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT model AS k, sum(value) AS v FROM hg_metrics FINAL ${join}
         WHERE ${where} AND name = 'cost.usage' GROUP BY k ORDER BY v DESC`,
        p,
      ),
      this.ch.query<{ tool: string; uses: number; successRate: number; avgMs: number }>(
        `SELECT dims['tool_name'] AS tool, count() AS uses,
                countIf(dims['success'] = 'true') / count() AS successRate,
                avgIf(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS avgMs
         FROM hg_events FINAL ${join}
         WHERE ${where} AND event_type = 'tool_result' AND dims['tool_name'] != ''
         GROUP BY tool ORDER BY uses DESC LIMIT 20`,
        p,
      ),
    ]);
    return {
      costByDay: costByDay.map((x) => ({ day: x.day, cost: num(x.v) })),
      members: members.map((x) => ({ userHash: x.userHash, cost: num(x.cost), tokens: num(x.tokens), sessions: num(x.sessions) })),
      models: models.map((x) => ({ model: x.k || "(unknown)", cost: num(x.v) })),
      tools: tools.map((x) => ({ tool: x.tool || "(unknown)", uses: num(x.uses), successRate: num(x.successRate), avgMs: num(x.avgMs) })),
    };
  }

  async capabilities(r: DateRange): Promise<CapabilitiesSummary> {
    const p = { org: r.org, from: r.from, to: r.to };
    const where = "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    // event_type literals are hardcoded (not user input).
    const inEvent = (et: string) => `${where} AND event_type = '${et}'`;

    const [
      plugins,
      hooks,
      hooksBySource,
      mcp,
      mcpByTransport,
      mcpServers,
      skills,
      sessionStarts,
      autoTotal,
      autoByMode,
      autoTransitions,
      autoByTrigger,
    ] = await Promise.all([
        // Plugins: one row per plugin.name; flags fold has_hooks/has_mcp string dims to bool,
        // bundle counts read the per-install path counts.
        this.ch.query<{
          name: string;
          version: string;
          marketplace: string;
          scope: string;
          enabledVia: string;
          hasHooks: number;
          hasMcp: number;
          skills: number;
          commands: number;
          agents: number;
          events: number;
        }>(
          `SELECT dims['plugin.name'] AS name,
                  any(dims['plugin.version']) AS version,
                  any(dims['marketplace.name']) AS marketplace,
                  any(dims['plugin.scope']) AS scope,
                  any(dims['enabled_via']) AS enabledVia,
                  any(dims['has_hooks']) = 'true' AS hasHooks,
                  any(dims['has_mcp']) = 'true' AS hasMcp,
                  max(numbers['skill_path_count']) AS skills,
                  max(numbers['command_path_count']) AS commands,
                  max(numbers['agent_path_count']) AS agents,
                  count() AS events
           FROM hg_events FINAL WHERE ${inEvent("plugin")} AND dims['plugin.name'] != ''
           GROUP BY name ORDER BY events DESC`,
          p,
        ),
        // Hooks: per hook_event executions + summed outcome counters + avg total duration.
        this.ch.query<{
          hookEvent: string;
          executions: number;
          hooks: number;
          success: number;
          blocking: number;
          cancelled: number;
          errors: number;
          avgMs: number;
        }>(
          `SELECT dims['hook_event'] AS hookEvent, count() AS executions,
                  sum(numbers['num_hooks']) AS hooks,
                  sum(numbers['num_success']) AS success,
                  sum(numbers['num_blocking']) AS blocking,
                  sum(numbers['num_cancelled']) AS cancelled,
                  sum(numbers['num_non_blocking_error']) AS errors,
                  avgIf(numbers['total_duration_ms'], mapContains(numbers, 'total_duration_ms')) AS avgMs
           FROM hg_events FINAL WHERE ${inEvent("hook")}
           GROUP BY hookEvent ORDER BY executions DESC`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['hook_source'] AS k, count() AS v
           FROM hg_events FINAL WHERE ${inEvent("hook")} GROUP BY k ORDER BY v DESC`,
          p,
        ),
        // MCP connections (thin — no server name; that accrues on tool_result via the adapter split).
        this.ch.query<{ connections: number; avgConnectMs: number; pluginProvided: number }>(
          `SELECT count() AS connections,
                  avgIf(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS avgConnectMs,
                  countIf(dims['is_plugin'] = 'true') AS pluginProvided
           FROM hg_events FINAL WHERE ${inEvent("mcp_server_connection")}`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['transport_type'] AS k, count() AS v
           FROM hg_events FINAL WHERE ${inEvent("mcp_server_connection")} GROUP BY k ORDER BY v DESC`,
          p,
        ),
        // Per-server MCP usage from the mcp_server dim the adapter splits off tool names.
        this.ch.query<{ server: string; calls: number; successRate: number; avgMs: number }>(
          `SELECT dims['mcp_server'] AS server, count() AS calls,
                  countIf(dims['success'] = 'true') / count() AS successRate,
                  avgIf(numbers['duration_ms'], mapContains(numbers, 'duration_ms')) AS avgMs
           FROM hg_events FINAL WHERE ${inEvent("tool_result")} AND dims['mcp_server'] != ''
           GROUP BY server ORDER BY calls DESC LIMIT 20`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['skill.name'] AS k, count() AS v FROM hg_events FINAL
           WHERE ${inEvent("skill_activated")} AND dims['skill.name'] != '' GROUP BY k ORDER BY v DESC LIMIT 20`,
          p,
        ),
        // session.count: prefer the promoted start_type column, fall back to attributes map.
        this.ch.query<{ k: string; v: number }>(
          `SELECT if(start_type != '', start_type, attributes['start_type']) AS k, sum(value) AS v
           FROM hg_metrics FINAL WHERE ${where} AND name = 'session.count' GROUP BY k ORDER BY v DESC`,
          p,
        ),
        // Autonomy: permission_mode_changed posture — total switches, destination-mode
        // distribution, from→to transitions, and what triggered each switch.
        this.ch.query<{ v: number }>(
          `SELECT count() AS v FROM hg_events FINAL WHERE ${inEvent("permission_mode_changed")}`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['to_mode'] AS k, count() AS v FROM hg_events FINAL
           WHERE ${inEvent("permission_mode_changed")} GROUP BY k ORDER BY v DESC`,
          p,
        ),
        this.ch.query<{ from: string; to: string; v: number }>(
          `SELECT dims['from_mode'] AS from, dims['to_mode'] AS to, count() AS v FROM hg_events FINAL
           WHERE ${inEvent("permission_mode_changed")} GROUP BY from, to ORDER BY v DESC`,
          p,
        ),
        this.ch.query<{ k: string; v: number }>(
          `SELECT dims['trigger'] AS k, count() AS v FROM hg_events FINAL
           WHERE ${inEvent("permission_mode_changed")} GROUP BY k ORDER BY v DESC`,
          p,
        ),
      ]);

    return {
      plugins: plugins.map((x) => ({
        name: x.name,
        version: x.version || "",
        marketplace: x.marketplace || "",
        scope: x.scope || "",
        enabledVia: x.enabledVia || "",
        hasHooks: num(x.hasHooks) === 1,
        hasMcp: num(x.hasMcp) === 1,
        skills: num(x.skills),
        commands: num(x.commands),
        agents: num(x.agents),
        events: num(x.events),
      })),
      hooks: hooks.map((x) => ({
        hookEvent: x.hookEvent || "(none)",
        executions: num(x.executions),
        hooks: num(x.hooks),
        success: num(x.success),
        blocking: num(x.blocking),
        cancelled: num(x.cancelled),
        errors: num(x.errors),
        avgMs: num(x.avgMs),
      })),
      hooksBySource: hooksBySource.map((x) => ({ source: x.k || "(none)", count: num(x.v) })),
      mcp: {
        connections: num(mcp[0]?.connections),
        avgConnectMs: num(mcp[0]?.avgConnectMs),
        pluginProvided: num(mcp[0]?.pluginProvided),
        byTransport: mcpByTransport.map((x) => ({ transport: x.k || "(none)", count: num(x.v) })),
      },
      mcpServers: mcpServers.map((x) => ({
        server: x.server,
        calls: num(x.calls),
        successRate: num(x.successRate),
        avgMs: num(x.avgMs),
      })),
      skills: skills.map((x) => ({ name: x.k, count: num(x.v) })),
      sessionStarts: sessionStarts.map((x) => ({ startType: x.k || "(none)", count: num(x.v) })),
      autonomy: {
        total: num(autoTotal[0]?.v),
        byMode: autoByMode.map((x) => ({ mode: x.k || "(none)", count: num(x.v) })),
        transitions: autoTransitions.map((x) => ({ from: x.from || "(none)", to: x.to || "(none)", count: num(x.v) })),
        byTrigger: autoByTrigger.map((x) => ({ trigger: x.k || "(none)", count: num(x.v) })),
      },
    };
  }

  async pluginDetail(r: DateRange, name: string): Promise<PluginDetail> {
    // name is bound ({n:String}) into the dims map lookup — never interpolated.
    const p = { org: r.org, from: r.from, to: r.to, n: name };
    const where =
      "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date} AND event_type = 'plugin' AND dims['plugin.name'] = {n:String}";
    const [info, versions, users, byDay] = await Promise.all([
      // Single grouped aggregate (same shape as the plugins list); count() = 0 => not seen in range.
      this.ch.query<{
        version: string;
        marketplace: string;
        scope: string;
        enabledVia: string;
        hasHooks: number;
        hasMcp: number;
        skills: number;
        commands: number;
        agents: number;
        events: number;
      }>(
        `SELECT any(dims['plugin.version']) AS version,
                any(dims['marketplace.name']) AS marketplace,
                any(dims['plugin.scope']) AS scope,
                any(dims['enabled_via']) AS enabledVia,
                any(dims['has_hooks']) = 'true' AS hasHooks,
                any(dims['has_mcp']) = 'true' AS hasMcp,
                max(numbers['skill_path_count']) AS skills,
                max(numbers['command_path_count']) AS commands,
                max(numbers['agent_path_count']) AS agents,
                count() AS events
         FROM hg_events FINAL WHERE ${where}`,
        p,
      ),
      this.ch.query<{ k: string; v: number }>(
        `SELECT dims['plugin.version'] AS k, count() AS v FROM hg_events FINAL
         WHERE ${where} AND dims['plugin.version'] != '' GROUP BY k ORDER BY v DESC`,
        p,
      ),
      this.ch.query<{ userHash: string; events: number }>(
        `SELECT user_hash AS userHash, count() AS events FROM hg_events FINAL
         WHERE ${where} GROUP BY userHash ORDER BY events DESC LIMIT 20`,
        p,
      ),
      this.ch.query<{ day: string; v: number }>(
        `SELECT toString(event_date) AS day, count() AS v FROM hg_events FINAL
         WHERE ${where} GROUP BY event_date ORDER BY event_date`,
        p,
      ),
    ]);
    const row = info[0];
    const infoRow: PluginRow | null =
      row && num(row.events) > 0
        ? {
            name,
            version: row.version || "",
            marketplace: row.marketplace || "",
            scope: row.scope || "",
            enabledVia: row.enabledVia || "",
            hasHooks: num(row.hasHooks) === 1,
            hasMcp: num(row.hasMcp) === 1,
            skills: num(row.skills),
            commands: num(row.commands),
            agents: num(row.agents),
            events: num(row.events),
          }
        : null;
    return {
      info: infoRow,
      versions: versions.map((x) => ({ version: x.k || "(none)", count: num(x.v) })),
      users: users.map((x) => ({ userHash: x.userHash, events: num(x.events) })),
      byDay: byDay.map((x) => ({ day: x.day, events: num(x.v) })),
    };
  }

  async reliability(r: DateRange): Promise<ReliabilitySummary> {
    const p = { org: r.org, from: r.from, to: r.to };
    const where = "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    // Classify errors by HTTP status_code only — dims['error'] free text is NEVER selected.
    // status_code lives in the numbers map (mapContains guard); bucket by its integer string.
    const statusBucket = "if(mapContains(numbers, 'status_code'), toString(toInt32(numbers['status_code'])), '(none)')";
    const [totals, errorsByDay, errorsByStatus, errorsByModel, refusalsByModel, topUsers] =
      await Promise.all([
        this.ch.query<{
          apiRequests: number;
          apiErrors: number;
          refusals: number;
          retriesExhausted: number;
          internalErrors: number;
        }>(
          `SELECT countIf(event_type = 'api_request') AS apiRequests,
                  countIf(event_type = 'api_error') AS apiErrors,
                  countIf(event_type = 'api_refusal') AS refusals,
                  countIf(event_type = 'api_retries_exhausted') AS retriesExhausted,
                  countIf(event_type = 'internal_error') AS internalErrors
           FROM hg_events FINAL WHERE ${where}`,
          p,
        ),
        this.ch.query<{ day: string; requests: number; errors: number }>(
          `SELECT toString(event_date) AS day,
                  countIf(event_type = 'api_request') AS requests,
                  countIf(event_type = 'api_error') AS errors
           FROM hg_events FINAL WHERE ${where} GROUP BY event_date ORDER BY event_date`,
          p,
        ),
        this.ch.query<{ status: string; count: number }>(
          `SELECT ${statusBucket} AS status, count() AS count
           FROM hg_events FINAL WHERE ${where} AND event_type = 'api_error'
           GROUP BY status ORDER BY count DESC`,
          p,
        ),
        this.ch.query<{ model: string; errors: number }>(
          `SELECT dims['model'] AS model, count() AS errors
           FROM hg_events FINAL WHERE ${where} AND event_type = 'api_error'
           GROUP BY model ORDER BY errors DESC`,
          p,
        ),
        this.ch.query<{ model: string; count: number }>(
          `SELECT dims['model'] AS model, count() AS count
           FROM hg_events FINAL WHERE ${where} AND event_type = 'api_refusal'
           GROUP BY model ORDER BY count DESC`,
          p,
        ),
        this.ch.query<{ userHash: string; errors: number }>(
          `SELECT user_hash AS userHash, count() AS errors
           FROM hg_events FINAL WHERE ${where} AND event_type = 'api_error'
           GROUP BY userHash ORDER BY errors DESC LIMIT 10`,
          p,
        ),
      ]);
    return {
      totals: {
        apiRequests: num(totals[0]?.apiRequests),
        apiErrors: num(totals[0]?.apiErrors),
        refusals: num(totals[0]?.refusals),
        retriesExhausted: num(totals[0]?.retriesExhausted),
        internalErrors: num(totals[0]?.internalErrors),
      },
      errorsByDay: errorsByDay.map((x) => ({ day: x.day, requests: num(x.requests), errors: num(x.errors) })),
      errorsByStatus: errorsByStatus.map((x) => ({ status: x.status || "(none)", count: num(x.count) })),
      errorsByModel: errorsByModel.map((x) => ({ model: x.model || "(unknown)", errors: num(x.errors) })),
      refusalsByModel: refusalsByModel.map((x) => ({ model: x.model || "(unknown)", count: num(x.count) })),
      topUsers: topUsers.map((x) => ({ userHash: x.userHash, errors: num(x.errors) })),
    };
  }

  async agentsList(r: DateRange): Promise<AgentsListRow[]> {
    const p = { org: r.org, from: r.from, to: r.to };
    const where = "org_id = {org:String} AND event_date BETWEEN {from:Date} AND {to:Date}";
    // Real CC attributes subagents via agent.name: uses/users from events (dims['agent.name']),
    // tokens from the token.usage metric (attributes['agent.name'], unpromoted). Merge by agent.name.
    const [eventRows, tokenRows] = await Promise.all([
      this.ch.query<{ agentType: string; uses: number; users: number }>(
        `SELECT dims['agent.name'] AS agentType, count() AS uses, uniqExact(user_hash) AS users
         FROM hg_events FINAL
         WHERE ${where} AND dims['agent.name'] != ''
         GROUP BY agentType ORDER BY uses DESC LIMIT 200`,
        p,
      ),
      this.ch.query<{ agentType: string; tokens: number }>(
        `SELECT attributes['agent.name'] AS agentType, sum(value) AS tokens FROM hg_metrics FINAL
         WHERE ${where} AND name = 'token.usage' AND attributes['agent.name'] != '' GROUP BY agentType`,
        p,
      ),
    ]);
    const tok = new Map(tokenRows.map((t) => [t.agentType, num(t.tokens)]));
    return eventRows.map((x) => ({
      agentType: x.agentType,
      uses: num(x.uses),
      tokens: tok.get(x.agentType) ?? 0,
      // No real CC source: toolUses came from loadgen's total_tool_uses. 0 until CC exposes it.
      toolUses: 0,
      users: num(x.users),
    }));
  }
}

function emptyAutonomy(): AutonomySummary {
  return { total: 0, byMode: [], transitions: [], byTrigger: [] };
}

function emptyCapabilities(): CapabilitiesSummary {
  return {
    plugins: [],
    hooks: [],
    hooksBySource: [],
    mcp: { connections: 0, avgConnectMs: 0, pluginProvided: 0, byTransport: [] },
    mcpServers: [],
    skills: [],
    sessionStarts: [],
    autonomy: emptyAutonomy(),
  };
}

function emptyReliability(): ReliabilitySummary {
  return {
    totals: { apiRequests: 0, apiErrors: 0, refusals: 0, retriesExhausted: 0, internalErrors: 0 },
    errorsByDay: [],
    errorsByStatus: [],
    errorsByModel: [],
    refusalsByModel: [],
    topUsers: [],
  };
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
  async toolsList(): Promise<ToolsListRow[]> {
    return [];
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
  async capabilities(): Promise<CapabilitiesSummary> {
    return emptyCapabilities();
  }
  async reliability(): Promise<ReliabilitySummary> {
    return emptyReliability();
  }
  async agentsList(): Promise<AgentsListRow[]> {
    return [];
  }
  async pluginDetail(): Promise<PluginDetail> {
    return { info: null, versions: [], users: [], byDay: [] };
  }
}
