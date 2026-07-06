// Envelope encryption for content that an org opted to capture. Per-org data key
// derived (HKDF) from a master key; AES-256-GCM. Ciphertext = base64(iv|tag|ct).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from "node:crypto";
import type { EncryptedField } from "@heliograph/domain";

const ALG = "aes-256-gcm";

export interface EnvelopeEncryptor {
  encrypt(plaintext: string, orgId: string): EncryptedField;
  decrypt(field: EncryptedField, orgId: string): string;
}

export function createEnvelopeEncryptor(masterKey: Buffer): EnvelopeEncryptor {
  if (masterKey.length < 32) throw new Error("content master key must be >= 32 bytes");

  const orgKey = (orgId: string): Buffer =>
    Buffer.from(hkdfSync("sha256", masterKey, Buffer.from(orgId), Buffer.from("heliograph-content"), 32));

  const keyId = (orgId: string) =>
    `org:${createHash("sha256").update(orgId).digest("hex").slice(0, 12)}:v1`;

  return {
    encrypt(plaintext, orgId) {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALG, orgKey(orgId), iv);
      const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return { alg: ALG, keyId: keyId(orgId), ciphertext: Buffer.concat([iv, tag, ct]).toString("base64") };
    },
    decrypt(field, orgId) {
      const buf = Buffer.from(field.ciphertext, "base64");
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ct = buf.subarray(28);
      const decipher = createDecipheriv(ALG, orgKey(orgId), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    },
  };
}

/** Parse a base64 master key from env, or a dev default (NOT for production). */
export function loadMasterKey(base64?: string): Buffer {
  if (base64) return Buffer.from(base64, "base64");
  return createHash("sha256").update("heliograph-dev-content-key").digest();
}
