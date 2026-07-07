// Capabilities insights: how the org extends Claude Code — plugins & hooks carry
// the page (data-rich), MCP + skills render honestly (thin/empty in v1). Filters
// live in the URL; a change refetches while the previous render holds at reduced
// opacity. Every internal link carries the active query string.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchCapabilities, fetchEnvironment } from "../lib/api.ts";
import type {
  CapabilitiesSummary,
  EnvironmentSummary,
  PluginRow,
  HookEventRow,
} from "@heliograph/storage";
import { int, num, pct } from "../lib/format.ts";
import {
  Card,
  CardHeader,
  Section,
  Grid,
  StatStrip,
  BarList,
  DataTable,
  Empty,
  EmptyPage,
  PageHeader,
  type StatItem,
  type BarRow,
  type Column,
} from "../ui/index.ts";

const enc = encodeURIComponent;

export function Capabilities() {
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [caps, setCaps] = useState<CapabilitiesSummary | null>(null);
  const [env, setEnv] = useState<EnvironmentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchCapabilities(org, from, to), fetchEnvironment(org, from, to)])
      .then(([c, e]) => {
        if (!live) return;
        setCaps(c);
        setEnv(e);
      })
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to]);

  if (!org)
    return <EmptyPage title="Select an org" note="Choose an org to see its capabilities." />;
  if (error)
    return (
      <Card>
        <p className="error">Failed to load capabilities: {error}</p>
      </Card>
    );
  if (!caps) return <EmptyPage title="Loading…" />;

  const c = caps;

  // --- Environment (Claude Code version + entrypoint adoption) ---
  const versions: BarRow[] = (env?.versions ?? []).map((r) => ({
    key: r.version,
    label: r.version,
    value: r.users,
    valueText: `${int(r.users)} users`,
    title: `${int(r.users)} users · ${int(r.sessions)} sessions`,
  }));
  const entrypoints: BarRow[] = (env?.entrypoints ?? []).map((r) => ({
    key: r.entrypoint,
    label: r.entrypoint,
    value: r.users,
    valueText: `${int(r.users)} users`,
    title: `${int(r.users)} users · ${int(r.sessions)} sessions`,
  }));

  // --- Plugins ---
  const withHooks = c.plugins.filter((p) => p.hasHooks).length;
  const withMcp = c.plugins.filter((p) => p.hasMcp).length;
  const pluginStrip: StatItem[] = [
    { label: "Plugins", value: int(c.plugins.length) },
    {
      label: "With hooks",
      value: c.plugins.length ? pct((100 * withHooks) / c.plugins.length) : "—",
      title: `${withHooks} of ${c.plugins.length}`,
    },
    {
      label: "With MCP",
      value: c.plugins.length ? pct((100 * withMcp) / c.plugins.length) : "—",
      title: `${withMcp} of ${c.plugins.length}`,
    },
  ];
  const pluginCols: Column<PluginRow>[] = [
    { key: "name", header: "Plugin", render: (r) => r.name },
    { key: "version", header: "Version", render: (r) => r.version || "—" },
    { key: "marketplace", header: "Marketplace", render: (r) => r.marketplace || "—" },
    { key: "scope", header: "Scope", render: (r) => r.scope || "—" },
    { key: "enabledVia", header: "Installed via", render: (r) => r.enabledVia || "—" },
    {
      key: "bundles",
      header: "Bundles",
      render: (r) => `${int(r.skills)} skills · ${int(r.commands)} cmds · ${int(r.agents)} agents`,
    },
    {
      key: "events",
      header: "Events",
      align: "right",
      render: (r) => int(r.events),
      sortValue: (r) => r.events,
    },
  ];

  // --- Hooks ---
  const hookExecs = c.hooks.reduce((a, h) => a + h.executions, 0);
  const hookRuns = c.hooks.reduce((a, h) => a + h.hooks, 0);
  const hookSuccess = c.hooks.reduce((a, h) => a + h.success, 0);
  const hookBlocked = c.hooks.reduce((a, h) => a + h.blocking, 0);
  const hookAvgMs = hookExecs
    ? c.hooks.reduce((a, h) => a + h.avgMs * h.executions, 0) / hookExecs
    : 0;
  const hookStrip: StatItem[] = [
    { label: "Executions", value: int(hookExecs) },
    {
      label: "Success rate",
      value: hookRuns ? pct((100 * hookSuccess) / hookRuns) : "—",
      title: `${int(hookSuccess)} of ${int(hookRuns)} hooks`,
    },
    { label: "Blocked", value: int(hookBlocked) },
    { label: "Avg ms", value: num(hookAvgMs) },
  ];
  const hookCols: Column<HookEventRow>[] = [
    { key: "hookEvent", header: "Hook event", render: (r) => r.hookEvent },
    {
      key: "executions",
      header: "Executions",
      align: "right",
      render: (r) => int(r.executions),
      sortValue: (r) => r.executions,
    },
    {
      key: "success",
      header: "Success %",
      align: "right",
      render: (r) => (r.hooks ? pct((100 * r.success) / r.hooks) : "—"),
      sortValue: (r) => (r.hooks ? r.success / r.hooks : 0),
    },
    {
      key: "blocking",
      header: "Blocked",
      align: "right",
      render: (r) => int(r.blocking),
      sortValue: (r) => r.blocking,
    },
    {
      key: "cancelled",
      header: "Cancelled",
      align: "right",
      render: (r) => int(r.cancelled),
      sortValue: (r) => r.cancelled,
    },
    {
      key: "errors",
      header: "Errors",
      align: "right",
      render: (r) => int(r.errors),
      sortValue: (r) => r.errors,
    },
    {
      key: "avgMs",
      header: "Avg ms",
      align: "right",
      render: (r) => num(r.avgMs),
      sortValue: (r) => r.avgMs,
    },
  ];
  const hooksBySource: BarRow[] = c.hooksBySource.map((r) => ({
    key: r.source,
    label: r.source,
    value: r.count,
    valueText: int(r.count),
  }));

  // --- MCP ---
  const mcpStrip: StatItem[] = [
    { label: "Connections", value: int(c.mcp.connections) },
    { label: "Plugin-provided", value: int(c.mcp.pluginProvided) },
    { label: "Avg connect ms", value: num(c.mcp.avgConnectMs) },
  ];
  const mcpByTransport: BarRow[] = c.mcp.byTransport.map((r) => ({
    key: r.transport,
    label: r.transport,
    value: r.count,
    valueText: int(r.count),
  }));
  const mcpByServer: BarRow[] = c.mcpServers.map((r) => ({
    key: r.server,
    label: r.server,
    value: r.calls,
    valueText: `${int(r.calls)}× · ${pct(r.successRate * 100)} · ${num(r.avgMs)}ms`,
    title: `${r.server}: ${int(r.calls)} calls · ${pct(r.successRate * 100)} success · ${num(r.avgMs)}ms avg`,
  }));

  // --- Skills & session starts ---
  const skills: BarRow[] = c.skills.map((r) => ({
    key: r.name,
    label: r.name,
    value: r.count,
    valueText: int(r.count),
  }));
  const sessionStarts: BarRow[] = c.sessionStarts.map((r) => ({
    key: r.startType,
    label: r.startType,
    value: r.count,
    valueText: int(r.count),
  }));

  // --- Autonomy (permission-mode posture) ---
  const auto = c.autonomy;
  const topMode = auto.byMode.length
    ? [...auto.byMode].sort((a, b) => b.count - a.count)[0]
    : null;
  const autoStrip: StatItem[] = [
    { label: "Mode switches", value: int(auto.total) },
    {
      label: "Top destination",
      value: topMode ? topMode.mode : "—",
      title: topMode ? `${int(topMode.count)} switches into ${topMode.mode}` : undefined,
    },
    { label: "Distinct modes", value: int(auto.byMode.length) },
  ];
  const autoByMode: BarRow[] = auto.byMode.map((r) => ({
    key: r.mode,
    label: r.mode,
    value: r.count,
    valueText: int(r.count),
  }));
  const autoByTrigger: BarRow[] = auto.byTrigger.map((r) => ({
    key: r.trigger,
    label: r.trigger,
    value: r.count,
    valueText: int(r.count),
  }));
  const autoTransitions: BarRow[] = auto.transitions.map((r) => ({
    key: `${r.from}→${r.to}`,
    label: `${r.from} → ${r.to}`,
    value: r.count,
    valueText: int(r.count),
    title: `${r.from} → ${r.to}: ${int(r.count)} switches`,
  }));

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader title="Capabilities" meta="Plugins, hooks, MCP and skills across the selected range" />

      <Section title="Environment">
        <Grid cols={2}>
          <Card>
            <CardHeader title="Claude Code version" sub="users · sessions" />
            {versions.length ? (
              <BarList rows={versions} search={search} />
            ) : (
              <Empty text="No version data in range" />
            )}
          </Card>
          <Card>
            <CardHeader title="Entrypoint" sub="users · sessions" />
            {entrypoints.length ? (
              <BarList rows={entrypoints} search={search} />
            ) : (
              <Empty text="No entrypoint data — enable OTEL_METRICS_INCLUDE_ENTRYPOINT" />
            )}
          </Card>
        </Grid>
      </Section>

      <Section title="Plugins">
        <StatStrip stats={pluginStrip} />
        <Card>
          <CardHeader title="Installed plugins" sub="bundled skills · commands · agents" />
          <DataTable
            columns={pluginCols}
            rows={c.plugins}
            rowKey={(r) => r.name}
            rowLink={(r) => `/capabilities/plugins/${enc(r.name)}`}
            search={search}
            initialSort="events"
            emptyText="No plugins in range"
          />
        </Card>
      </Section>

      <Section title="Hooks">
        <StatStrip stats={hookStrip} />
        <Card>
          <CardHeader title="By hook event" sub="executions · outcomes · latency" />
          <DataTable
            columns={hookCols}
            rows={c.hooks}
            rowKey={(r) => r.hookEvent}
            initialSort="executions"
            emptyText="No hook activity in range"
          />
        </Card>
        <Card>
          <CardHeader title="By source" />
          <BarList rows={hooksBySource} search={search} />
        </Card>
      </Section>

      <Section title="MCP servers">
        <StatStrip stats={mcpStrip} />
        <Grid cols={2}>
          <Card>
            <CardHeader title="By transport" />
            <BarList rows={mcpByTransport} search={search} />
          </Card>
          <Card>
            <CardHeader title="By server" sub="calls · success · latency" />
            {mcpByServer.length ? (
              <BarList rows={mcpByServer} search={search} />
            ) : (
              <Empty text="Per-server data accrues from new telemetry." />
            )}
          </Card>
        </Grid>
      </Section>

      <Section title="Skills">
        <Card>
          <CardHeader title="Skill activations" />
          {skills.length ? (
            <BarList rows={skills} search={search} />
          ) : (
            <Empty text="No skill activations in range" />
          )}
        </Card>
      </Section>

      <Section title="Session starts">
        <Card>
          <CardHeader title="By start type" />
          <BarList rows={sessionStarts} search={search} />
        </Card>
      </Section>

      <Section title="Autonomy">
        <StatStrip stats={autoStrip} />
        {auto.total ? (
          <>
            <Grid cols={2}>
              <Card>
                <CardHeader title="Destination mode" sub="mode switched into" />
                <BarList rows={autoByMode} search={search} />
              </Card>
              <Card>
                <CardHeader title="Trigger" sub="what caused the switch" />
                {autoByTrigger.length ? (
                  <BarList rows={autoByTrigger} search={search} />
                ) : (
                  <Empty text="No trigger data in range" />
                )}
              </Card>
            </Grid>
            <Card>
              <CardHeader title="Transitions" sub="from → to" />
              {autoTransitions.length ? (
                <BarList rows={autoTransitions} search={search} />
              ) : (
                <Empty text="No transition data in range" />
              )}
            </Card>
          </>
        ) : (
          <Card>
            <Empty text="No permission-mode changes in range — accrues as autonomy telemetry arrives" />
          </Card>
        )}
      </Section>
    </div>
  );
}
