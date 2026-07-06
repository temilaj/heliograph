// Org-level landing page. Hierarchy: 4 hero KPIs, a strip of secondary
// metrics, then Spend / Tools & agents / When / Capabilities. Filters live in
// the URL; a change refetches while the previous render holds at reduced
// opacity. Drill-down links preserve the query string via useLocation().search.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchSummary, fetchCostTimeseries } from "../lib/api.ts";
import type { OrgSummary, CostTimeseriesRow } from "@heliograph/storage";
import { usd, int, num, compact, pct, truncHash } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  StatHeroGrid,
  StatStrip,
  BarList,
  Empty,
  type StatItem,
  type BarRow,
} from "../ui/index.ts";
import { CostTrendChart } from "../components/CostTrendChart.tsx";
import { ActivityHourChart } from "../components/ActivityHourChart.tsx";

const enc = encodeURIComponent;

export function Overview() {
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [trend, setTrend] = useState<CostTimeseriesRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchSummary(org, from, to), fetchCostTimeseries(org, from, to)])
      .then(([s, t]) => {
        if (!live) return;
        setSummary(s);
        setTrend(t);
      })
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to]);

  if (!org) {
    return (
      <Card>
        <Empty text="Select an org to see its overview." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="error">Failed to load overview: {error}</p>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <Empty text="Loading…" />
      </Card>
    );
  }

  const s = summary;
  const { heroes, strip } = kpis(s);

  // --- Spend breakdowns ---
  const costByModel: BarRow[] = s.cost.map((r) => ({
    key: r.model,
    label: r.model,
    value: r.cost,
    valueText: usd(r.cost),
    to: `/models/${enc(r.model)}`,
  }));
  const costBySource: BarRow[] = s.costBySource.map((r) => ({
    key: r.source,
    label: r.source,
    value: r.cost,
    valueText: usd(r.cost),
  }));
  const costByEffort: BarRow[] = s.costByEffort.map((r) => ({
    key: r.effort,
    label: r.effort,
    value: r.cost,
    valueText: usd(r.cost),
  }));
  const topUsers: BarRow[] = s.costByUser.map((r) => ({
    key: r.userHash,
    label: truncHash(r.userHash),
    title: r.userHash,
    value: r.cost,
    valueText: usd(r.cost),
    to: `/people/${enc(r.userHash)}`,
    mono: true,
  }));
  const tokensByType: BarRow[] = s.tokens.map((r) => ({
    key: r.tokenType,
    label: r.tokenType,
    value: r.tokens,
    valueText: compact(r.tokens),
    title: `${r.tokenType}: ${int(r.tokens)} tokens`,
  }));

  // --- Tools & agents ---
  const tools: BarRow[] = s.tools.map((t) => ({
    key: t.tool,
    label: t.tool,
    value: t.uses,
    valueText: `${int(t.uses)}× · ${pct(t.successRate * 100)} · ${num(t.avgMs)}ms`,
    to: `/tools/${enc(t.tool)}`,
  }));
  const toolDecisions: BarRow[] = s.toolDecisions.map((t) => ({
    key: t.tool,
    label: t.tool,
    value: t.accept + t.reject + t.block,
    valueText: `${int(t.accept)}✓ ${int(t.reject)}✕ ${int(t.block)}⊘`,
  }));
  const subagents: BarRow[] = s.subagents.map((a) => ({
    key: a.agentType,
    label: a.agentType,
    value: a.uses,
    valueText: `${int(a.uses)}× · ${compact(a.tokens)} tok`,
    title: `${a.agentType}: ${int(a.uses)} uses · ${int(a.tokens)} tokens`,
    to: `/agents/${enc(a.agentType)}`,
  }));
  const linesOfCode: BarRow[] = s.linesOfCode.map((r) => ({
    key: r.subtype,
    label: r.subtype,
    value: r.lines,
    valueText: compact(r.lines),
    title: `${r.subtype}: ${int(r.lines)} lines`,
  }));

  // --- Capabilities ---
  const countRows = (items: { name: string; count: number }[]): BarRow[] =>
    items.map((r) => ({ key: r.name, label: r.name, value: r.count, valueText: int(r.count) }));
  const pluginRows: BarRow[] = s.plugins.map((r) => ({
    key: r.name,
    label: r.name,
    value: r.count,
    valueText: int(r.count),
    to: `/capabilities/plugins/${enc(r.name)}`,
  }));
  const viewAll = (
    <Link className="card-sub" to={{ pathname: "/capabilities", search }}>
      View all ›
    </Link>
  );
  const sessionStarts: BarRow[] = s.sessionsByStart.map((r) => ({
    key: r.startType,
    label: r.startType,
    value: r.count,
    valueText: int(r.count),
  }));

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <StatHeroGrid stats={heroes} />
      <StatStrip stats={strip} />

      <Section title="Spend">
        <Card>
          <CardHeader title="Cost over time" sub="USD · by day" />
          <CostTrendChart rows={trend ?? []} />
        </Card>
        <Grid cols={3}>
          <Card>
            <CardHeader title="Cost by model" />
            <BarList rows={costByModel} search={search} />
          </Card>
          <Card>
            <CardHeader title="Cost by source" />
            <BarList rows={costBySource} search={search} />
          </Card>
          <Card>
            <CardHeader title="Cost by effort" />
            <BarList rows={costByEffort} search={search} />
          </Card>
          <Card>
            <CardHeader title="Top users by spend" />
            <BarList rows={topUsers} search={search} />
          </Card>
          <Card>
            <CardHeader title="Tokens by type" />
            <BarList rows={tokensByType} search={search} />
          </Card>
        </Grid>
      </Section>

      <Section title="Tools & agents">
        <Grid cols={3}>
          <Card>
            <CardHeader title="Top tools" sub="uses · success · latency" />
            <BarList rows={tools} search={search} />
          </Card>
          <Card>
            <CardHeader title="Tool decisions" sub="✓ accept · ✕ reject · ⊘ block" />
            <BarList rows={toolDecisions} search={search} />
          </Card>
          <Card>
            <CardHeader title="Subagents" sub="uses · tokens" />
            <BarList rows={subagents} search={search} />
          </Card>
          <Card>
            <CardHeader title="Lines of code" sub="added / removed" />
            <BarList rows={linesOfCode} search={search} />
          </Card>
        </Grid>
      </Section>

      <Section title="When">
        <Card>
          <CardHeader title="Activity by hour" sub="UTC · requests; cost on hover" />
          <ActivityHourChart rows={s.activityByHour} />
        </Card>
      </Section>

      <Section title="Capabilities">
        <Grid cols={3}>
          <Card>
            <CardHeader title="Skills" action={viewAll} />
            <BarList rows={countRows(s.skills)} search={search} />
          </Card>
          <Card>
            <CardHeader title="MCP servers" action={viewAll} />
            <BarList rows={countRows(s.mcpServers)} search={search} />
          </Card>
          <Card>
            <CardHeader title="Plugins" action={viewAll} />
            <BarList rows={pluginRows} search={search} />
          </Card>
          <Card>
            <CardHeader title="Session starts" />
            <BarList rows={sessionStarts} search={search} />
          </Card>
        </Grid>
      </Section>
    </div>
  );
}

