// Per-subagent drill-down. Kicker back to the Models & Tools index. Two hero
// KPIs (runs, tokens), a Usage section (uses-per-day via the shared
// UsesTrendChart — the day's tokens ride in the tooltip), and top users →
// per-person pages. Filters live in the URL; links carry the active query string.
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchAgentDetail } from "../lib/api.ts";
import type { AgentDetail as AgentDetailData } from "@heliograph/storage";
import { int, compact, truncHash } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  StatHeroGrid,
  BarList,
  EmptyPage,
  PageHeader,
  type StatItem,
  type BarRow,
} from "../ui/index.ts";
import { UsesTrendChart, type UsesTrendRow } from "../components/UsesTrendChart.tsx";

const enc = encodeURIComponent;

export function AgentDetail() {
  const { agentType: raw } = useParams();
  const agentType = decodeURIComponent(raw ?? "");
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [data, setData] = useState<AgentDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org || !agentType) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchAgentDetail(org, from, to, agentType)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to, agentType]);

  const totals = data
    ? {
        runs: data.usesByDay.reduce((a, r) => a + r.uses, 0),
        tokens: data.usesByDay.reduce((a, r) => a + r.tokens, 0),
      }
    : null;

  const header = (
    <PageHeader
      kicker="Models & Tools"
      kickerTo="/models"
      search={search}
      title={agentType}
      meta={totals ? `${int(totals.runs)} runs · ${compact(totals.tokens)} tokens` : undefined}
    />
  );

  if (!org)
    return <EmptyPage title="Select an org" note="Choose an org to see this subagent." />;
  if (error)
    return (
      <>
        {header}
        <Card>
          <p className="error">Failed to load subagent: {error}</p>
        </Card>
      </>
    );
  if (!data || !totals)
    return (
      <>
        {header}
        <EmptyPage title="Loading…" />
      </>
    );

  const d = data;
  const heroes: StatItem[] = [
    { label: "Runs", value: int(totals.runs), sub: "in selected range" },
    {
      label: "Tokens",
      value: compact(totals.tokens),
      sub: `${int(totals.tokens)} total`,
      title: `${int(totals.tokens)} tokens`,
    },
  ];

  // Runs per day; the day's tokens are a tooltip-only extra row.
  const trend: UsesTrendRow[] = d.usesByDay.map((r) => ({
    day: r.day,
    value: r.uses,
    extra: [{ value: compact(r.tokens), name: "tokens" }],
  }));

  const topUsers: BarRow[] = d.topUsers.map((r) => ({
    key: r.userHash,
    label: truncHash(r.userHash),
    title: r.userHash,
    value: r.uses,
    valueText: int(r.uses),
    to: `/people/${enc(r.userHash)}`,
    mono: true,
  }));

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      {header}
      <StatHeroGrid stats={heroes} />

      <Section title="Usage">
        <Card>
          <CardHeader title="Runs per day" sub="count · tokens on hover" />
          <UsesTrendChart rows={trend} label="runs" />
        </Card>
      </Section>

      <Section title="Who">
        <Card>
          <CardHeader title="Top users" sub="by runs" />
          <BarList rows={topUsers} search={search} />
        </Card>
      </Section>
    </div>
  );
}
