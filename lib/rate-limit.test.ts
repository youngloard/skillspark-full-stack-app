import { beforeEach, describe, expect, it } from "vitest";
import { RATE_RULES, checkRateLimit, resetRateLimiter } from "./rate-limit";

beforeEach(() => resetRateLimiter());

describe("rate limiter", () => {
  it("rate-limit-429-after-threshold (login: 10 per 15min)", () => {
    const t0 = Date.now();
    for (let i = 0; i < RATE_RULES.login.capacity; i += 1) {
      expect(checkRateLimit("login", "1.2.3.4", t0).allowed).toBe(true);
    }
    const eleventh = checkRateLimit("login", "1.2.3.4", t0);
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys are isolated per scope and per key", () => {
    const t0 = Date.now();
    for (let i = 0; i < RATE_RULES.login.capacity; i += 1) {
      checkRateLimit("login", "1.2.3.4", t0);
    }
    expect(checkRateLimit("login", "5.6.7.8", t0).allowed).toBe(true);
    expect(checkRateLimit("mutation", "1.2.3.4", t0).allowed).toBe(true);
  });

  it("refills over time", () => {
    const t0 = Date.now();
    for (let i = 0; i < RATE_RULES.login.capacity; i += 1) {
      checkRateLimit("login", "9.9.9.9", t0);
    }
    expect(checkRateLimit("login", "9.9.9.9", t0).allowed).toBe(false);
    // After a full window, the bucket is full again.
    const t1 = t0 + RATE_RULES.login.windowMs;
    expect(checkRateLimit("login", "9.9.9.9", t1).allowed).toBe(true);
  });
});
