// OTLP/protobuf decoder. Decodes ExportMetrics/LogsServiceRequest bytes into the
// same JS shape as OTLP/JSON (camelCase, longs-as-strings), then reuses the JSON
// decoders — one decode path for both wire formats. See docs/ARCHITECTURE.md §2.1.
import protobuf from "protobufjs";
import { join } from "node:path";
import { OTLP_LOGS_SERVICE_PROTO, OTLP_METRICS_SERVICE_PROTO, OTLP_PROTO_ROOT } from "./proto.ts";
import { OtlpDecodeError, decodeMetricsJson } from "./decode-json.ts";
import { decodeLogsJson } from "./decode-logs-json.ts";
import type { DecodedLogs, DecodedMetrics } from "./types.ts";

const METRICS_REQ = "opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceRequest";
const LOGS_REQ = "opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest";

// Match proto-loader's options so the plain object mirrors OTLP/JSON exactly.
const TO_OBJECT: protobuf.IConversionOptions = {
  longs: String,
  enums: String,
  defaults: false,
  oneofs: true,
};

let cachedRoot: protobuf.Root | undefined;
function root(): protobuf.Root {
  if (!cachedRoot) {
    const r = new protobuf.Root();
    r.resolvePath = (_origin, target) => (target.startsWith("/") ? target : join(OTLP_PROTO_ROOT, target));
    r.loadSync([OTLP_METRICS_SERVICE_PROTO, OTLP_LOGS_SERVICE_PROTO]);
    cachedRoot = r;
  }
  return cachedRoot;
}

function decodeToObject(fullName: string, bytes: Uint8Array): unknown {
  try {
    const type = root().lookupType(fullName);
    return type.toObject(type.decode(bytes), TO_OBJECT);
  } catch (err) {
    throw new OtlpDecodeError(`protobuf decode failed: ${String(err)}`);
  }
}

export function decodeMetricsProto(bytes: Uint8Array): DecodedMetrics {
  return decodeMetricsJson(decodeToObject(METRICS_REQ, bytes));
}

export function decodeLogsProto(bytes: Uint8Array): DecodedLogs {
  return decodeLogsJson(decodeToObject(LOGS_REQ, bytes));
}
