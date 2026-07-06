// Redpanda (Kafka API) via kafkajs. Consumer commits manually after the
// downstream write (at-least-once). See docs/ARCHITECTURE.md.
import { Kafka, type Consumer, type Producer, logLevel } from "kafkajs";
import type {
  ConsumedBatch,
  EventConsumer,
  EventPublisher,
  QueueMessage,
} from "./types.ts";

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
}

function client(cfg: KafkaConfig): Kafka {
  return new Kafka({
    clientId: cfg.clientId,
    brokers: cfg.brokers,
    logLevel: logLevel.NOTHING,
    retry: { retries: 8, initialRetryTime: 100 },
  });
}

/** Ensure topics exist (idempotent). Redpanda can auto-create, but be explicit. */
export async function ensureTopics(
  cfg: KafkaConfig,
  topics: string[],
  partitions = 12,
): Promise<void> {
  const admin = client(cfg).admin();
  await admin.connect();
  try {
    const existing = new Set(await admin.listTopics());
    const toCreate = topics
      .filter((t) => !existing.has(t))
      .map((topic) => ({ topic, numPartitions: partitions, replicationFactor: 1 }));
    if (toCreate.length > 0) await admin.createTopics({ topics: toCreate });
  } finally {
    await admin.disconnect();
  }
}

export class KafkaPublisher implements EventPublisher {
  private readonly producer: Producer;
  private connected = false;
  private inFlight = 0;
  private readonly maxInFlight: number;

  constructor(cfg: KafkaConfig, maxInFlight = 5000) {
    this.producer = client(cfg).producer({ allowAutoTopicCreation: true });
    this.maxInFlight = maxInFlight;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async publish(topic: string, messages: QueueMessage[]): Promise<void> {
    await this.ensureConnected();
    this.inFlight += messages.length;
    try {
      await this.producer.send({
        topic,
        messages: messages.map((m) => ({ key: m.key, value: m.value })),
      });
    } finally {
      this.inFlight = Math.max(0, this.inFlight - messages.length);
    }
  }

  isSaturated(): boolean {
    return this.inFlight >= this.maxInFlight;
  }

  async close(): Promise<void> {
    if (this.connected) await this.producer.disconnect();
    this.connected = false;
  }
}

export class KafkaConsumer implements EventConsumer {
  private readonly consumer: Consumer;
  private readonly topics: string[];

  constructor(cfg: KafkaConfig, groupId: string, topics: string[]) {
    this.consumer = client(cfg).consumer({ groupId });
    this.topics = topics;
  }

  async run(handler: (batch: ConsumedBatch) => Promise<void>): Promise<void> {
    await this.consumer.connect();
    for (const topic of this.topics) {
      await this.consumer.subscribe({ topic, fromBeginning: true });
    }
    await this.consumer.run({
      autoCommit: false,
      eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
        const messages: QueueMessage[] = batch.messages.map((m) => ({
          key: m.key?.toString() ?? "",
          value: m.value?.toString() ?? "",
        }));
        if (messages.length === 0) return;

        const lastOffset = batch.messages[batch.messages.length - 1]!.offset;
        const consumed: ConsumedBatch = {
          topic: batch.topic,
          messages,
          // Explicit commit of lastOffset+1 (commitOffsetsIfNecessary no-ops with autoCommit off).
          commit: async () => {
            for (const m of batch.messages) resolveOffset(m.offset);
            await this.consumer.commitOffsets([
              {
                topic: batch.topic,
                partition: batch.partition,
                offset: (BigInt(lastOffset) + 1n).toString(),
              },
            ]);
          },
        };
        // Handler throwing => offsets not committed => redelivery (at-least-once).
        await handler(consumed);
        await heartbeat();
      },
    });
  }

  async close(): Promise<void> {
    await this.consumer.disconnect();
  }
}
