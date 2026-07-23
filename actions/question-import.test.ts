import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Workbook } from "exceljs";

vi.mock("@/lib/authorization", () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    admin: { id: "question-import-test", email: "question-import@test.skillspark.local" },
  }),
}));

const actions = await import("./question-import");
const { db } = await import("@/lib/db");

const STAMP = `question-import-preview-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let examId: string;

beforeAll(async () => {
  examId = (
    await db.exam.create({
      data: { slug: `preview-${STAMP}`, name: `Preview ${STAMP}` },
    })
  ).id;
  await db.question.create({
    data: {
      examId,
      level: "basic",
      sourceQuestionNo: "1",
      prompt: "Already stored",
      sheetName: "existing",
    },
  });
});

afterAll(async () => {
  if (examId) await db.exam.deleteMany({ where: { id: examId } });
  await db.$disconnect();
});

describe("question import preview", () => {
  it("marks database and repeated-file duplicates before commit", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Basic");
    sheet.addRows([
      [1, "Existing question", "Cash A/c"],
      [2, "New question two", "Bank A/c"],
      [3, "New question three", "Sales A/c"],
      [2, "Repeated question two", "Purchase A/c"],
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const form = new FormData();
    form.set("examId", examId);
    form.set("mode", "full");
    form.set(
      "file",
      new File([buffer], "questions.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    const result = await actions.previewQuestionWorkbook(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.questions.map((question) => question.duplicate)).toEqual([
      true,
      false,
      false,
      true,
    ]);
  });

  it("skips the same normalized question across levels and within the file", async () => {
    const workbook = new Workbook();
    const basic = workbook.addWorksheet("Basic");
    basic.addRows([
      [10, "Shared file question", "Cash A/c"],
      [11, "Unique basic question", "Bank A/c"],
    ]);
    const medium = workbook.addWorksheet("Medium");
    medium.addRows([
      [90, "Already stored", "Sales A/c"],
      [91, "  SHARED   FILE QUESTION  ", "Purchase A/c"],
      [92, "Unique medium question", "Capital A/c"],
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const form = new FormData();
    form.set("examId", examId);
    form.set("mode", "full");
    form.set(
      "file",
      new File([buffer], "cross-level.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    const result = await actions.previewQuestionWorkbook(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.questions.map((question) => question.duplicate)).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
  });
});
