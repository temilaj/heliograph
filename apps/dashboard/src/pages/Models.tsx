// Models & Tools index. The nav link lands here. Tools are the data-rich
// dimension, so they get the spotlight: a StatStrip of tool-usage insights over
// a full, sortable table of EVERY tool (no teaser cap) — each row links into its
// detail page. Models (by spend) and Subagents (by runs) keep their ranked
// BarLists. Filters live in the URL; a change refetches while the previous
// render holds at reduced opacity.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchSummary, fetchToolsList, fetchAgentsList } from "../lib/api.ts";
import type { OrgSummary, ToolsListRow, AgentsListRow } from "@heliograph/storage";
import { usd, int, num, compact, pct } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  BarList,
  DataTable,
  StatStrip,
  EmptyPage,
  PageHeader,
  type BarRow,
  type StatItem,
  type Column,
} from "../ui/index.ts";

const enc = encodeURIComponent;

// Full tool table. Text left, numbers right + sortable. Decision-only tools have
// uses 0 — show "—" for the usage-derived cells so a real 0 isn't implied.
const toolColumns: Column<ToolsListRow>[] = [
  {
    key: "tool",
    header: "Tool",
    render: (t) => t.tool,
    sortValue: (t) => t.tool,
  },
  {
    key: "mcpServer",
    header: "MCP server",
    render: (t) => (t.mcpServer ? t.mcpServer : "—"),
    sortValue: (t) => t.mcpServer,
  },
  {
    key: "uses",
    header: "Uses",
    render: (t) => int(t.uses),
    sortValue: (t) => t.uses,
    align: "right",
  },
  {
    key: "successRate",
    header: "Success",
    render: (t) => (t.uses ? pct(t.successRate * 100, 1) : "—"),
    sortValue: (t) => t.successRate,
    align: "right",
  },
  {
    key: "avgMs",
    header: "Avg ms",
    render: (t) => (t.uses ? num(t.avgMs) : "—"),
    sortValue: (t) => t.avgMs,
    align: "right",
  },
  {
    key: "p95Ms",
    header: "p95 ms",
    render: (t) => (t.uses ? num(t.p95Ms) : "—"),
    sortValue: (t) => t.p95Ms,
    align: "right",
  },
  {
    key: "users",
    header: "Users",
    render: (t) => (t.uses ? int(t.users) : "—"),
    sortValue: (t) => t.users,
    align: "right",
  },
  {
    key: "decisions",
    header: "Decisions",
    render: (t) => `✓ ${int(t.accept)}  ✕ ${int(t.reject)}  ⊘ ${int(t.block)}`,
    title: (t) => `${int(t.accept)} accepted · ${int(t.reject)} rejected · ${int(t.block)} blocked`,
    sortValue: (t) => t.accept + t.reject + t.block,
    align: "right",
  },
];

// Full subagent-type table. Text left, numbers right + sortable. Empty until
// subagent telemetry (agent_type dim) accrues; each row links to its detail page.
const agentColumns: Column<AgentsListRow>[] = [
  {
    key: "agentType",
    header: "Agent type",
    render: (a) => a.agentType,
    sortValue: (a) => a.agentType,
  },
  {
    key: "uses",
    header: "Uses",
    render: (a) => int(a.uses),
    sortValue: (a) => a.uses,
    align: "right",
  },
  {
    key: "tokens",
    header: "Tokens",
    render: (a) => compact(a.tokens),
    title: (a) => `${int(a.tokens)} tokens`,
    sortValue: (a) => a.tokens,
    align: "right",
  },
  {
    key: "toolUses",
    header: "Tool uses",
    render: (a) => int(a.toolUses),
    sortValue: (a) => a.toolUses,
    align: "right",
  },
  {
    key: "users",
    header: "Users",
    render: (a) => int(a.users),
    sortValue: (a) => a.users,
    align: "right",
  },
];

export function Models() {
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [tools, setTools] = useState<ToolsListRow[] | null>(null);
  const [agents, setAgents] = useState<AgentsListRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchSummary(org, from, to),
      fetchToolsList(org, from, to),
      fetchAgentsList(org, from, to),
    ])
      .then(([s, t, a]) => {
        if (!live) return;
        setSummary(s);
        setTools(t);
        setAgents(a);
      })
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to]);

  if (!org) return <EmptyPage title="Select an org" note="Choose an org to browse agents & tools." />;
  if (error)
    return (
      <Card>
        <p className="error">Failed to load agents & tools: {error}</p>
      </Card>
    );
  if (!summary || !tools || !agents) return <EmptyPage title="Loading…" />;

  const s = summary;
  const models: BarRow[] = s.cost.map((r) => ({
    key: r.model,
    label: r.model,
    value: r.cost,
    valueText: usd(r.cost),
    to: `/models/${enc(r.model)}`,
  }));

  const toolStats = toolInsights(tools);

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader title="Agents & Tools" meta="Spend and usage across the selected range" />
      <StatStrip stats={toolStats} />
      <Section title="Tools" sub={`${int(tools.length)} tools · sortable`}>
        <Card>
          <CardHeader title="All tools" sub="uses · success · latency · decisions" />
          <DataTable
            columns={toolColumns}
            rows={tools}
            rowKey={(t) => t.tool}
            rowLink={(t) => `/tools/${enc(t.tool)}`}
            search={search}
            initialSort="uses"
            emptyText="No tool activity in range"
          />
        </Card>
      </Section>
      <Section title="Subagents" sub={`${int(agents.length)} agent types · sortable`}>
        <Card>
          <CardHeader title="All subagents" sub="uses · tokens · tool uses · users" />
          <DataTable
            columns={agentColumns}
            rows={agents}
            rowKey={(a) => a.agentType}
            rowLink={(a) => `/agents/${enc(a.agentType)}`}
            search={search}
            initialSort="uses"
            emptyText="No subagent activity in range — accrues as subagent telemetry arrives"
          />
        </Card>
      </Section>
      <Section title="Models">
        <Card>
          <CardHeader title="Models" sub="cost" />
          <BarList rows={models} search={search} />
        </Card>
      </Section>
    </div>
  );
}

// Tool-usage insights — every stat is backed by real tool_result / tool_decision
// data. MCP share reads dims['mcp_server'] (0% until split MCP telemetry accrues).
function toolInsights(tools: ToolsListRow[]): StatItem[] {
  const calls = tools.reduce((a, t) => a + t.uses, 0);
  const successes = tools.reduce((a, t) => a + t.uses * t.successRate, 0);
  const rejBlock = tools.reduce((a, t) => a + t.reject + t.block, 0);
  const mcpCalls = tools.reduce((a, t) => a + (t.mcpServer ? t.uses : 0), 0);
  return [
    { label: "Tool calls", value: compact(calls), title: `${int(calls)} tool calls` },
    { label: "Distinct tools", value: int(tools.length) },
    {
      label: "Success rate",
      value: calls ? pct((100 * successes) / calls, 1) : "—",
      title: "successful calls / total calls",
    },
    {
      label: "Rejected / blocked",
      value: int(rejBlock),
      title: "tool_decision reject + block counts",
    },
    {
      label: "MCP share",
      value: calls ? pct((100 * mcpCalls) / calls, 1) : "—",
      title: "share of calls to mcp__<server>__<tool> tools",
    },
  ];
}
