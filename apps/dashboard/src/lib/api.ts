// Typed fetch client for the read-api. Types are shared from @heliograph/storage
// (type-only import — never pulls server code into the browser bundle).
import type { OrgInfo, OrgSummary, CostTimeseriesRow } from "@heliograph/storage";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function fetchOrgs(): Promise<OrgInfo[]> {
  return get<OrgInfo[]>("/v1/orgs");
}

export function fetchSummary(org: string, from: string, to: string): Promise<OrgSummary> {
  const q = new URLSearchParams({ org, from, to });
  return get<OrgSummary>(`/v1/summary?${q}`);
}

export function fetchCostTimeseries(
  org: string,
  from: string,
  to: string,
): Promise<CostTimeseriesRow[]> {
  const q = new URLSearchParams({ org, from, to });
  return get<CostTimeseriesRow[]>(`/v1/cost-timeseries?${q}`);
}
