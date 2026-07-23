import { describe, expect, it } from "vitest";
import { logger } from "./logger";

describe("logger never-log redaction", () => {
  it("redacts banned keys at any depth", () => {
    const out = logger._redact({
      event: "login",
      token: "abc123",
      nested: { database_url: "postgresql://x", ok: 1 },
      apiKeyValue: "secret-ish",
    });
    expect(out.token).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).database_url).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(out.apiKeyValue).toBe("[REDACTED]");
    expect(out.event).toBe("login");
  });
});
