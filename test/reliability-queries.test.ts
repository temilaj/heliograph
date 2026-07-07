// Phase 8 reliability / agents-list / autonomy queries: in-memory conformance +
// proves the ClickHouse impl always scopes by org + date range (no user-supplied
// dimension params here) and NEVER selects dims['error'] free text.
import { expect, test, describe } from "bun:test";
import {
  ClickHouseQueryRepository,
  InMemoryQueryRepository,
  type ClickHouseClient,
  type QueryRepository,
} from "@heliograph/storage";

const range = { org: "o", from: "2026-01-01", to: "2026-02-01" };

const emptyReliabilityShape = {
  totals: { apiRequests: 0, apiErrors: 0, refusals: 0, retriesExhausted: 0, internalErrors: 0 },
  errorsByDay: [],
  errorsByStatus: [],
  errorsByModel: [],
  refusalsByModel: [],
  topUsers: [],
};

describe("in-memory reliability/agents conformance", () => {
  const repo: QueryRepository = new InMemoryQueryRepository();

  test("reliability returns the empty shape", async () => {
    expect(await repo.reliability(range)).toEqual(emptyReliabilityShape);
  });

  test("agentsList returns []", async () => {
    expect(await repo.agentsList(range)).toEqual([]);
  });

  test("capabilities.autonomy returns the empty shape", async () => {
    const caps = await repo.capabilities(range);
    expect(caps.autonomy).toEqual({ total: 0, byMode: [], transitions: [], byTrigger: [] });
  });
});

// Fake client captures every (sql, params) pair; returns no rows.
function fakeClient() {
  const calls: { sql: string; params: Record<string, string | string[]> }[] = [];
  const client = {
    async query(sql: string, params: Record<string, string | string[]> = {}) {
      calls.push({ sql, params });
      return [];
    },
  };
  return { client: client as unknown as ClickHouseClient, calls };
}

describe("ClickHouse reliability/agents/autonomy scope every query", () => {
  test("reliability: org + date range bound on every query, org never inlined", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).reliability(range);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.params.org).toBe("o");
      expect(c.params.from).toBe("2026-01-01");
      expect(c.params.to).toBe("2026-02-01");
      expect(c.sql).toContain("{org:String}");
      expect(c.sql).toContain("{from:Date}");
      expect(c.sql).toContain("{to:Date}");
      expect(c.sql).not.toContain("org_id = 'o'"); // org never inlined
    }
  });

  test("reliability: NEVER selects the dims['error'] free text", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).reliability(range);
    for (const c of calls) {
      expect(c.sql).not.toContain("dims['error']");
    }
  });

  test("agentsList: org + date range bound, org never inlined", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).agentsList(range);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.params.org).toBe("o");
      expect(c.params.from).toBe("2026-01-01");
      expect(c.params.to).toBe("2026-02-01");
      expect(c.sql).toContain("{org:String}");
      expect(c.sql).not.toContain("org_id = 'o'");
    }
  });

  test("agentsList: reads real CC agent.name (events + token.usage metric), not agent_type", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).agentsList(range);
    // Two queries: uses/users from events dims['agent.name'], tokens from metric attributes['agent.name'].
    const eventCall = calls.find((c) => c.sql.includes("FROM hg_events") && c.sql.includes("dims['agent.name']"));
    const metricCall = calls.find(
      (c) => c.sql.includes("FROM hg_metrics") && c.sql.includes("attributes['agent.name']"),
    );
    expect(eventCall).toBeTruthy();
    expect(metricCall).toBeTruthy();
    expect(metricCall?.sql).toContain("name = 'token.usage'");
    for (const c of calls) {
      expect(c.sql).not.toContain("agent_type"); // stale loadgen-only field is gone
      expect(c.sql).not.toContain("total_tool_uses"); // toolUses has no real source
    }
  });

  test("capabilities (autonomy queries): org + date range bound, no dims['error']", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).capabilities(range);
    const autonomyCalls = calls.filter((c) => c.sql.includes("permission_mode_changed"));
    expect(autonomyCalls.length).toBe(4); // total, byMode, transitions, byTrigger
    for (const c of autonomyCalls) {
      expect(c.params.org).toBe("o");
      expect(c.params.from).toBe("2026-01-01");
      expect(c.params.to).toBe("2026-02-01");
      expect(c.sql).toContain("{org:String}");
      expect(c.sql).not.toContain("org_id = 'o'");
    }
  });
});

