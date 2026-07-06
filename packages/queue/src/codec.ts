// JSON codec that round-trips bigint (ns timestamps exceed MAX_SAFE_INTEGER).
const BIGINT_TAG = "__bigint__";

export function serialize(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === "bigint" ? { [BIGINT_TAG]: v.toString() } : v,
  );
}

export function deserialize<T>(text: string): T {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === "object" && typeof v[BIGINT_TAG] === "string") {
      return BigInt(v[BIGINT_TAG]);
    }
    return v;
  }) as T;
}
