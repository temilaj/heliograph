// Consume canonical.* -> storage. Offsets commit only after a durable write
// (at-least-once). Un-deserializable (poison) messages go to the DLQ, not blocking.
import type { CanonicalEvent, CanonicalMetric } from "@heliograph/domain";
import { deserialize, type ConsumedBatch, type QueueMessage } from "@heliograph/queue";
import type { EventSink, MetricSink } from "@heliograph/storage";

export interface DlqSink {
  send(sourceTopic: string, messages: QueueMessage[], error: string): Promise<void>;
}

async function processBatch<T>(
  batch: ConsumedBatch,
  decode: (value: string) => T,
  insert: (rows: T[]) => Promise<void>,
  dlq?: DlqSink,
): Promise<number> {
  const good: T[] = [];
  const bad: QueueMessage[] = [];
  for (const m of batch.messages) {
    try {
      good.push(decode(m.value));
    } catch {
      bad.push(m);
    }
  }
  if (bad.length && dlq) await dlq.send(batch.topic, bad, "deserialize_error");
  await insert(good); // insert failure throws -> no commit -> redelivery
  await batch.commit();
  return good.length;
}

export function handleMetricBatch(batch: ConsumedBatch, sink: MetricSink, dlq?: DlqSink) {
  return processBatch(batch, (v) => deserialize<CanonicalMetric>(v), (g) => sink.insertBatch(g), dlq);
}

export function handleEventBatch(batch: ConsumedBatch, sink: EventSink, dlq?: DlqSink) {
  return processBatch(batch, (v) => deserialize<CanonicalEvent>(v), (g) => sink.insertBatch(g), dlq);
}
