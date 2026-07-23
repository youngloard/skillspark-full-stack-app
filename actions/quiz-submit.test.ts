import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// M5-S5 integration tests: idempotent submit against the real DB — the
// unique(quizId) constraint is the mechanism under test, so no mocks there.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const { startQuizAction, submitQuizAction } = await import("./quiz");
const { clearQuestionIdCache } = await import("@/lib/question-cache");
const { resetRateLimiter } = await import("@/lib/rate-limit");
const { db } = await import("@/lib/db");

const STAMP = `m5s5-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let examId: string;
let studentId: string;

function expectOk<T>(result: { ok: boolean }): asserts result is { ok: true; data: T } {
  expect(result).toMatchObject({ ok: true });
}

const asStudent = () =>
  mockAuth.mockResolvedValue({ user: { role: "student", studentId, email: "s@x" } });

/** Starts a real quiz and returns its id + the correct answers for q rows. */
async function startedQuiz(): Promise<{ quizId: string; questionIds: string[] }> {
  const result = await startQuizAction({ examId, level: "basic" });
  expectOk<{ quizId: string; questions: { id: string }[] }>(result);
  return { quizId: result.data.quizId, questionIds: result.data.questions.map((q) => q.id) };
}

const correctRows = [{ account: "Cash", debit: "1,000", credit: "" }];

beforeAll(async () => {
  examId = (
    await db.exam.create({
      data: {
        slug: `sub-${STAMP}`,
        name: `Submit Exam ${STAMP}`,
        questionsPerQuiz: 2,
        timeLimitMinutes: 30,
      },
    })
  ).id;
  studentId = (
    await db.student.create({
      data: {
        name: "Submit Student",
        email: `sub-${STAMP}@test.skillspark.local`,
        accessStartDate: new Date(Date.now() - 86_400_000),
        accessEndDate: new Date(Date.now() + 86_400_000),
      },
    })
  ).id;
  await db.batch.create({
    data: {
      batchCode: `SUB-${STAMP}`,
      batchName: "Submit Batch",
      studentBatches: { create: { studentId } },
      batchExams: { create: { examId } },
    },
  });
  await Promise.all(
    [1, 2, 3, 4].map((i) =>
      db.question.create({
        data: {
          examId,
          level: "basic",
          sourceQuestionNo: `s${i}`,
          prompt: `Submit prompt ${i}`,
          sheetName: "Seed",
          options: { create: [{ optionIndex: 0, optionText: "Cash" }] },
          answerRows: { create: [{ rowIndex: 0, account: "Cash", debit: 1000, credit: null }] },
        },
      }),
    ),
  );
}, 30_000);

beforeEach(() => {
  mockAuth.mockReset();
  asStudent();
  clearQuestionIdCache();
  resetRateLimiter();
});

afterAll(async () => {
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("quiz submit", () => {
  it("evaluates, labels, and stores exactly one attempt (double-submit-one-attempt)", async () => {
    const { quizId, questionIds } = await startedQuiz();
    const submissions = questionIds.map((questionId) => ({ questionId, rows: correctRows }));

    const first = await submitQuizAction({ quizId, submissions });
    expectOk<{
      attempt: { score: number; performanceLabel: string; percentage: number };
      alreadySubmitted: boolean;
    }>(first);
    expect(first.data.alreadySubmitted).toBe(false);
    expect(first.data.attempt.score).toBe(2); // both correct (comma-stripped)
    expect(first.data.attempt.percentage).toBe(1);
    expect(first.data.attempt.performanceLabel).toBe("Excellent");

    // The session is consumed…
    expect(await db.quizSession.findUnique({ where: { id: quizId } })).toBeNull();

    // …and the second submit converges on the SAME attempt.
    const second = await submitQuizAction({ quizId, submissions: [] });
    expectOk<{ attempt: { id: string }; alreadySubmitted: boolean }>(second);
    expect(second.data.alreadySubmitted).toBe(true);
    expect(second.data.attempt.id).toBe(first.data.attempt.id);
    expect(await db.attempt.count({ where: { quizId } })).toBe(1);
  }, 30_000);

  it("concurrent-submit-one-attempt", async () => {
    const { quizId, questionIds } = await startedQuiz();
    const submissions = questionIds.map((questionId) => ({ questionId, rows: correctRows }));

    const [a, b] = await Promise.all([
      submitQuizAction({ quizId, submissions }),
      submitQuizAction({ quizId, submissions }),
    ]);
    expectOk<{ attempt: { id: string } }>(a);
    expectOk<{ attempt: { id: string } }>(b);
    expect(a.data.attempt.id).toBe(b.data.attempt.id);
    expect(await db.attempt.count({ where: { quizId } })).toBe(1);
  }, 30_000);

  it("late-submit-within-grace-ok", async () => {
    const { quizId, questionIds } = await startedQuiz();
    // Expired an hour ago — inside the 24h grace.
    await db.quizSession.update({
      where: { id: quizId },
      data: { expiresAt: new Date(Date.now() - 60 * 60_000) },
    });
    const result = await submitQuizAction({
      quizId,
      submissions: questionIds.map((questionId) => ({ questionId, rows: correctRows })),
    });
    expectOk<{ attempt: { score: number } }>(result);
    expect(result.data.attempt.score).toBe(2);
  }, 30_000);

  it("after-grace-rejected", async () => {
    const { quizId } = await startedQuiz();
    // Expired 25 hours ago — beyond grace; session gets cleaned up.
    await db.quizSession.update({
      where: { id: quizId },
      data: { expiresAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });
    const rejected = await submitQuizAction({ quizId, submissions: [] });
    expect(rejected).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!rejected.ok) expect(rejected.error.message).toMatch(/expired/i);
    expect(await db.quizSession.findUnique({ where: { id: quizId } })).toBeNull();
    // Ghost quiz id → NOT_FOUND (uniform with foreign sessions).
    const ghost = await submitQuizAction({ quizId: "0".repeat(36), submissions: [] });
    expect(ghost).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  }, 30_000);

  it("partial answers score partially; expired-access student may submit", async () => {
    const { quizId, questionIds } = await startedQuiz();
    // Student's platform access lapses mid-quiz — submit must still land.
    await db.student.update({
      where: { id: studentId },
      data: { accessEndDate: new Date(Date.now() - 60_000) },
    });
    const result = await submitQuizAction({
      quizId,
      submissions: [
        { questionId: questionIds[0]!, rows: correctRows },
        { questionId: questionIds[1]!, rows: [{ account: "Wrong", debit: "5", credit: "" }] },
      ],
    });
    expectOk<{
      attempt: { score: number; percentage: number; performanceLabel: string };
    }>(result);
    expect(result.data.attempt.score).toBe(1);
    expect(result.data.attempt.percentage).toBe(0.5);
    expect(result.data.attempt.performanceLabel).toBe("Good"); // 50% → Good
    await db.student.update({
      where: { id: studentId },
      data: { accessEndDate: new Date(Date.now() + 86_400_000) },
    });
  }, 30_000);

  it("rate-limited after 5 submits per minute", async () => {
    const { quizId } = await startedQuiz();
    for (let i = 0; i < 5; i++) {
      await submitQuizAction({ quizId, submissions: [] });
    }
    const sixth = await submitQuizAction({ quizId, submissions: [] });
    expect(sixth).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  }, 30_000);

  it("starting a new quiz replaces the previous open session (reference rule)", async () => {
    const first = await startedQuiz();
    const second = await startedQuiz();
    expect(await db.quizSession.findUnique({ where: { id: first.quizId } })).toBeNull();
    expect(await db.quizSession.findUnique({ where: { id: second.quizId } })).not.toBeNull();
    // Submitting the replaced quiz finds nothing.
    const stale = await submitQuizAction({ quizId: first.quizId, submissions: [] });
    expect(stale).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  }, 30_000);
});
