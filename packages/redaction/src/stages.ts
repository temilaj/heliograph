// Redaction stages (Strategy + Chain-of-Responsibility). Order matters: scan raw
// text for secrets/PII/paths BEFORE the field-policy decides drop-vs-encrypt, so
// even opted-in encrypted content has secrets stripped.
import type { CanonicalEvent, EncryptedField, OrgPolicy } from "@heliograph/domain";
import { scanDenyList, scanPaths, scanPii, scanSecrets } from "./scan.ts";
import { addFlags, scanAllFields, type Redactor, type RedactionDeps } from "./types.ts";

export const SecretScanner: Redactor = {
  name: "secret-scanner",
  apply: (e) => scanAllFields(e, scanSecrets),
};

export const PiiRedactor: Redactor = {
  name: "pii",
  apply: (e) => scanAllFields(e, scanPii),
};

export const PathScrubber: Redactor = {
  name: "path-scrubber",
  apply: (e) => scanAllFields(e, scanPaths),
};

export const DenyListRedactor: Redactor = {
  name: "deny-list",
  apply: (e, policy) => {
    if (policy.denyList?.length) scanAllFields(e, (s) => scanDenyList(s, policy.denyList!));
  },
};

/**
 * Field policy for staged content (all `critical`): drop unless the org opted
 * into content capture, in which case encrypt. Always clears stagedContent.
 */
export const FieldPolicyRedactor: Redactor = {
  name: "field-policy",
  apply: (e: CanonicalEvent, policy: OrgPolicy, deps: RedactionDeps) => {
    if (!e.stagedContent) return;
    if (policy.captureContent) {
      const fields: Record<string, EncryptedField> = {};
      for (const [name, value] of Object.entries(e.stagedContent)) {
        fields[name] = deps.encrypt.encrypt(value, e.resource.identity.orgId);
      }
      e.content = { classification: "critical", fields };
      addFlags(e, ["content_encrypted"]);
    } else {
      addFlags(e, ["content_dropped"]);
    }
    delete e.stagedContent;
  },
};

export const DEFAULT_STAGES: Redactor[] = [
  SecretScanner,
  PiiRedactor,
  PathScrubber,
  DenyListRedactor,
  FieldPolicyRedactor,
];
