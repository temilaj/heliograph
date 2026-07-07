import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchReliability } from "../lib/api.ts";
import type { ReliabilitySummary } from "@heliograph/storage";
import { int, pct, truncHash } from "../lib/format.ts";
import { UsesTrendChart, type UsesTrendRow } from "../components/UsesTrendChart.tsx";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  StatStrip,
  BarList,
  Empty,
  EmptyPage,
  PageHeader,
  type StatItem,
  type BarRow,
} from "../ui/index.ts";

export function Reliability() {
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [rel, setRel] = useState<ReliabilitySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchReliability(org, from, to)
      .then((r) => live && setRel(r))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to]);

  if (!org)
    return <EmptyPage title="Select an org" note="Choose an org to see its reliability." />;
  if (error)
    return (
      <Card>
        <p className="error">Failed to load reliability: {error}</p>
      </Card>
    );
  if (!rel) return <EmptyPage title="Loading…" />;

  const t = rel.totals;

  // --- Health headline ---
  const strip: StatItem[] = [
    { label: "API requests", value: int(t.apiRequests) },
    {
      label: "Error rate",
      value: t.apiRequests ? pct((100 * t.apiErrors) / t.apiRequests) : "—",
      title: `${int(t.apiErrors)} of ${int(t.apiRequests)}`,
    },
    { label: "API errors", value: int(t.apiErrors) },
    { label: "Refusals", value: int(t.refusals) },
    { label: "Retries exhausted", value: int(t.retriesExhausted) },
    { label: "Internal errors", value: int(t.internalErrors) },
  ];

  // --- Errors over time: one axis (errors); requests ride in the tooltip only ---
  const trend: UsesTrendRow[] = rel.errorsByDay.map((d) => ({
    day: d.day,
    value: d.errors,
    extra: [{ value: int(d.requests), name: "requests" }],
  }));

  // --- Where errors happen ---
  const byStatus: BarRow[] = rel.errorsByStatus.map((r) => ({
    key: r.status,
    label: r.status,
    value: r.count,
    valueText: int(r.count),
  }));
  const byModel: BarRow[] = rel.errorsByModel.map((r) => ({
    key: r.model,
    label: r.model,
    value: r.errors,
    valueText: int(r.errors),
  }));

  // --- Refusals ---
  const refusals: BarRow[] = rel.refusalsByModel.map((r) => ({
    key: r.model,
    label: r.model,
    value: r.count,
    valueText: int(r.count),
  }));

  // --- Most affected users ---
  const users: BarRow[] = rel.topUsers.map((r) => ({
    key: r.userHash,
    label: truncHash(r.userHash),
    title: r.userHash,
    value: r.errors,
    valueText: int(r.errors),
    to: `/people/${encodeURIComponent(r.userHash)}`,
    mono: true,
  }));

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader title="Reliability" meta="API health across the selected range" />

      <StatStrip stats={strip} />

      <Section title="Errors over time">
        <Card>
          <CardHeader title="API errors by day" sub="requests in tooltip" />
          <UsesTrendChart rows={trend} label="errors" />
        </Card>
      </Section>

      <Section title="Where errors happen">
        <Grid cols={2}>
          <Card>
            <CardHeader title="By status" />
            <BarList rows={byStatus} search={search} />
          </Card>
          <Card>
            <CardHeader title="By model" />
            <BarList rows={byModel} search={search} />
          </Card>
        </Grid>
      </Section>

      <Section title="Refusals">
        <Card>
          <CardHeader title="By model" />
          {refusals.length ? (
            <BarList rows={refusals} search={search} />
          ) : (
            <Empty text="No refusals in range" />
          )}
        </Card>
      </Section>

      <Section title="Most affected users">
        <Card>
          <CardHeader title="By errors" />
          <BarList rows={users} search={search} />
        </Card>
      </Section>
    </div>
  );
}
