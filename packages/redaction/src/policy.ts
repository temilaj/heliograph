// Per-org policy lookup. Default: metadata-only for every org. Opt-in orgs are
// listed in CONTENT_CAPTURE_ORGS. A real deployment backs this with a DB/config service.
import { DEFAULT_ORG_POLICY, type OrgPolicy } from "@heliograph/domain";

export interface OrgPolicyStore {
  get(orgId: string): OrgPolicy;
}

export class StaticOrgPolicyStore implements OrgPolicyStore {
  constructor(
    private readonly captureOrgs: Set<string>,
    private readonly denyList: string[] = [],
  ) {}

  get(orgId: string): OrgPolicy {
    return {
      orgId,
      captureContent: this.captureOrgs.has(orgId),
      denyList: this.denyList,
    };
  }
}

export function orgPolicyStoreFromEnv(): OrgPolicyStore {
  const capture = (process.env.CONTENT_CAPTURE_ORGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const deny = (process.env.CONTENT_DENYLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new StaticOrgPolicyStore(new Set(capture), deny);
}

export { DEFAULT_ORG_POLICY };
