import type { CanonicalEvent, OrgPolicy } from "@heliograph/domain";
import type { EnvelopeEncryptor } from "./encrypt.ts";
import type { ScanResult } from "./scan.ts";

export interface RedactionDeps {
  encrypt: EnvelopeEncryptor;
}

/** One stage in the redaction chain. Mutates the event in place. */
export interface Redactor {
  readonly name: string;
  apply(event: CanonicalEvent, policy: OrgPolicy, deps: RedactionDeps): void;
}

export function addFlags(event: CanonicalEvent, flags: Iterable<string>): void {
  const set = new Set(event.redactionFlags ?? []);
  for (const f of flags) set.add(f);
  event.redactionFlags = [...set];
}

/** Apply a text scanner to every dims value and staged-content value in place. */
export function scanAllFields(event: CanonicalEvent, scanner: (s: string) => ScanResult): void {
  for (const [k, v] of Object.entries(event.dims)) {
    const r = scanner(v);
    event.dims[k] = r.text;
    addFlags(event, r.flags);
  }
  if (event.stagedContent) {
    for (const [k, v] of Object.entries(event.stagedContent)) {
      const r = scanner(v);
      event.stagedContent[k] = r.text;
      addFlags(event, r.flags);
    }
  }
}
