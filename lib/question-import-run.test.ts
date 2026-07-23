import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearQuestionIdCache, getQuestionIdList } from "./question-cache";
import { db } from "./db";
import { importQuestionRows } from "./question-import-run";
import type { ParsedQuestion } from "./question-import";

const STAMP = `question-import-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let examId: string;

const question = (
  sourceQuestionNo: string,
  prompt = `Prompt ${sourceQuestionNo}`,
): ParsedQuestion => ({
  sourceQuestionNo,
  prompt,
  options: ["Cash A/c", "Bank A/c"],
  answerRows: [
    { account: "Cash A/c", debit: 100, credit: null },
    { account: "Bank A/c", debit: null, credit: 100 },
  ],
  error: null,
  sheetName: "test-import",
});

beforeAll(async () => {
  examId = (
    await db.exam.create({
      data: { slug: `import-${STAMP}`, name: `Import ${STAMP}` },
    })
  ).id;
  clearQuestionIdCache();
});

afterAll(async () => {
  if (examId) await db.exam.deleteMany({ where: { id: examId } });
  clearQuestionIdCache();
  await db.$disconnect();
});

describe("question import runner", () => {
  it("skips database and in-file duplicates without overwriting existing data", async () => {
    const existing = await db.question.create({
      data: {
        examId,
        level: "basic",
        sourceQuestionNo: "existing",
        prompt: "Original prompt",
        sheetName: "original",
        options: { create: [{ optionIndex: 0, optionText: "Original option" }] },
      },
    });
    const cachedBefore = await getQuestionIdList(examId, "basic");

    const outcomes = await importQuestionRows(examId, "basic", [
      question("existing", "Must not replace"),
      question("new-1"),
      question("new-1", "Repeated inside file"),
      question("new-2"),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "duplicate",
      "created",
      "duplicate",
      "created",
    ]);
    const unchanged = await db.question.findUniqueOrThrow({
      where: { id: existing.id },
      include: { options: true },
    });
    expect(unchanged.prompt).toBe("Original prompt");
    expect(unchanged.options.map((option) => option.optionText)).toEqual(["Original option"]);

    const inserted = await db.question.findUniqueOrThrow({
      where: {
        examId_level_sourceQuestionNo: {
          examId,
          level: "basic",
          sourceQuestionNo: "new-1",
        },
      },
      include: { options: true, answerRows: true },
    });
    expect(inserted.options).toHaveLength(2);
    expect(inserted.answerRows).toHaveLength(2);
    expect(await db.question.count({ where: { examId, level: "basic" } })).toBe(3);

    const cachedAfter = await getQuestionIdList(examId, "basic");
    expect(cachedAfter).not.toBe(cachedBefore);
    expect(cachedAfter).toHaveLength(3);
  });

  it("remains duplicate-safe when two imports race", async () => {
    const [first, second] = await Promise.all([
      importQuestionRows(examId, "medium", [question("race")]),
      importQuestionRows(examId, "medium", [question("race")]),
    ]);

    expect([first[0]?.status, second[0]?.status].sort()).toEqual(["created", "duplicate"]);
    expect(
      await db.question.count({
        where: { examId, level: "medium", sourceQuestionNo: "race" },
      }),
    ).toBe(1);
  });

  it("serializes cross-level imports and keeps only one normalized prompt", async () => {
    const [first, second] = await Promise.all([
      importQuestionRows(examId, "basic", [question("cross-basic", "Concurrent duplicate")]),
      importQuestionRows(examId, "hard", [question("cross-hard", "concurrent   duplicate")]),
    ]);

    expect([first[0]?.status, second[0]?.status].sort()).toEqual(["created", "duplicate"]);
    expect(
      await db.question.count({
        where: {
          examId,
          prompt: { contains: "concurrent", mode: "insensitive" },
        },
      }),
    ).toBe(1);
  });
});
