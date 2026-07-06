// Consume canonical.metrics -> ClickHouse. Offsets commit only after a durable
// write (at-least-once). See docs/ARCHITECTURE.md.
import type { CanonicalMetric } from "@heliograph/domain";
import { deserialize, type ConsumedBatch } from "@heliograph/queue";
import type { MetricSink } from "@heliograph/storage";

export async function handleMetricBatch(
  batch: ConsumedBatch,
  sink: MetricSink,
): Promise<number> {
  const metrics = batch.messages.map((m) => deserialize<CanonicalMetric>(m.value));
  await sink.insertBatch(metrics);
  await batch.commit();
  return metrics.length;
}
