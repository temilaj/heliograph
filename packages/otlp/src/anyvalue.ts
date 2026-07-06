// Shared OTLP AnyValue/attribute decoding for the metrics and logs decoders.
import type { OtlpResource } from "./types.ts";

export interface AnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: AnyValue[] };
  kvlistValue?: { values?: KeyValue[] };
}
export interface KeyValue {
  key: string;
  value?: AnyValue;
}

export function toBigIntNs(v: string | number | undefined): bigint {
  if (v === undefined) return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

export function decodeResource(attrs: KeyValue[] | undefined): OtlpResource {
  return { attributes: decodeAttributes(attrs) };
}

/** Flatten OTLP attributes to a string map (scalars stringified). */
export function decodeAttributes(attrs: KeyValue[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of attrs ?? []) {
    if (!kv.key || kv.value === undefined) continue;
    const s = anyValueToString(kv.value);
    if (s !== undefined) out[kv.key] = s;
  }
  return out;
}

export function anyValueToString(v: AnyValue): string | undefined {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.boolValue !== undefined) return String(v.boolValue);
  if (v.intValue !== undefined) return String(v.intValue);
  if (v.doubleValue !== undefined) return String(v.doubleValue);
  if (v.arrayValue?.values) return JSON.stringify(v.arrayValue.values.map(anyValueToString));
  if (v.kvlistValue?.values) {
    const obj: Record<string, string | undefined> = {};
    for (const kv of v.kvlistValue.values) {
      if (kv.key && kv.value) obj[kv.key] = anyValueToString(kv.value);
    }
    return JSON.stringify(obj);
  }
  return undefined;
}
