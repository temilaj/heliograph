// Claude Code event-name -> canonical EventType, and which attributes are
// sensitive content (routed to redaction, never stored as dims).
import type { EventType } from "@heliograph/domain";

const EVENT_TYPE_BY_NAME: Record<string, EventType> = {
  user_prompt: "user_prompt",
  assistant_response: "assistant_response",
  api_request: "api_request",
  api_error: "api_error",
  api_refusal: "api_refusal",
  tool_result: "tool_result",
  tool_decision: "tool_decision",
  permission_mode_changed: "permission_mode_changed",
  auth: "auth",
  plugin_installed: "plugin",
  plugin_loaded: "plugin",
  skill_activated: "skill_activated",
  mcp_server_connection: "mcp_server_connection",
  hook_registered: "hook",
  hook_execution_start: "hook",
  hook_execution_complete: "hook",
  hook_plugin_metrics: "hook",
  subagent_start: "subagent",
  subagent_completed: "subagent",
  at_mention: "at_mention",
  api_retries_exhausted: "api_retries_exhausted",
  compaction: "compaction",
  internal_error: "internal_error",
  feedback_survey: "feedback_survey",
  // `api_request_body`/`api_response_body` (raw-body dumps, gated behind
  // OTEL_LOG_RAW_API_BODIES) are deliberately absent: the domain EventType union
  // has no fitting member, and mapping a response body onto `api_request` would
  // conflate distinct events and inflate request counts. They fall through to
  // "unknown" (event.name preserved in dims); their `body`/`body_ref` content is
  // always dropped via CONTENT_KEYS, so no raw body ever leaks into dims/numbers.
};

const VENDOR_PREFIX = "claude_code.";

export function toEventType(eventName: string | undefined): EventType {
  if (!eventName) return "unknown";
  const bare = eventName.startsWith(VENDOR_PREFIX)
    ? eventName.slice(VENDOR_PREFIX.length)
    : eventName;
  return EVENT_TYPE_BY_NAME[bare] ?? "unknown";
}

/**
 * Attribute keys carrying free-text content — routed to redaction, never dims.
 * `tool_input` (actual tool args: bash commands, file-write contents, paths,
 * grep patterns) and `error` (free-text error messages) are the OTEL_LOG_TOOL_DETAILS
 * fields; only the free-text `error` string is dropped — structured
 * `error_type`/`status_code`/`error_code`/`error_category` still flow as dims/numbers.
 * `body` (inline raw request/response JSON, truncated ~60KB) and `body_ref` (a
 * file-path reference to the untruncated body on disk) are the real raw-body
 * content keys — the OTEL_LOG_RAW_API_BODIES fields on
 * `api_request_body`/`api_response_body`. (There is no `raw_api_body` attribute;
 * that was a name Claude Code never emits.) The structured
 * `body_length`/`body_truncated` (numbers) still flow safely.
 */
export const CONTENT_KEYS = new Set([
  "prompt",
  "response",
  "tool_parameters",
  "tool_input",
  "error",
  "body",
  "body_ref",
]);

/** Attribute keys the adapter consumes directly, so excluded from numbers/dims. */
export const CONSUMED_EVENT_KEYS = new Set(["event.name", "name", "prompt.id"]);

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function isNumeric(value: string): boolean {
  return NUMERIC.test(value);
}
