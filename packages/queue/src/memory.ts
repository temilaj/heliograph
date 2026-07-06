// In-memory publisher/consumer for tests — same interface as the Kafka impl.
import type {
  ConsumedBatch,
  EventConsumer,
  EventPublisher,
  QueueMessage,
} from "./types.ts";

export class InMemoryBus {
  readonly topics = new Map<string, QueueMessage[]>();

  publisher(): EventPublisher {
    return {
      publish: async (topic, messages) => {
        const arr = this.topics.get(topic) ?? [];
        arr.push(...messages);
        this.topics.set(topic, arr);
      },
      isSaturated: () => false,
      close: async () => {},
    };
  }

  /** Drain a topic once through the handler (commit is a no-op in memory). */
  consumerFor(topic: string): EventConsumer {
    return {
      run: async (handler: (batch: ConsumedBatch) => Promise<void>) => {
        const messages = this.topics.get(topic) ?? [];
        if (messages.length === 0) return;
        await handler({ topic, messages: [...messages], commit: async () => {} });
      },
      close: async () => {},
    };
  }
}
