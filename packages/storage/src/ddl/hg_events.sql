-- Canonical events, one row per event. Correlated by correlation_id (prompt.id).
-- Sensitive text is never here in plaintext: content_fields holds ciphertext only
-- (present only for opted-in orgs); default posture is metadata-only.
-- Content dies earlier than metadata via the column-level TTL.
CREATE TABLE IF NOT EXISTS hg_events
(
  event_date     Date DEFAULT toDate(timestamp),
  timestamp      DateTime64(9),
  ingest_time    DateTime64(3) DEFAULT now64(3),
  source         LowCardinality(String),
  event_type     LowCardinality(String),
  org_id         LowCardinality(String),
  user_hash      String,
  session_id     String,
  correlation_id String,
  model          LowCardinality(String),
  status_code    LowCardinality(String),
  decision       LowCardinality(String),
  numbers        Map(String, Float64),
  dims           Map(String, String),
  department     LowCardinality(String),
  team_id        LowCardinality(String),
  region         LowCardinality(String),
  app_version    LowCardinality(String),
  attributes     Map(String, String),
  redaction_flags Array(String),
  content_class  LowCardinality(String),
  content_keyid  String,
  -- Column TTL: encrypted content is wiped 30 days before the row (metadata) expires.
  content_fields Map(String, String) TTL event_date + INTERVAL 30 DAY,
  dedup_id       String
)
ENGINE = ReplacingMergeTree(ingest_time)
PARTITION BY toYYYYMMDD(event_date)
ORDER BY (org_id, source, event_type, session_id, correlation_id, timestamp, dedup_id)
TTL event_date + INTERVAL 90 DAY;
