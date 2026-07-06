// Free-text detectors. Each returns redacted text + which categories fired.
// Run on ALL free text (dims and staged content) — secrets leak into prompts/errors.

interface Detector {
  flag: string;
  regex: RegExp;
  replacement: string;
}

const SECRET_DETECTORS: Detector[] = [
  { flag: "secret", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: "[REDACTED:secret]" },
  { flag: "secret", regex: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, replacement: "[REDACTED:secret]" }, // JWT
  { flag: "secret", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: "[REDACTED:secret]" }, // OpenAI-style
  { flag: "secret", regex: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}\b/g, replacement: "[REDACTED:secret]" }, // GitHub
  { flag: "secret", regex: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED:secret]" }, // AWS access key id
  { flag: "secret", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replacement: "[REDACTED:secret]" }, // Slack
];

const PII_DETECTORS: Detector[] = [
  { flag: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED:email]" },
  { flag: "ip", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[REDACTED:ip]" },
];

const PATH_DETECTORS: Detector[] = [
  { flag: "path", regex: /\/(?:Users|home)\/[^/\s]+/g, replacement: "~" },
  { flag: "path", regex: /[A-Za-z]:\\Users\\[^\\/\s]+/gi, replacement: "~" },
];

export interface ScanResult {
  text: string;
  flags: Set<string>;
}

function run(text: string, detectors: Detector[]): ScanResult {
  const flags = new Set<string>();
  let out = text;
  for (const d of detectors) {
    if (d.regex.test(out)) {
      flags.add(d.flag);
      out = out.replace(d.regex, d.replacement);
    }
    d.regex.lastIndex = 0; // reset stateful global regex
  }
  return { text: out, flags };
}

export const scanSecrets = (t: string) => run(t, SECRET_DETECTORS);
export const scanPii = (t: string) => run(t, PII_DETECTORS);
export const scanPaths = (t: string) => run(t, PATH_DETECTORS);

/** Apply a plain substring deny-list (case-insensitive). */
export function scanDenyList(text: string, deny: string[]): ScanResult {
  const flags = new Set<string>();
  let out = text;
  for (const term of deny) {
    if (!term) continue;
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(out)) {
      flags.add("denylist");
      out = out.replace(re, "[REDACTED:denylist]");
    }
  }
  return { text: out, flags };
}
