// Queue provider: one cohesive contract per transport so swapping Redpanda ->
// Kafka/Pulsar/Kinesis/PubSub is a config change, not a wiring edit.
import type { EventConsumer, EventPublisher } from "./types.ts";
import { InMemoryBus } from "./memory.ts";
import { KafkaConsumer, KafkaPublisher, ensureTopics, type KafkaConfig } from "./kafka.ts";

export interface QueueProvider {
  /** Idempotent setup (e.g. create topics). Call once at boot. */
  init(topics: string[]): Promise<void>;
  /** Shared publisher for this process. */
  publisher(): EventPublisher;
  /** A consumer bound to a group + topics. */
  consumer(groupId: string, topics: string[]): EventConsumer;
  close(): Promise<void>;
}

export type QueueProviderName = "kafka" | "memory";

export interface QueueProviderConfig {
  provider: QueueProviderName;
  kafka: KafkaConfig;
}

export function makeQueueProvider(cfg: QueueProviderConfig): QueueProvider {
  switch (cfg.provider) {
    case "kafka":
      return new KafkaQueueProvider(cfg.kafka);
    case "memory":
      return new InMemoryQueueProvider();
    default:
      throw new Error(`unknown QUEUE_PROVIDER: ${cfg.provider satisfies never}`);
  }
}

class KafkaQueueProvider implements QueueProvider {
  private pub?: KafkaPublisher;
  constructor(private readonly cfg: KafkaConfig) {}

  init(topics: string[]): Promise<void> {
    return ensureTopics(this.cfg, topics);
  }
  publisher(): EventPublisher {
    return (this.pub ??= new KafkaPublisher(this.cfg));
  }
  consumer(groupId: string, topics: string[]): EventConsumer {
    return new KafkaConsumer(this.cfg, groupId, topics);
  }
  async close(): Promise<void> {
    await this.pub?.close();
  }
}

/** In-memory provider for tests: publisher and consumers share one bus. */
export class InMemoryQueueProvider implements QueueProvider {
  readonly bus = new InMemoryBus();
  async init(): Promise<void> {}
  publisher(): EventPublisher {
    return this.bus.publisher();
  }
  consumer(_groupId: string, topics: string[]): EventConsumer {
    return this.bus.consumerFor(topics[0]!);
  }
  async close(): Promise<void> {}
}
