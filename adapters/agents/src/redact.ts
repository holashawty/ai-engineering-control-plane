// Shared across adapters. Per docs/security-model.md — never let a
// captured observation payload carry a raw secret value through into
// evidence. Best-effort key-name redaction; not a substitute for not
// capturing secrets in the first place.
const SENSITIVE_KEY_PATTERN = /token|secret|password|api[_-]?key|credential/i;

export function redact(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "[redacted]" : v;
  }
  return out;
}
