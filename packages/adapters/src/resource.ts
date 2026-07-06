// Shared OTLP resource -> pseudonymized ResourceContext. Identity per ADR-0002:
// account_uuid = anchor, user.id = device, email = fallback (dropped if account present).
import type { Identity, ResourceContext, SourceId } from "@heliograph/domain";
import type { OtlpResource } from "@heliograph/otlp";
import type { AdapterContext } from "./SourceAdapter.ts";

/** Resource attribute keys that are promoted/consumed, so excluded from the long tail. */
const CONSUMED_KEYS = new Set<string>([
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

export function buildResourceContext(
  source: SourceId,
  resource: OtlpResource,
  ctx: AdapterContext,
): ResourceContext {
  const a = resource.attributes;

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
  for (const [k, v] of Object.entries(a)) {
    if (!CONSUMED_KEYS.has(k)) attributes[k] = v;
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
