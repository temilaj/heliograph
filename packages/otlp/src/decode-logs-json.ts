// OTLP/JSON logs decoder. Claude Code emits events as OTel log records; the
// event name is in the `event.name` (or `name`) attribute.
import type { DecodedLogs, DecodedLogGroup, OtlpLogRecord, ResourceScope } from "./types.ts";
import { decodeAttributes, decodeResource, toBigIntNs, type KeyValue } from "./anyvalue.ts";
import { OtlpDecodeError } from "./decode-json.ts";

interface LogRecord {
  timeUnixNano?: string | number;
  observedTimeUnixNano?: string | number;
  severityNumber?: number;
  body?: { stringValue?: string };
  attributes?: KeyValue[];
}
interface ScopeLogs {
  scope?: { name?: string; version?: string };
  logRecords?: LogRecord[];
}
interface ResourceLogs {
  resource?: { attributes?: KeyValue[] };
  scopeLogs?: ScopeLogs[];
}
interface LogsPayload {
  resourceLogs?: ResourceLogs[];
}

export function decodeLogsJson(body: unknown): DecodedLogs {
  if (typeof body !== "object" || body === null) {
    throw new OtlpDecodeError("logs payload must be a JSON object");
  }
  const payload = body as LogsPayload;
  const groups: DecodedLogGroup[] = [];

  for (const rl of payload.resourceLogs ?? []) {
    const resource = decodeResource(rl.resource?.attributes);
    for (const sl of rl.scopeLogs ?? []) {
      const scope: ResourceScope = {
        serviceName: resource.attributes["service.name"],
        scopeName: sl.scope?.name,
        scopeVersion: sl.scope?.version,
      };
      const records: OtlpLogRecord[] = [];
      for (const lr of sl.logRecords ?? []) {
        const attributes = decodeAttributes(lr.attributes);
        records.push({
          eventName: attributes["event.name"] ?? attributes["name"],
          timestampNs: toBigIntNs(lr.timeUnixNano ?? lr.observedTimeUnixNano),
          severityNumber: lr.severityNumber,
          body: lr.body?.stringValue,
          attributes,
        });
      }
      if (records.length > 0) groups.push({ resource, scope, records });
    }
  }
  return { groups };
}
