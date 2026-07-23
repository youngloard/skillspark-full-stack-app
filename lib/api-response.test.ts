import { describe, expect, it } from "vitest";
import { ERROR_STATUS, err, ok } from "./api-response";

describe("api-response envelope", () => {
  it("wraps success data", () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it("wraps errors with code and message", () => {
    expect(err("VALIDATION", "Name is required", { name: "Required" })).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "Name is required", fields: { name: "Required" } },
    });
  });

  it("omits fields when not provided", () => {
    expect(err("NOT_FOUND", "No such course")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such course" },
    });
  });

  it("maps every error code to an HTTP status", () => {
    expect(ERROR_STATUS.UNAUTHORIZED).toBe(401);
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(Object.values(ERROR_STATUS).every((s) => s >= 400 && s < 600)).toBe(true);
  });
});
