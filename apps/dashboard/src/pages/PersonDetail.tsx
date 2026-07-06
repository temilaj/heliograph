// Per-person detail — pseudonymous. Hero KPIs, then Spend / Tools / When,
// mirroring the org overview one level down. Filters live in the URL; a change
// refetches while the previous render holds at reduced opacity. Internal links
// (models, tools) carry the active query string.
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchPersonDetail } from "../lib/api.ts";
import type { PersonDetail as PersonDetailData, CostTimeseriesRow } from "@heliograph/storage";
import { usd, int, num, compact, pct, truncHash } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  StatHeroGrid,
  BarList,
  Empty,
  PageHeader,
  type StatItem,
  type BarRow,
} from "../ui/index.ts";
import { CostTrendChart } from "../components/CostTrendChart.tsx";
import { ActivityHourChart } from "../components/ActivityHourChart.tsx";

const enc = encodeURIComponent;

export function PersonDetail() {
  const { hash: raw } = useParams();
  const hash = raw ? decodeURIComponent(raw) : "";
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [detail, setDetail] = useState<PersonDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org || !hash) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchPersonDetail(org, from, to, hash)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to, hash]);

  const header = (meta?: string) => (
    <PageHeader
      kicker="People"
      kickerTo="/people"
      search={search}
      title={truncHash(hash)}
      mono
      meta={meta}
    />
  );

  if (!org) {
    return (
      <Card>
        <Empty text="Select an org to see this person." />
      </Card>
    );
  }

  if (error) {
    return (
      <>
        {header()}
        <Card>
          <p className="error">Failed to load person: {error}</p>
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
  const totalTokens = d.tokens.reduce((a, r) => a + r.tokens, 0);
  const toolUses = d.tools.reduce((a, t) => a + t.uses, 0);
  const heroes: StatItem[] = [
    { label: "Cost", value: usd(totalCost) },
    {
      label: "Tokens",
      value: compact(totalTokens),
      sub: `${int(totalTokens)} total`,
      title: `${int(totalTokens)} tokens`,
    },
    { label: "Sessions", value: int(d.sessions) },
    { label: "Tool calls", value: compact(toolUses), title: `${int(toolUses)} tool calls` },
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
  const tokensByType: BarRow[] = d.tokens.map((r) => ({
    key: r.tokenType,
    label: r.tokenType,
    value: r.tokens,
    valueText: compact(r.tokens),
    title: `${r.tokenType}: ${int(r.tokens)} tokens`,
  }));

  // --- Tools ---
  const tools: BarRow[] = d.tools.map((t) => ({
    key: t.tool,
    label: t.tool,
    value: t.uses,
    valueText: `${int(t.uses)}× · ${pct(t.successRate * 100)} · ${num(t.avgMs)}ms`,
    to: `/tools/${enc(t.tool)}`,
  }));
  const linesOfCode: BarRow[] = d.linesOfCode.map((r) => ({
    key: r.subtype,
    label: r.subtype,
    value: r.lines,
    valueText: compact(r.lines),
    title: `${r.subtype}: ${int(r.lines)} lines`,
  }));

  const meta = `${int(d.sessions)} ${d.sessions === 1 ? "session" : "sessions"} in range`;

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
            <CardHeader title="Tokens by type" />
            <BarList rows={tokensByType} search={search} />
          </Card>
        </Grid>
      </Section>

      <Section title="Tools">
        <Grid cols={2}>
          <Card>
            <CardHeader title="Top tools" sub="uses · success · latency" />
            <BarList rows={tools} search={search} />
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
          <ActivityHourChart rows={d.activityByHour} />
        </Card>
      </Section>
    </div>
  );
}
