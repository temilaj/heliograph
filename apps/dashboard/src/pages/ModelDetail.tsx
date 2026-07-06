// Per-model drill-down. Kicker back to the Models & Tools index; mono title is
// the raw model id. Three hero KPIs (cost, tokens, distinct top users), a Spend
// section (cost-over-time reusing CostTrendChart + three breakdown bar lists),
// and a Who section (top spenders → per-person pages). Filters live in the URL;
// links carry the active query string.
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchModelDetail } from "../lib/api.ts";
import type { ModelDetail as ModelDetailData } from "@heliograph/storage";
import { usd, int, compact, truncHash } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  StatHeroGrid,
  BarList,
  EmptyPage,
  PageHeader,
  type StatItem,
  type BarRow,
} from "../ui/index.ts";
import { CostTrendChart } from "../components/CostTrendChart.tsx";

const enc = encodeURIComponent;

export function ModelDetail() {
  const { model: raw } = useParams();
  const model = decodeURIComponent(raw ?? "");
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [data, setData] = useState<ModelDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org || !model) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchModelDetail(org, from, to, model)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to, model]);

  if (!org)
    return <EmptyPage title="Select an org" note="Choose an org to see this model." />;
  if (error)
    return (
      <>
        <PageHeader kicker="Models & Tools" kickerTo="/models" search={search} title={model} mono />
        <Card>
          <p className="error">Failed to load model: {error}</p>
        </Card>
      </>
    );
  if (!data)
    return (
      <>
        <PageHeader kicker="Models & Tools" kickerTo="/models" search={search} title={model} mono />
        <EmptyPage title="Loading…" />
      </>
    );

  const d = data;
  const totalCost = d.costByDay.reduce((a, r) => a + r.cost, 0);
  const totalTokens = d.tokensByType.reduce((a, r) => a + r.tokens, 0);

  const heroes: StatItem[] = [
    { label: "Cost", value: usd(totalCost), sub: "in selected range" },
    {
      label: "Tokens",
      value: compact(totalTokens),
      sub: `${int(totalTokens)} total`,
      title: `${int(totalTokens)} tokens`,
    },
    { label: "Users", value: int(d.topUsers.length), sub: "top spenders shown" },
  ];

  // CostTrendChart pivots CostTimeseriesRow[] by model; this page is one model,
  // so tag every day's row with the model id => a single-series area.
  const trend = d.costByDay.map((r) => ({ day: r.day, model, cost: r.cost }));

  const costBySource: BarRow[] = d.costBySource.map((r) => ({
    key: r.source,
    label: r.source,
    value: r.cost,
    valueText: usd(r.cost),
  }));
  const costByEffort: BarRow[] = d.costByEffort.map((r) => ({
    key: r.effort,
    label: r.effort,
    value: r.cost,
    valueText: usd(r.cost),
  }));
  const tokensByType: BarRow[] = d.tokensByType.map((r) => ({
    key: r.tokenType,
    label: r.tokenType,
    value: r.tokens,
    valueText: compact(r.tokens),
    title: `${r.tokenType}: ${int(r.tokens)} tokens`,
  }));
  const topUsers: BarRow[] = d.topUsers.map((r) => ({
    key: r.userHash,
    label: truncHash(r.userHash),
    title: r.userHash,
    value: r.cost,
    valueText: usd(r.cost),
    to: `/people/${enc(r.userHash)}`,
    mono: true,
  }));

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader
        kicker="Models & Tools"
        kickerTo="/models"
        search={search}
        title={model}
        mono
        meta={`${usd(totalCost)} · ${compact(totalTokens)} tokens`}
      />
      <StatHeroGrid stats={heroes} />

      <Section title="Spend">
        <Card>
          <CardHeader title="Cost over time" sub="USD · by day" />
          <CostTrendChart rows={trend} />
        </Card>
        <Grid cols={3}>
          <Card>
            <CardHeader title="Cost by source" />
            <BarList rows={costBySource} search={search} />
          </Card>
          <Card>
            <CardHeader title="Cost by effort" />
            <BarList rows={costByEffort} search={search} />
          </Card>
          <Card>
            <CardHeader title="Tokens by type" />
            <BarList rows={tokensByType} search={search} />
          </Card>
        </Grid>
      </Section>

      <Section title="Who">
        <Card>
          <CardHeader title="Top users" sub="by spend" />
          <BarList rows={topUsers} search={search} />
        </Card>
      </Section>
    </div>
  );
}
