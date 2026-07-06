// Per-tool drill-down. Kicker back to the Models & Tools index. Four hero KPIs
// (uses, weighted success rate, avg + p95 latency), a Usage section (uses-per-day
// via the shared UsesTrendChart — the day's success rate rides in the tooltip),
// a Decisions bar list (accept / reject / block), and top users → per-person
// pages. Filters live in the URL; links carry the active query string.
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchToolDetail } from "../lib/api.ts";
import type { ToolDetail as ToolDetailData } from "@heliograph/storage";
import { int, num, pct, truncHash } from "../lib/format.ts";
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

export function ToolDetail() {
  const { tool: raw } = useParams();
  const tool = decodeURIComponent(raw ?? "");
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [data, setData] = useState<ToolDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org || !tool) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchToolDetail(org, from, to, tool)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to, tool]);

  const header = (
    <PageHeader
      kicker="Models & Tools"
      kickerTo="/models"
      search={search}
      title={tool}
      meta={data ? `avg ${num(data.latency.avgMs)}ms · p95 ${num(data.latency.p95Ms)}ms` : undefined}
    />
  );

  if (!org)
    return <EmptyPage title="Select an org" note="Choose an org to see this tool." />;
  if (error)
    return (
      <>
        {header}
        <Card>
          <p className="error">Failed to load tool: {error}</p>
        </Card>
      </>
    );
  if (!data)
    return (
      <>
        {header}
        <EmptyPage title="Loading…" />
      </>
    );

  const d = data;
  const totalUses = d.usesByDay.reduce((a, r) => a + r.uses, 0);
  // Weighted success rate: sum(uses * rate) / sum(uses) — a daily average would
  // over-weight quiet days.
  const weightedSuccess = totalUses
    ? d.usesByDay.reduce((a, r) => a + r.uses * r.successRate, 0) / totalUses
    : 0;

  const heroes: StatItem[] = [
    { label: "Uses", value: int(totalUses), sub: "in selected range" },
    { label: "Success rate", value: pct(weightedSuccess * 100), sub: "weighted by uses" },
    { label: "Avg latency", value: `${num(d.latency.avgMs)}ms` },
    { label: "p95 latency", value: `${num(d.latency.p95Ms)}ms` },
  ];

  // Uses per day; the day's success rate is a tooltip-only extra row.
  const trend: UsesTrendRow[] = d.usesByDay.map((r) => ({
    day: r.day,
    value: r.uses,
    extra: [{ value: pct(r.successRate * 100), name: "success" }],
  }));

  const decisions: BarRow[] = [
    { key: "accept", label: "accept", value: d.decisions.accept, valueText: int(d.decisions.accept) },
    { key: "reject", label: "reject", value: d.decisions.reject, valueText: int(d.decisions.reject) },
    { key: "block", label: "block", value: d.decisions.block, valueText: int(d.decisions.block) },
  ];

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
          <CardHeader title="Uses per day" sub="count · success rate on hover" />
          <UsesTrendChart rows={trend} label="uses" />
        </Card>
      </Section>

      <Section title="Decisions">
        <Card>
          <CardHeader title="Accept · reject · block" />
          <BarList rows={decisions} search={search} />
        </Card>
      </Section>

      <Section title="Who">
        <Card>
          <CardHeader title="Top users" sub="by uses" />
          <BarList rows={topUsers} search={search} />
        </Card>
      </Section>
    </div>
  );
}
