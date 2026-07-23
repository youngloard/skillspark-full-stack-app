import { describe, expect, it } from "vitest";
import { parseAmount } from "./answer-row-parse";

describe("parseAmount", () => {
  it("parses a plain number", () => {
    expect(parseAmount("1500")).toBe(1500);
  });

  it("strips thousands commas", () => {
    expect(parseAmount("1,20,000")).toBe(120000);
    expect(parseAmount("1,500.50")).toBe(1500.5);
  });

  it("treats a blank cell as null", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("12x")).toBeNull();
  });

  it("keeps decimals and negatives", () => {
    expect(parseAmount("0.25")).toBe(0.25);
    expect(parseAmount("-40")).toBe(-40);
  });
});
