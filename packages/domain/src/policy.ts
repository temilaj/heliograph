import type { DataClass } from "./canonical.ts";

/** What the redaction pipeline does with a field. */
export type PolicyAction = "drop" | "hash" | "encrypt" | "allow";

export interface FieldPolicy {
  /** Canonical field name, e.g. "prompt", "user.email". */
  field: string;
  class: DataClass;
  action: PolicyAction;
}

/**
 * Per-org privacy configuration. The default posture is metadata-only:
 * `captureContent=false` means `critical` content fields are dropped even if
 * the source sent them (e.g. Claude Code with OTEL_LOG_USER_PROMPTS=1).
 */
export interface OrgPolicy {
  orgId: string;
  /** When false, `critical` fields are dropped regardless of field policy. */
  captureContent: boolean;
  /** Field-level overrides layered on top of {@link DEFAULT_FIELD_POLICIES}. */
  overrides?: FieldPolicy[];
  /** Extra deny-list substrings (hostnames, project codenames). */
  denyList?: string[];
}

/**
 * Default field policy table. Orgs may TIGHTEN these (e.g. hash -> drop) but the
 * pipeline never loosens a `critical` field to `encrypt` unless the org's
 * `captureContent` flag is true.
 */
export const DEFAULT_FIELD_POLICIES: readonly FieldPolicy[] = [
  // Identity: raw values are ALWAYS dropped; `hash` means "keep HMAC, drop raw".
  // account_uuid is the primary anchor; user.id is device-scoped; email is a
  // fallback join only (adapters for sources that always emit account_uuid,
  // e.g. Claude Code, may tighten user.email to `drop`). See ADR-0002.
  { field: "user.account_uuid", class: "confidential", action: "hash" },
  { field: "user.account_id", class: "confidential", action: "hash" },
  { field: "user.id", class: "confidential", action: "hash" },
  { field: "user.email", class: "confidential", action: "hash" },
  { field: "prompt", class: "critical", action: "drop" },
  { field: "response", class: "critical", action: "drop" },
  { field: "tool_parameters", class: "critical", action: "drop" },
  { field: "raw_api_body", class: "critical", action: "drop" },
  { field: "cost_usd", class: "public", action: "allow" },
];

/** Content fields that are `critical` — only ever kept via encryption + opt-in. */
export const CRITICAL_CONTENT_FIELDS: readonly string[] = [
  "prompt",
  "response",
  "tool_parameters",
  "raw_api_body",
];

export const DEFAULT_ORG_POLICY: OrgPolicy = {
  orgId: "*",
  captureContent: false,
};
