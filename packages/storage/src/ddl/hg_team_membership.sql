-- Team membership: account_hash (== hg_metrics.user_hash) -> team. Mirrors
-- hg_person_directory. Upserts collapse to latest by updated_at; one team per person.
CREATE TABLE IF NOT EXISTS hg_team_membership
(
  org_id        LowCardinality(String),
  account_hash  String, -- joins against hg_metrics/hg_events.user_hash
  team          LowCardinality(String),
  updated_at    DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (org_id, account_hash);
