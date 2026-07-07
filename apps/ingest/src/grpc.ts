// OTLP/gRPC receiver (:4317).
import * as grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import {
  OtlpDecodeError,
  OTLP_LOGS_SERVICE_PROTO,
  OTLP_METRICS_SERVICE_PROTO,
  OTLP_PROTO_ROOT,
} from "@heliograph/otlp";
import type { Logger } from "@heliograph/observability";
import { SaturatedError, type IngestResult } from "./pipeline.ts";

// camelCase + longs-as-strings => decoded shape matches OTLP/JSON (reuses the JSON decoders).
const LOAD_OPTS: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: false,
  oneofs: true,
  includeDirs: [OTLP_PROTO_ROOT],
};

export interface GrpcIngestDeps {
  ingestMetrics: (body: unknown) => Promise<IngestResult>;
  ingestEvents: (body: unknown) => Promise<IngestResult>;
  isReady: () => boolean;
  log: Logger;
}

export interface OtlpGrpcHandle {
  port: number;
  shutdown: () => Promise<void>;
}

// async so a synchronous setup failure (proto load, new Server) rejects the
// returned promise instead of throwing past main.ts's .catch and killing HTTP too.
/** Bind the OTLP gRPC server; resolves once listening. */
export async function startOtlpGrpcServer(
  deps: GrpcIngestDeps,
  port: number,
): Promise<OtlpGrpcHandle> {
  // Default max receive is 4 MB; OTLP batches from a busy fleet/collector exceed it.
  const server = new grpc.Server({ "grpc.max_receive_message_length": 32 * 1024 * 1024 });
  const metrics = loadService(OTLP_METRICS_SERVICE_PROTO, "metrics");
  const logs = loadService(OTLP_LOGS_SERVICE_PROTO, "logs");

  server.addService(metrics, { Export: makeExport(deps.ingestMetrics, "metrics", deps) });
  server.addService(logs, { Export: makeExport(deps.ingestEvents, "events", deps) });

  return new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
      if (err) return reject(err);
      resolve({
        port: boundPort,
        shutdown: () => new Promise<void>((res) => server.tryShutdown(() => res())),
      });
    });
  });
}

type UnaryHandler = grpc.handleUnaryCall<{ [k: string]: unknown }, Record<string, never>>;

function makeExport(
  ingest: (body: unknown) => Promise<IngestResult>,
  label: string,
  deps: GrpcIngestDeps,
): UnaryHandler {
  return (call, callback) => {
    if (!deps.isReady()) {
      callback({ code: grpc.status.UNAVAILABLE, message: "not ready" });
      return;
    }
    ingest(call.request)
      .then((result) => {
        deps.log.info(`grpc ${label} ingested`, { accepted: result.accepted });
        callback(null, {}); // empty response = full success
      })
      .catch((err) => {
        if (err instanceof SaturatedError) {
          callback({ code: grpc.status.RESOURCE_EXHAUSTED, message: "saturated" });
          return;
        }
        if (err instanceof OtlpDecodeError) {
          // Client fault: malformed payload — not retryable.
          deps.log.warn(`grpc ${label} decode error`, { err: String(err) });
          callback({ code: grpc.status.INVALID_ARGUMENT, message: String(err) });
          return;
        }
        // Backend/transient fault (e.g. produce failure) — retryable.
        deps.log.error(`grpc ${label} ingest error`, { err: String(err) });
        callback({ code: grpc.status.UNAVAILABLE, message: "ingest unavailable" });
      });
  };
}

function loadService(protoFile: string, signal: "metrics" | "logs"): grpc.ServiceDefinition {
  const def = protoLoader.loadSync(protoFile, LOAD_OPTS);
  const pkg = grpc.loadPackageDefinition(def) as unknown as Record<string, any>;
  const svcName = signal === "metrics" ? "MetricsService" : "LogsService";
  return pkg.opentelemetry.proto.collector[signal].v1[svcName].service;
}
