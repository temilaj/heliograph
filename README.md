# heliograph

Telemetry ingestion for AI coding tools (OpenTelemetry). Collects the OTLP that Claude Code — and later Codex, Cursor, and others — emit, normalizes it into a tool-agnostic canonical model, strips PII/sensitive content, and lands it in ClickHouse for cost/adoption/reliability analytics.

```
Claude Code ──OTLP──►  ingest (adapt → drop content → enrich → produce) ──► Redpanda ──► processor (consume → sink) ──► ClickHouse ──► read-api ──► dashboard
```



## Privacy

Metadata-only today: counts, tokens, cost, durations, decisions, and model/tool names. Sensitive free text (prompt / response / tool_parameters / raw API bodies) is **dropped at ingest** — it never reaches the queue or storage. No raw identity is stored either: `user.email` / `user.account_uuid` / `user.id` are salted-HMAC hashed at the adapter boundary. Rationale, the redaction pipeline (built but not wired),

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- Docker (for Redpanda + ClickHouse)

## Run it

Dev flow: infra in Docker, services via Bun:

```bash
cp .env.example .env && bun install
docker compose up -d redpanda clickhouse      # infra only (Kafka API + ClickHouse)

bun run migrate                               # create hg_metrics + hg_events
bun run processor &                           # consume → ClickHouse (:9465 ops)
bun run ingest &                              # OTLP HTTP :4318
bun run read-api &                            # :8080 (+ dashboard at /)

bun run loadgen 10                            # 10 metric batches → /v1/metrics
bun run loadgen events 5                      # 5 event turns     → /v1/logs

open http://localhost:8080                    # dashboard (defaults to org_acme)
curl -s "http://localhost:8080/v1/summary?org=org_acme"   # raw aggregates
```

The dashboard is a React SPA (`apps/dashboard`) served by read-api — no separate frontend server or build step. Bundling runs in dev/HMR mode by default; set `NODE_ENV=production` for production serving.

Tear down: `pkill -f "apps/.*/src/main.ts"` then `docker compose down -v`.

### All in Docker (one command)

`docker compose up -d` runs the whole stack — Redpanda, ClickHouse, and all three
services (the processor migrates the schema on boot). No host Bun needed; loadgen
runs inside the container.

```bash
docker compose up -d                                                  # everything
# wait ~30s for the consumer to join, then:
docker compose exec ingest bun run tools/loadgen/src/main.ts 10        # metrics
docker compose exec ingest bun run tools/loadgen/src/main.ts events 5  # events
open http://localhost:8080                                            # dashboard
```

Tear down with `docker compose down -v`.

## Testing

All tests live in `test/` (not colocated with source), named `<area>.test.ts`.

```bash
bun test          # unit + integration
bun run typecheck # tsc --noEmit
```


