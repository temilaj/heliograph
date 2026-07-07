import { expect, test, describe } from "bun:test";
import {
  ClickHouseQueryRepository,
  InMemoryQueryRepository,
  type ClickHouseClient,
  type QueryRepository,
} from "@heliograph/storage";

const range = { org: "o", from: "2026-01-01", to: "2026-02-01" };

describe("in-memory capability conformance", () => {
  const repo: QueryRepository = new InMemoryQueryRepository();

  test("capabilities returns the empty shape", async () => {
    expect(await repo.capabilities(range)).toEqual({
      plugins: [],
      hooks: [],
      hooksBySource: [],
      mcp: { connections: 0, avgConnectMs: 0, pluginProvided: 0, byTransport: [], servers: [] },
      mcpServers: [],
      skills: [],
      sessionStarts: [],
      autonomy: { total: 0, byMode: [], transitions: [], byTrigger: [] },
    });
  });

  test("pluginDetail returns the empty shape (info null)", async () => {
    expect(await repo.pluginDetail(range, "skill-creator")).toEqual({
      info: null,
      versions: [],
      users: [],
      byDay: [],
    });
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

describe("ClickHouse capability queries bind + scope every query", () => {
  const evil = "x' OR '1'='1";

  test("capabilities: org + date range bound on every query", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).capabilities(range);
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

  test("pluginDetail: plugin name bound as {n:String}, never interpolated", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).pluginDetail(range, evil);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.params.n).toBe(evil);
      expect(c.sql).not.toContain(evil); // never interpolated into SQL text
      expect(c.sql).toContain("dims['plugin.name'] = {n:String}");
    }
  });

  test("pluginDetail: org + date range bound on every query", async () => {
    const { client, calls } = fakeClient();
    await new ClickHouseQueryRepository(client).pluginDetail(range, "skill-creator");
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.params.org).toBe("o");
      expect(c.params.from).toBe("2026-01-01");
      expect(c.params.to).toBe("2026-02-01");
      expect(c.sql).toContain("{org:String}");
      expect(c.sql).toContain("{from:Date}");
      expect(c.sql).toContain("{to:Date}");
    }
  });
});

describe("ClickHouse capabilities maps rows", () => {
  test("folds has_hooks/has_mcp flags and coerces counts", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("event_type = 'plugin'") && sql.includes("GROUP BY name")) {
          return [
            {
              name: "skill-creator",
              version: "1.2.0",
              marketplace: "claude-plugins-official",
              scope: "user",
              enabledVia: "user-install",
              hasHooks: 1,
              hasMcp: 0,
              skills: "3",
              commands: "2",
              agents: "1",
              events: "10",
            },
          ] as never;
        }
        return [] as never;
      },
    };
    const repo = new ClickHouseQueryRepository(client as unknown as ClickHouseClient);
    const caps = await repo.capabilities(range);
    expect(caps.plugins).toHaveLength(1);
    const p = caps.plugins[0]!;
    expect(p.name).toBe("skill-creator");
    expect(p.hasHooks).toBe(true);
    expect(p.hasMcp).toBe(false);
    expect(p.skills).toBe(3);
    expect(p.commands).toBe(2);
    expect(p.agents).toBe(1);
    expect(p.events).toBe(10);
  });

  test("maps connected MCP servers by name from mcp_server_connection events", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("event_type = 'mcp_server_connection'") && sql.includes("dims['server_name'] AS server")) {
          return [{ server: "claude-design", connections: "6", avgConnectMs: "12.5" }] as never;
        }
        return [] as never;
      },
    };
    const repo = new ClickHouseQueryRepository(client as unknown as ClickHouseClient);
    const caps = await repo.capabilities(range);
    expect(caps.mcp.servers).toEqual([{ server: "claude-design", connections: 6, avgConnectMs: 12.5 }]);
  });

  test("pluginDetail: info null when the plugin has zero events in range", async () => {
    // Aggregate-without-GROUP-BY always returns one row; count()=0 => not seen.
    const client = {
      async query(sql: string) {
        if (sql.includes("count() AS events") && !sql.includes("GROUP BY")) {
          return [{ version: "", marketplace: "", scope: "", enabledVia: "", hasHooks: 0, hasMcp: 0, skills: 0, commands: 0, agents: 0, events: 0 }] as never;
        }
        return [] as never;
      },
    };
    const repo = new ClickHouseQueryRepository(client as unknown as ClickHouseClient);
    const detail = await repo.pluginDetail(range, "ghost");
    expect(detail.info).toBeNull();
  });

  test("pluginDetail: info present when events > 0", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("count() AS events") && !sql.includes("GROUP BY")) {
          return [{ version: "2.0.0", marketplace: "m", scope: "user", enabledVia: "user-install", hasHooks: 1, hasMcp: 1, skills: 5, commands: 0, agents: 2, events: 42 }] as never;
        }
        return [] as never;
      },
    };
    const repo = new ClickHouseQueryRepository(client as unknown as ClickHouseClient);
    const detail = await repo.pluginDetail(range, "rust-analyzer-lsp");
    expect(detail.info).not.toBeNull();
    expect(detail.info!.name).toBe("rust-analyzer-lsp");
    expect(detail.info!.version).toBe("2.0.0");
    expect(detail.info!.hasHooks).toBe(true);
    expect(detail.info!.hasMcp).toBe(true);
    expect(detail.info!.events).toBe(42);
  });
});
