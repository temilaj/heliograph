import { expect, test, describe } from "bun:test";
import { makeStorageProvider } from "@heliograph/storage";
import { orgFrom, dateRange } from "../apps/read-api/src/routes.ts";

describe("read-api tenant scoping", () => {
  test("org comes from X-Org-Id header or ?org=, else null", () => {
    expect(orgFrom(new Request("http://x/v1/summary", { headers: { "x-org-id": "o1" } }))).toBe("o1");
    expect(orgFrom(new Request("http://x/v1/summary?org=o2"))).toBe("o2");
    expect(orgFrom(new Request("http://x/v1/summary"))).toBeNull();
  });

  test("date range honors params and defaults to YYYY-MM-DD", () => {
    const explicit = dateRange(new Request("http://x/s?from=2026-01-01&to=2026-02-01"), "o");
    expect(explicit).toEqual({ org: "o", from: "2026-01-01", to: "2026-02-01" });
    const def = dateRange(new Request("http://x/s"), "o");
    expect(def.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(def.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("storage query repository seam", () => {
  test("provider exposes a query repository (in-memory returns empty)", async () => {
    const repo = makeStorageProvider({ provider: "memory", clickhouse: {} as never }).queryRepository();
    const summary = await repo.summary({ org: "o", from: "2026-01-01", to: "2026-02-01" });
    expect(summary.adoption.activeUsers).toBe(0);
    expect(summary.cost).toEqual([]);
    expect(await repo.orgs()).toEqual([]);
  });
});