describe("ClickHouse reliability maps rows", () => {
  test("totals route via countIf; status/model/user buckets map through", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("countIf(event_type = 'api_request') AS apiRequests")) {
          return [{ apiRequests: 198, apiErrors: 4, refusals: 0, retriesExhausted: 0, internalErrors: 0 }] as never;
        }
        if (sql.includes("countIf(event_type = 'api_request') AS requests")) {
          return [{ day: "2026-01-05", requests: 100, errors: 2 }] as never;
        }
        if (sql.includes("AS status")) {
          return [{ status: "429", count: 4 }] as never;
        }
        if (sql.includes("event_type = 'api_error'") && sql.includes("dims['model'] AS model")) {
          return [{ model: "claude-fable-5", errors: 4 }] as never;
        }
        if (sql.includes("event_type = 'api_refusal'")) {
          return [] as never; // no refusals
        }
        if (sql.includes("user_hash AS userHash")) {
          return [{ userHash: "u1", errors: 3 }] as never;
        }
        return [] as never;
      },
    };
    const repo = new ClickHouseQueryRepository(client as unknown as ClickHouseClient);
    const rel = await repo.reliability(range);
    expect(rel.totals).toEqual({
      apiRequests: 198,
      apiErrors: 4,
      refusals: 0,
      retriesExhausted: 0,
      internalErrors: 0,
    });
    expect(rel.errorsByDay).toEqual([{ day: "2026-01-05", requests: 100, errors: 2 }]);
    expect(rel.errorsByStatus).toEqual([{ status: "429", count: 4 }]);
    expect(rel.errorsByModel).toEqual([{ model: "claude-fable-5", errors: 4 }]);
    expect(rel.refusalsByModel).toEqual([]);
    expect(rel.topUsers).toEqual([{ userHash: "u1", errors: 3 }]);
  });
});

describe("ClickHouse agentsList maps rows", () => {
  test("merges events (uses/users) with token.usage metric (tokens) by agent.name; toolUses 0", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("FROM hg_metrics")) {
          return [
            { agentType: "reviewer", tokens: "34000" }, // token.usage by agent.name
          ] as never;
        }
        return [
          { agentType: "reviewer", uses: 12, users: 4 }, // events by agent.name
          { agentType: "explorer", uses: 3, users: 1 }, // no metric row => tokens 0
        ] as never;
      },
    };
    const repo = new ClickHouseQueryRepository(client as unknown as ClickHouseClient);
    const agents = await repo.agentsList(range);
    expect(agents).toEqual([
      { agentType: "reviewer", uses: 12, tokens: 34000, toolUses: 0, users: 4 },
      { agentType: "explorer", uses: 3, tokens: 0, toolUses: 0, users: 1 },
    ]);
  });
});

describe("ClickHouse capabilities maps autonomy rows", () => {
  test("total/byMode/transitions/byTrigger map through", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("permission_mode_changed")) {
          if (sql.includes("count() AS v FROM hg_events FINAL WHERE") && !sql.includes("GROUP BY")) {
            return [{ v: 4 }] as never;
          }
          if (sql.includes("dims['from_mode'] AS from")) {
            return [{ from: "auto", to: "default", v: 3 }] as never;
          }
          if (sql.includes("dims['to_mode'] AS k")) {
            return [{ k: "default", v: 3 }] as never;
          }
          if (sql.includes("dims['trigger'] AS k")) {
            return [{ k: "shift_tab", v: 4 }] as never;
          }
        }
        return [] as never;
      },
    };
    const repo = new ClickHouseQueryRepository(client as unknown as ClickHouseClient);
    const caps = await repo.capabilities(range);
    expect(caps.autonomy.total).toBe(4);
    expect(caps.autonomy.byMode).toEqual([{ mode: "default", count: 3 }]);
    expect(caps.autonomy.transitions).toEqual([{ from: "auto", to: "default", count: 3 }]);
    expect(caps.autonomy.byTrigger).toEqual([{ trigger: "shift_tab", count: 4 }]);
  });
});
