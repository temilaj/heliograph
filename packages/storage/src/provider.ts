// Storage provider: one cohesive contract per backend so swapping the store is a
// config change. Vendor specifics (row shape, DDL) live inside the provider.
import { ClickHouseClient, type ClickHouseConfig } from "./ClickHouseClient.ts";
import {
  ClickHouseEventSink,
  ClickHouseMetricSink,
  InMemoryEventSink,
  InMemoryMetricSink,
  type EventSink,
  type MetricSink,
} from "./MetricSink.ts";
import {
  ClickHouseQueryRepository,
  InMemoryQueryRepository,
  type QueryRepository,
} from "./QueryRepository.ts";
import {
  ClickHousePersonDirectory,
  InMemoryPersonDirectory,
  type PersonDirectory,
} from "./PersonDirectory.ts";
import { migrate } from "./migrate.ts";

export interface StorageProvider {
  /** Apply schema (no-op for schemaless stores). */
  migrate(): Promise<void>;
  metricSink(): MetricSink;
  eventSink(): EventSink;
  queryRepository(): QueryRepository;
  /** RBAC-gated identity directory (ADR-0002); resolves user_hash → person. */
  personDirectory(): PersonDirectory;
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
  private mSink?: ClickHouseMetricSink;
  private eSink?: ClickHouseEventSink;
  constructor(private readonly cfg: ClickHouseConfig) {
    this.ch = new ClickHouseClient(cfg);
  }
  migrate(): Promise<void> {
    return migrate(this.ch, this.cfg.database).then(() => {});
  }
  metricSink(): MetricSink {
    return (this.mSink ??= new ClickHouseMetricSink(this.ch));
  }
  eventSink(): EventSink {
    return (this.eSink ??= new ClickHouseEventSink(this.ch));
  }
  queryRepository(): QueryRepository {
    return new ClickHouseQueryRepository(this.ch);
  }
  personDirectory(): PersonDirectory {
    return new ClickHousePersonDirectory(this.ch);
  }
  health(): Promise<boolean> {
    return this.ch.ping();
  }
  async close(): Promise<void> {}
}

/** In-memory provider for tests. */
export class InMemoryStorageProvider implements StorageProvider {
  readonly sink = new InMemoryMetricSink();
  readonly events = new InMemoryEventSink();
  readonly directory = new InMemoryPersonDirectory();
  async migrate(): Promise<void> {}
  metricSink(): MetricSink {
    return this.sink;
  }
  eventSink(): EventSink {
    return this.events;
  }
  queryRepository(): QueryRepository {
    return new InMemoryQueryRepository();
  }
  personDirectory(): PersonDirectory {
    return this.directory;
  }
  async health(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {}
}
