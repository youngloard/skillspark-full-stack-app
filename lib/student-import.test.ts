import { describe, expect, it } from "vitest";
import { parseImportCsv, splitCodeAndName } from "./student-import";

describe("splitCodeAndName", () => {
  it("splits a leading code run from the name", () => {
    expect(splitCodeAndName("KLM 2606 1282 Seethal U")).toEqual({
      code: "KLM 2606 1282",
      name: "Seethal U",
    });
  });

  it("treats an all-lowercase/no-code value as name-only", () => {
    expect(splitCodeAndName("Ravi Kumar")).toEqual({ code: "", name: "Ravi Kumar" });
  });

  it("handles an empty cell", () => {
    expect(splitCodeAndName("   ")).toEqual({ code: "", name: "" });
  });
});

describe("parseImportCsv", () => {
  it("drops a header row and parses two-column rows", () => {
    const rows = parseImportCsv(
      "Mail ID,Files To Share\nseethaludayan4@gmail.com,KLM 2606 1282 Seethal U",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "seethaludayan4@gmail.com",
      code: "KLM 2606 1282",
      name: "Seethal U",
      batchName: null,
      courseNames: [],
      error: null,
    });
  });

  it("keeps the first row when it is already data (no header)", () => {
    const rows = parseImportCsv("ravi@example.com,ABC 12 Ravi Kumar");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ravi Kumar");
  });

  it("reads optional batch and course columns", () => {
    const rows = parseImportCsv("a@b.com,X 1 Asha,Batch A,Course One");
    expect(rows[0]).toMatchObject({ batchName: "Batch A", courseNames: ["Course One"] });
  });

  it("flags an invalid email on a data row", () => {
    const rows = parseImportCsv("Mail ID,Files To Share\nnot-an-email,X 1 Asha");
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toMatch(/email/i);
  });

  it("flags a missing name", () => {
    const rows = parseImportCsv("a@b.com,");
    expect(rows[0].error).toMatch(/name/i);
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseImportCsv('a@b.com,"X 1 Asha, Jr",Batch A');
    expect(rows[0].name).toBe("Asha, Jr");
    expect(rows[0].batchName).toBe("Batch A");
  });

  it("splits several course names on + or ;", () => {
    const rows = parseImportCsv("a@b.com,X 1 Asha,Batch A,Tally Prime + Tally VAT; GST");
    expect(rows[0].courseNames).toEqual(["Tally Prime", "Tally VAT", "GST"]);
  });
});
