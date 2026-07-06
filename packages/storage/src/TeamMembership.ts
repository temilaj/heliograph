// Team membership store: account_hash -> team. Mirrors PersonDirectory; kept off
// the hot analytics queries so team rollups join against it at read time.
import type { ClickHouseClient } from "./ClickHouseClient.ts";

/** Upsert record; `accountHash` is already HMAC'd (== hg_metrics.user_hash). */
export interface MembershipRecord {
  orgId: string;
  accountHash: string;
  team: string;
}

export interface TeamMembership {
  /** Idempotent upsert; latest updated_at wins (one team per person). */
  assign(records: MembershipRecord[]): Promise<void>;
  /** All memberships for the org (FINAL collapses to latest per account_hash). */
  list(org: string): Promise<{ accountHash: string; team: string }[]>;
}

interface MembershipRow {
  org_id: string;
  account_hash: string;
  team: string;
}

function toRow(r: MembershipRecord): MembershipRow {
  return { org_id: r.orgId, account_hash: r.accountHash, team: r.team };
}

export class ClickHouseTeamMembership implements TeamMembership {
  constructor(private readonly ch: ClickHouseClient) {}

  async assign(records: MembershipRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.ch.insertJSONEachRow("hg_team_membership", records.map(toRow));
  }

  async list(org: string): Promise<{ accountHash: string; team: string }[]> {
    // FINAL: latest upsert per (org, hash). org bound, never interpolated.
    const rows = await this.ch.query<{ account_hash: string; team: string }>(
      `SELECT account_hash, team FROM hg_team_membership FINAL WHERE org_id = {org:String}`,
      { org },
    );
    return rows.map((r) => ({ accountHash: r.account_hash, team: r.team }));
  }
}

/** In-memory membership for the memory provider / tests. */
export class InMemoryTeamMembership implements TeamMembership {
  // key: `${org} ${accountHash}` -> team (latest wins)
  private readonly byKey = new Map<string, MembershipRow>();

  async assign(records: MembershipRecord[]): Promise<void> {
    for (const r of records) {
      const row = toRow(r);
      this.byKey.set(`${row.org_id} ${row.account_hash}`, row);
    }
  }

  async list(org: string): Promise<{ accountHash: string; team: string }[]> {
    const out: { accountHash: string; team: string }[] = [];
    for (const row of this.byKey.values()) {
      if (row.org_id === org) out.push({ accountHash: row.account_hash, team: row.team });
    }
    return out;
  }
}
