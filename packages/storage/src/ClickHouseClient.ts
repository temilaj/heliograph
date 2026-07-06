// Thin ClickHouse HTTP client (fetch, no driver): batched JSONEachRow inserts + reads.
export interface ClickHouseConfig {
  url: string;
  database: string;
  user?: string;
  password?: string;
}

export class ClickHouseError extends Error {}

export class ClickHouseClient {
  constructor(private readonly cfg: ClickHouseConfig) {}

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.cfg.user) h["X-ClickHouse-User"] = this.cfg.user;
    if (this.cfg.password) h["X-ClickHouse-Key"] = this.cfg.password;
    return h;
  }

  /** DDL/statements. Runs in the configured DB; pass useDatabase:false for CREATE DATABASE. */
  async command(sql: string, opts: { useDatabase?: boolean } = {}): Promise<void> {
    const params = new URLSearchParams();
    if (opts.useDatabase !== false) params.set("database", this.cfg.database);
    const qs = params.toString();
    const res = await fetch(qs ? `${this.cfg.url}/?${qs}` : this.cfg.url, {
      method: "POST",
      headers: { "content-type": "text/plain", ...this.authHeaders() },
      body: sql,
    });
    if (!res.ok) {
      throw new ClickHouseError(`command failed (${res.status}): ${await res.text()}`);
    }
  }

  /** Synchronous JSONEachRow insert — returns only once durably written (before offset commit). */
  async insertJSONEachRow(table: string, rows: object[]): Promise<void> {
    if (rows.length === 0) return;
    const params = new URLSearchParams({
      query: `INSERT INTO ${this.cfg.database}.${table} FORMAT JSONEachRow`,
      date_time_input_format: "best_effort",
    });
    const body = rows.map((r) => JSON.stringify(r)).join("\n");
    const res = await fetch(`${this.cfg.url}/?${params.toString()}`, {
      method: "POST",
      headers: { "content-type": "application/x-ndjson", ...this.authHeaders() },
      body,
    });
    if (!res.ok) {
      throw new ClickHouseError(`insert failed (${res.status}): ${await res.text()}`);
    }
  }

  /**
   * Run a query and return parsed JSON rows (`FORMAT JSON`). Bind external input
   * via `params` ({name:Type} in SQL -> param_name) — never string-interpolate.
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, string> = {},
  ): Promise<T[]> {
    const qs = new URLSearchParams({ database: this.cfg.database });
    for (const [k, v] of Object.entries(params)) qs.set(`param_${k}`, v);
    const res = await fetch(`${this.cfg.url}/?${qs.toString()}`, {
      method: "POST",
      headers: { "content-type": "text/plain", ...this.authHeaders() },
      body: `${sql} FORMAT JSON`,
    });
    if (!res.ok) {
      throw new ClickHouseError(`query failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { data: T[] };
    return json.data;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.cfg.url}/ping`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
