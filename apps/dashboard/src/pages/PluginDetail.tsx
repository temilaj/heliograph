// Per-plugin detail — one level down from the capabilities page. Header meta and
// hero-strip come from the plugin's install record; then version spread, adopters
// (pseudonymous), and an events-over-time trend. Filters live in the URL; a
// change refetches while the previous render holds at reduced opacity. Links keep
// the query string.
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchPluginDetail } from "../lib/api.ts";
import type { PluginDetail as PluginDetailData } from "@heliograph/storage";
import { int, truncHash } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  StatStrip,
  BarList,
  Empty,
  PageHeader,
  type StatItem,
  type BarRow,
} from "../ui/index.ts";
import { UsesTrendChart, type UsesTrendRow } from "../components/UsesTrendChart.tsx";

const enc = encodeURIComponent;

export function PluginDetail() {
  const { name: raw } = useParams();
  const name = raw ? decodeURIComponent(raw) : "";
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [detail, setDetail] = useState<PluginDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org || !name) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchPluginDetail(org, from, to, name)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to, name]);

  const header = (meta?: string) => (
    <PageHeader kicker="Capabilities" kickerTo="/capabilities" search={search} title={name} meta={meta} />
  );

  if (!org) {
    return (
      <Card>
        <Empty text="Select an org to see this plugin." />
      </Card>
    );
  }

  if (error) {
    return (
      <>
        {header()}
        <Card>
          <p className="error">Failed to load plugin: {error}</p>
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
  const info = d.info;

  if (!info) {
    return (
      <>
        {header()}
        <Card>
          <Empty text="This plugin wasn't seen in the selected range." />
        </Card>
      </>
    );
  }

  const meta = [info.version, info.marketplace, info.scope].filter(Boolean).join(" · ");

  const strip: StatItem[] = [
    { label: "Skills", value: int(info.skills) },
    { label: "Commands", value: int(info.commands) },
    { label: "Agents", value: int(info.agents) },
    { label: "Installed via", value: info.enabledVia || "—" },
    { label: "Hooks", value: info.hasHooks ? "yes" : "no" },
    { label: "MCP", value: info.hasMcp ? "yes" : "no" },
  ];

  const versions: BarRow[] = d.versions.map((r) => ({
    key: r.version,
    label: r.version,
    value: r.count,
    valueText: int(r.count),
  }));
  const adopters: BarRow[] = d.users.map((r) => ({
    key: r.userHash,
    label: truncHash(r.userHash),
    title: r.userHash,
    value: r.events,
    valueText: int(r.events),
    to: `/people/${enc(r.userHash)}`,
    mono: true,
  }));
  const trend: UsesTrendRow[] = d.byDay.map((r) => ({ day: r.day, value: r.events }));

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      {header(meta || undefined)}
      <StatStrip stats={strip} />

      <Section title="Adoption">
        <Grid cols={2}>
          <Card>
            <CardHeader title="Versions" sub="events" />
            <BarList rows={versions} search={search} />
          </Card>
          <Card>
            <CardHeader title="Adopters" sub="events" />
            <BarList rows={adopters} search={search} />
          </Card>
        </Grid>
        <Card>
          <CardHeader title="Events over time" sub="by day" />
          <UsesTrendChart rows={trend} label="events" />
        </Card>
      </Section>
    </div>
  );
}
