// Identity resolver (ADR-0002): the person_directory contract, and the crux —
// the loader hashes user.account_uuid with the SAME hasher as ingest, so a
// directory row joins telemetry's user_hash. If that ever drifts, names vanish.
import { describe, expect, test } from "bun:test";
import { AdapterRegistry, ClaudeCodeAdapter } from "@heliograph/adapters";
import { Enricher, createIdentityHasher } from "@heliograph/enrichment";
import { InMemoryBus, deserialize } from "@heliograph/queue";
import { InMemoryPersonDirectory, metricToRow } from "@heliograph/storage";
import type { CanonicalMetric } from "@heliograph/domain";
import { MetricsIngestPipeline } from "../apps/ingest/src/pipeline.ts";
import { claudeCodeMetricsPayload } from "../tools/loadgen/src/payload.ts";

describe("PersonDirectory", () => {
  test("upsert then resolve returns the person; personId defaults to the hash", async () => {
    const dir = new InMemoryPersonDirectory();
    await dir.upsert([
      { orgId: "org_acme", accountHash: "H_ada", displayName: "Ada Lovelace", email: "ada@acme" },
      { orgId: "org_acme", accountHash: "H_alan", personId: "P_alan", displayName: "Alan Turing", email: "alan@acme" },
    ]);
    const got = await dir.resolve("org_acme", ["H_ada", "H_alan"]);
    expect(got.get("H_ada")).toEqual({ personId: "H_ada", displayName: "Ada Lovelace", email: "ada@acme" });
    expect(got.get("H_alan")?.personId).toBe("P_alan");
  });

  test("unknown hashes are omitted (caller falls back to the hash)", async () => {
    const dir = new InMemoryPersonDirectory();
    await dir.upsert([{ orgId: "org_acme", accountHash: "H_ada", displayName: "Ada", email: "a@x" }]);
    const got = await dir.resolve("org_acme", ["H_ada", "H_unknown"]);
    expect(got.has("H_unknown")).toBe(false);
    expect(got.size).toBe(1);
  });

  test("resolution is org-scoped (no cross-tenant leak)", async () => {
    const dir = new InMemoryPersonDirectory();
    await dir.upsert([{ orgId: "org_a", accountHash: "H_x", displayName: "A", email: "a@x" }]);
    expect((await dir.resolve("org_b", ["H_x"])).size).toBe(0);
  });

  test("latest upsert wins for the same (org, hash)", async () => {
    const dir = new InMemoryPersonDirectory();
    await dir.upsert([{ orgId: "o", accountHash: "H", displayName: "Old", email: "old@x" }]);
    await dir.upsert([{ orgId: "o", accountHash: "H", displayName: "New", email: "new@x" }]);
    expect((await dir.resolve("o", ["H"])).get("H")?.displayName).toBe("New");
  });

  test("loader hash of account_uuid joins telemetry user_hash", async () => {
    const pepper = "test-pepper";
    const hash = createIdentityHasher(pepper);
    const accountUuid = "acct-uuid-999"; // the payload's user.account_uuid

    // Telemetry side: run a metric through ingest, read the stored user_hash.
    const bus = new InMemoryBus();
    const pipeline = new MetricsIngestPipeline({
      registry: new AdapterRegistry().register(new ClaudeCodeAdapter()),
      hash,
      enricher: new Enricher(),
      publisher: bus.publisher(),
      metricsTopic: "canonical.metrics",
    });
    await pipeline.ingestJson(claudeCodeMetricsPayload({ accountUuid }));
    const metric = deserialize<CanonicalMetric>((bus.topics.get("canonical.metrics") ?? [])[0]!.value);
    const userHash = metricToRow(metric).user_hash;

    // Directory side: loader hashes the raw account_uuid the same way.
    const dir = new InMemoryPersonDirectory();
    await dir.upsert([
      { orgId: "org_acme", accountHash: hash(accountUuid), displayName: "Jane Doe", email: "jane@acme" },
    ]);

    // The join: resolving the telemetry user_hash finds the person.
    expect(userHash).toBe(hash(accountUuid));
    expect((await dir.resolve("org_acme", [userHash])).get(userHash)?.displayName).toBe("Jane Doe");
  });
});
