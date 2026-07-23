import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pw@host:6543/postgres",
  DIRECT_URL: "postgresql://user:pw@host:5432/postgres",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  AUTH_GOOGLE_ID: "12345-abc.apps.googleusercontent.com",
  AUTH_GOOGLE_SECRET: "GOCSPX-test",
};

describe("env-fails-fast-on-missing", () => {
  it("parses a valid environment", () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe("test");
    expect(env.DATABASE_URL).toContain("postgresql://");
  });

  it("throws with an actionable message when DATABASE_URL is missing", () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest.DATABASE_URL;
    expect(() => parseEnv(rest)).toThrowError(/DATABASE_URL/);
    expect(() => parseEnv(rest)).toThrowError(/\.env\.example/);
  });

  it("rejects a non-postgres connection string", () => {
    expect(() => parseEnv({ ...valid, DIRECT_URL: "mysql://nope" })).toThrowError(/DIRECT_URL/);
  });

  it("defaults NODE_ENV to development", () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest.NODE_ENV;
    expect(parseEnv(rest).NODE_ENV).toBe("development");
  });
});
