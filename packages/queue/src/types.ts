// Queue abstractions over the durable log (Redpanda). Swappable transport;
// in-memory impl for tests. See docs/ARCHITECTURE.md.

export interface QueueMessage {
  /** Partition key — determines ordering locality (see partitionKey). */
  key: string;
  /** Serialized record body. */
  value: string;
}

export interface EventPublisher {
  /** Publish a batch to a topic. Resolves once the broker acks. */
  publish(topic: string, messages: QueueMessage[]): Promise<void>;
  /** Backpressure signal — true if the producer's in-flight buffer is full. */
  isSaturated(): boolean;
  close(): Promise<void>;
}

export interface ConsumedBatch {
  topic: string;
  messages: QueueMessage[];
  /** Commit offsets for this batch (call only after durable downstream write). */
  commit(): Promise<void>;
}

export interface EventConsumer {
  /**
   * Run the consume loop, invoking `handler` per batch. `handler` must throw to
   * signal failure (offsets are then NOT committed → at-least-once redelivery).
   */
  run(handler: (batch: ConsumedBatch) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

/** `org:session` — session locality for prompt.id joins, without pure-org hot partitions. */
export function partitionKey(orgId: string, sessionId: string): string {
  return `${orgId}:${sessionId}`;
}
