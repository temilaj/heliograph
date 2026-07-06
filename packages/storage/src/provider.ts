// Storage provider: one cohesive contract per backend so swapping the store is a
// config change. Vendor specifics (row shape, DDL) live inside the provider.
import { ClickHouseClient, type ClickHouseConfig } from "./ClickHouseClient.ts";
import { ClickHouseMetricSink, InMemoryMetricSink, type MetricSink } from "./MetricSink.ts";
import { migrate } from "./migrate.ts";

export interface StorageProvider {
  /** Apply schema (no-op for schemaless stores). */
  migrate(): Promise<void>;
  metricSink(): MetricSink;
  // eventSink(): EventSink;      // Phase 2
  // queryRepository(): QueryRepository;  // Phase 3
  health(): Promise<boolean>;
  close(): Promise<void>;
}

export type StorageProviderName = "clickhouse" | "memory";

export interface StorageProviderConfig {
  provider: StorageProviderName;
  clickhouse: ClickHouseConfig;
}

export function makeStorageProvider(cfg: StorageProviderConfig): StorageProvider {
  switch (cfg.provider) {
    case "clickhouse":
      return new ClickHouseStorageProvider(cfg.clickhouse);
    case "memory":
      return new InMemoryStorageProvider();
    default:
      throw new Error(`unknown STORE_PROVIDER: ${cfg.provider satisfies never}`);
  }
}

class ClickHouseStorageProvider implements StorageProvider {
  private readonly ch: ClickHouseClient;
  private sink?: ClickHouseMetricSink;
  constructor(private readonly cfg: ClickHouseConfig) {
    this.ch = new ClickHouseClient(cfg);
  }
  migrate(): Promise<void> {
    return migrate(this.ch, this.cfg.database).then(() => {});
  }
  metricSink(): MetricSink {
    return (this.sink ??= new ClickHouseMetricSink(this.ch));
  }
  health(): Promise<boolean> {
    return this.ch.ping();
  }
  async close(): Promise<void> {}
}

/** In-memory provider for tests. */
export class InMemoryStorageProvider implements StorageProvider {
  readonly sink = new InMemoryMetricSink();
  async migrate(): Promise<void> {}
  metricSink(): MetricSink {
    return this.sink;
  }
  async health(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {}
}
