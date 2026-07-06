// People list — pseudonymous per-user aggregates in a sortable table. Filters
// live in the URL; a change refetches while the previous render holds at reduced
// opacity. Each row links into /people/:hash, preserving the query string.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFilters } from "../lib/filters.tsx";
import { fetchPeople } from "../lib/api.ts";
import type { PersonRow } from "@heliograph/storage";
import { usd, int, compact, truncHash } from "../lib/format.ts";
import { Card, PageHeader, DataTable, Empty, type Column } from "../ui/index.ts";

const enc = encodeURIComponent;

const columns: Column<PersonRow>[] = [
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
  {
    key: "toolCalls",
    header: "Tool calls",
    render: (r) => int(r.toolCalls),
    sortValue: (r) => r.toolCalls,
    align: "right",
  },
  {
    key: "linesAdded",
    header: "Lines added",
    render: (r) => int(r.linesAdded),
    sortValue: (r) => r.linesAdded,
    align: "right",
  },
  {
    key: "lastActive",
    header: "Last active",
    render: (r) => (r.lastActive ? r.lastActive.slice(0, 10) : "—"),
    sortValue: (r) => r.lastActive,
    align: "right",
  },
];

export function People() {
  const { org, from, to } = useFilters();
  const { search } = useLocation();
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetchPeople(org, from, to)
      .then((p) => live && setPeople(p))
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, from, to]);

  if (!org) {
    return (
      <Card>
        <Empty text="Select an org to see its people." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="error">Failed to load people: {error}</p>
      </Card>
    );
  }

  if (!people) {
    return (
      <Card>
        <Empty text="Loading…" />
      </Card>
    );
  }

  const meta = `${int(people.length)} ${people.length === 1 ? "person" : "people"} · pseudonymous (hashes)`;

  return (
    <div className="loading-dim" style={{ opacity: loading ? 0.6 : 1 }}>
      <PageHeader title="People" meta={meta} />
      <Card>
        <DataTable
          columns={columns}
          rows={people}
          rowKey={(r) => r.userHash}
          rowLink={(r) => `/people/${enc(r.userHash)}`}
          search={search}
          initialSort="cost"
          emptyText="No people in range"
        />
      </Card>
    </div>
  );
}
