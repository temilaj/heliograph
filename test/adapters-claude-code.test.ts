import { expect, test, describe } from "bun:test";
import { decodeMetricsJson } from "@heliograph/otlp";
import { AdapterRegistry, ClaudeCodeAdapter } from "@heliograph/adapters";
import { createIdentityHasher } from "@heliograph/enrichment";
import { claudeCodeMetricsPayload } from "../tools/loadgen/src/payload.ts";

const hash = createIdentityHasher("test-pepper");
const ctx = { hash };

function mapAll() {
  const decoded = decodeMetricsJson(claudeCodeMetricsPayload());
  const registry = new AdapterRegistry().register(new ClaudeCodeAdapter());
  return decoded.groups.flatMap((g) => {
    const adapter = registry.resolve(g.scope);
    const rc = adapter.buildResourceContext(g.resource, ctx);
    return g.points.flatMap((p) => adapter.toMetrics(p, rc));
  });
}

describe("ClaudeCodeAdapter", () => {
  test("routes claude-code by service.name", () => {
    const registry = new AdapterRegistry().register(new ClaudeCodeAdapter());
    expect(registry.resolve({ serviceName: "claude-code" }).source).toBe("claude_code");
    expect(registry.resolve({ serviceName: "mystery-tool" }).source).toBe("unknown");
  });

  test("strips the claude_code. prefix from metric names", () => {
    const names = new Set(mapAll().map((m) => m.name));
    expect(names.has("token.usage")).toBe(true);
    expect(names.has("cost.usage")).toBe(true);
    expect([...names].some((n) => n.startsWith("claude_code."))).toBe(false);
  });

  test("promotes hot dimensions and keeps token breakdown", () => {
    const tokens = mapAll().filter((m) => m.name === "token.usage");
    expect(tokens.map((t) => t.tokenType).sort()).toEqual(["cacheRead", "input", "output"]);
    expect(tokens.every((t) => t.model === "claude-opus-4-8")).toBe(true);
  });

  test("pseudonymizes identity and NEVER carries raw email/account", () => {
    const m = mapAll()[0]!;
    const id = m.resource.identity;
    expect(id.orgId).toBe("org_acme"); // tenant kept raw
    expect(id.accountHash).toBe(hash("acct-uuid-999")); // account is the anchor
    expect(id.emailHash).toBeUndefined(); // email dropped when account present
    const blob = JSON.stringify(m, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(blob).not.toContain("jane.doe@acme.com");
    expect(blob).not.toContain("acct-uuid-999");
  });

  test("email is used as fallback only when no account id", () => {
    const adapter = new ClaudeCodeAdapter();
    const rc = adapter.buildResourceContext(
      { attributes: { "service.name": "claude-code", "user.email": "x@y.com" } },
      ctx,
    );
    expect(rc.identity.accountHash).toBeUndefined();
    expect(rc.identity.emailHash).toBe(hash("x@y.com"));
  });
});
