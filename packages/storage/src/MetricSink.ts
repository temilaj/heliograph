// Metric sink. Interface keeps the write path storage-agnostic (ClickHouse / in-memory).
import type { CanonicalMetric } from "@heliograph/domain";
import type { ClickHouseClient } from "./ClickHouseClient.ts";
import { metricToRow } from "./rows.ts";

export interface MetricSink {
  insertBatch(metrics: CanonicalMetric[]): Promise<void>;
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

/** Test/dev double that records everything written. */
export class InMemoryMetricSink implements MetricSink {
  readonly written: CanonicalMetric[] = [];
  async insertBatch(metrics: CanonicalMetric[]): Promise<void> {
    this.written.push(...metrics);
  }
}
