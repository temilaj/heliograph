/**
 * The tool-agnostic canonical model.
 *
 * This is the contract that every {@link SourceAdapter} maps INTO. Nothing
 * downstream of the adapter layer (redaction, enrichment, storage, query) is
 * allowed to know vendor-specific names like `claude_code.*`. That knowledge
 * lives exclusively in the adapters package.
 *
 * Design note: "hot", low-cardinality dimensions are promoted to first-class
 * fields (they become typed ClickHouse columns and ordering keys). The long
 * tail of vendor attributes goes into `attributes` (a String map column).
 */

/** Every coding tool we ingest from. Add a value here when adding an adapter. */
export type SourceId = "claude_code" | "codex" | "cursor" | "unknown";

export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * Pseudonymized identity. Priority: accountHash (anchor) > userIdHash (device) >
 * emailHash (fallback). Raw values never persist. Resolved to a person_id at read
 * time via person_directory. See docs/DECISIONS.md ADR-0002.
 */
export interface Identity {
  /** `organization.id` — tenant key, kept raw. Always present. */
  orgId: string;
  /** Stable HMAC of `user.account_uuid`. Primary person anchor when present. */
  accountHash?: string;
  /** Stable HMAC of `user.id` (anonymous install id). Device-scoped. */
  userIdHash: string;
  /** Stable HMAC of `user.email`. Fallback join key only — never primary. */
  emailHash?: string;
}

/**
 * Resource-level context attached to every metric and event. Mirrors the OTLP
 * Resource, but normalized and pseudonymized.
 */
export interface ResourceContext {
  source: SourceId;
  identity: Identity;
  /** `session.id` */
  sessionId: string;
  appVersion?: string;
  /** cli | vscode | desktop | web | sdk-ts | etc. */
  appEntrypoint?: string;
  /** iTerm | vscode-terminal | warp | ... */
  terminalType?: string;
  // Low-cardinality org dims from OTEL_RESOURCE_ATTRIBUTES, promoted to columns:
  department?: string;
  teamId?: string;
  costCenter?: string;
  region?: string;
  /** Long-tail resource attributes that were not promoted. */
  attributes: Record<string, string>;
}

export type MetricKind = "counter" | "gauge";

/**
 * A single canonical metric data point. `name` is the canonical name
 * (e.g. `"token.usage"`), NOT the vendor name (`"claude_code.token.usage"`).
 */
export interface CanonicalMetric {
  schemaVersion: number;
  source: SourceId;
  name: string;
  kind: MetricKind;
  value: number;
  unit?: string;
  /** Event time, nanoseconds since epoch (OTLP is ns-precision). */
  timestampNs: bigint;
  resource: ResourceContext;
  // Hot dimensions promoted from metric attributes:
  model?: string;
  language?: string;
  editType?: string;
  /**
   * Generic per-metric subtype (the OTLP `type` attribute, which several metrics
   * overload): token.usage input|output|cacheRead|cacheCreation;
   * lines_of_code.count added|removed; active_time.total user|cli.
   */
  subtype?: string;
  startType?: string; // session.count: fresh|resume|continue|agents_view
  querySource?: string;
  toolName?: string;
  decision?: string;
  /** Long-tail metric attributes not promoted above. */
  attributes: Record<string, string>;
  /** Deterministic dedup key, set by enrichment. */
  dedupId?: string;
}

/** The canonical event taxonomy. Vendor event names map onto these. */
export type EventType =
  | "user_prompt"
  | "assistant_response"
  | "api_request"
  | "api_error"
  | "api_refusal"
  | "tool_result"
  | "tool_decision"
  | "permission_mode_changed"
  | "auth"
  | "plugin"
  | "skill_activated"
  | "mcp_server_connection"
  | "hook"
  | "subagent"
  | "at_mention"
  | "api_retries_exhausted"
  | "compaction"
  | "internal_error"
  | "feedback_survey"
  | "unknown";

/**
 * A canonical event.
 *
 * `numbers` and `dims` are already-safe scalars (character counts, durations,
 * token counts, status codes, decisions) that we always keep. `content` is the
 * ONLY place raw free text can live and is structurally gated + encrypted — it
 * is populated only when an org opted into content capture AND the text survived
 * the redaction pipeline.
 */
export interface CanonicalEvent {
  schemaVersion: number;
  source: SourceId;
  eventType: EventType;
  timestampNs: bigint;
  resource: ResourceContext;
  /** `prompt.id` — joins all events of a single user turn together. */
  correlationId?: string;
  /** Safe numeric fields: prompt_length, duration_ms, cost_usd, tokens, ... */
  numbers: Record<string, number>;
  /** Safe string dimensions: model, status_code, decision, success, ... */
  dims: Record<string, string>;
  /** Sensitive text: present only after opt-in + redaction + encryption. */
  content?: ContentPayload;
  /**
   * Transient raw sensitive fields set by adapters and consumed+cleared by the
   * redaction pipeline. Never serialized to the queue or storage.
   */
  stagedContent?: Record<string, string>;
  /** Redaction actions applied (e.g. "secret", "email"), for observability. */
  redactionFlags?: string[];
  /** Long-tail event attributes. */
  attributes: Record<string, string>;
  dedupId?: string;
}

export interface ContentPayload {
  classification: DataClass;
  /** field name (e.g. "prompt") -> encrypted value */
  fields: Record<string, EncryptedField>;
}

export interface EncryptedField {
  alg: string;
  keyId: string;
  ciphertext: string;
}

/** Data classification levels drive the field policy table. */
export type DataClass = "public" | "internal" | "confidential" | "critical";
