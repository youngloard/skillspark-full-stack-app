import { readFileSync } from "node:fs";
import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import { prepareQuestionWorkbookImport } from "./question-workbook-import";

async function workbookBuffer(sheets: Array<{ name: string; rows: unknown[][] }>): Promise<Buffer> {
  const workbook = new Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) worksheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("question workbook import modes", () => {
  it("full mode keeps all detected workbook levels", async () => {
    const preview = await prepareQuestionWorkbookImport(
      readFileSync("test/fixtures/jet-questions.xlsx"),
      "full",
    );

    expect(preview.importedLevels).toEqual(["basic", "medium", "hard"]);
    expect(preview.counts).toEqual({ basic: 250, medium: 199, hard: 201 });
    expect(preview.questions).toHaveLength(650);
  });

  it("single mode assigns one populated block to the selected level", async () => {
    const buffer = await workbookBuffer([
      {
        name: "Questions",
        rows: [[1, "A basic question", "Cash A/c", "", "Cash A/c", 100, ""]],
      },
    ]);

    const preview = await prepareQuestionWorkbookImport(buffer, "single", "hard");

    expect(preview.importedLevels).toEqual(["hard"]);
    expect(preview.counts).toEqual({ basic: 0, medium: 0, hard: 1 });
    expect(preview.questions[0]).toMatchObject({ level: "hard", sourceQuestionNo: "1" });
  });

  it("single mode rejects a workbook containing multiple populated levels", async () => {
    const buffer = await workbookBuffer([
      { name: "Basic", rows: [[1, "Basic question", "Cash A/c"]] },
      { name: "Medium", rows: [[1, "Medium question", "Bank A/c"]] },
    ]);

    await expect(prepareQuestionWorkbookImport(buffer, "single", "basic")).rejects.toThrowError(
      /Full workbook/,
    );
  });
});
