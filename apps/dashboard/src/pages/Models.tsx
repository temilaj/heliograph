// Models & Tools index. The nav link lands here: a real index that ranks the
// three drill-down dimensions (models by spend, tools by usage, subagents by
// runs) and links each row into its detail page. Data is the org summary, so no
// extra fetch. Filters live in the URL; a change refetches while the previous
// render holds at reduced opacity.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchSummary } from "../lib/api.ts";
import type { OrgSummary } from "@heliograph/storage";
import { usd, int, num, compact, pct } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  BarList,
  EmptyPage,
  PageHeader,
  type BarRow,
} from "../ui/index.ts";

const enc = encodeURIComponent;

export function Models() {
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchSummary(org, from, to)
      .then((s) => live && setSummary(s))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to]);

  if (!org) return <EmptyPage title="Select an org" note="Choose an org to browse models & tools." />;
  if (error)
    return (
      <Card>
        <p className="error">Failed to load models & tools: {error}</p>
      </Card>
    );
  if (!summary) return <EmptyPage title="Loading…" />;

  const s = summary;
  const models: BarRow[] = s.cost.map((r) => ({
    key: r.model,
    label: r.model,
    value: r.cost,
    valueText: usd(r.cost),
    to: `/models/${enc(r.model)}`,
  }));
  const tools: BarRow[] = s.tools.map((t) => ({
    key: t.tool,
    label: t.tool,
    value: t.uses,
    valueText: `${int(t.uses)}× · ${pct(t.successRate * 100)} · ${num(t.avgMs)}ms`,
    to: `/tools/${enc(t.tool)}`,
  }));
  const subagents: BarRow[] = s.subagents.map((a) => ({
    key: a.agentType,
    label: a.agentType,
    value: a.uses,
    valueText: `${int(a.uses)}× · ${compact(a.tokens)} tok`,
    title: `${a.agentType}: ${int(a.uses)} uses · ${int(a.tokens)} tokens`,
    to: `/agents/${enc(a.agentType)}`,
  }));

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader title="Models & Tools" meta="Spend and usage across the selected range" />
      <Section title="Ranked">
        <Grid cols={3}>
          <Card>
            <CardHeader title="Models" sub="cost" />
            <BarList rows={models} search={search} />
          </Card>
          <Card>
            <CardHeader title="Tools" sub="uses · success · latency" />
            <BarList rows={tools} search={search} />
          </Card>
          <Card>
            <CardHeader title="Subagents" sub="uses · tokens" />
            <BarList rows={subagents} search={search} />
          </Card>
        </Grid>
      </Section>
    </div>
  );
}
