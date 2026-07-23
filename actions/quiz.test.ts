import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// M5-S4 integration tests: quiz start against the real DB. The security
// point of this slice is answers-not-in-payload — asserted by deep-scanning
// the serialized result for seeded answer markers.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

const { startQuizAction } = await import("./quiz");
const { clearQuestionIdCache } = await import("@/lib/question-cache");
const { db } = await import("@/lib/db");

const STAMP = `m5s4-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ANSWER_MARKER = `SecretAccount${STAMP.replace(/[^a-z0-9]/gi, "")}`;

let examId: string;
let studentId: string;
let outsiderId: string;

const asStudent = (id: string) =>
  mockAuth.mockResolvedValue({ user: { role: "student", studentId: id, email: "s@x" } });

function expectOk<T>(result: { ok: boolean }): asserts result is { ok: true; data: T } {
  expect(result).toMatchObject({ ok: true });
}

beforeAll(async () => {
  const window = {
    accessStartDate: new Date(Date.now() - 86_400_000),
    accessEndDate: new Date(Date.now() + 86_400_000),
  };
  examId = (
    await db.exam.create({
      data: {
        slug: `qz-${STAMP}`,
        name: `Quiz Exam ${STAMP}`,
        questionsPerQuiz: 5,
        timeLimitMinutes: 45,
      },
    })
  ).id;
  studentId = (
    await db.student.create({
      data: { name: "Quiz Student", email: `qs-${STAMP}@test.skillspark.local`, ...window },
    })
  ).id;
  outsiderId = (
    await db.student.create({
      data: { name: "No Access", email: `qo-${STAMP}@test.skillspark.local`, ...window },
    })
  ).id;
  // Grant via batch path.
  await db.batch.create({
    data: {
      batchCode: `QZ-${STAMP}`,
      batchName: "Quiz Batch",
      studentBatches: { create: { studentId } },
      batchExams: { create: { examId } },
    },
  });
  // 12 basic questions with options AND answer rows carrying a marker that
  // must never appear in any student payload. 3 medium questions (short
  // bank). 0 hard questions.
  for (let i = 1; i <= 12; i++) {
    await db.question.create({
      data: {
        examId,
        level: "basic",
        sourceQuestionNo: `b${i}`,
        prompt: `Basic prompt ${i}`,
        sheetName: "Seed",
        options: {
          create: [
            { optionIndex: 0, optionText: `${ANSWER_MARKER}` },
            { optionIndex: 1, optionText: "Bank Account" },
          ].map((option, index) => ({ ...option, optionIndex: index })),
        },
        answerRows: {
          create: [{ rowIndex: 0, account: ANSWER_MARKER, debit: 1234.56, credit: null }],
        },
      },
    });
  }
  for (let i = 1; i <= 3; i++) {
    await db.question.create({
      data: {
        examId,
        level: "medium",
        sourceQuestionNo: `m${i}`,
        prompt: `Medium prompt ${i}`,
        sheetName: "Seed",
        options: { create: [{ optionIndex: 0, optionText: "Opt" }] },
        answerRows: { create: [{ rowIndex: 0, account: ANSWER_MARKER, debit: 10, credit: null }] },
      },
    });
  }
});

beforeEach(() => {
  mockAuth.mockReset();
  asStudent(studentId);
  clearQuestionIdCache();
});

afterAll(async () => {
  await db.batch.deleteMany({ where: { batchCode: { contains: STAMP } } });
  await db.exam.deleteMany({ where: { slug: { contains: STAMP } } });
  await db.student.deleteMany({ where: { email: { contains: STAMP } } });
  await db.$disconnect();
});

describe("quiz start", () => {
  it("no-access-403", async () => {
    asStudent(outsiderId);
    const denied = await startQuizAction({ examId, level: "basic" });
    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    // Nonexistent exam is indistinguishable from denied (fail closed).
    const ghost = await startQuizAction({ examId: "ghost-exam", level: "basic" });
    expect(ghost).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    // Admins are not students.
    mockAuth.mockResolvedValue({ user: { role: "admin", adminId: "x", email: "a@x" } });
    const admin = await startQuizAction({ examId, level: "basic" });
    expect(admin).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  });

  it("sample-size-respects-settings", async () => {
    const result = await startQuizAction({ examId, level: "basic" });
    expectOk<{ questionCount: number; questions: { id: string }[] }>(result);
    expect(result.data.questionCount).toBe(5); // exam setting, bank of 12
    expect(result.data.questions).toHaveLength(5);
    const ids = result.data.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(5); // no duplicates

    // Two starts differ (statistically: 5 of 12 twice colliding fully is
    // ~1/792 per identical draw; assert the mechanism stores per-session ids).
    const again = await startQuizAction({ examId, level: "basic" });
    expectOk<{ quizId: string; questions: { id: string }[] }>(again);
    const session = await db.quizSession.findUniqueOrThrow({
      where: { id: again.data.quizId },
    });
    expect(session.questionIds).toEqual(again.data.questions.map((q) => q.id));
    expect(session.level).toBe("basic");
  });

  it("answers-not-in-payload", async () => {
    const result = await startQuizAction({ examId, level: "basic" });
    expectOk(result);
    const serialized = JSON.stringify(result);
    // The seeded answer-row marker appears as an OPTION (legitimate) but the
    // payload must carry no answerRows structure and no amounts.
    expect(serialized).not.toContain("answerRows");
    expect(serialized).not.toContain("answer_rows");
    expect(serialized).not.toContain("debit");
    expect(serialized).not.toContain("credit");
    expect(serialized).not.toContain("1234.56");
  });

  it("expiry-set-from-settings", async () => {
    const before = Date.now();
    const result = await startQuizAction({ examId, level: "basic" });
    expectOk<{ quizId: string; timeLimitMinutes: number; expiresAt: string }>(result);
    expect(result.data.timeLimitMinutes).toBe(45);
    const expiresAt = new Date(result.data.expiresAt).getTime();
    const expected = before + 45 * 60_000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(15_000); // server clock ±15s
    // Server authority: the DB row says the same.
    const session = await db.quizSession.findUniqueOrThrow({
      where: { id: result.data.quizId },
    });
    expect(session.expiresAt.toISOString()).toBe(result.data.expiresAt);
  });

  it("insufficient-questions-actionable-error", async () => {
    // Empty bank → actionable error.
    const empty = await startQuizAction({ examId, level: "hard" });
    expect(empty).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!empty.ok) expect(empty.error.message).toMatch(/question bank|import/i);

    // Short bank (3 < 5 configured) → smaller quiz, reference parity.
    const short = await startQuizAction({ examId, level: "medium" });
    expectOk<{ questionCount: number }>(short);
    expect(short.data.questionCount).toBe(3);

    // Unknown level → validation naming the level field.
    const bad = await startQuizAction({ examId, level: "expert" });
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fields: { level: expect.any(String) } },
    });
  });
});
