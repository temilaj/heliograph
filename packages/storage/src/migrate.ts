// Idempotent migration: applies every ddl/*.sql (all CREATE IF NOT EXISTS). Run: `bun run migrate`.
import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ClickHouseClient } from "./ClickHouseClient.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ddlDir = join(here, "ddl");

// Idempotent post-DDL migrations for pre-existing tables. 
const MIGRATIONS: string[] = [
  "ALTER TABLE hg_metrics RENAME COLUMN IF EXISTS token_type TO subtype",
  "ALTER TABLE hg_metrics ADD COLUMN IF NOT EXISTS start_type LowCardinality(String) AFTER subtype",
];

export async function migrate(ch: ClickHouseClient, database: string): Promise<string[]> {
  await ch.command(`CREATE DATABASE IF NOT EXISTS ${database}`, { useDatabase: false });
  const files = (await readdir(ddlDir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const sql = await Bun.file(join(ddlDir, file)).text();
    await ch.command(sql); // runs in `database` via the ?database= param
    applied.push(file);
  }
  for (const stmt of MIGRATIONS) await ch.command(stmt);
  return applied;
}

if (import.meta.main) {
  const database = process.env.CLICKHOUSE_DB ?? "heliograph";
  const ch = new ClickHouseClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    database,
    user: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
  });
  const applied = await migrate(ch, database);
  process.stdout.write(`migrated: ${applied.join(", ")}\n`);
}
