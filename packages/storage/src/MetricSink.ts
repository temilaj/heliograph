// Sinks. Interfaces keep the write path storage-agnostic (ClickHouse / in-memory).
import type { CanonicalEvent, CanonicalMetric } from "@heliograph/domain";
import type { ClickHouseClient } from "./ClickHouseClient.ts";
import { eventToRow, metricToRow } from "./rows.ts";

export interface MetricSink {
  insertBatch(metrics: CanonicalMetric[]): Promise<void>;
}

export interface EventSink {
  insertBatch(events: CanonicalEvent[]): Promise<void>;
}

export class ClickHouseMetricSink implements MetricSink {
  constructor(
    private readonly ch: ClickHouseClient,
    private readonly table = "hg_metrics",
  ) {}

  async insertBatch(metrics: CanonicalMetric[]): Promise<void> {
    await this.ch.insertJSONEachRow(this.table, metrics.map(metricToRow));
  }
}

export class ClickHouseEventSink implements EventSink {
  constructor(
    private readonly ch: ClickHouseClient,
    private readonly table = "hg_events",
  ) {}
  async insertBatch(events: CanonicalEvent[]): Promise<void> {
    await this.ch.insertJSONEachRow(this.table, events.map(eventToRow));
  }
}

/** Test/dev doubles that record everything written. */
export class InMemoryMetricSink implements MetricSink {
  readonly written: CanonicalMetric[] = [];
  async insertBatch(metrics: CanonicalMetric[]): Promise<void> {
    this.written.push(...metrics);
  }
}

export class InMemoryEventSink implements EventSink {
  readonly written: CanonicalEvent[] = [];
  async insertBatch(events: CanonicalEvent[]): Promise<void> {
    this.written.push(...events);
  }
}
