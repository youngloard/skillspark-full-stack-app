import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";

// Schema-invariant tests (M5-S1): the DB enforces exam settings bounds and
// question identity, regardless of app code.

const STAMP = `m5s1-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let examId: string;
let otherExamId: string;

beforeAll(async () => {
  examId = (await db.exam.create({ data: { slug: `test-${STAMP}`, name: `Test Exam ${STAMP}` } }))
    .id;
  otherExamId = (
    await db.exam.create({ data: { slug: `test2-${STAMP}`, name: `Test Exam 2 ${STAMP}` } })
  ).id;
});

afterAll(async () => {
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.$disconnect();
});

describe("exam schema constraints", () => {
  it("settings-bounds-enforced", async () => {
    for (const bad of [
      { questionsPerQuiz: 0 },
      { questionsPerQuiz: 101 },
      { timeLimitMinutes: 0 },
      { timeLimitMinutes: 301 },
    ]) {
      await expect(
        db.exam.update({ where: { id: examId }, data: bad }),
        JSON.stringify(bad),
      ).rejects.toThrowError();
    }
    // Boundary values are legal.
    await db.exam.update({
      where: { id: examId },
      data: { questionsPerQuiz: 100, timeLimitMinutes: 300 },
    });
    await db.exam.update({
      where: { id: examId },
      data: { questionsPerQuiz: 1, timeLimitMinutes: 1 },
    });
  });

  it("unique-question-triple", async () => {
    const triple = { level: "basic", sourceQuestionNo: `q-${STAMP}` };
    await db.question.create({
      data: { examId, ...triple, prompt: "P1", sheetName: "S1" },
    });
    // Same triple in the same exam → rejected.
    await expect(
      db.question.create({ data: { examId, ...triple, prompt: "P2", sheetName: "S1" } }),
    ).rejects.toThrowError();
    // Same (level, sourceQuestionNo) under a DIFFERENT exam → fine.
    const other = await db.question.create({
      data: { examId: otherExamId, ...triple, prompt: "P3", sheetName: "S1" },
    });
    expect(other.id).toBeTruthy();
    // Same number at a different level in the same exam → fine.
    const otherLevel = await db.question.create({
      data: {
        examId,
        level: "hard",
        sourceQuestionNo: `q-${STAMP}`,
        prompt: "P4",
        sheetName: "S1",
      },
    });
    expect(otherLevel.id).toBeTruthy();
  });

  it("options and answer rows cascade with their question", async () => {
    const q = await db.question.create({
      data: {
        examId,
        level: "medium",
        sourceQuestionNo: `qc-${STAMP}`,
        prompt: "Cascade",
        sheetName: "S1",
        options: {
          create: [
            { optionIndex: 0, optionText: "A" },
            { optionIndex: 1, optionText: "B" },
          ],
        },
        answerRows: {
          create: [{ rowIndex: 0, account: "Cash", debit: "1,000.50".replace(",", "") }],
        },
      },
    });
    // Duplicate option index for the same question → composite PK rejects.
    await expect(
      db.questionOption.create({
        data: { questionId: q.id, optionIndex: 0, optionText: "dup" },
      }),
    ).rejects.toThrowError();

    await db.question.delete({ where: { id: q.id } });
    expect(await db.questionOption.count({ where: { questionId: q.id } })).toBe(0);
    expect(await db.answerRow.count({ where: { questionId: q.id } })).toBe(0);
  });

  it("seed-idempotent", async () => {
    // The live JET row exists (seeded via npm run db:seed).
    const jet = await db.exam.findUniqueOrThrow({ where: { slug: "jet" } });
    expect(jet.status).toBe("active");
    expect(jet.levels).toEqual(["basic", "medium", "hard"]);

    // Re-seeding must not clobber admin-changed settings: the seed upserts
    // with update:{} — simulate by asserting a second upsert with the same
    // shape leaves a modified value untouched.
    const original = jet.questionsPerQuiz;
    await db.exam.update({ where: { slug: "jet" }, data: { questionsPerQuiz: 37 } });
    await db.exam.upsert({
      where: { slug: "jet" },
      update: {},
      create: {
        slug: "jet",
        name: "JET Exam",
        status: "active",
        questionsPerQuiz: 20,
        timeLimitMinutes: 30,
        levels: ["basic", "medium", "hard"],
      },
    });
    const after = await db.exam.findUniqueOrThrow({ where: { slug: "jet" } });
    expect(after.questionsPerQuiz).toBe(37);
    expect(await db.exam.count({ where: { slug: "jet" } })).toBe(1);
    await db.exam.update({ where: { slug: "jet" }, data: { questionsPerQuiz: original } });
  });

  it("exam-slug-unique and level-list index exists", async () => {
    await expect(
      db.exam.create({ data: { slug: `test-${STAMP}`, name: "Dup slug" } }),
    ).rejects.toThrowError();

    const rows = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('questions', 'answer_rows')
    `;
    const names = rows.map((r) => r.indexname);
    // Level-list + sampling queries ride the unique triple's prefix.
    expect(names).toContain("questions_exam_id_level_source_question_no_key");
    expect(names).toContain("answer_rows_question_id_row_index_idx");
  });
});