// 4 hero KPIs + the secondary strip, matching the old dashboard's derivations.
function kpis(s: OrgSummary): { heroes: StatItem[]; strip: StatItem[] } {
  const totalCost = s.cost.reduce((a, c) => a + c.cost, 0);
  const totalTokens = s.tokens.reduce((a, t) => a + t.tokens, 0);
  const totalLines = s.linesOfCode.reduce((a, x) => a + x.lines, 0);
  const toolUses = s.tools.reduce((a, t) => a + t.uses, 0);
  const subagentRuns = s.subagents.reduce((a, x) => a + x.uses, 0);
  const activeMin = s.activeTime.reduce((a, x) => a + x.seconds, 0) / 60;
  const users = s.adoption.activeUsers;
  const sessions = s.adoption.sessions;

  const edits = s.edits.accept + s.edits.reject;
  const acceptRate = edits ? (100 * s.edits.accept) / edits : null;

  const tok = Object.fromEntries(s.tokens.map((t) => [t.tokenType, t.tokens]));
  const cacheRead = tok.cacheRead ?? 0;
  const cacheCreation = tok.cacheCreation ?? 0;
  const cacheDenom = cacheRead + cacheCreation;
  const cacheReuse = cacheDenom ? (100 * cacheRead) / cacheDenom : null;

  const errRate = s.reliability.apiRequests
    ? (100 * s.reliability.apiErrors) / s.reliability.apiRequests
    : 0;

  const heroes: StatItem[] = [
    {
      label: "Cost",
      value: usd(totalCost),
      sub: users ? `${usd(totalCost / users)} per active user` : undefined,
    },
    {
      label: "Tokens",
      value: compact(totalTokens),
      sub: `${int(totalTokens)} total`,
      title: `${int(totalTokens)} tokens`,
    },
    { label: "Active users", value: int(users), sub: "in selected range" },
    {
      label: "Sessions",
      value: int(sessions),
      sub: users ? `${num(sessions / users, 1)} per user` : undefined,
    },
  ];

  const strip: StatItem[] = [
    { label: "Tool calls", value: compact(toolUses), title: `${int(toolUses)} tool calls` },
    { label: "Subagent runs", value: int(subagentRuns) },
    { label: "Commits", value: int(s.commits) },
    { label: "Pull requests", value: int(s.pullRequests) },
    { label: "Lines of code", value: compact(totalLines), title: `${int(totalLines)} lines` },
    { label: "Active minutes", value: num(activeMin, 1) },
    { label: "Edit accept", value: acceptRate === null ? "—" : pct(acceptRate) },
    {
      label: "Cache reuse",
      value: cacheReuse === null ? "—" : pct(cacheReuse),
      title: "cacheRead / (cacheRead + cacheCreation)",
    },
    { label: "API errors", value: pct(errRate, 1) },
  ];

  return { heroes, strip };
}
