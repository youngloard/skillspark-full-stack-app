import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import { parseQuestionWorkbook } from "./exam-workbook";

// M5-S2 tests. The golden hash pins BEHAVIOR PARITY with the reference
// parser: it was generated after a deep-equal run of the reference parser
// (_reference/Jet_Exam) vs this port on the real production workbook
// (650 questions). If a change breaks the hash, the port has drifted —
// regenerate ONLY after re-proving parity against the reference.
const GOLDEN_SHA256 = "b1586af69f9747137ea80c05acbeefbd62bc72c19ffc1d1d83e8af3653fa19b1";

const HEADER = ["No", "Particulars B", "Particulars A", "", "Answer", "Debit", "Credit"];

async function workbookBuffer(sheets: Array<{ name: string; rows: unknown[][] }>): Promise<Buffer> {
  const workbook = new Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("JET workbook parser (behavior-parity port)", () => {
  it("parses the real production workbook to the reference-verified golden output", async () => {
    const parsed = await parseQuestionWorkbook(readFileSync("test/fixtures/jet-questions.xlsx"));
    expect(parsed.importedLevels).toEqual(["basic", "medium", "hard"]);
    expect(parsed.counts).toEqual({ basic: 250, medium: 199, hard: 201 });
    expect(parsed.questions).toHaveLength(650);
    const hash = createHash("sha256")
      .update(
        JSON.stringify({ importedLevels: parsed.importedLevels, questions: parsed.questions }),
      )
      .digest("hex");
    expect(hash).toBe(GOLDEN_SHA256);
  });

  it("named sheets map to levels; header rows are skipped", async () => {
    const buffer = await workbookBuffer([
      {
        name: "Basic",
        rows: [
          HEADER,
          [1, "What is a journal?", "Option A", "", "Cash", "1,000.50", ""],
          ["", "", "Option B", "", "Bank", "", "2,500"],
        ],
      },
    ]);
    const parsed = await parseQuestionWorkbook(buffer);
    expect(parsed.importedLevels).toEqual(["basic"]);
    expect(parsed.questions).toHaveLength(1);
    const q = parsed.questions[0]!;
    expect(q).toMatchObject({
      level: "basic",
      sourceQuestionNo: "1",
      prompt: "What is a journal?",
      sheetName: "Basic",
    });
    expect(q.options).toEqual(["Option A", "Option B"]);
    // Comma-stripped amounts (evaluator rule).
    expect(q.answerRows).toEqual([
      { account: "Cash", debit: 1000.5, credit: null },
      { account: "Bank", debit: null, credit: 2500 },
    ]);
  });

  it("options dedup case-insensitively keeping first occurrence", async () => {
    const buffer = await workbookBuffer([
      {
        name: "Medium",
        rows: [
          [1, "Prompt", "Cash Account", "", "", "", ""],
          ["", "", "CASH ACCOUNT", "", "", "", ""],
          ["", "", "Bank Account", "", "", "", ""],
        ],
      },
    ]);
    const parsed = await parseQuestionWorkbook(buffer);
    expect(parsed.questions[0]!.options).toEqual(["Cash Account", "Bank Account"]);
  });

  it("numeric question numbers lose trailing .0; grouping follows the No column", async () => {
    const buffer = await workbookBuffer([
      {
        name: "Hard",
        rows: [
          ["2.0", "First prompt", "A", "", "", "", ""],
          [3, "Second prompt", "B", "", "", "", ""],
        ],
      },
    ]);
    const parsed = await parseQuestionWorkbook(buffer);
    expect(parsed.questions.map((q) => q.sourceQuestionNo)).toEqual(["2", "3"]);
  });

  it("prompt+options filter drops incomplete questions (reference rule)", async () => {
    const buffer = await workbookBuffer([
      {
        name: "Basic",
        rows: [
          [1, "", "Only option no prompt", "", "", "", ""],
          [2, "Prompt but no options", "", "", "", "", ""],
          [3, "Complete", "Option", "", "", "", ""],
        ],
      },
    ]);
    const parsed = await parseQuestionWorkbook(buffer);
    expect(parsed.questions.map((q) => q.sourceQuestionNo)).toEqual(["3"]);
  });

  it("single sheet with level markers splits into sections", async () => {
    const buffer = await workbookBuffer([
      {
        name: "AllQuestions",
        rows: [
          ["Basic"],
          [1, "Basic Q", "A", "", "", "", ""],
          [],
          ["Hard"],
          [1, "Hard Q", "B", "", "", "", ""],
        ],
      },
    ]);
    const parsed = await parseQuestionWorkbook(buffer);
    expect(parsed.importedLevels).toEqual(["basic", "hard"]);
    expect(parsed.counts).toMatchObject({ basic: 1, medium: 0, hard: 1 });
    expect(parsed.questions.every((q) => q.sheetName === "AllQuestions")).toBe(true);
  });

  it("csv-reference-shape: unnamed contiguous blocks assign levels in order", async () => {
    // The single-sheet CSV-converted layout: no named sheets, no markers —
    // blocks separated by content-free spacer rows become basic/medium/hard
    // in order. (Truly empty rows never reach the parser: eachRow uses
    // includeEmpty:false, reference parity — a separator row carries
    // something outside the question-content columns, e.g. col A.)
    const buffer = await workbookBuffer([
      {
        name: "Sheet1",
        rows: [
          [1, "Q one", "A", "", "", "", ""],
          ["---"],
          [1, "Q two", "B", "", "", "", ""],
          ["---"],
          [1, "Q three", "C", "", "", "", ""],
        ],
      },
    ]);
    const parsed = await parseQuestionWorkbook(buffer);
    expect(parsed.importedLevels).toEqual(["basic", "medium", "hard"]);
    expect(parsed.questions.map((q) => q.level)).toEqual(["basic", "medium", "hard"]);
    expect(parsed.questions.map((q) => q.sheetName)).toEqual([
      "Sheet1 block 1",
      "Sheet1 block 2",
      "Sheet1 block 3",
    ]);
  });

  it("more than three unnamed blocks is an actionable error", async () => {
    const buffer = await workbookBuffer([
      {
        name: "Sheet1",
        rows: [
          [1, "Q1", "A", "", "", "", ""],
          ["---"],
          [1, "Q2", "B", "", "", "", ""],
          ["---"],
          [1, "Q3", "C", "", "", "", ""],
          ["---"],
          [1, "Q4", "D", "", "", "", ""],
        ],
      },
    ]);
    await expect(parseQuestionWorkbook(buffer)).rejects.toThrowError(/more than three/);
  });

  it("empty workbook is an actionable error", async () => {
    const buffer = await workbookBuffer([{ name: "Notes", rows: [] }]);
    await expect(parseQuestionWorkbook(buffer)).rejects.toThrowError(/Basic, Medium, Hard/);
  });

  it("size and type validated before parsing", async () => {
    await expect(parseQuestionWorkbook(Buffer.alloc(0))).rejects.toThrowError(/empty/);
    await expect(parseQuestionWorkbook(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrowError(
      /5 MB/,
    );
    await expect(parseQuestionWorkbook(Buffer.from("this,is,a,csv\n1,2,3,4"))).rejects.toThrowError(
      /xlsx/,
    );
    // Right magic bytes but corrupt zip.
    await expect(
      parseQuestionWorkbook(Buffer.from("PK garbage that is not a zip")),
    ).rejects.toThrowError(/corrupted|not a real/);
  });

  it("5MB-class workbook parses under the 5s budget", async () => {
    const start = Date.now();
    await parseQuestionWorkbook(readFileSync("test/fixtures/jet-questions.xlsx"));
    expect(Date.now() - start).toBeLessThan(5_000);
  });
});
