// Shared OTLP attrs -> pseudonymized ResourceContext. Identity per ADR-0002:
// account_uuid = anchor, user.id = device, email = fallback (dropped if account present).
//
// IMPORTANT: real Claude Code puts identity on every metric datapoint / log record's
// attributes, not the OTLP Resource. So adapters build context from the MERGED
// (resource + point/record) attrs, and RESOURCE_KEYS must be stripped from stored
// dims/attributes so raw identity never lands in storage.
import type { Identity, ResourceContext, SourceId } from "@heliograph/domain";
import type { AdapterContext } from "./SourceAdapter.ts";

/** Identity + resource keys — consumed into ResourceContext, never kept as dims. */
export const RESOURCE_KEYS = new Set<string>([
  "service.name",
  "session.id",
  "user.id",
  "user.email",
  "user.account_uuid",
  "user.account_id",
  "organization.id",
  "app.version",
  "app.entrypoint",
  "terminal.type",
  "department",
  "team.id",
  "cost_center",
  "region",
]);

/**
 * Build context from resource + point/record attrs. Identity and resource dims
 * are read from the MERGE (they can live on either); the long-tail `attributes`
 * map draws ONLY from `resourceAttrs`, so per-point event/metric fields (and any
 * raw content) never leak into it.
 */
export function resourceContextFromAttrs(
  source: SourceId,
  resourceAttrs: Record<string, string>,
  pointAttrs: Record<string, string>,
  ctx: AdapterContext,
): ResourceContext {
  const a = { ...resourceAttrs, ...pointAttrs };

  const identity: Identity = {
    orgId: a["organization.id"] ?? "unknown",
    userIdHash: ctx.hash(a["user.id"] ?? a["session.id"] ?? "anonymous"),
  };

  const accountRaw = a["user.account_uuid"] ?? a["user.account_id"];
  if (accountRaw) {
    identity.accountHash = ctx.hash(accountRaw);
  } else if (a["user.email"]) {
    // Fallback join only when no stable account id is present.
    identity.emailHash = ctx.hash(a["user.email"]);
  }

  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(resourceAttrs)) {
    if (!RESOURCE_KEYS.has(k)) attributes[k] = v;
  }

  return {
    source,
    identity,
    sessionId: a["session.id"] ?? "",
    appVersion: a["app.version"],
    appEntrypoint: a["app.entrypoint"],
    terminalType: a["terminal.type"],
    department: a["department"],
    teamId: a["team.id"],
    costCenter: a["cost_center"],
    region: a["region"],
    attributes,
  };
}
