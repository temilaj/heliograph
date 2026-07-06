// Per-team detail — usage rolled up by membership, one level above the person.
// Hero KPIs, then Spend (trend + model mix + member table) and Tools. Filters
// live in the URL; a change refetches while the previous render holds at reduced
// opacity. Internal links (members, models, tools) carry the active query string.
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchTeamDetail } from "../lib/api.ts";
import type { TeamDetail as TeamDetailData, CostTimeseriesRow } from "@heliograph/storage";
import { usd, int, num, compact, pct, truncHash } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  StatHeroGrid,
  BarList,
  DataTable,
  Empty,
  PageHeader,
  type StatItem,
  type BarRow,
  type Column,
} from "../ui/index.ts";
import { CostTrendChart } from "../components/CostTrendChart.tsx";

const enc = encodeURIComponent;

type Member = TeamDetailData["members"][number];

const memberColumns: Column<Member>[] = [
  {
    key: "user",
    header: "User",
    render: (r) => <span className="mono">{truncHash(r.userHash)}</span>,
    title: (r) => r.userHash,
    sortValue: (r) => r.userHash,
  },
  {
    key: "cost",
    header: "Cost",
    render: (r) => usd(r.cost),
    sortValue: (r) => r.cost,
    align: "right",
  },
  {
    key: "tokens",
    header: "Tokens",
    render: (r) => compact(r.tokens),
    title: (r) => `${int(r.tokens)} tokens`,
    sortValue: (r) => r.tokens,
    align: "right",
  },
  {
    key: "sessions",
    header: "Sessions",
    render: (r) => int(r.sessions),
    sortValue: (r) => r.sessions,
    align: "right",
  },
];

export function TeamDetail() {
  const { team: raw } = useParams();
  const team = raw ? decodeURIComponent(raw) : "";
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [detail, setDetail] = useState<TeamDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org || !team) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchTeamDetail(org, from, to, team)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to, team]);

  const header = (meta?: string) => (
    <PageHeader kicker="Teams" kickerTo="/teams" search={search} title={team} meta={meta} />
  );

  if (!org) {
    return (
      <Card>
        <Empty text="Select an org to see this team." />
      </Card>
    );
  }

  if (error) {
    return (
      <>
        {header()}
        <Card>
          <p className="error">Failed to load team: {error}</p>
        </Card>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        {header()}
        <Card>
          <Empty text="Loading…" />
        </Card>
      </>
    );
  }

  const d = detail;

  // --- hero KPIs ---
  const totalCost = d.costByDay.reduce((a, r) => a + r.cost, 0);
  const totalTokens = d.members.reduce((a, m) => a + m.tokens, 0);
  const totalSessions = d.members.reduce((a, m) => a + m.sessions, 0);
  const heroes: StatItem[] = [
    { label: "Cost", value: usd(totalCost) },
    {
      label: "Tokens",
      value: compact(totalTokens),
      sub: `${int(totalTokens)} total`,
      title: `${int(totalTokens)} tokens`,
    },
    { label: "Members", value: int(d.members.length) },
    { label: "Sessions", value: int(totalSessions) },
  ];

  // --- Spend ---
  const trend: CostTimeseriesRow[] = d.costByDay.map((r) => ({
    day: r.day,
    model: "cost",
    cost: r.cost,
  }));
  const costByModel: BarRow[] = d.models.map((r) => ({
    key: r.model,
    label: r.model,
    value: r.cost,
    valueText: usd(r.cost),
    to: `/models/${enc(r.model)}`,
  }));

  // --- Tools ---
  const tools: BarRow[] = d.tools.map((t) => ({
    key: t.tool,
    label: t.tool,
    value: t.uses,
    valueText: `${int(t.uses)}× · ${pct(t.successRate * 100)} · ${num(t.avgMs)}ms`,
    to: `/tools/${enc(t.tool)}`,
  }));

  const meta = `${int(d.members.length)} ${d.members.length === 1 ? "member" : "members"} · ${int(totalSessions)} ${totalSessions === 1 ? "session" : "sessions"} in range`;

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      {header(meta)}
      <StatHeroGrid stats={heroes} />

      <Section title="Spend">
        <Card>
          <CardHeader title="Cost over time" sub="USD · by day" />
          <CostTrendChart rows={trend} />
        </Card>
        <Grid cols={2}>
          <Card>
            <CardHeader title="Models" sub="cost" />
            <BarList rows={costByModel} search={search} />
          </Card>
          <Card>
            <CardHeader title="Members" sub="cost · tokens · sessions" />
            <DataTable
              columns={memberColumns}
              rows={d.members}
              rowKey={(r) => r.userHash}
              rowLink={(r) => `/people/${enc(r.userHash)}`}
              search={search}
              initialSort="cost"
              emptyText="No members active in range"
            />
          </Card>
        </Grid>
      </Section>

      <Section title="Tools">
        <Card>
          <CardHeader title="Top tools" sub="uses · success · latency" />
          <BarList rows={tools} search={search} />
        </Card>
      </Section>
    </div>
  );
}
