// Vendored OTLP .proto paths (v1.3.2) for grpc proto-loader.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OTLP_PROTO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "proto");
export const OTLP_METRICS_SERVICE_PROTO =
  "opentelemetry/proto/collector/metrics/v1/metrics_service.proto";
export const OTLP_LOGS_SERVICE_PROTO =
  "opentelemetry/proto/collector/logs/v1/logs_service.proto";
