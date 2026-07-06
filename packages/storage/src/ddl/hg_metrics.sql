-- Canonical metrics, one row per data point. ReplacingMergeTree collapses
-- at-least-once dupes by dedup_id (reads use FINAL). Ordering low->high
-- cardinality for granule pruning. See docs/ARCHITECTURE.md.
CREATE TABLE IF NOT EXISTS hg_metrics
(
  event_date   Date DEFAULT toDate(timestamp),
  timestamp    DateTime64(9),
  ingest_time  DateTime64(3) DEFAULT now64(3),
  source       LowCardinality(String),
  name         LowCardinality(String),
  kind         LowCardinality(String),
  unit         LowCardinality(String),
  value        Float64,
  org_id       LowCardinality(String),
  user_hash    String,
  session_id   String,
  model        LowCardinality(String),
  language     LowCardinality(String),
  edit_type    LowCardinality(String),
  subtype      LowCardinality(String),
  start_type   LowCardinality(String),
  query_source LowCardinality(String),
  tool_name    LowCardinality(String),
  decision     LowCardinality(String),
  department   LowCardinality(String),
  team_id      LowCardinality(String),
  cost_center  LowCardinality(String),
  region       LowCardinality(String),
  app_version  LowCardinality(String),
  entrypoint   LowCardinality(String),
  attributes   Map(String, String),
  dedup_id     String
)
ENGINE = ReplacingMergeTree(ingest_time)
PARTITION BY toYYYYMMDD(event_date)
ORDER BY (org_id, source, name, session_id, timestamp, dedup_id)
TTL event_date + INTERVAL 365 DAY;
