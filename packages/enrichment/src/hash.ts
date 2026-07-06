// Identity pseudonymization: salted HMAC (stable for joins, not reversible
// without the pepper). See ADR-0002.
import { createHmac, createHash } from "node:crypto";

export type HashFn = (raw: string) => string;

/** HMAC-SHA256 hasher bound to a secret pepper (long-lived; rotating it rehashes everything). */
export function createIdentityHasher(pepper: string): HashFn {
  if (!pepper) throw new Error("IDENTITY_PEPPER must be a non-empty secret");
  return (raw: string) =>
    createHmac("sha256", pepper).update(raw, "utf8").digest("base64url").slice(0, 27);
}

/** Non-secret content hash for dedup keys (no pepper needed — not identity). */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("base64url").slice(0, 27);
}
