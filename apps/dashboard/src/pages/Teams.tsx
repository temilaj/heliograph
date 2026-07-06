// Teams list — usage rolled up by membership. Users without a membership row
// bucket under "(unassigned)". Filters live in the URL; a change refetches while
// the previous render holds at reduced opacity. Each row links into
// /teams/:team, preserving the query string.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchTeams } from "../lib/api.ts";
import type { TeamRow } from "@heliograph/storage";
import { usd, int, compact } from "../lib/format.ts";
import { Card, PageHeader, DataTable, Empty, type Column } from "../ui/index.ts";

const enc = encodeURIComponent;

const columns: Column<TeamRow>[] = [
  {
    key: "team",
    header: "Team",
    render: (r) => r.team,
    sortValue: (r) => r.team,
  },
  {
    key: "members",
    header: "Members",
    render: (r) => int(r.members),
    sortValue: (r) => r.members,
    align: "right",
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
  {
    key: "toolCalls",
    header: "Tool calls",
    render: (r) => int(r.toolCalls),
    sortValue: (r) => r.toolCalls,
    align: "right",
  },
];

export function Teams() {
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchTeams(org, from, to)
      .then((t) => live && setTeams(t))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to]);

  if (!org) {
    return (
      <Card>
        <Empty text="Select an org to see its teams." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="error">Failed to load teams: {error}</p>
      </Card>
    );
  }

  if (!teams) {
    return (
      <Card>
        <Empty text="Loading…" />
      </Card>
    );
  }

  const meta = `${int(teams.length)} ${teams.length === 1 ? "team" : "teams"} · usage rolled up by membership`;

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader title="Teams" meta={meta} />
      <Card>
        <DataTable
          columns={columns}
          rows={teams}
          rowKey={(r) => r.team}
          rowLink={(r) => `/teams/${enc(r.team)}`}
          search={search}
          initialSort="cost"
          emptyText="No teams yet — telemetry rolls up once membership is loaded"
        />
      </Card>
    </div>
  );
}
