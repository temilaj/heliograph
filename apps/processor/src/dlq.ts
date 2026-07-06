// DLQ sink over an EventPublisher: wraps poison messages with error metadata.
import { serialize, type EventPublisher, type QueueMessage } from "@heliograph/queue";
import type { DlqSink } from "./consume.ts";

export class PublisherDlq implements DlqSink {
  constructor(
    private readonly publisher: EventPublisher,
    private readonly topic: string,
  ) {}

  async send(sourceTopic: string, messages: QueueMessage[], error: string): Promise<void> {
    await this.publisher.publish(
      this.topic,
      messages.map((m) => ({
        key: m.key,
        value: serialize({ sourceTopic, error, original: m.value }),
      })),
    );
  }
}
