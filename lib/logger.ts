// Structured JSON logging per docs/CONVENTIONS.md.
// Levels: error (actionable failure), warn (degraded/retry), info (lifecycle),
// debug (dev only). The never-log list is enforced by key redaction — values
// under these keys are masked even if a call site passes them by mistake.

type LogLevel = "error" | "warn" | "info" | "debug";
type LogFields = Record<string, unknown>;

const REDACTED_KEYS = [
  "password",
  "token",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "jwt",
  "credential",
  "signedurl",
  "signed_url",
  "connectionstring",
  "database_url",
];

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACTED_KEYS.some((banned) => key.toLowerCase().includes(banned))) {
      out[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redact(value as LogFields);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const entry = { ts: new Date().toISOString(), level, event, ...redact(fields) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  error: (event: string, fields?: LogFields) => write("error", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  /** Exported for tests only. */
  _redact: redact,
};
