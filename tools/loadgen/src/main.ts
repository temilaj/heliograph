// Sends N OTLP/JSON metric requests to the ingest endpoint.
// Usage: bun run loadgen [count] [endpoint]
import { claudeCodeMetricsPayload } from "./payload.ts";

const count = Number(process.argv[2] ?? 1);
const endpoint = process.argv[3] ?? "http://localhost:4318/v1/metrics";

let ok = 0;
let accepted = 0;
const start = performance.now();
// Base timestamps on "now" so rows aren't near the table TTL boundary.
// Set LOADGEN_BASE_NS to a fixed value to make re-sends idempotent (same dedupId).
const baseNs = process.env.LOADGEN_BASE_NS
  ? BigInt(process.env.LOADGEN_BASE_NS)
  : BigInt(Date.now()) * 1_000_000n;

for (let i = 0; i < count; i++) {
  const payload = claudeCodeMetricsPayload({
    sessionId: `sess_${i % 8}`,
    timeUnixNano: String(baseNs + BigInt(i)),
  });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    ok++;
    const body = (await res.json().catch(() => ({}))) as { accepted?: number };
    // ingest does not echo accepted in the OTLP body; count locally instead.
    accepted += body.accepted ?? 0;
  } else {
    process.stderr.write(`request ${i} failed: ${res.status} ${await res.text()}\n`);
  }
}

const ms = performance.now() - start;
process.stdout.write(
  `sent=${count} ok=${ok} in ${ms.toFixed(0)}ms (${((count / ms) * 1000).toFixed(0)} req/s)\n`,
);
