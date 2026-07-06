// Typed fetch client for the read-api. Types are shared from @heliograph/storage
// (type-only import — never pulls server code into the browser bundle).
import type {
  OrgInfo,
  OrgSummary,
  CostTimeseriesRow,
  PersonRow,
  PersonDetail,
  ModelDetail,
  ToolDetail,
  AgentDetail,
  TeamRow,
  TeamDetail,
  CapabilitiesSummary,
  PluginDetail,
} from "@heliograph/storage";

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

// --- drill-downs; the entity segment is URL-encoded, decoded server-side, and
// bound as a query parameter (never interpolated into SQL) ---

const range = (org: string, from: string, to: string) => new URLSearchParams({ org, from, to });

export function fetchPeople(org: string, from: string, to: string): Promise<PersonRow[]> {
  return get<PersonRow[]>(`/v1/people?${range(org, from, to)}`);
}

export function fetchPersonDetail(
  org: string,
  from: string,
  to: string,
  userHash: string,
): Promise<PersonDetail> {
  return get<PersonDetail>(`/v1/people/${encodeURIComponent(userHash)}?${range(org, from, to)}`);
}

export function fetchModelDetail(
  org: string,
  from: string,
  to: string,
  model: string,
): Promise<ModelDetail> {
  return get<ModelDetail>(`/v1/models/${encodeURIComponent(model)}?${range(org, from, to)}`);
}

export function fetchToolDetail(
  org: string,
  from: string,
  to: string,
  tool: string,
): Promise<ToolDetail> {
  return get<ToolDetail>(`/v1/tools/${encodeURIComponent(tool)}?${range(org, from, to)}`);
}

export function fetchTeams(org: string, from: string, to: string): Promise<TeamRow[]> {
  return get<TeamRow[]>(`/v1/teams?${range(org, from, to)}`);
}

export function fetchTeamDetail(
  org: string,
  from: string,
  to: string,
  team: string,
): Promise<TeamDetail> {
  return get<TeamDetail>(`/v1/teams/${encodeURIComponent(team)}?${range(org, from, to)}`);
}

export function fetchCapabilities(
  org: string,
  from: string,
  to: string,
): Promise<CapabilitiesSummary> {
  return get<CapabilitiesSummary>(`/v1/capabilities?${range(org, from, to)}`);
}

export function fetchPluginDetail(
  org: string,
  from: string,
  to: string,
  name: string,
): Promise<PluginDetail> {
  return get<PluginDetail>(`/v1/plugins/${encodeURIComponent(name)}?${range(org, from, to)}`);
}

export function fetchAgentDetail(
  org: string,
  from: string,
  to: string,
  agentType: string,
): Promise<AgentDetail> {
  return get<AgentDetail>(`/v1/agents/${encodeURIComponent(agentType)}?${range(org, from, to)}`);
}
