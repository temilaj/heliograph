// Central env parsing.

export interface KafkaEnv {
  brokers: string[];
  clientId: string;
  topics: { metrics: string; events: string; dlq: string };
}

export interface ClickHouseEnv {
  url: string;
  database: string;
  user?: string;
  password?: string;
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing required env: ${name}`);
  return v;
}

export function kafkaEnv(): KafkaEnv {
  return {
    brokers: req("KAFKA_BROKERS", "localhost:19092").split(",").map((s) => s.trim()),
    clientId: req("KAFKA_CLIENT_ID", "heliograph"),
    topics: {
      metrics: req("TOPIC_METRICS", "canonical.metrics"),
      events: req("TOPIC_EVENTS", "canonical.events"),
      dlq: req("TOPIC_DLQ", "canonical.dlq"),
    },
  };
}

export function clickhouseEnv(): ClickHouseEnv {
  return {
    url: req("CLICKHOUSE_URL", "http://localhost:8123"),
    database: req("CLICKHOUSE_DB", "heliograph"),
    user: process.env.CLICKHOUSE_USER || undefined,
    password: process.env.CLICKHOUSE_PASSWORD || undefined,
  };
}

export function identityPepper(): string {
  return req("IDENTITY_PEPPER", "dev-only-change-me");
}

export function queueProviderName(): "kafka" | "memory" {
  return (process.env.QUEUE_PROVIDER as "kafka" | "memory") || "kafka";
}
export function storeProviderName(): "clickhouse" | "memory" {
  return (process.env.STORE_PROVIDER as "clickhouse" | "memory") || "clickhouse";
}
