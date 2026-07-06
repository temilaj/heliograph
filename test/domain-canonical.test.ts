import { expect, test, describe } from "bun:test";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_FIELD_POLICIES,
  DEFAULT_ORG_POLICY,
  CRITICAL_CONTENT_FIELDS,
  type CanonicalMetric,
} from "@heliograph/domain";

describe("domain canonical model", () => {
  test("schema version is pinned", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  test("default org policy is metadata-only", () => {
    expect(DEFAULT_ORG_POLICY.captureContent).toBe(false);
  });

  test("every critical content field defaults to drop", () => {
    for (const field of CRITICAL_CONTENT_FIELDS) {
      const policy = DEFAULT_FIELD_POLICIES.find((p) => p.field === field);
      expect(policy).toBeDefined();
      expect(policy!.class).toBe("critical");
      expect(policy!.action).toBe("drop");
    }
  });

  test("a canonical metric carries no vendor-prefixed name", () => {
    const m: CanonicalMetric = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      source: "claude_code",
      name: "token.usage",
      kind: "counter",
      value: 1234,
      unit: "token",
      timestampNs: 1_700_000_000_000_000_000n,
      resource: {
        source: "claude_code",
        identity: { userIdHash: "abc", orgId: "org_1" },
        sessionId: "sess_1",
        attributes: {},
      },
      attributes: {},
    };
    expect(m.name.startsWith("claude_code.")).toBe(false);
  });
});
