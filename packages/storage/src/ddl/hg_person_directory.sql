-- RBAC-gated identity directory: account_hash (== hg_metrics.user_hash) -> person.
-- See docs/ARCHITECTURE.md + ADR-0002. Upserts collapse to latest by updated_at.
CREATE TABLE IF NOT EXISTS hg_person_directory
(
  org_id        LowCardinality(String),
  account_hash  String,
  person_id     String, -- defaults to account_hash until an IdP id is assigned
  display_name  String,
  email         String,
  external_id   String, -- immutable IdP id (SCIM externalId); future join anchor
  updated_at    DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (org_id, account_hash);
